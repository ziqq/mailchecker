/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Outlook.com, Hotmail and Microsoft 365 / Exchange Online (any domain) through Microsoft Graph.
 *
 * @module background/providers/outlook
 */
import type {Credentials, FolderPage, FolderRole, MailFolder, MailMessage, MessageAction} from '../../shared/types';
import {AuthError, HTTPError, requestJSON, type RequestOptions} from '../http';
import * as oauth from '../oauth/flow';
import {addresses, categorize, count, message, threadMessage, type Provider} from './message';
import {t} from '../../shared/i18n';

/** Graph API base for the signed-in user. */
const API = 'https://graph.microsoft.com/v1.0/me';

/** Graph recipient. */
interface Recipient {
  emailAddress?: {name?: string; address?: string};
}

/** Graph message fields used here. */
interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: Recipient;
  toRecipients?: Recipient[];
  ccRecipients?: Recipient[];
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: {contentType?: string; content?: string};
  webLink?: string;
  isRead?: boolean;
  flag?: {flagStatus?: string};
  hasAttachments?: boolean;
  unsubscribeEnabled?: boolean;
}

/** Fields requested for lists. */
const LIST_FIELDS =
  'id,conversationId,subject,from,receivedDateTime,bodyPreview,webLink,isRead,flag,hasAttachments,unsubscribeEnabled';

/** Sends an authorized Graph request. */
const call = <T>(credentials: Credentials, path: string, options: RequestOptions = {}) =>
  requestJSON<T>(API + path, {...options, token: credentials.token, service: 'Microsoft Graph'});

/** Returns a server continuation restricted to the requested Graph collection. */
function continuation(link: unknown, path: string): string {
  if (link == null) return '';
  if (typeof link !== 'string' || !link || link.length > 4096)
    throw new Error(t('error_unexpected_reply', 'Microsoft Graph'));
  const url = new URL(link);
  const expected = new URL(API + path);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash)
    throw new Error(t('error_unexpected_reply', 'Microsoft Graph'));
  return path + url.search;
}

/** Returns the mailbox address authenticated by [credentials]. */
async function address(credentials: Credentials): Promise<string> {
  const me = await call<{mail?: unknown; userPrincipalName?: unknown}>(credentials, '?$select=mail,userPrincipalName');
  const email = me?.mail || me?.userPrincipalName;
  if (typeof email !== 'string' || !email.trim()) throw new Error(t('error_no_address', 'Microsoft'));
  return email;
}

/** Formats a Graph recipient. */
const sender = (value?: Recipient): string => addresses(value?.emailAddress ? [value.emailAddress] : []);

/** Converts a Graph message to a list message. */
function listMessage(item: GraphMessage): MailMessage {
  const from = sender(item.from);
  return message({
    id: item.id,
    thread: item.conversationId,
    from,
    subject: item.subject,
    snippet: item.bodyPreview,
    date: Date.parse(item.receivedDateTime || ''),
    link: item.webLink,
    unread: item.isRead === false,
    pinned: item.flag?.flagStatus === 'flagged',
    attachments: item.hasAttachments,
    category: categorize({from, listUnsubscribe: item.unsubscribeEnabled}),
  });
}

/** PATCH bodies for state actions. */
const PATCHES: Partial<Record<MessageAction, object>> = {
  read: {isRead: true},
  unread: {isRead: false},
  pin: {flag: {flagStatus: 'flagged'}},
  unpin: {flag: {flagStatus: 'notFlagged'}},
};

/** Reads a bounded Graph folder page; continuation queries cannot change the host or folder path. */
async function listFolder(credentials: Credentials, id: string, limit: number, cursor = ''): Promise<FolderPage> {
  const query = cursor ? new URLSearchParams(cursor) : new URLSearchParams();
  query.set('$top', String(limit));
  query.set('$select', LIST_FIELDS);
  query.set('$orderby', 'receivedDateTime desc');
  const path = `/mailFolders/${encodeURIComponent(id)}/messages`;
  const value = await call<{value?: GraphMessage[]; '@odata.nextLink'?: string}>(credentials, `${path}?${query}`);
  const next = continuation(value?.['@odata.nextLink'], path).slice(path.length + 1);
  return {messages: (Array.isArray(value?.value) ? value.value : []).slice(0, limit).map(listMessage), next};
}

/** Graph's stable folder names, resolved to server IDs before assigning common roles. */
const FOLDERS: Readonly<Record<string, FolderRole>> = {
  inbox: 'inbox',
  sentitems: 'sent',
  archive: 'archive',
  deleteditems: 'trash',
  junkemail: 'spam',
  drafts: 'drafts',
};

/** Lists a bounded folder tree, resolving system roles by ID rather than translated display names. */
async function folders(credentials: Credentials): Promise<MailFolder[]> {
  const roles = new Map<string, FolderRole>();
  await Promise.all(
    Object.entries(FOLDERS).map(async ([id, role]) => {
      try {
        const value = await call<{id?: string}>(credentials, `/mailFolders/${id}?$select=id`);
        if (value?.id) roles.set(value.id, role);
      } catch (error) {
        if (!(error instanceof HTTPError) || error.status !== 404) throw error;
      }
    }),
  );
  const result: MailFolder[] = [];
  const pending = [''];
  const visited = new Set<string>();
  const seen = new Set<string>();
  let requests = 0;
  while (pending.length && result.length < 200 && requests < 200) {
    const parent = pending.shift()!;
    if (visited.has(parent)) continue;
    visited.add(parent);
    const path = parent ? `/mailFolders/${encodeURIComponent(parent)}/childFolders` : '/mailFolders';
    let next = `${path}?$top=200&$select=id,displayName,childFolderCount,totalItemCount,unreadItemCount`;
    const pages = new Set<string>();
    while (next && !pages.has(next) && result.length < 200 && requests++ < 200) {
      pages.add(next);
      const value = await call<{
        value?: {
          id?: string;
          displayName?: string;
          childFolderCount?: number;
          totalItemCount?: number;
          unreadItemCount?: number;
        }[];
        '@odata.nextLink'?: string;
      }>(credentials, next);
      for (const item of (Array.isArray(value?.value) ? value.value : []).slice(0, 200 - result.length)) {
        if (!item.id || seen.has(item.id)) continue;
        seen.add(item.id);
        result.push({
          id: item.id,
          name: item.displayName || item.id,
          role: roles.get(item.id),
          parent: parent || undefined,
          total: item.totalItemCount,
          unread: item.unreadItemCount,
        });
        if (item.childFolderCount) pending.push(item.id);
      }
      next = continuation(value?.['@odata.nextLink'], path);
    }
  }
  return result;
}

