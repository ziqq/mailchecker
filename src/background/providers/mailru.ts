/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Mail.ru read through the browser's sign-in: the Mail.ru checker API.
 *
 * Mail.ru has no public HTTP mail API; its own browser checkers use
 * `mailru-checker-api.e.mail.ru`: a token for the signed-in address, then the
 * unread Inbox messages. The address is entered by the user; the API refuses
 * it unless that mailbox is signed in to Mail.ru in this browser. Replies
 * are untyped and validated field by field.
 *
 * @module background/providers/mailru
 */
import type {Account, InboxResult, MailMessage} from '../../shared/types';
import {AuthError, requestJSON} from '../http';
import {categorize, message} from './message';
import {firstAddress, sessionProvider} from './session';

/** The checker API. */
const API = 'https://mailru-checker-api.e.mail.ru/api/v1';

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
    const from = sender((item.correspondents as {from?: Sender[]} | undefined)?.from?.[0] ?? item.from);
    const seconds = Number(item.date);
    return message({
      id,
      thread: id,
      from,
      subject: item.subject,
      snippet: item.snippet,
      date: Number.isFinite(seconds) && seconds > 0 ? seconds * (seconds < 1e12 ? 1000 : 1) : now - index * 60_000,
      link: link(id, String(item.fid ?? item.folder ?? '0')),
      unread: true,
      category: categorize({from}),
    });
  });
  return {unread: messages.length, messages};
}

/** Returns query parameters naming the mailbox. */
const mailbox = (email: string): string => `email=${encodeURIComponent(email)}&x-email=${encodeURIComponent(email)}`;

/** Reads the unread Inbox messages of [email] with the browser's Mail.ru sign-in. */
async function unread(email: string): Promise<InboxResult> {
  const options = {session: true, service: 'Почта Mail.ru'};
  const token = await requestJSON<Reply>(`${API}/tokens?${mailbox(email)}`, options);
  if (Number(token?.status) === 403) throw new AuthError('Войдите в Почту Mail.ru в этом браузере и повторите.');
  const value = (token?.body as {token?: unknown} | undefined)?.token;
  if (typeof value !== 'string' || !value) throw new Error('Почта Mail.ru вернула неожиданный ответ.');
  return parseUnread(
    await requestJSON<Reply>(
      `${API}/messages/status/unread?${mailbox(email)}&token=${encodeURIComponent(value)}&limit=50`,
      options,
    ),
  );
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
});
