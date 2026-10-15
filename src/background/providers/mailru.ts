/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Mail.ru read through the browser's sign-in: the Mail.ru webmail API.
 *
 * This adapter uses the webmail API on `e.mail.ru`, which gives
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
import type {Account, FolderPage, FolderRole, InboxResult, MailFolder, MailMessage} from '../../shared/types';
import {FOLDER_ROLES} from '../../shared/folders';
import {AuthError, requestJSON, type RequestOptions} from '../http';
import {bareAddress, categorize, message, replySubject} from './message';
import {firstAddress, sessionProvider} from './session';
import {t} from '../../shared/i18n';

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
  if (Number(reply?.status) === 403) throw new AuthError(t('error_sign_in_mailru'));
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
const OPTIONS: RequestOptions = {session: true, service: t('service_mailru')};

/** The trash folder of a Mail.ru mailbox. */
const TRASH = '500002';

/** Parses Mail.ru's server catalog; type and archive flags identify roles without guessing names. */
export function parseFolders(reply: Reply | null): MailFolder[] {
  if (Number(reply?.status) === 403) throw new AuthError(t('error_sign_in_mailru'));
  if (Number(reply?.status) !== 200) throw new Error(t('error_unexpected_reply', t('service_mailru')));
  const body = reply?.body as {folders?: unknown} | unknown[] | undefined;
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as {folders?: unknown})?.folders)
      ? (body as {folders: unknown[]}).folders
      : null;
  if (!list) throw new Error(t('error_unexpected_reply', t('service_mailru')));
  return list.slice(0, 200).flatMap(value => {
    const item = value as Record<string, unknown>;
    const id = String(item.id ?? '');
    if (!/^\d+$/.test(id)) return [];
    const role = item.archive === true ? 'archive' : String(item.type || '');
    return [
      {
        id,
        name: String(item.name || id),
        role: FOLDER_ROLES.includes(role as FolderRole) ? (role as FolderRole) : undefined,
        parent: item.parent != null && Number(item.parent) >= 0 ? String(item.parent) : undefined,
        total: item.messages_total == null ? undefined : Number(item.messages_total),
        unread: item.messages_unread == null ? undefined : Number(item.messages_unread),
      },
    ];
  });
}

/** Parses the web client's smart thread list into bounded message metadata. */
export function parseFolderPage(reply: Reply | null, folder: string, offset: number, limit: number): FolderPage {
  if (Number(reply?.status) === 403) throw new AuthError(t('error_sign_in_mailru'));
  if (Number(reply?.status) !== 200) throw new Error(t('error_unexpected_reply', t('service_mailru')));
  const body = reply?.body as {threads?: Record<string, unknown>[]; threads_total?: number} | undefined;
  if (!Array.isArray(body?.threads)) throw new Error(t('error_unexpected_reply', t('service_mailru')));
  const messages = body.threads.slice(0, limit).flatMap(thread => {
    const children = Array.isArray(thread.messages) ? (thread.messages as Record<string, unknown>[]) : [];
    const item = children.find(item => item.id === thread.expand) || children[children.length - 1] || thread;
    const id = String(item.id || thread.id || '');
    if (!id) return [];
    const from = sender((item.correspondents as {from?: Sender[]} | undefined)?.from?.[0] ?? item.from);
    const seconds = Number(item.date);
    const flags = item.flags as {unread?: unknown; flagged?: unknown; attach?: unknown} | undefined;
    return [
      message({
        id,
        thread: String(thread.id || `0:${id}:${folder}`),
        folder,
        from,
        subject: item.subject ?? thread.subject,
        snippet: item.snippet ?? thread.snippet,
        date: seconds > 0 ? seconds * (seconds < 1e12 ? 1000 : 1) : Date.now(),
        unread: flags?.unread ?? Number(thread.length_unread) > 0,
        pinned: flags?.flagged,
        attachments: flags?.attach,
        link: link(String(thread.id || id), folder),
        category: categorize({from}),
      }),
    ];
  });
  const total = Number(body.threads_total);
  const more = messages.length === limit && (!Number.isFinite(total) || offset + messages.length < total);
  return {messages, next: more ? String(offset + messages.length) : ''};
}