/** Outlook / Microsoft 365 provider. */
export const outlook: Provider = {
  label: 'Outlook / Microsoft 365',

  async connect() {
    const credentials = await oauth.microsoft();
    return {email: await address(credentials), credentials, settings: {}};
  },

  address,

  async renew(account) {
    if (!account.credentials.refreshToken) throw new AuthError();
    return oauth.microsoftRefresh(account.credentials.refreshToken);
  },

  signIn: account => oauth.microsoft({loginHint: account.email}),

  async inbox(account, limit) {
    const [folder, list] = await Promise.all([
      call<{unreadItemCount?: unknown}>(account.credentials, '/mailFolders/inbox?$select=unreadItemCount'),
      listFolder(account.credentials, 'inbox', limit),
    ]);
    const messages = list.messages;
    return {unread: count(folder?.unreadItemCount, messages.filter(item => item.unread).length), messages};
  },

  folders: account => folders(account.credentials),

  folder: (account, id, limit, cursor) => listFolder(account.credentials, id, limit, cursor),

  /** Graph rejects `$orderby` with a `conversationId` filter, so messages are sorted locally. */
  async thread(account, item) {
    const query = new URLSearchParams({
      $filter: `conversationId eq '${(item.thread || '').replace(/'/g, "''")}'`,
      $select: 'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,isRead,hasAttachments',
      $top: '50',
    });
    const messages = new Map<string, GraphMessage>();
    let next = item.thread ? `/messages?${query}` : '';
    const visited = new Set<string>();
    while (next) {
      if (visited.has(next) || visited.size >= 4) throw new Error(t('error_too_large'));
      visited.add(next);
      const list = await call<{value?: GraphMessage[]; '@odata.nextLink'?: string}>(account.credentials, next);
      const entries = Array.isArray(list?.value) ? list.value : [];
      if (entries.length > 50) throw new Error(t('error_too_large'));
      for (const entry of entries) {
        if (typeof entry?.id !== 'string' || !entry.id) throw new Error(t('error_unexpected_reply', 'Microsoft Graph'));
        messages.set(entry.id, entry);
      }
      next = continuation(list?.['@odata.nextLink'], '/messages');
    }
    if (!messages.has(item.id)) {
      const selected = await call<GraphMessage>(account.credentials, `/messages/${encodeURIComponent(item.id)}`);
      if (selected?.id !== item.id || (item.thread && selected.conversationId !== item.thread))
        throw new Error(t('error_unexpected_reply', 'Microsoft Graph'));
      messages.set(item.id, selected);
    }
    const entries = [...messages.values()].sort(
      (a, b) => Date.parse(a.receivedDateTime || '') - Date.parse(b.receivedDateTime || ''),
    );
    return Promise.all(
      entries.map(async entry => {
        const attachments = entry.hasAttachments
          ? (
              await call<{value?: {name?: string; size?: number; contentType?: string}[]}>(
                account.credentials,
                `/messages/${encodeURIComponent(entry.id)}/attachments?$select=name,size,contentType`,
              )
            ).value?.map(file => ({name: file.name, size: file.size, type: file.contentType}))
          : [];
        const html = entry.body?.contentType === 'html' ? entry.body.content : '';
        return threadMessage({
          id: entry.id,
          from: sender(entry.from),
          to: addresses(entry.toRecipients?.map(item => item.emailAddress || {})),
          cc: addresses(entry.ccRecipients?.map(item => item.emailAddress || {})),
          subject: entry.subject,
          date: Date.parse(entry.receivedDateTime || ''),
          html,
          text: html ? '' : entry.body?.content,
          unread: entry.isRead === false,
          attachments,
        });
      }),
    );
  },

  async act(account, item, action) {
    const path = `/messages/${encodeURIComponent(item.id)}`;
    if (action === 'archive' || action === 'trash')
      await call(account.credentials, `${path}/move`, {
        method: 'POST',
        json: {destinationId: action === 'archive' ? 'archive' : 'deleteditems'},
      });
    else await call(account.credentials, path, {method: 'PATCH', json: PATCHES[action]});
  },

  async search(account, query, limit) {
    const params = new URLSearchParams({
      $search: `"${query.replace(/"/g, '')}"`,
      $top: String(limit),
      $select: LIST_FIELDS,
    });
    const list = await call<{value?: GraphMessage[]}>(account.credentials, `/messages?${params}`);
    return (Array.isArray(list?.value) ? list.value : []).slice(0, limit).map(listMessage);
  },

  webURL: (_account, item) => item?.link || 'https://outlook.office.com/mail/inbox',

  // Graph quotes the original message under the comment, as Outlook's own reply does.
  async reply(account, item, text) {
    await call(account.credentials, `/messages/${encodeURIComponent(item.id)}/reply`, {
      method: 'POST',
      json: {comment: text},
    });
  },
};
