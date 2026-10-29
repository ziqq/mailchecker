/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * In-memory stand-in for the service worker in the sandbox build.
 *
 * Answers the client's `Request`s from fixtures with no extension APIs and
 * no network, so `popup.html` and `app.html` run in a plain browser tab.
 * Actions change the in-memory state; a reload starts over. Initial
 * preferences come from the page query (`?theme=dark&palette=pink`).
 *
 * @module sandbox/worker
 */
import {preferences} from '../shared/preferences';
import {ACCOUNT_COLORS, searchLoaded} from '../shared/inbox';
import type {
  MailMessage,
  Preferences,
  PublicState,
  Reply,
  Request,
  SearchHit,
  SearchPage,
  ThreadMessage,
} from '../shared/types';
import {createFixtures, type Fixtures} from './fixtures';
import {t} from '../shared/i18n';

/** Simulated worker latency, so loading states are visible. */
const LATENCY = 120;

/** Fixtures and preferences, created on the first request. */
let data: (Fixtures & {preferences: Preferences}) | null = null;
/** Browser sign-in started by the fixture user; the return scenario completes it on the next check. */
let pendingBrowserSignIn = '';
/** One simulated per-account search failure before a successful retry. */
const failedSearches = new Set<string>();
/** Folder metadata actually opened in the sandbox, mirroring the worker's loaded-mail cache. */
const loadedMessages = new Map<string, Map<string, MailMessage>>();

/** Returns the sandbox data, creating it on first use. */
function current(): Fixtures & {preferences: Preferences} {
  if (!data) {
    const query = new URLSearchParams(location.search);
    data = {
      ...createFixtures(Date.now()),
      preferences: preferences({
        theme: query.get('theme') ?? undefined,
        palette: query.get('palette') ?? undefined,
        popup: query.get('popup') ?? undefined,
      }),
    };
    const signedOut = query.get('reauth');
    if (signedOut && data.mailboxes[signedOut])
      data.mailboxes[signedOut] = {
        ...data.mailboxes[signedOut],
        error: t('error_account_mismatch', data.accounts.find(account => account.id === signedOut)!.email),
        reauth: true,
      };
    if (query.get('mail') === 'percentage') data.threads['gmail/g5'][0].html += '<style>html,body{height:100%}</style>';
    if (query.get('mail') === 'background')
      data.threads['gmail/g5'][0].html =
        `<div style="background-image:url('${location.origin}/icons/icon128.png');background-repeat:no-repeat;min-height:160px">CSS background image</div>`;
    if (query.get('mail') === 'srcset')
      data.threads['gmail/g5'][0].html =
        `<img width="64" height="64" alt="Image candidate" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=" srcset="${location.origin}/icons/icon128.png?candidate 2x">`;
    if (query.get('mail') === 'css-images') {
      const image = `${location.origin}/icons/icon128.png`;
      data.threads['gmail/g5'][0].html = `<style>
        .background {background-image:url('${image}?style')}
        .image-set {background-image:image-set("${image}?one" 1x,url('${image}?two') 2x)}
        @font-face {font-family:Unused;src:url('${location.origin}/unused.woff')}
        .text::after {content:"https://example.test/plain-text"}
      </style><div class="background" style="min-height:160px">Stylesheet image</div>
      <div class="image-set">Image set</div>
      <div style="background-image:url('${image.replace('http', '\\68 ttp')}?escaped')">Escaped URL</div>
      <div style="background-image:url('data:image/png;base64,iVBORw0KGgo=')">Embedded image</div>`;
    }
    if (query.get('search') === 'paged') {
      data.accounts = data.accounts.map(account => ({...account, search: account.provider !== 'icloud'}));
      for (const account of data.accounts) {
        data.archive[account.id] ||= [];
        const base = data.mailboxes[account.id].messages[0];
        data.archive[account.id].push(
          ...Array.from({length: 45}, (_, index) => ({
            ...base,
            from: base?.from || account.email,
            category: base?.category || 'people',
            link: base?.link || '',
            pinned: false,
            attachments: false,
            id: `search-${account.id}-${index}`,
            thread: `search-${account.id}-${index}`,
            subject: `Server pagination ${index + 1}`,
            snippet: 'Loaded on demand',
            date: Date.now() - index * 60_000,
            unread: false,
          })),
        );
      }
    }
    if (query.get('search') === 'webmail') data.accounts = data.accounts.filter(account => account.browser);
    if (query.get('search') === 'loaded')
      data.accounts = data.accounts
        .filter(account => account.id === 'gmail')
        .map(account => ({...account, browser: true, search: false, reply: false}));
  }
  return data;
}

