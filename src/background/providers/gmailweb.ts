/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Gmail read through the browser's sign-in: the unread Atom feed.
 *
 * `mail.google.com/mail/u/0/feed/atom` lists up to 20 unread Inbox messages
 * of the first signed-in Google account, with the full unread count. The
 * feed has no read mail or bodies: the full text comes from Gmail's print
 * view of the message; actions stay in Gmail.
 *
 * @module background/providers/gmailweb
 */
import type {Account, InboxResult, MailMessage} from '../../shared/types';
import {requestText} from '../http';
import {categorize, count, message} from './message';
import {elements, firstAddress, markupText, sessionProvider} from './session';

/** The feed of the first signed-in account. */
const FEED = 'https://mail.google.com/mail/u/0/feed/atom';

/** Returns the text of the first `<tag>` in [xml]. */
const field = (xml: string, tag: string): string =>
  markupText(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] || '');

/**
 * Parses the Gmail Atom feed.
 *
 * @param xml The feed document.
 * @returns The mailbox address, unread count and messages.
 */
export function parseFeed(xml: string): {email: string} & InboxResult {
  const messages = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 50).map(([, entry]) => {
    const link = /<link[^>]*href="([^"]+)"/.exec(entry)?.[1].replace(/&amp;/g, '&') || '';
    const id = new URL(link || 'https://mail.google.com/').searchParams.get('message_id') || field(entry, 'id');
    const author = /<author>([\s\S]*?)<\/author>/.exec(entry)?.[1] || '';
    const name = field(author, 'name');
    const address = field(author, 'email');
    const from = name && address ? `${name} <${address}>` : name || address;
    return message({
      id,
      thread: id,
      from,
      subject: field(entry, 'title'),
      snippet: field(entry, 'summary'),
      date: Date.parse(field(entry, 'issued') || field(entry, 'modified')),
      link,
      unread: true,
      category: categorize({from}),
    });
  });
  return {
    email: firstAddress(field(xml, 'title')),
    unread: count(field(xml, 'fullcount'), messages.length),
    messages,
  };
}

/**
 * Returns the last message of a Gmail print view, or an empty string.
 *
 * @param html The print view page.
 */
export function parsePrint(html: string): string {
  return elements(html, 'table', /class="message"/).pop() || '';
}

/** Reads the feed with the browser's Google sign-in. */
const feed = async (): Promise<ReturnType<typeof parseFeed>> =>
  parseFeed(await requestText(FEED, {session: true, service: 'Gmail'}));

/** Gmail through the browser's sign-in. */
export const gmailWeb = sessionProvider({
  label: 'Gmail',
  async connect() {
    const {email} = await feed();
    if (!email) throw new Error('Не удалось определить адрес Gmail. Откройте Gmail в этом браузере и повторите.');
    return email;
  },
  async inbox(_account: Account, limit: number) {
    const {unread, messages} = await feed();
    return {unread, messages: messages.slice(0, limit)};
  },
  webURL: (_account: Account, item?: MailMessage | null) =>
    item?.id
      ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(item.id)}`
      : 'https://mail.google.com/mail/u/0/#inbox',
  async body(_account, item) {
    const url = `https://mail.google.com/mail/u/0/?ui=2&view=pt&dsqt=1&search=all&msg=${encodeURIComponent(item.id)}`;
    return {html: parsePrint(await requestText(url, {session: true, service: 'Gmail'}))};
  },
});
