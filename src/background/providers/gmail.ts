/**
 * Gmail and Google Workspace (any domain hosted by Google) through the Gmail API.
 *
 * @module background/providers/gmail
 */
import type {Account, Credentials, MailMessage} from '../../shared/types';
import {requestJSON, type RequestOptions} from '../http';
import * as oauth from '../oauth/flow';
import {count, message, type Provider} from './message';

/** Gmail API base for the signed-in user. */
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Gmail message metadata fields used here. */
interface GmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: {headers?: {name: string; value: string}[]};
}

/** Sends an authorized Gmail API request. */
const call = <T>(credentials: Credentials, path: string, options: RequestOptions = {}) =>
  requestJSON<T>(API + path, {...options, token: credentials.token, service: 'Gmail'});

/** Decodes the HTML entities Gmail uses in snippets. */
function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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
    const query = new URLSearchParams({q: 'is:unread in:inbox', maxResults: String(limit)});
    const [label, list] = await Promise.all([
      call<{messagesUnread?: unknown}>(account.credentials, '/labels/INBOX'),
      call<{messages?: {id: string}[]}>(account.credentials, `/messages?${query}`),
    ]);
    const ids = (Array.isArray(list?.messages) ? list.messages : []).slice(0, limit).map(item => String(item.id));
    const metadata = 'format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
    const details = await Promise.all(
      ids.map(id => call<GmailMessage>(account.credentials, `/messages/${encodeURIComponent(id)}?${metadata}`)),
    );
    const messages = details.map(item => {
      const headers = Object.fromEntries(
        (item?.payload?.headers || []).map(h => [String(h.name).toLowerCase(), h.value]),
      );
      return message({
        id: item.id,
        thread: item.threadId,
        from: headers.from,
        subject: headers.subject,
        snippet: decodeEntities(item.snippet || ''),
        date: Number(item.internalDate) || Date.parse(headers.date || ''),
      });
    });
    return {unread: count(label?.messagesUnread, messages.length), messages};
  },

  async markRead(account, item) {
    await call(account.credentials, `/messages/${encodeURIComponent(item.id)}/modify`, {
      method: 'POST',
      json: {removeLabelIds: ['UNREAD']},
    });
  },

  async trash(account, item) {
    await call(account.credentials, `/messages/${encodeURIComponent(item.id)}/trash`, {method: 'POST'});
  },

  webURL(account: Account, item?: MailMessage | null) {
    const base = `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.email)}`;
    return item?.thread ? `${base}#inbox/${encodeURIComponent(item.thread)}` : `${base}#inbox`;
  },
};
