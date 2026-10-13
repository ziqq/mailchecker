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
 * view of the message. Actions post the request Gmail's own web client
 * sends, with the page key (`ID_KEY`) and the `GMAIL_AT` action cookie, read
 * with the optional `cookies` permission.
 *
 * @module background/providers/gmailweb
 */
import type {Account, InboxResult, MailMessage, MessageAction} from '../../shared/types';
import {requestText} from '../http';
import {readCookie} from '../platform';
import {categorize, count, decodeEntities, message} from './message';
import {elements, firstAddress, markupText, sessionProvider} from './session';
import {t} from '../../shared/i18n';

/** The first signed-in account in Gmail. */
const BASE = 'https://mail.google.com/mail/u/0';

/** The feed of the first signed-in account. */
const FEED = `${BASE}/feed/atom`;

/** Session request options. */
const OPTIONS = {session: true, service: 'Gmail'};

/** Gmail web client action codes. */
const CODES: Partial<Record<MessageAction, number>> = {archive: 1, read: 3, pin: 5, unpin: 6, trash: 9};

/** The page key of the Gmail web client, cached for the worker's lifetime. */
let pageKey = '';

/**
 * Returns the page key of a Gmail page: `ID_KEY` in the light client, the
 * tenth `GLOBALS` entry in the full one; an empty string when absent.
 *
 * @param html The page.
 */
export function parseKey(html: string): string {
  const light = /ID_KEY\s*=\s*['"]([^'"]+)['"]/.exec(html)?.[1];
  const full = /var GLOBALS\s*=\s*\[(?:([^,]*),){10}/.exec(html)?.[1]?.replace(/["'\s]/g, '');
  return light || full || '';
}

/** Returns the Gmail page key: the light client (following one `<meta http-equiv="refresh">`), then the full one. */
async function idKey(): Promise<string> {
  if (pageKey) return pageKey;
  let url = `${BASE}/s/`;
  for (let step = 0; step < 2 && !pageKey; step++) {
    const html = await requestText(url, OPTIONS);
    pageKey = parseKey(html);
    const refresh = /<meta[^>]*http-equiv=["']?refresh["']?[^>]*url=([^"'>]+)/i.exec(html)?.[1];
    if (!refresh) break;
    url = new URL(decodeEntities(refresh), url).href;
  }
  if (!pageKey) pageKey = parseKey(await requestText(`${BASE}/`, OPTIONS));
  if (!pageKey) throw new Error(t('error_gmail_key'));
  return pageKey;
}

/** Applies an action to a message as Gmail's web client does. */
async function act(item: MailMessage, action: MessageAction): Promise<void> {
  const at = await readCookie(BASE, 'GMAIL_AT');
  if (!at) throw new Error(t('error_gmail_cookies'));
  const key = await idKey();
  const update = [null, CODES[action], item.id, item.id, 'l:all', [], [], null];
  const refresh = [null, null, null, null, null, null, [null, true, false]];
  const reply = await requestText(
    `${BASE}/s/?v=or&ik=${encodeURIComponent(key)}&at=${encodeURIComponent(at)}&subui=chrome&hl=en&ts=${Date.now()}`,
    {
      ...OPTIONS,
      method: 'POST',
      form: {s_jr: JSON.stringify([null, [[null, null, null, update], refresh, refresh], 2, null, null, null, key])},
    },
  );
  if (!reply || reply.includes('/spreauth')) throw new Error(t('error_gmail_action'));
}

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
const feed = async (): Promise<ReturnType<typeof parseFeed>> => parseFeed(await requestText(FEED, OPTIONS));

/** Gmail through the browser's sign-in. */
export const gmailWeb = sessionProvider({
  label: 'Gmail',
  async connect() {
    const {email} = await feed();
    if (!email) throw new Error(t('error_gmail_address'));
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
    return {html: parsePrint(await requestText(url, OPTIONS))};
  },
  actions: Object.keys(CODES) as MessageAction[],
  act: (_account, item, action) => act(item, action),
});
