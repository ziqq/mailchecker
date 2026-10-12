/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Shared behaviour of mailboxes read through the browser's own sign-in.
 *
 * Gmail, Yandex Mail and Mail.ru can be read with the session the user
 * already has in this browser: no client ID, token or password is stored.
 * These adapters read the Inbox and open messages in the webmail; actions and
 * search stay in the webmail. Requests go through `http.ts` with `session`,
 * which sends cookies only to the webmail hosts it allows.
 *
 * @module background/providers/session
 */
import type {Account, Credentials, InboxResult, MailMessage} from '../../shared/types';
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
    // The stored list already has everything the webmail list gives: no request, so opening
    // messages does not add load on the webmail (Yandex blocks bursts of requests).
    async thread(_account, item) {
      return [
        threadMessage({
          id: item.id,
          from: item.from,
          subject: item.subject,
          date: item.date,
          unread: item.unread,
          text: `${item.snippet}\n\nПолный текст — в веб-почте: кнопка «Открыть в веб-почте».`,
        }),
      ];
    },
    async act() {
      throw new Error(IN_WEBMAIL(adapter.label));
    },
    async search() {
      return [];
    },
    webURL: (account, message) => adapter.webURL(account, message),
  };
}
