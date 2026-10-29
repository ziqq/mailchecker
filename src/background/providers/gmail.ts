/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Gmail and Google Workspace (any domain hosted by Google) through the Gmail API.
 *
 * @module background/providers/gmail
 */
import type {Account, Credentials, FolderPage, MailFolder, MailMessage, MessageAction} from '../../shared/types';
import {AuthError, isAuthFailure, requestJSON, requestText, type RequestOptions} from '../http';
import * as oauth from '../oauth/flow';
import {
  bareAddress,
  base64,
  categorize,
  count,
  decodeEntities,
  message,
  replySubject,
  threadMessage,
  type Provider,
  type RawThreadMessage,
} from './message';
import {t} from '../../shared/i18n';

/** Gmail's virtual Archive: received mail outside Inbox, Sent, Drafts, Spam and Trash. */
const ARCHIVE_QUERY = '-in:inbox -in:sent -in:drafts -in:spam -in:trash';

/** Gmail API base for the signed-in user. */
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Reads folder counters in Gmail's recommended batches of at most 50 operations. */
async function folderCounts(account: Account, paths: string[]): Promise<(Record<string, unknown> | undefined)[]> {
  const results: (Record<string, unknown> | undefined)[] = Array(paths.length).fill(undefined);
  for (let offset = 0; offset < paths.length; offset += 50) {
    const group = paths.slice(offset, offset + 50);
    const boundary = 'mailchecker_batch';
    const body =
      group
        .map(
          (path, index) =>
            `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <${index}@mailchecker>\r\n\r\nGET /gmail/v1/users/me${path} HTTP/1.1\r\n\r\n`,
        )
        .join('') + `--${boundary}--\r\n`;
    try {
      const reply = await requestText('https://gmail.googleapis.com/batch/gmail/v1', {
        token: account.credentials.token,
        service: 'Gmail',
        method: 'POST',
        multipart: {boundary, body},
      });
      const marker = /^--([^\r\n]{1,200})\r?$/m.exec(reply)?.[1];
      if (!marker) continue;
      for (const part of reply.split(`--${marker}`).slice(1, group.length + 1)) {
        const id = /Content-ID:\s*<response-(\d+)@mailchecker>/i.exec(part)?.[1];
        const status = Number(/HTTP\/1\.[01]\s+(\d{3})/.exec(part)?.[1]);
        const start = part.indexOf('{');
        if (isAuthFailure(status, start < 0 ? '' : part.slice(start).trim())) throw new AuthError();
        if (id == null || Number(id) >= group.length || status !== 200) continue;
        if (start < 0) continue;
        try {
          const value: unknown = JSON.parse(part.slice(start).trim());
          if (value && typeof value === 'object' && !Array.isArray(value))
            results[offset + Number(id)] = value as Record<string, unknown>;
        } catch {
          // A malformed individual counter must not hide the other folder names or counts.
        }
      }
    } catch (error) {
      if (error instanceof AuthError) throw error;
      // Keep names usable when a batch fails; absent counters remain unknown rather than zero.
    }
  }
  return results;
}

/** A MIME part as returned with `format=full` or `format=metadata`. */
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: {name: string; value: string}[];
  body?: {data?: string; size?: number; attachmentId?: string};
  parts?: GmailPart[];
}

/** Gmail message fields used here. */
interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

/** Label changes for each action; archive and trash are handled separately. */
const LABEL_CHANGES: Partial<Record<MessageAction, {addLabelIds?: string[]; removeLabelIds?: string[]}>> = {
  archive: {removeLabelIds: ['INBOX']},
  read: {removeLabelIds: ['UNREAD']},
  unread: {addLabelIds: ['UNREAD']},
  pin: {addLabelIds: ['STARRED']},
  unpin: {removeLabelIds: ['STARRED']},
};

/** Metadata headers requested for lists. */
const METADATA = ['From', 'Subject', 'Date', 'List-Unsubscribe', 'Precedence']
  .map(name => `metadataHeaders=${name}`)
  .join('&');

/** Sends an authorized Gmail API request. */
const call = <T>(credentials: Credentials, path: string, options: RequestOptions = {}) =>
  requestJSON<T>(API + path, {...options, token: credentials.token, service: 'Gmail'});

/** Returns the mailbox address authenticated by [credentials]. */
async function address(credentials: Credentials): Promise<string> {
  const profile = await call<{emailAddress?: unknown}>(credentials, '/profile');
  if (typeof profile?.emailAddress !== 'string' || !profile.emailAddress.trim())
    throw new Error(t('error_no_address', 'Gmail'));
  return profile.emailAddress;
}

