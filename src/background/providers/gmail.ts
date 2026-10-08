/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * Gmail and Google Workspace (any domain hosted by Google) through the Gmail API.
 *
 * @module background/providers/gmail
 */
import type {Account, Credentials, MailMessage, MessageAction} from '../../shared/types';
import {requestJSON, type RequestOptions} from '../http';
import * as oauth from '../oauth/flow';
import {categorize, count, message, threadMessage, type Provider, type RawThreadMessage} from './message';

/** Gmail API base for the signed-in user. */
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

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

/** Returns headers of a part by lower-case name. */
const headersOf = (part?: GmailPart): Record<string, string> =>
  Object.fromEntries((part?.headers || []).map(h => [String(h.name).toLowerCase(), String(h.value)]));

/** Decodes the HTML entities Gmail uses in snippets. */
function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

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

/** Collects the HTML, plain text and attachments of a MIME tree. */
function walk(
  part: GmailPart | undefined,
  out: {html: string; text: string; attachments: RawThreadMessage['attachments']},
) {
  if (!part) return out;
  const type = (part.mimeType || '').toLowerCase();
  if (part.filename && part.body?.attachmentId) {
    out.attachments!.push({name: part.filename, size: part.body.size, type});
  } else if (part.body?.data && type === 'text/html' && !out.html) {
    out.html = decodeBody(part.body.data, headersOf(part)['content-type']);
  } else if (part.body?.data && type === 'text/plain' && !out.text) {
    out.text = decodeBody(part.body.data, headersOf(part)['content-type']);
  }
  for (const child of part.parts || []) walk(child, out);
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

/** Lists messages matching a Gmail query with metadata. */
async function list(credentials: Credentials, q: string, limit: number): Promise<MailMessage[]> {
  const query = new URLSearchParams({q, maxResults: String(limit)});
  const found = await call<{messages?: {id: string}[]}>(credentials, `/messages?${query}`);
  const ids = (Array.isArray(found?.messages) ? found.messages : []).slice(0, limit).map(item => String(item.id));
  const details = await Promise.all(
    ids.map(id => call<GmailMessage>(credentials, `/messages/${encodeURIComponent(id)}?format=metadata&${METADATA}`)),
  );
  return details.map(listMessage);
}

/** Gmail provider. */
export const gmail: Provider = {
  label: 'Gmail / Google Workspace',

  async connect() {
    const credentials = await oauth.google({interactive: true});
    const profile = await call<{emailAddress?: unknown}>(credentials, '/profile');
    if (typeof profile?.emailAddress !== 'string') throw new Error('Gmail не вернул адрес ящика.');
    return {email: profile.emailAddress, credentials, settings: {}};
  },

  renew: account => oauth.google({loginHint: account.email, interactive: false}),

  signIn: account => oauth.google({loginHint: account.email, interactive: true}),

  async inbox(account, limit) {
    const [label, messages] = await Promise.all([
      call<{messagesUnread?: unknown}>(account.credentials, '/labels/INBOX'),
      list(account.credentials, 'in:inbox', limit),
    ]);
    return {unread: count(label?.messagesUnread, messages.filter(item => item.unread).length), messages};
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

  webURL(account: Account, item?: MailMessage | null) {
    const base = `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.email)}`;
    return item?.thread ? `${base}#all/${encodeURIComponent(item.thread)}` : `${base}#inbox`;
  },
};