/** Returns the public state. */
function state(): PublicState {
  const {accounts, mailboxes, preferences} = current();
  return {
    preferences,
    accounts,
    mailboxes,
    oauth: {
      google: true,
      microsoft: true,
      redirect: {
        google: 'https://sandbox.chromiumapp.org/google',
        microsoft: 'https://sandbox.chromiumapp.org/microsoft',
      },
    },
  };
}

/** Replaces the listed messages of [account] and adjusts its unread count by the difference. */
function update(account: string, messages: MailMessage[]): void {
  const {mailboxes} = current();
  const box = mailboxes[account];
  const listed = (items: MailMessage[]) => items.filter(item => item.unread).length;
  mailboxes[account] = {...box, messages, unread: Math.max(0, box.unread - listed(box.messages) + listed(messages))};
}

/** Returns a known account ID or throws. */
function account(id: string): string {
  if (!current().mailboxes[id]) throw new Error(t('error_account_missing'));
  return id;
}

/** Applies a message action. */
function act(id: string, message: string, action: string): void {
  const {mailboxes, archive, folderMessages, accounts, folders} = current();
  const messages = mailboxes[account(id)].messages;
  const target =
    messages.find(item => item.id === message) ||
    (archive[id] || []).find(item => item.id === message) ||
    Object.values(folderMessages[id])
      .flat()
      .find(item => item.id === message);
  if (!target) throw new Error(t('error_bad_message'));
  if (action === 'archive' || action === 'trash') {
    const destination = action === 'archive' ? 'archive' : 'trash';
    if (action === 'archive') archive[id] = [{...target, unread: false}, ...(archive[id] || [])];
    else archive[id] = (archive[id] || []).filter(item => item.id !== message);
    const labels = ['gmail', 'jmap'].includes(accounts.find(account => account.id === id)!.provider);
    for (const key of Object.keys(folderMessages[id]))
      if (
        action === 'trash' ||
        !labels ||
        folders[id].find(folder => folder.id === key)?.role === 'inbox' ||
        key === destination
      )
        folderMessages[id][key] = folderMessages[id][key].filter(item => item.id !== message);
    folderMessages[id][destination] = [{...target, folder: destination}, ...(folderMessages[id][destination] || [])];
    update(
      id,
      messages.filter(item => item !== target),
    );
    return;
  }
  const flags: Record<string, Partial<MailMessage>> = {
    read: {unread: false},
    unread: {unread: true},
    pin: {pinned: true},
    unpin: {pinned: false},
  };
  if (!flags[action]) throw new Error(t('error_unknown_action'));
  for (const key of Object.keys(folderMessages[id]))
    folderMessages[id][key] = folderMessages[id][key].map(item =>
      item.id === message ? {...item, ...flags[action]} : item,
    );
  update(
    id,
    messages.map(item => (item === target ? {...item, ...flags[action]} : item)),
  );
}

/** Delivers queued incoming mail and checks all mailboxes, or only [accountID] during sign-in. */
function check(accountID = ''): void {
  const {mailboxes, incoming} = current();
  const query = new URLSearchParams(location.search);
  const signedOut = query.get('reauth') || '';
  const session = query.get('session');
  if (
    mailboxes[signedOut] &&
    (!accountID || accountID === signedOut) &&
    (session === 'valid' || (session === 'after-return' && pendingBrowserSignIn === signedOut))
  )
    mailboxes[signedOut] = {...mailboxes[signedOut], error: '', reauth: false};
  const now = Date.now();
  for (const [id, box] of Object.entries(mailboxes)) {
    if (accountID && id !== accountID) continue;
    const delivered =
      query.get('refresh') === 'timestamp' ? [] : (incoming[id] || []).map(item => ({...item, date: now}));
    incoming[id] = [];
    if (delivered.length) update(id, [...delivered, ...box.messages]);
    if (!mailboxes[id].reauth) mailboxes[id] = {...mailboxes[id], checkedAt: now};
    // Like the lite Inbox, this scenario assigns fresh dates on every check and refreshes the reader cache.
    if (id === 'yandex' && query.get('refresh') === 'slow')
      mailboxes[id] = {...mailboxes[id], messages: mailboxes[id].messages.map(item => ({...item, date: now}))};
  }
}

