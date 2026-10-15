/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Yandex Mail read through the browser's sign-in: the lite web Inbox.
 *
 * This browser-session adapter reads the lite Inbox page
 * (`mail.yandex.ru/lite/inbox`) is parsed: the folder list gives the unread
 * count, message rows give sender, subject, first line, read state and the
 * checkbox the lite toolbar acts on. A message page gives the full text and
 * marks the message read; deleting posts the lite toolbar form. The markup is
 * not a public contract; parsing is defensive and bounded.
 *
 * @module background/providers/yandex
 */
import type {Account, FolderRole, InboxResult, MailFolder, MailMessage} from '../../shared/types';
import {AuthError, requestText} from '../http';
import {categorize, count, message} from './message';
import {elements, firstAddress, markupText, sessionProvider, verifyMailbox} from './session';
import {t} from '../../shared/i18n';

/** The lite web interface. */
const ORIGIN = 'https://mail.yandex.ru';

/** Folder paths accepted from the lite navigation; never accept a host or arbitrary endpoint. */
const FOLDER_PATH = /^(inbox|sent|trash|spam|drafts|archive|folder\/\d+)$/;

/** Parses the lite folder navigation, preserving custom IDs and names. */
export function parseFolders(html: string): MailFolder[] {
  const [navigation] = elements(html, 'div', classTag('b-folders'), 0, 1);
  if (!navigation) throw new Error(t('error_unexpected_page', t('service_yandex')));
  return elements(navigation, 'span', classTag('b-folders__folder')).flatMap(block => {
    const [anchor] = elements(block, 'a', /href=["']\/lite\//, 0, 1);
    if (!anchor) return [];
    const id = /href=["']\/lite\/([^"'?#]+)["']/.exec(anchor)?.[1] || '';
    if (!FOLDER_PATH.test(id)) return [];
    const label = /aria-label=["']([^"']+)["']/.exec(anchor)?.[1] || '';
    const visible = /class=["'][^"']*b-folders__folder__num[^"']*["'][^>]*>\s*([\d,]+)/.exec(block)?.[1];
    const announced = [...label.matchAll(/,\s*([\d,]+)\s/g)].pop()?.[1];
    return [
      {
        id,
        name: markupText(anchor),
        role: id.includes('/') ? undefined : (id as FolderRole),
        unread: count((visible || announced || '0').replace(/,/g, ''), 0),
      },
    ];
  });
}

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
 * @param offset Server-order offset when the page has no machine-readable dates. Nonpositive dates are order only.
 * @throws {AuthError} For the sign-in page.
 */
export function parseInbox(html: string, offset = 0): InboxResult {
  if (/type=["']password["']/.test(html)) throw new AuthError(t('error_sign_in_yandex'));
  const folders = /<div class="b-folders">([\s\S]*?)<\/div>/.exec(html)?.[1] || '';
  if (!folders.includes('href="/lite/inbox"')) throw new Error(t('error_unexpected_page', t('service_yandex')));
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
        date: -offset - index - 1,
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
const OPTIONS = {session: true, service: t('service_yandex')};

/** Matches one trusted class token in a quoted or unquoted opening tag. */
function classTag(name: string): RegExp {
  return new RegExp(
    `\\bclass\\s*=\\s*(?:"(?:[^"]*\\s)?${name}(?:\\s[^"]*)?"|'(?:[^']*\\s)?${name}(?:\\s[^']*)?'|${name}(?=[\\s>]))`,
  );
}

/** Reads the mailbox address from the lite page's account header, never from message senders. */
export function parseOwner(html: string): string {
  const [account] = elements(html, 'div', classTag('b-head-user'), 0, 1);
  const [active] = account ? elements(account, 'li', classTag('b-dropdown__visible'), 0, 1) : [];
  const login = active
    ? pick(active, [
        // Yandex formats the first letter in a nested <b>; the accessible name keeps the login intact.
        /<a\b[^>]*\baria-label=["']([^"']+)["']/,
        /<a\b[^>]*>([\s\S]*?)<\/a>/,
      ])
    : account
      ? pick(account, [
          /<a\b[^>]*href=["']https:\/\/passport\.yandex\.(?:ru|com)\/profile\/avatars\/?["'][^>]*>([\s\S]*?)<\/a>/,
        ])
      : '';
  if (/^[\w.-]+$/.test(login)) return `${login.toLowerCase()}@yandex.ru`;
  const header =
    login ||
    pick(html, [
      /class="[^"]*b-head-user__login[^"]*"[^>]*>([\s\S]*?)<\//,
      /class="[^"]*b-header__user[^"]*"[^>]*>([\s\S]*?)<\//,
    ]);
  return firstAddress(header);
}

/** Normalizes Yandex's documented dot/dash and public-domain mailbox aliases. */
function canonicalAddress(address: string): string {
  const [login, domain] = address.trim().toLowerCase().split('@');
  const aliases = ['yandex.ru', 'yandex.com', 'yandex.by', 'yandex.kz', 'yandex.com.tr', 'ya.ru'];
  return domain ? `${login.replace(/\./g, '-')}@${aliases.includes(domain) ? 'yandex.ru' : domain}` : '';
}

/** Reads a trusted lite folder path and verifies its owner before exposing messages or forms. */
async function page(email: string, folder = 'inbox', cursor = ''): Promise<string> {
  const html = await requestText(`${ORIGIN}/lite/${folder}${cursor ? `/page_number=${cursor}` : ''}`, OPTIONS);
  parseInbox(html);
  const owner = parseOwner(html);
  // Preserve the connected spelling in errors when a documented alias resolves to the same mailbox.
  verifyMailbox(email, owner && canonicalAddress(email) === canonicalAddress(owner) ? email : owner);
  return html;
}

/**
 * Returns the body of a lite message page, rejecting sign-in and unexpected pages.
 *
 * @param html The message page.
 */
export function parseMessage(html: string): string {
  if (/type=["']password["']/.test(html)) throw new AuthError(t('error_sign_in_yandex'));
  const [body] = elements(html, 'div', /class="[^"]*b-message-body(?:__content)?[" ]/);
  if (!body) throw new Error(t('error_unexpected_page', t('service_yandex')));
  return body.slice(body.indexOf('>') + 1, body.lastIndexOf('</div'));
}

/** Deletes a listed message with the lite toolbar form, as its «Удалить» button does. */
async function remove(account: Account, item: MailMessage): Promise<void> {
  if (item.folder === 'trash') throw new Error(t('error_in_webmail', t('service_yandex')));
  const [field, value] = item.thread.split('=');
  if (!value || (field !== 'ids' && field !== 'tids')) throw new Error(t('error_delete_in_webmail'));
  const ckey = /name="_ckey" value="([^"]+)"/.exec(await page(account.email))?.[1];
  if (!ckey) throw new Error(t('error_unexpected_page', t('service_yandex')));
  await requestText(`${ORIGIN}/lite/messages-action.xml`, {
    ...OPTIONS,
    method: 'POST',
    form: {delete: 'Удалить', request: '', _ckey: ckey, _handlers: 'do-messages', retpath: '/inbox', [field]: value},
  });
}

/** Opens a verified single-message page, which marks that message read in the lite webmail. */
async function read(account: Account, item: MailMessage): Promise<{html: string}> {
  if (!item.link.startsWith(`${ORIGIN}/lite/message/`)) throw new Error(t('error_in_webmail', t('service_yandex')));
  await page(account.email);
  return {html: parseMessage(await requestText(item.link, OPTIONS))};
}

/** Yandex Mail through the browser's sign-in. */
export const yandex = sessionProvider({
  label: t('service_yandex'),
  bodyMarksRead: true,
  async connect(email) {
    const address = firstAddress(email || '');
    if (!address) throw new Error(t('error_yandex_address'));
    await page(address);
    return address;
  },
  async inbox(account: Account, limit: number) {
    const {unread, messages} = parseInbox(await page(account.email));
    return {unread, messages: messages.slice(0, limit)};
  },
  async folders(account) {
    return parseFolders(await page(account.email));
  },
  async folder(account, id, limit, cursor) {
    if (!FOLDER_PATH.test(id) || (cursor && !/^\d{1,7}$/.test(cursor))) throw new Error(t('error_bad_message'));
    const html = await page(account.email, id, cursor);
    const value = parseInbox(html, Number(cursor || 0) * 200);
    const [pager] = elements(html, 'div', /class=["'][^"']*b-pager/, 0, 1);
    const [nextAnchor] = pager ? elements(pager, 'a', classTag('b-pager__next'), 0, 1) : [];
    const nextLink = nextAnchor && /href=["']([^"']+)["']/.exec(nextAnchor)?.[1];
    let next = '';
    if (nextLink) {
      const url = new URL(nextLink.replace(/&amp;/g, '&'), ORIGIN);
      const match = /^\/page_number=(\d{1,7})$/.exec(url.pathname.slice(`/lite/${id}`.length));
      if (url.origin === ORIGIN && url.pathname.startsWith(`/lite/${id}/`) && match) next = match[1];
    }
    // Lite pages have their own page size; never discard the rest of a server page.
    return {messages: value.messages.slice(0, limit).map(item => ({...item, folder: id})), next};
  },
  webURL: (_account: Account, item?: MailMessage | null) => item?.link || `${ORIGIN}/`,
  // Opening a message page marks the message read, as in the lite web interface.
  body: read,
  // `read` happens when the message page is opened for its body.
  actions: ['trash', 'read'],
  async act(account, item, action) {
    if (action === 'trash') await remove(account, item);
    else await read(account, item);
  },
});
