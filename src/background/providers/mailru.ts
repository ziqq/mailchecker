/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Mail.ru read through the browser's sign-in: the Mail.ru webmail API.
 *
 * Mail.ru has no public HTTP mail API; its webmail API on `e.mail.ru` gives
 * a token for the signed-in address, then the unread Inbox messages. The API
 * also needs the webmail's own session cookie: without it the reply is
 * `nosdc`, and `auth.mail.ru/sdc` issues it from the Mail.ru sign-in,
 * redirecting back to the API. Opening a message reads its full text and
 * marks it read; trash moves the conversation to the trash folder, the same
 * requests the webmail sends. The address is entered by the user; the API refuses
 * it unless that mailbox is signed in to Mail.ru in this browser. Replies
 * are untyped and validated field by field.
 *
 * @module background/providers/mailru
 */
import type {Account, InboxResult, MailMessage} from '../../shared/types';
import {AuthError, requestJSON, type RequestOptions} from '../http';
import {categorize, message} from './message';
import {firstAddress, sessionProvider} from './session';

/** The webmail API. */
const API = 'https://e.mail.ru/api/v1';

/** A reply envelope: Mail.ru reports its own status inside a 200 response. */
interface Reply {
  status?: unknown;
  body?: unknown;
}

/** A sender as the API returns it. */
type Sender = string | {name?: unknown; email?: unknown};

/** Returns `Name <address>` for a sender value. */
function sender(value: unknown): string {
  if (typeof value === 'string') return value;
  const {name, email} = (value || {}) as {name?: unknown; email?: unknown};
  const [display, address] = [String(name || ''), String(email || '')];
  return display && address ? `${display} <${address}>` : display || address;
}

/** Returns the Mail.ru webmail URL of a message. */
function link(id: string, folder: string): string {
  if (!id) return 'https://e.mail.ru/inbox/';
  return id.includes(':')
    ? `https://e.mail.ru/${encodeURIComponent(folder)}/${encodeURIComponent(id)}/`
    : `https://e.mail.ru/message/${encodeURIComponent(id)}/`;
}

/**
 * Parses an unread-messages reply.
 *
 * @param reply The API reply.
 * @param now The time given to messages without a date.
 * @throws {AuthError} When Mail.ru refuses the address.
 */
export function parseUnread(reply: Reply | null, now = Date.now()): InboxResult {
  if (Number(reply?.status) === 403) throw new AuthError('Войдите в Почту Mail.ru в этом браузере и повторите.');
  const list = Array.isArray(reply?.body) ? (reply.body as Record<string, unknown>[]) : [];
  const messages = list.slice(0, 100).map((item, index) => {
    const id = String(item.id ?? item.mid ?? '');
    const folder = String(item.fid ?? item.folder ?? '0');
    const from = sender((item.correspondents as {from?: Sender[]} | undefined)?.from?.[0] ?? item.from);
    const seconds = Number(item.date);
    return message({
      id,
      // The webmail's conversation ID for a single message: `0:<message>:<folder>`.
      thread: `0:${id}:${folder}`,
      from,
      subject: item.subject,
      snippet: item.snippet,
      date: Number.isFinite(seconds) && seconds > 0 ? seconds * (seconds < 1e12 ? 1000 : 1) : now - index * 60_000,
      link: link(id, folder),
      unread: true,
      category: categorize({from}),
    });
  });
  return {unread: messages.length, messages};
}

/** Mail.ru's sign-in service that issues the webmail session cookie. */
const SDC = 'https://auth.mail.ru/sdc';

/** Calls the API; on `nosdc` gets the webmail session cookie through [SDC] and repeats the call once. */
async function call(url: string, options: RequestOptions): Promise<Reply> {
  const reply = await requestJSON<Reply>(url, options);
  if (Number(reply?.status) !== 403 || reply?.body !== 'nosdc') return reply;
  return requestJSON<Reply>(`${SDC}?from=${encodeURIComponent(url)}`, options);
}

