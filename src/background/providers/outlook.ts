/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Outlook.com, Hotmail and Microsoft 365 / Exchange Online (any domain) through Microsoft Graph.
 *
 * @module background/providers/outlook
 */
import type {Credentials, MailMessage, MessageAction} from '../../shared/types';
import {AuthError, requestJSON, type RequestOptions} from '../http';
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

/** Outlook / Microsoft 365 provider. */
export const outlook: Provider = {
  label: 'Outlook / Microsoft 365',

  async connect() {
    const credentials = await oauth.microsoft();
    const me = await call<{mail?: unknown; userPrincipalName?: unknown}>(
      credentials,
      '?$select=mail,userPrincipalName',
    );
    const email = me?.mail || me?.userPrincipalName;
    if (typeof email !== 'string') throw new Error(t('error_no_address', 'Microsoft'));
    return {email, credentials, settings: {}};
  },

  async renew(account) {
    if (!account.credentials.refreshToken) throw new AuthError();
    return oauth.microsoftRefresh(account.credentials.refreshToken);
  },

  signIn: account => oauth.microsoft({loginHint: account.email}),

  async inbox(account, limit) {
    const query = new URLSearchParams({$top: String(limit), $select: LIST_FIELDS, $orderby: 'receivedDateTime desc'});
    const [folder, list] = await Promise.all([
      call<{unreadItemCount?: unknown}>(account.credentials, '/mailFolders/inbox?$select=unreadItemCount'),
      call<{value?: GraphMessage[]}>(account.credentials, `/mailFolders/inbox/messages?${query}`),
    ]);
    const messages = (Array.isArray(list?.value) ? list.value : []).slice(0, limit).map(listMessage);
    return {unread: count(folder?.unreadItemCount, messages.filter(item => item.unread).length), messages};
  },

  /** Graph rejects `$orderby` with a `conversationId` filter, so messages are sorted locally. */
  async thread(account, item) {
    const query = new URLSearchParams({
      $filter: `conversationId eq '${(item.thread || '').replace(/'/g, "''")}'`,
      $select: 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,isRead,hasAttachments',
      $top: '50',
    });
    const list = item.thread
      ? await call<{value?: GraphMessage[]}>(account.credentials, `/messages?${query}`)
      : {value: [await call<GraphMessage>(account.credentials, `/messages/${encodeURIComponent(item.id)}`)]};
    const entries = (Array.isArray(list?.value) ? list.value : []).sort(
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
