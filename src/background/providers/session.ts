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
import type {Account, Credentials, InboxResult, MailMessage, MessageAction} from '../../shared/types';
import {AuthError} from '../http';
import {decodeEntities, threadMessage, type Connection, type Provider} from './message';

/** The parts a browser-session adapter supplies. */
export interface SessionAdapter {
  /** Display name, also used in sign-in messages. */
  label: string;
  /** Verifies the session and returns the mailbox address; [email] is the address the user entered, if any. */
  connect(email?: string): Promise<string>;
  /** The latest Inbox messages and the unread count. */
  inbox(account: Account, limit: number): Promise<InboxResult>;
  /** The webmail page for the Inbox or a message. */
  webURL(account: Account, message?: MailMessage | null): string;
  /** The full text of a listed message, when the webmail gives it. */
  body?(account: Account, message: MailMessage): Promise<{html?: string; text?: string}>;
  /** Actions [act] applies in the webmail; the rest stay in the webmail. */
  actions?: readonly MessageAction[];
  /** Applies one of [actions] to a listed message in the webmail. */
  act?(account: Account, message: MailMessage, action: MessageAction): Promise<void>;
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
  const start = `<${tag}`;
  const close = `</${tag}`;
  let position = Math.max(0, from);
  while (found.length < limit) {
    const begin = html.indexOf(start, position);
    if (begin < 0) break;
    const end = html.indexOf('>', begin);
    if (end < 0) break;
    if (!open.test(html.slice(begin, end + 1))) {
      position = begin + start.length;
      continue;
    }
    let depth = 1;
    let cursor = end + 1;
    while (depth > 0) {
      const nextOpen = html.indexOf(start, cursor);
      const nextClose = html.indexOf(close, cursor);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        cursor = nextOpen + start.length;
      } else {
        depth--;
        cursor = nextClose + close.length + 1;
      }
    }
    found.push(html.slice(begin, cursor));
    if (depth > 0) break;
    position = cursor;
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
const IN_WEBMAIL = (label: string) =>
  `Для ящика «${label}», подключённого через вход в браузере, это действие доступно в веб-почте: откройте письмо там.`;

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
    async connect(input): Promise<Connection> {
      return {email: await adapter.connect(input?.email), credentials: empty, settings: {browser: true}};
    },
    async renew(): Promise<Credentials> {
      throw new AuthError(`Войдите в ${adapter.label} в этом браузере и повторите.`);
    },
    async signIn(account: Account): Promise<Credentials> {
      await adapter.inbox(account, 1);
      return empty;
    },
    inbox: (account, limit) => adapter.inbox(account, limit),
    // One request for the body at most; without it the stored list entry is shown, so opening
    // messages does not add load on the webmail (Yandex blocks bursts of requests).
    async thread(account, item) {
      const body = adapter.body ? await adapter.body(account, item).catch(() => null) : null;
      const full = Boolean(body?.html?.trim() || body?.text?.trim());
      return [
        threadMessage({
          id: item.id,
          from: item.from,
          subject: item.subject,
          date: item.date,
          unread: item.unread,
          html: full ? body?.html : '',
          text: full ? body?.text : `${item.snippet}\n\nПолный текст — в веб-почте: кнопка «Открыть в веб-почте».`,
        }),
      ];
    },
    async act(account, item, action) {
      if (!adapter.act || !adapter.actions?.includes(action)) throw new Error(IN_WEBMAIL(adapter.label));
      await adapter.act(account, item, action);
    },
    async search() {
      return [];
    },
    webURL: (account, message) => adapter.webURL(account, message),
  };
}
