/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Yandex Mail read through the browser's sign-in: the lite web Inbox.
 *
 * Yandex has no HTTP mail API, so the lite Inbox page
 * (`mail.yandex.ru/lite/inbox`) is parsed: the folder list gives the unread
 * count, message rows give sender, subject, first line and read state. The
 * markup is not a public contract; parsing is defensive and bounded.
 *
 * @module background/providers/yandex
 */
import type {Account, InboxResult, MailMessage} from '../../shared/types';
import {AuthError, requestText} from '../http';
import {categorize, count, message} from './message';
import {firstAddress, markupText, sessionProvider} from './session';

/** The lite web interface. */
const ORIGIN = 'https://mail.yandex.ru';

/** Returns the first capture of the first matching pattern, as visible text. */
const pick = (html: string, patterns: RegExp[]): string => {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return markupText(match[1]);
  }
  return '';
};

/** Splits the message list into row blocks, matching nested `<div>`s. */
function rows(html: string): string[] {
  const start = html.indexOf('class="b-messages"');
  if (start < 0) return [];
  const blocks: string[] = [];
  let position = start;
  while (blocks.length < 200) {
    const open = html.indexOf('<div', position);
    if (open < 0) break;
    const end = html.indexOf('>', open);
    if (end < 0) break;
    const tag = html.slice(open, end + 1);
    if (!/class="[^"]*(?:b-messages__message|b-message )/.test(tag)) {
      position = open + 4;
      continue;
    }
    let depth = 1;
    let cursor = end + 1;
    while (depth > 0) {
      const nextOpen = html.indexOf('<div', cursor);
      const nextClose = html.indexOf('</div', cursor);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        cursor = nextOpen + 4;
      } else {
        depth--;
        cursor = nextClose + 6;
      }
    }
    blocks.push(html.slice(open, cursor));
    if (depth > 0) break;
    position = cursor;
  }
  return blocks;
}

/**
 * Parses the lite Inbox page.
 *
 * @param html The page.
 * @param now The time given to the newest message; rows carry no parseable date, so older rows get earlier times.
 * @throws {AuthError} For the sign-in page.
 */
export function parseInbox(html: string, now = Date.now()): InboxResult {
  if (/type=["']password["']/.test(html)) throw new AuthError('Войдите в Яндекс Почту в этом браузере и повторите.');
  const folders = /<div class="b-folders">([\s\S]*?)<\/div>/.exec(html)?.[1] || '';
  if (!folders.includes('href="/lite/inbox"')) throw new Error('Яндекс Почта вернула неожиданную страницу.');
  const inboxPart = folders.split('href="/lite/inbox"')[0];
  const folderCount = /class="b-folders__folder__num"[^>]*>\s*([\d,]+)\s*<\/span>/.exec(inboxPart)?.[1];
  const messages = rows(html)
    .map(block => {
      const href = /href="(\/lite\/(?:message|thread)\/[^"]+)"/.exec(block)?.[1];
      if (!href) return null;
      const from =
        /class="[^"]*b-message__from[^"]*"[^>]*title="([^"]+)"/.exec(block)?.[1] ||
        pick(block, [
          /class="[^"]*b-message__from__text[^"]*"[^>]*>([^<]+)<\/span>/,
          /class="[^"]*b-messages__message__sender[^"]*"[^>]*>([^<]+)<\/span>/,
          /class="[^"]*b-messages__from__text[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)<\/span>/,
        ]);
      return {
        href,
        from: markupText(from),
        subject: pick(block, [
          /class="[^"]*b-message__subject__text[^"]*"[^>]*>([\s\S]*?)<\/span>/,
          /class="[^"]*b-messages__message__subject[^"]*"[^>]*>([\s\S]*?)<\/span>/,
          /class="[^"]*b-messages__subject[^"]*"[^>]*>(?:<span[^>]*>)?([\s\S]*?)<\/span>/,
        ]),
        snippet: pick(block, [
          /class="[^"]*b-message__firstline[^"]*"[^>]*>([\s\S]*?)<\/span>/,
          /class="[^"]*b-messages__message__firstline[^"]*"[^>]*>([\s\S]*?)<\/span>/,
          /class="[^"]*b-messages__firstline[^"]*"[^>]*>([\s\S]*?)<\/span>/,
        ]),
        unread: block.includes('b-message_unread') || block.includes('b-messages__message_unread'),
      };
    })
    .filter(row => row !== null)
    .map((row, index) => {
      const id = row.href.split('/').filter(Boolean).pop() || row.href;
      return message({
        id,
        thread: id,
        from: row.from,
        subject: row.subject,
        snippet: row.snippet,
        date: now - index * 60_000,
        link: ORIGIN + row.href,
        unread: row.unread,
        category: categorize({from: row.from}),
      });
    });
  return {
    unread: count(folderCount?.replace(/,/g, ''), messages.filter(item => item.unread).length),
    messages,
  };
}

/** Reads the lite Inbox with the browser's Yandex sign-in. */
const inbox = async (): Promise<InboxResult> =>
  parseInbox(await requestText(`${ORIGIN}/lite/inbox`, {session: true, service: 'Яндекс Почта'}));

/** Yandex Mail through the browser's sign-in. */
export const yandex = sessionProvider({
  label: 'Яндекс Почта',
  async connect(email) {
    const address = firstAddress(email || '');
    if (!address) throw new Error('Укажите адрес Яндекс Почты.');
    await inbox();
    return address;
  },
  async inbox(_account: Account, limit: number) {
    const {unread, messages} = await inbox();
    return {unread, messages: messages.slice(0, limit)};
  },
  webURL: (_account: Account, item?: MailMessage | null) => item?.link || `${ORIGIN}/`,
});
