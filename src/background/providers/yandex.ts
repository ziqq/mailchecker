/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Yandex Mail read through the browser's sign-in: the lite web Inbox.
 *
 * Yandex has no HTTP mail API, so the lite Inbox page
 * (`mail.yandex.ru/lite/inbox`) is parsed: the folder list gives the unread
 * count, message rows give sender, subject, first line, read state and the
 * checkbox the lite toolbar acts on. A message page gives the full text and
 * marks the message read; deleting posts the lite toolbar form. The markup is
 * not a public contract; parsing is defensive and bounded.
 *
 * @module background/providers/yandex
 */
import type {Account, InboxResult, MailMessage} from '../../shared/types';
import {AuthError, requestText} from '../http';
import {categorize, count, message} from './message';
import {elements, firstAddress, markupText, sessionProvider} from './session';

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

/** Splits the message list into row blocks. */
const rows = (html: string): string[] => {
  const start = html.indexOf('class="b-messages"');
  return start < 0 ? [] : elements(html, 'div', /class="[^"]*(?:b-messages__message|b-message )/, start);
};

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
      // The toolbar checkbox: `ids` for a message, `tids` (`<thread>:<count>`) for a thread.
      const box = /<input[^>]*name="(ids|tids)"[^>]*value="([^"]+)"/.exec(block);
      const from =
        /class="[^"]*b-message__from[^"]*"[^>]*title="([^"]+)"/.exec(block)?.[1] ||
        pick(block, [
          /class="[^"]*b-message__from__text[^"]*"[^>]*>([^<]+)<\/span>/,
          /class="[^"]*b-messages__message__sender[^"]*"[^>]*>([^<]+)<\/span>/,
          /class="[^"]*b-messages__from__text[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)<\/span>/,
        ]);
      return {
        href,
        box: box ? `${box[1]}=${box[2]}` : '',
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
    .map((row, index, list) => {
      const fallback = row.href.split('/').filter(Boolean).pop()?.split('?')[0] || row.href;
      const base = row.box ? row.box.slice(row.box.indexOf('=') + 1) : fallback;
      // Selection and actions need unique IDs even if two rows share a link.
      const id = list.slice(0, index).some(other => (other.box || other.href) === (row.box || row.href))
        ? `${base}~${index}`
        : base;
      return message({
        id,
        thread: row.box || id,
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

/** Session request options. */
const OPTIONS = {session: true, service: 'Яндекс Почта'};

/** Reads the lite Inbox page with the browser's Yandex sign-in. */
const page = (): Promise<string> => requestText(`${ORIGIN}/lite/inbox`, OPTIONS);

/** Reads the lite Inbox with the browser's Yandex sign-in. */
const inbox = async (): Promise<InboxResult> => parseInbox(await page());

/**
 * Returns the body of a lite message page, or an empty string.
 *
 * @param html The message page.
 */
export function parseMessage(html: string): string {
  const [body] = elements(html, 'div', /class="[^"]*b-message-body(?:__content)?[" ]/);
  return body ? body.slice(body.indexOf('>') + 1, body.lastIndexOf('</div')) : '';
}

/** Deletes a listed message with the lite toolbar form, as its «Удалить» button does. */
async function remove(item: MailMessage): Promise<void> {
  const [field, value] = item.thread.split('=');
  if (!value || (field !== 'ids' && field !== 'tids')) throw new Error('Удалите это письмо в веб-почте.');
  const ckey = /name="_ckey" value="([^"]+)"/.exec(await page())?.[1];
  if (!ckey) throw new Error('Яндекс Почта вернула неожиданную страницу.');
  await requestText(`${ORIGIN}/lite/messages-action.xml`, {
    ...OPTIONS,
    method: 'POST',
    form: {delete: 'Удалить', request: '', _ckey: ckey, _handlers: 'do-messages', retpath: '/inbox', [field]: value},
  });
}

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
  // Opening a message page marks the message read, as in the lite web interface.
  async body(_account, item) {
    if (!item.link.startsWith(`${ORIGIN}/lite/message/`)) return {};
    return {html: parseMessage(await requestText(item.link, OPTIONS))};
  },
  // `read` happens when the message page is opened for its body.
  actions: ['trash', 'read'],
  async act(_account, item, action) {
    if (action === 'trash') await remove(item);
  },
});