/** Returns headers of a part by lower-case name. */
const headersOf = (part?: GmailPart): Record<string, string> =>
  Object.fromEntries((part?.headers || []).map(h => [String(h.name).toLowerCase(), String(h.value)]));

/** Decodes a base64url body in the part's charset. */
function decodeBody(data: string, contentType = ''): string {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const charset = /charset="?([\w-]+)"?/i.exec(contentType)?.[1] || 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Collects a MIME tree in depth-first order with explicit depth and work bounds. */
function walk(
  part: GmailPart | undefined,
  out: {html: string; text: string; attachments: RawThreadMessage['attachments']},
) {
  const pending = part ? [{part, depth: 0}] : [];
  let visited = 0;
  while (pending.length) {
    const {part, depth} = pending.pop()!;
    if (++visited > 2000 || depth > 64) throw new Error(t('error_too_large'));
    if (!part || typeof part !== 'object') continue;
    const type = typeof part.mimeType === 'string' ? part.mimeType.toLowerCase() : '';
    if (part.filename && part.body?.attachmentId) {
      out.attachments!.push({name: part.filename, size: part.body.size, type});
    } else if (part.body?.data && type === 'text/html' && !out.html) {
      out.html = decodeBody(part.body.data, headersOf(part)['content-type']);
    } else if (part.body?.data && type === 'text/plain' && !out.text) {
      out.text = decodeBody(part.body.data, headersOf(part)['content-type']);
    }
    const children = Array.isArray(part.parts) ? part.parts : [];
    if (visited + pending.length + children.length > 2000) throw new Error(t('error_too_large'));
    for (let index = children.length - 1; index >= 0; index--) pending.push({part: children[index], depth: depth + 1});
  }
  return out;
}

/** Converts Gmail metadata to a list message. */
function listMessage(item: GmailMessage): MailMessage {
  const headers = headersOf(item.payload);
  const labels = item.labelIds || [];
  return message({
    id: item.id,
    thread: item.threadId,
    from: headers.from,
    subject: headers.subject,
    snippet: decodeEntities(item.snippet || ''),
    date: Number(item.internalDate) || Date.parse(headers.date || ''),
    unread: labels.includes('UNREAD'),
    pinned: labels.includes('STARRED'),
    attachments: /multipart\/mixed/i.test(item.payload?.mimeType || ''),
    category: categorize({
      from: headers.from || '',
      listUnsubscribe: Boolean(headers['list-unsubscribe']),
      bulk: /bulk|list/i.test(headers.precedence || ''),
      labels,
    }),
  });
}

/** Lists a bounded Gmail page, matching a query or a server label. */
async function listPage(
  credentials: Credentials,
  q: string,
  limit: number,
  folder = '',
  cursor = '',
): Promise<FolderPage> {
  const query = new URLSearchParams({maxResults: String(limit)});
  if (q) query.set('q', q);
  if (folder) {
    query.set('includeSpamTrash', String(folder === 'TRASH' || folder === 'SPAM'));
    if (folder !== 'archive') query.set('labelIds', folder);
  }
  if (cursor) query.set('pageToken', cursor);
  const found = await call<{messages?: {id: string}[]; nextPageToken?: string}>(credentials, `/messages?${query}`);
  const ids = (Array.isArray(found?.messages) ? found.messages : []).slice(0, limit).map(item => String(item.id));
  const details = await Promise.all(
    ids.map(id => call<GmailMessage>(credentials, `/messages/${encodeURIComponent(id)}?format=metadata&${METADATA}`)),
  );
  return {
    messages: details.map(item => ({...listMessage(item), ...(folder ? {folder} : {})})),
    next: found?.nextPageToken || '',
  };
}

/** Lists the first page for Inbox checks and search. */
async function list(credentials: Credentials, q: string, limit: number): Promise<MailMessage[]> {
  return (await listPage(credentials, q, limit)).messages;
}

/** Gmail provider. */
export const gmail: Provider = {
  label: 'Gmail / Google Workspace',

  async connect() {
    const credentials = await oauth.google({interactive: true});
    return {email: await address(credentials), credentials, settings: {}};
  },

  address,

  renew: account => oauth.google({credentials: account.credentials, interactive: false}),

  signIn: account => oauth.google({credentials: account.credentials, interactive: true}),

  async inbox(account, limit) {
    const [label, messages] = await Promise.all([
      call<{messagesUnread?: unknown}>(account.credentials, '/labels/INBOX'),
      list(account.credentials, 'in:inbox', limit),
    ]);
    return {unread: count(label?.messagesUnread, messages.filter(item => item.unread).length), messages};
  },

  async folders(account) {
    const value = await call<{labels?: {id?: string; name?: string; type?: string}[]}>(account.credentials, '/labels');
    const roles = {INBOX: 'inbox', SENT: 'sent', TRASH: 'trash', SPAM: 'spam', DRAFT: 'drafts'} as const;
    const system: MailFolder[] = [];
    const custom: MailFolder[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(value?.labels) ? value.labels : []) {
      if (typeof item?.id !== 'string' || !item.id || item.id.length > 512 || seen.has(item.id)) continue;
      const role = Object.hasOwn(roles, item.id) ? roles[item.id as keyof typeof roles] : undefined;
      if (!role && (item.type !== 'user' || custom.length >= 199)) continue;
      seen.add(item.id);
      (role ? system : custom).push({id: item.id, name: item.name || item.id, role});
    }
    // Reserve Archive and prioritize every system role before applying the catalog cap.
    const labels = [...system, ...custom.slice(0, 199 - system.length)];
    const counts = await folderCounts(account, [
      ...labels.map(label => `/labels/${encodeURIComponent(label.id)}?fields=messagesTotal,messagesUnread`),
      `/messages?${new URLSearchParams({q: ARCHIVE_QUERY, maxResults: '1', fields: 'resultSizeEstimate'})}`,
    ]);
    const folders: MailFolder[] = labels.map((label, index) => ({
      ...label,
      total: typeof counts[index]?.messagesTotal === 'number' ? (counts[index]!.messagesTotal as number) : undefined,
      unread: typeof counts[index]?.messagesUnread === 'number' ? (counts[index]!.messagesUnread as number) : undefined,
    }));
    const archive = counts[labels.length];
    // Gmail archives by removing INBOX; it has no Archive label.
    return [
      {
        id: 'archive',
        name: '',
        role: 'archive' as const,
        total: typeof archive?.resultSizeEstimate === 'number' ? archive.resultSizeEstimate : undefined,
        approximate: true,
      },
      ...folders,
    ];
  },

  async folder(account, id, limit, cursor) {
    const q = id === 'archive' ? ARCHIVE_QUERY : '';
    return listPage(account.credentials, q, limit, id, cursor);
  },

  async thread(account, item) {
    const value = await call<{messages?: GmailMessage[]}>(
      account.credentials,
      `/threads/${encodeURIComponent(item.thread || item.id)}?format=full`,
    );
    return (Array.isArray(value?.messages) ? value.messages : []).map(entry => {
      const headers = headersOf(entry.payload);
      const body = walk(entry.payload, {html: '', text: '', attachments: []});
      return threadMessage({
        id: entry.id,
        from: headers.from,
        to: headers.to,
        cc: headers.cc,
        subject: headers.subject,
        date: Number(entry.internalDate) || Date.parse(headers.date || ''),
        unread: (entry.labelIds || []).includes('UNREAD'),
        ...body,
      });
    });
  },

  async act(account, item, action) {
    const path = `/messages/${encodeURIComponent(item.id)}`;
    if (action === 'trash') {
      await call(account.credentials, `${path}/trash`, {method: 'POST'});
      return;
    }
    await call(account.credentials, `${path}/modify`, {method: 'POST', json: LABEL_CHANGES[action]});
  },

  search: (account, query, limit) => list(account.credentials, query, limit),

  searchPage: (account, query, limit, cursor) => listPage(account.credentials, query, limit, '', cursor),

  // A plain-text RFC 5322 message in the original thread, with `In-Reply-To` and `References`.
  async reply(account, item, text) {
    const original = await call<GmailMessage>(
      account.credentials,
      `/messages/${encodeURIComponent(item.id)}?format=metadata` +
        ['From', 'Reply-To', 'Subject', 'Message-ID', 'References'].map(name => `&metadataHeaders=${name}`).join(''),
    );
    const headers = headersOf(original?.payload);
    const id = headers['message-id'] || '';
    const lines = [
      `To: ${bareAddress(headers['reply-to'] || headers.from || item.from)}`,
      `Subject: =?UTF-8?B?${base64(replySubject(headers.subject || item.subject))}?=`,
      ...(id ? [`In-Reply-To: ${id}`, `References: ${[headers.references, id].filter(Boolean).join(' ')}`] : []),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64(text).replace(/.{76}/g, '$&\r\n'),
    ];
    await call(account.credentials, '/messages/send', {
      method: 'POST',
      json: {raw: base64(lines.join('\r\n'), true), threadId: original?.threadId || item.thread},
    });
  },

  webURL(account: Account, item?: MailMessage | null) {
    const base = `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.email)}`;
    return item?.thread ? `${base}#all/${encodeURIComponent(item.thread)}` : `${base}#inbox`;
  },
};