/** Returns a conversation; messages without a fixture conversation become one-message threads. */
function thread(id: string, message: string, key: string): ThreadMessage[] {
  const {mailboxes, archive, threads, accounts, folderMessages} = current();
  const fixture = threads[`${account(id)}/${key || message}`];
  const item = [...mailboxes[id].messages, ...(archive[id] || []), ...Object.values(folderMessages[id]).flat()].find(
    entry => entry.id === message,
  );
  if (!item) throw new Error(t('error_bad_message'));
  if (item.unread) {
    if (mailboxes[id].messages.includes(item)) act(id, message, 'read');
    else {
      if (archive[id])
        archive[id] = archive[id].map(entry => (entry.id === message ? {...entry, unread: false} : entry));
      for (const key of Object.keys(folderMessages[id]))
        folderMessages[id][key] = folderMessages[id][key].map(entry =>
          entry.id === message ? {...entry, unread: false} : entry,
        );
    }
  }
  if (fixture) return fixture.map(entry => (entry.id === message ? {...entry, unread: false} : entry));
  const email = accounts.find(entry => entry.id === id)!.email;
  return [
    {
      id: item.id,
      from: item.from,
      to: email,
      cc: '',
      subject: item.subject,
      date: item.date,
      html: '',
      text: item.snippet,
      unread: false,
      attachments: item.attachments ? [{name: 'Attachment.pdf', size: 120_000, type: 'application/pdf'}] : [],
    },
  ];
}

/** Searches Inbox and archived mail of every account by sender, subject and snippet. */
function search(query: string, sessions = false): SearchHit[] {
  const {accounts, mailboxes, archive, folderMessages} = current();
  return accounts
    .filter(account => sessions || !account.browser)
    .flatMap(({id}) =>
      searchLoaded(
        [
          ...new Map(
            [...mailboxes[id].messages, ...(archive[id] || []), ...Object.values(folderMessages[id]).flat()].map(
              item => [item.id, item],
            ),
          ).values(),
        ],
        query,
      ).map(message => ({account: id, message})),
    )
    .sort((a, b) => b.message.date - a.message.date);
}

/** Simulates independent server cursors and one retryable mailbox failure for previewing search. */
function searchPage(query: string, pages: {account: string; cursor: string}[]): SearchPage {
  const accounts = current().accounts;
  const targets = pages.length ? pages : accounts.map(account => ({account: account.id, cursor: ''}));
  const hits = search(query, new URLSearchParams(location.search).get('search') === 'paged');
  const value: SearchPage = {hits: [], pages: []};
  for (const target of targets) {
    const account = accounts.find(account => account.id === target.account)!;
    const local = account.search === false || (account.search === undefined && account.browser);
    if (new URLSearchParams(location.search).get('searchError') === account.id && !failedSearches.has(account.id)) {
      failedSearches.add(account.id);
      value.pages.push({...target, error: t('error_unreachable', t('service_server'))});
      continue;
    }
    const offset = Number(target.cursor || 0);
    const all = local
      ? searchLoaded(
          [
            ...new Map([
              ...(loadedMessages.get(account.id) || new Map()),
              ...current().mailboxes[account.id].messages.map(message => [message.id, message] as const),
            ]).values(),
          ],
          query,
        ).map(message => ({account: account.id, message}))
      : hits.filter(hit => hit.account === target.account);
    const messages = all.slice(offset, offset + 20);
    value.hits.push(...messages);
    value.pages.push({
      account: target.account,
      cursor: offset + messages.length < all.length ? String(offset + messages.length) : '',
      error: '',
      ...(local ? {local: true} : {}),
    });
  }
  return value;
}