/** Returns query parameters naming the mailbox. */
const mailbox = (email: string): string => `email=${encodeURIComponent(email)}&x-email=${encodeURIComponent(email)}`;

/** Session request options. */
const OPTIONS: RequestOptions = {session: true, service: 'Почта Mail.ru'};

/** The trash folder of a Mail.ru mailbox. */
const TRASH = '500002';

/** Returns an API token for [email], issued for the browser's Mail.ru sign-in. */
async function token(email: string): Promise<string> {
  const reply = await call(`${API}/tokens?${mailbox(email)}`, OPTIONS);
  if (Number(reply?.status) === 403) throw new AuthError('Войдите в Почту Mail.ru в этом браузере и повторите.');
  const value = (reply?.body as {token?: unknown} | undefined)?.token;
  if (typeof value !== 'string' || !value) throw new Error('Почта Mail.ru вернула неожиданный ответ.');
  return value;
}

/** Reads the unread Inbox messages of [email] with the browser's Mail.ru sign-in. */
async function unread(email: string): Promise<InboxResult> {
  const value = await token(email);
  return parseUnread(
    await call(`${API}/messages/status/unread?${mailbox(email)}&token=${encodeURIComponent(value)}&limit=50`, OPTIONS),
  );
}

/**
 * Returns the HTML and text of a message reply.
 *
 * @param reply The `messages/message` reply.
 */
export function parseMessage(reply: Reply | null): {html: string; text: string} {
  if (Number(reply?.status) !== 200) return {html: '', text: ''};
  const item = (reply?.body || {}) as {body?: {html?: unknown; text?: unknown}; html?: unknown; text?: unknown};
  const part = item.body && typeof item.body === 'object' ? item.body : item;
  return {
    html: typeof part.html === 'string' ? part.html : '',
    text: typeof part.text === 'string' ? part.text : '',
  };
}

/** Posts a webmail action for one listed message; Mail.ru reports failures inside a 200 reply. */
async function post(email: string, path: string, form: Record<string, string>): Promise<void> {
  const reply = await call(`${API}/${path}`, {
    ...OPTIONS,
    method: 'POST',
    form: {...form, email, htmlencoded: 'false', token: await token(email)},
  });
  if (Number(reply?.status) !== 200) throw new Error('Почта Mail.ru не выполнила действие. Повторите в веб-почте.');
}

/** Mail.ru through the browser's sign-in. */
export const mailru = sessionProvider({
  label: 'Почта Mail.ru',
  async connect(email) {
    const address = firstAddress(email || '');
    if (!address) throw new Error('Укажите адрес Почты Mail.ru.');
    await unread(address);
    return address;
  },
  async inbox(account: Account, limit: number) {
    const {unread: total, messages} = await unread(account.email);
    return {unread: total, messages: messages.slice(0, limit)};
  },
  webURL: (_account: Account, item?: MailMessage | null) => item?.link || 'https://e.mail.ru/inbox/',
  async body(account, item) {
    const value = await token(account.email);
    return parseMessage(
      await call(
        `${API}/messages/message?${mailbox(account.email)}&id=${encodeURIComponent(item.id)}` +
          `&htmlencoded=false&token=${encodeURIComponent(value)}`,
        OPTIONS,
      ),
    );
  },
  actions: ['read', 'unread', 'trash'],
  async act(account, item, action) {
    const last = JSON.stringify({[item.thread]: item.id});
    if (action === 'trash') {
      const folder = item.thread.split(':').pop() || '0';
      await post(account.email, 'threads/move', {
        ids: JSON.stringify([item.thread]),
        msg_ids: JSON.stringify([{id: item.thread, folder}]),
        folder: TRASH,
        message_id_last: last,
      });
      return;
    }
    const mark = action === 'unread' ? 'set' : 'unset';
    await post(account.email, 'threads/marks', {
      marks: JSON.stringify([{name: 'unread', [mark]: [item.thread], folder: 0}]),
      message_id_last: last,
    });
  },
});
