/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Shared behaviour of mailboxes read through the browser's own sign-in.
 *
 * Gmail, Yandex Mail and Mail.ru can be read with the session the user
 * already has in this browser: no client ID, token or password is stored.
 * These adapters read the Inbox; the full text and actions come from the
 * webmail's own pages or API where an adapter supports them, everything else
 * opens in the webmail. Requests go through `http.ts` with `session`, which
 * sends cookies only to the webmail hosts it allows.
 *
 * @module background/providers/session
 */
import type {
  Account,
  Credentials,
  FolderPage,
  InboxResult,
  MailFolder,
  MailMessage,
  MessageAction,
} from '../../shared/types';
import {AuthError} from '../http';
import {decodeEntities, threadMessage, type Connection, type Provider} from './message';
import {t} from '../../shared/i18n';

/** The parts a browser-session adapter supplies. */
export interface SessionAdapter {
  /** Display name, also used in sign-in messages. */
  label: string;
  /** The Inbox feed omits read messages. */
  unreadOnly?: boolean;
  /** Successfully loading a body marks that message read in the webmail. */
  bodyMarksRead?: boolean;
  /** Verifies the session and returns the mailbox address; [email] is the address the user entered, if any. */
  connect(email?: string): Promise<string>;
  /** The latest Inbox messages and the unread count. */
  inbox(account: Account, limit: number): Promise<InboxResult>;
  /** Server folders available through this webmail session. */
  folders?(account: Account): Promise<MailFolder[]>;
  /** One page of messages in a selected folder. */
  folder?(account: Account, id: string, limit: number, cursor: string): Promise<FolderPage>;
  /** The webmail page for the Inbox or a message. */
  webURL(account: Account, message?: MailMessage | null): string;
  /** The full text of a listed message, when the webmail gives it. */
  body?(account: Account, message: MailMessage): Promise<{html?: string; text?: string}>;
  /** Actions [act] applies in the webmail; the rest stay in the webmail. */
  actions?: readonly MessageAction[];
  /** Applies one of [actions] to a listed message in the webmail. */
  act?(account: Account, message: MailMessage, action: MessageAction): Promise<void>;
  /** Sends a plain-text reply, when the webmail API allows it. */
  reply?(account: Account, message: MailMessage, text: string): Promise<void>;
}

/**
 * Returns the outer markup of the elements whose opening tag matches [open],
 * nested tags of the same name included, from [from] on.
 *
 * @param html The page.
 * @param tag The element name, e.g. `div`.
 * @param open A pattern for the opening tag, e.g. its class.
 * @param from Where to start.
 * @param limit The most elements to return.
 */
export function elements(html: string, tag: string, open: RegExp, from = 0, limit = 200): string[] {
  const found: string[] = [];
  const lower = html.toLowerCase();
  const name = tag.toLowerCase();
  let position = 0;
  let begin = -1;
  let depth = 0;
  while (found.length < limit && position < html.length) {
    const start = html.indexOf('<', position);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      if (end < 0) break;
      position = end + 3;
      continue;
    }
    const token = /^<(\/?)([a-z][\w:-]*)(?=[\s/>])/i.exec(html.slice(start, start + 100));
    if (!token && !/^<[!?]/.test(html.slice(start, start + 2))) {
      position = start + 1;
      continue;
    }
    let end = start + 1;
    let quote = '';
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) break;
    position = end + 1;
    const current = token?.[2].toLowerCase();
    const closing = Boolean(token?.[1]);
    if (!closing && current && ['script', 'style', 'textarea', 'title'].includes(current)) {
      let close = lower.indexOf(`</${current}`, position);
      while (close >= 0 && !/[\s>]/.test(html[close + current.length + 2] || ''))
        close = lower.indexOf(`</${current}`, close + current.length + 2);
      if (close < 0) break;
      position = close;
      continue;
    }
    if (current !== name) continue;
    if (closing) {
      if (depth && --depth === 0) {
        found.push(html.slice(begin, position));
        begin = -1;
      }
    } else if (depth) depth++;
    else if (start >= Math.max(0, from)) {
      open.lastIndex = 0;
      if (!open.test(html.slice(start, position))) continue;
      begin = start;
      depth = 1;
    }
  }
  return found;
}

/** Returns the visible text of a markup fragment: tags dropped, entities decoded, whitespace collapsed. */
export function markupText(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the first e-mail address in [value], lower-cased, or an empty string. */
export function firstAddress(value: string): string {
  return /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(value)?.[0].toLowerCase() || '';
}

/** A message for features the browser session cannot do; the webmail has them. */
const IN_WEBMAIL = (label: string) => t('error_in_webmail', label);

/** Rejects a session owned by a different or unidentified mailbox. */
export function verifyMailbox(expected: string, actual: string): void {
  if (!actual || actual.trim().toLowerCase() !== expected.trim().toLowerCase())
    throw new AuthError(t('error_account_mismatch', expected));
}

/**
 * Returns a [Provider] for a mailbox read through the browser's sign-in.
 *
 * Credentials are empty: a signed-out session raises [AuthError], and «Войти»
 * succeeds once the user has signed in to the webmail in this browser.
 */
export function sessionProvider(adapter: SessionAdapter): Provider {
  const empty: Credentials = {token: ''};
  return {
    label: adapter.label,
    unreadOnly: adapter.unreadOnly,
    async connect(input): Promise<Connection> {
      return {email: await adapter.connect(input?.email), credentials: empty, settings: {browser: true}};
    },
    async renew(): Promise<Credentials> {
      throw new AuthError(t('error_sign_in_webmail', adapter.label));
    },
    async signIn(account: Account): Promise<Credentials> {
      await adapter.inbox(account, 1);
      return empty;
    },
    inbox: (account, limit) => adapter.inbox(account, limit),
    folders: adapter.folders && (account => adapter.folders!(account)),
    folder: adapter.folder && ((account, id, limit, cursor) => adapter.folder!(account, id, limit, cursor)),
    // One request for the body at most; without it the stored list entry is shown, so opening
    // messages does not add load on the webmail (Yandex blocks bursts of requests).
    async thread(account, item) {
      const body = adapter.body ? await adapter.body(account, item) : null;
      const full = Boolean(body?.html?.trim() || body?.text?.trim());
      return [
        threadMessage({
          id: item.id,
          from: item.from,
          subject: item.subject,
          date: item.date,
          unread: adapter.bodyMarksRead && body ? false : item.unread,
          html: full ? body?.html : '',
          text: full ? body?.text : t('snippet_full_text', item.snippet),
        }),
      ];
    },
    async act(account, item, action) {
      if (!adapter.act || !adapter.actions?.includes(action)) throw new Error(IN_WEBMAIL(adapter.label));
      await adapter.act(account, item, action);
    },
    async search() {
      throw new Error(IN_WEBMAIL(adapter.label));
    },
    reply: adapter.reply && ((account, item, text) => adapter.reply!(account, item, text)),
    webURL: (account, message) => adapter.webURL(account, message),
  };
}