/** Answers one request. */
function answer(message: Request): unknown {
  switch (message.type) {
    case 'CACHED_THREAD':
      return null;
    case 'CLEAR_CACHE':
      loadedMessages.clear();
      return true;
    case 'STATE':
      return state();
    case 'CHECK':
      check();
      return state();
    case 'FOLDERS':
      return current().folders[account(message.account)].map(folder => {
        const items =
          folder.role === 'inbox'
            ? current().mailboxes[message.account].messages
            : current().folderMessages[message.account][folder.id] || [];
        return {
          ...folder,
          total:
            message.account === 'yandex'
              ? undefined
              : folder.role === 'inbox'
                ? Math.max(items.length, current().mailboxes[message.account].unread)
                : items.length,
          unread:
            folder.role === 'inbox'
              ? current().mailboxes[message.account].unread
              : items.filter(item => item.unread).length,
        };
      });
    case 'FOLDER': {
      const id = account(message.account);
      const items =
        message.folder === 'inbox' ? current().mailboxes[id].messages : current().folderMessages[id][message.folder];
      if (!items) throw new Error(t('error_bad_message'));
      const offset = Number(message.cursor || 0);
      const messages = items.slice(offset, offset + 50).map(item => ({...item, folder: message.folder}));
      const loaded = loadedMessages.get(id) || new Map<string, MailMessage>();
      for (const item of messages) loaded.set(item.id, item);
      loadedMessages.set(id, loaded);
      return {messages, next: offset + messages.length < items.length ? String(offset + messages.length) : ''};
    }
    case 'ACT':
      if (
        message.action === 'trash' &&
        message.account === 'yandex' &&
        new URLSearchParams(location.search).get('trash') === 'partial'
      )
        throw new Error(
          t('error_account_mismatch', current().accounts.find(account => account.id === 'yandex')!.email),
        );
      act(message.account, message.message, message.action);
      if (message.action === 'archive' || message.action === 'trash')
        loadedMessages.get(message.account)?.delete(message.message);
      return state();
    case 'THREAD':
      return thread(message.account, message.message, message.thread);
    case 'SEARCH':
      if (new URLSearchParams(location.search).get('search') === 'error')
        throw new Error(t('error_unreachable', t('service_server')));
      return message.pages ? searchPage(message.query, message.pages) : search(message.query);
    case 'REPLY':
      if (!message.text.trim()) throw new Error(t('error_reply_text'));
      return true;
    case 'PREFERENCES': {
      const sandbox = current();
      sandbox.preferences = preferences({...sandbox.preferences, ...message.value});
      return sandbox.preferences;
    }
    case 'ACCOUNT_COLOR': {
      const id = account(message.account);
      if (message.color && !ACCOUNT_COLORS.includes(message.color)) throw new Error(t('error_unknown_color'));
      current().accounts.find(item => item.id === id)!.color = message.color;
      return state();
    }
    case 'SIGN_IN': {
      const {accounts, mailboxes} = current();
      const id = account(message.account);
      const stored = accounts.find(item => item.id === id)!;
      if (stored.browser) {
        check(id);
        const webmail = {
          gmail: 'https://mail.google.com/mail/u/0/#inbox',
          yandex: 'https://mail.yandex.ru/',
          mailru: 'https://e.mail.ru/inbox/',
        };
        if (mailboxes[id].reauth) {
          pendingBrowserSignIn = id;
          window.open(webmail[stored.provider as keyof typeof webmail], '_blank', 'noopener');
        }
        return state();
      }
      mailboxes[id] = {...mailboxes[id], error: '', reauth: false, checkedAt: Date.now()};
      return state();
    }
    case 'OPEN_APP':
      window.open('app.html', '_blank', 'noopener');
      return true;
    default:
      throw new Error(t('error_request_denied'));
  }
}

/**
 * Handles a client request like the service worker would, after a short delay.
 *
 * @param message The typed request.
 * @returns The worker reply envelope.
 */
export async function handle(message: Request): Promise<Reply> {
  const query = new URLSearchParams(location.search);
  const delayed =
    (message.type === 'THREAD' && query.get('refresh') === 'slow') ||
    (message.type === 'FOLDER' && query.get('folders') === 'slow');
  await new Promise(resolve => setTimeout(resolve, delayed ? 2000 : LATENCY));
  try {
    if (
      (message.type === 'FOLDERS' || message.type === 'FOLDER') &&
      query.get('folders') === 'partial' &&
      message.account === 'mailru'
    )
      throw new Error(current().mailboxes.mailru.error);
    if (message.type === 'FOLDERS' && query.get('folders') === 'gmail-web' && message.account === 'gmail')
      throw new Error(t('folder_unsupported'));
    return {ok: true, value: structuredClone(answer(message))};
  } catch (error) {
    return {ok: false, error: error instanceof Error ? error.message : t('error_unknown')};
  }
}