/** Reads the same folder-list endpoint as Mail.ru's web client, using the signed-in account's token. */
async function folderPage(
  email: string,
  folder: string,
  limit: number,
  offset: number,
  accessToken?: string,
): Promise<Reply> {
  const query = new URLSearchParams({
    folder,
    limit: String(limit),
    offset: String(offset),
    last_modified: '1',
    token: accessToken || (await token(email)),
  });
  return call(`${API}/threads/status/smart?${mailbox(email)}&${query}`, OPTIONS);
}

/** Returns an API token for [email], issued for the browser's Mail.ru sign-in. */
async function token(email: string): Promise<string> {
  const reply = await call(`${API}/tokens?${mailbox(email)}`, OPTIONS);
  if (Number(reply?.status) === 403) throw new AuthError(t('error_sign_in_mailru'));
  const value = (reply?.body as {token?: unknown} | undefined)?.token;
  if (typeof value !== 'string' || !value) throw new Error(t('error_unexpected_reply', t('service_mailru')));
  return value;
}

/** Reads the unread Inbox messages of [email] with the browser's Mail.ru sign-in. */
async function unread(email: string): Promise<InboxResult> {
  const value = await token(email);
  const result = parseUnread(
    await call(`${API}/messages/status/unread?${mailbox(email)}&token=${encodeURIComponent(value)}&limit=50`, OPTIONS),
  );
  if (result.messages.length < 50) return result;
  try {
    const folders = parseFolders(await folderPage(email, '0', 1, 0, value));
    const total = folders.find(folder => folder.role === 'inbox')?.unread;
    if (Number.isSafeInteger(total) && total! >= result.unread) return {...result, unread: total!};
  } catch (error) {
    if (error instanceof AuthError) throw error;
  }
  return {...result, unreadPartial: true};
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
  if (Number(reply?.status) !== 200) throw new Error(t('error_mailru_action'));
}

/** Mail.ru through the browser's sign-in. */
export const mailru = sessionProvider({
  label: t('service_mailru'),
  unreadOnly: true,
  bodyMarksRead: true,
  async connect(email) {
    const address = firstAddress(email || '');
    if (!address) throw new Error(t('error_mailru_address'));
    await unread(address);
    return address;
  },
  async inbox(account: Account, limit: number) {
    const result = await unread(account.email);
    return {...result, messages: result.messages.slice(0, limit)};
  },
  async folders(account) {
    return parseFolders(await folderPage(account.email, '0', 1, 0));
  },
  async folder(account, id, limit, cursor) {
    if (!/^\d{1,12}$/.test(id) || (cursor && !/^\d{1,7}$/.test(cursor))) throw new Error(t('error_bad_message'));
    const offset = Number(cursor || 0);
    return parseFolderPage(await folderPage(account.email, id, limit, offset), id, offset, limit);
  },
  webURL: (_account: Account, item?: MailMessage | null) => item?.link || 'https://e.mail.ru/inbox/',
  async body(account, item) {
    const value = await token(account.email);
    const reply = await call(
      `${API}/messages/message?${mailbox(account.email)}&id=${encodeURIComponent(item.id)}` +
        `&folder_id=${encodeURIComponent(item.folder || item.thread.split(':').pop() || '0')}&htmlencoded=false&token=${encodeURIComponent(value)}`,
      OPTIONS,
    );
    if (Number(reply?.status) === 403) throw new AuthError(t('error_sign_in_mailru'));
    if (Number(reply?.status) !== 200) throw new Error(t('error_mailru_action'));
    return parseMessage(reply);
  },
  // The compose fields of the webmail API; `source.reply` links the reply to the original.
  async reply(account, item, text) {
    const html = text.replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`).replace(/\n/g, '<br>');
    await post(account.email, 'messages/send', {
      attaches: JSON.stringify({list: []}),
      body: JSON.stringify({html, text}),
      correspondents: JSON.stringify({to: bareAddress(item.from), cc: '', bcc: ''}),
      source: JSON.stringify({reply: item.id}),
      subject: replySubject(item.subject),
      send_date: '0',
    });
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
      marks: JSON.stringify([
        {name: 'unread', [mark]: [item.thread], folder: Number(item.folder || item.thread.split(':').pop() || 0)},
      ]),
      message_id_last: last,
    });
  },
});
