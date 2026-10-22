/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Mail checks, the toolbar badge, notifications, conversations, search and message actions.
 *
 * A check stores a `Mailbox` per account in `mailboxes`: the latest Inbox
 * messages (read and unread) and the Inbox unread count. Notifications are
 * shown only for unread messages that were not listed by the previous
 * successful check, so the first check after connecting is silent.
 * Loaded mail is cached in bounded worker-owned IndexedDB; credentials stay in chrome.storage.
 *
 * @module background/mailbox
 */
import {cacheAction, cacheTicket, cacheView, invalidateCache} from './cache';
import {senderName} from '../shared/format';
import {accents, preferences} from '../shared/preferences';
import type {
  Account,
  FolderPage,
  MailFolder,
  MailMessage,
  Mailbox,
  MessageAction,
  SearchHit,
  SearchPage,
  SearchAccountPage,
  ThreadMessage,
} from '../shared/types';
import {FOLDER_ROLES, orderFolders} from '../shared/folders';
import {adapter, withAccount} from './accounts';
import {message as normalize} from './providers/message';
import {hasNotifications, setBadge} from './platform';
import {readStore, writeStore} from './storage';
import {t} from '../shared/i18n';

/** The running check of all accounts, shared by concurrent callers. */
let running: Promise<void> | null = null;

/** Messages older than this are not announced even if newly listed. */
const NOTIFY_WINDOW = 24 * 60 * 60 * 1000;

/** At most 100 actionable notification URLs survive in session storage. */
const NOTIFICATION_LIMIT = 100;
const NOTIFICATION_INDEX = 'notification-index';
let notificationWrites: Promise<unknown> = Promise.resolve();

/** Serializes notification URL/index changes across checks, clicks and dismissals. */
function notificationTask(callback: () => Promise<void>): Promise<void> {
  const result = notificationWrites.then(callback);
  notificationWrites = result.catch(() => {});
  return result;
}

/** Reads the bounded index, migrating and pruning URL records left by older versions once. */
async function notificationIDs(): Promise<string[]> {
  const value = (await chrome.storage.session.get(NOTIFICATION_INDEX))[NOTIFICATION_INDEX];
  if (!Array.isArray(value)) {
    const stored = await chrome.storage.session.get(null).catch(() => ({}));
    const legacy = Object.keys(stored).filter(key => key.startsWith('notification:'));
    const keep = legacy.slice(-NOTIFICATION_LIMIT).map(key => key.slice('notification:'.length));
    for (const key of legacy.slice(0, -NOTIFICATION_LIMIT)) await chrome.storage.session.remove(key);
    await chrome.storage.session.set({[NOTIFICATION_INDEX]: keep});
    return keep;
  }
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length <= 1024))].slice(
    -NOTIFICATION_LIMIT,
  );
}

/** Allowed message actions. */
const ACTIONS: readonly MessageAction[] = ['archive', 'trash', 'read', 'unread', 'pin', 'unpin'];

/** Account mutation generations and actions still waiting for the provider. */
const revisions = new Map<string, {version: number; actions: number}>();

/** Returns the current mutation generation of an account. */
function revision(id: string): {version: number; actions: number} {
  let value = revisions.get(id);
  if (!value) revisions.set(id, (value = {version: 0, actions: 0}));
  return value;
}

/** Checks every account, sharing an in-flight run. */
export function checkAll(): Promise<void> {
  running ??= (async () => {
    const store = await readStore();
    const connected = new Set((store.accounts || []).map(account => account.id));
    for (const id of revisions.keys()) if (!connected.has(id)) revisions.delete(id);
    await Promise.all((store.accounts || []).map(account => checkAccount(account.id)));
    await updateBadge();
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Checks one account and records the result or error. */
export async function checkAccount(id: string): Promise<void> {
  const ticket = cacheTicket(id);
  const changes = revision(id);
  const version = changes.version;
  const before = await readStore();
  const settings = preferences(before.preferences);
  const previous = before.mailboxes?.[id];
  let result: Mailbox;
  let unreadOnly = false;
  try {
    const value = await withAccount(id, (module, account) => {
      unreadOnly = module.unreadOnly === true;
      return module.inbox(account, settings.limit);
    });
    result = {...value, error: '', reauth: false, checkedAt: Date.now(), notified: true};
  } catch (error) {
    const failure = error as Error & {reauth?: boolean};
    result = {
      unread: previous?.unread || 0,
      ...(previous?.unreadPartial ? {unreadPartial: true} : {}),
      messages: previous?.messages || [],
      error: failure?.message || t('error_check_failed'),
      reauth: Boolean(failure?.reauth),
      checkedAt: Date.now(),
      notified: previous?.notified,
    };
  }
  let account: Account | undefined;
  let fresh: MailMessage[] = [];
  await writeStore(({accounts = [], mailboxes = {}}) => {
    account = accounts.find(item => item.id === id);
    // A check cannot restore mail changed by an action while its provider snapshot was in flight.
    if (!account || changes.version !== version || changes.actions) {
      account = undefined;
      return {};
    }
    if (unreadOnly && !result.error) {
      const listed = new Set(result.messages.map(item => item.id));
      const read = (mailboxes[id]?.messages || []).filter(item => !item.unread && !listed.has(item.id));
      result = {
        ...result,
        messages: [...result.messages, ...read].sort((a, b) => b.date - a.date).slice(0, settings.limit),
      };
    }
    // Claim new mail against the latest stored baseline, including overlapping account checks.
    const current = mailboxes[id];
    if (current?.notified && !result.error && settings.notifications) {
      const known = new Set(current.messages.map(item => item.id));
      fresh = result.messages.filter(
        item => item.unread && !known.has(item.id) && (item.date <= 0 || item.date > Date.now() - NOTIFY_WINDOW),
      );
    }
    return {mailboxes: {...mailboxes, [id]: result}};
  });
  if (account && !result.error) await cacheView(ticket, 'inbox', '', result.messages);
  if (account) await notify(account, fresh);
}

/** Graphite badge colours for the neutral palette. */
const NEUTRAL_BADGE = {color: '#171717', text: '#fafafa'};

/**
 * Updates the toolbar badge with the total unread count, or `!` when only errors remain.
 *
 * Unread mail takes the accent colour from the preferences.
 */
export async function updateBadge(): Promise<void> {
  const {accounts = [], mailboxes = {}, preferences: stored} = await readStore();
  const {palette} = preferences(stored);
  const accent = palette === 'neutral' ? NEUTRAL_BADGE : accents[palette];
  let unread = 0;
  let problems = 0;
  for (const account of accounts) {
    unread += mailboxes[account.id]?.unread || 0;
    if (mailboxes[account.id]?.error) problems += 1;
  }
  await setBadge(
    unread > 999 ? '999+' : unread ? String(unread) : problems ? '!' : '',
    unread ? {background: accent.color, text: accent.text} : {background: '#6b6b70', text: '#ffffff'},
    problems ? t('badge_title_problems', unread, problems) : t('badge_title', unread),
  );
}

/** Shows one notification for new messages of an account, where notifications exist. */
async function notify(account: Account, messages: MailMessage[]): Promise<void> {
  if (!messages.length || !hasNotifications()) return;
  const single = messages.length === 1;
  const id = `${account.id}:${Date.now()}`;
  const url = adapter(account).webURL(account, single ? messages[0] : null);
  await notificationTask(async () => {
    const ids = (await notificationIDs()).filter(existing => existing !== id);
    while (ids.length >= NOTIFICATION_LIMIT) {
      const old = ids.shift()!;
      await chrome.storage.session.remove(`notification:${old}`);
      await chrome.notifications.clear(old).catch(() => {});
    }
    try {
      await chrome.storage.session.set({[`notification:${id}`]: url, [NOTIFICATION_INDEX]: [...ids, id]});
      await chrome.notifications.create(id, {
        type: single ? 'basic' : 'list',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: single ? senderName(messages[0].from) : t('notification_new', messages.length),
        message: single ? messages[0].subject : account.email,
        contextMessage: account.email,
        ...(single
          ? {}
          : {items: messages.slice(0, 5).map(item => ({title: senderName(item.from), message: item.subject}))}),
        priority: 1,
      });
    } catch {
      await chrome.storage.session.remove(`notification:${id}`).catch(() => {});
      await chrome.storage.session.set({[NOTIFICATION_INDEX]: ids}).catch(() => {});
    }
  }).catch(() => {});
}

/** Removes the URL and index entry of a clicked or dismissed notification. */
export function closeNotification(id: string): Promise<void> {
  return notificationTask(async () => {
    await chrome.storage.session.remove(`notification:${id}`);
    const ids = await notificationIDs();
    await chrome.storage.session.set({[NOTIFICATION_INDEX]: ids.filter(existing => existing !== id)});
  });
}

/** Opens the webmail page stored for a clicked notification. */
export async function openNotification(id: string): Promise<void> {
  const key = `notification:${id}`;
  const {[key]: url} = await chrome.storage.session.get(key);
  await closeNotification(id).catch(() => {});
  if (typeof url === 'string' && url.startsWith('https://')) await chrome.tabs.create({url});
  await chrome.notifications.clear(id);
}

/** Returns a listed message, or a minimal record for a message outside the list (search hits). */
function lookup(box: Mailbox | undefined, id: string, thread = '', entry?: MailMessage): MailMessage {
  return box?.messages.find(item => item.id === id) || normalize(entry && entry.id === id ? entry : {id, thread});
}

/** Returns a bounded server catalog without changing the Inbox, notification baseline or badge. */
export async function folders(accountID: string): Promise<MailFolder[]> {
  return withAccount(accountID, async (module, account) => {
    if (!module.folders) throw new Error(t('folder_unsupported'));
    const value = await module.folders(account);
    const seen = new Set<string>();
    return orderFolders(
      value.slice(0, 200).flatMap(item => {
        const id = String(item.id || '').slice(0, 512);
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [
          {
            id,
            name: String(item.name || id).slice(0, 300),
            role: item.role && FOLDER_ROLES.includes(item.role) ? item.role : undefined,
            parent: item.parent ? String(item.parent).slice(0, 512) : undefined,
            total: Number.isSafeInteger(item.total) && item.total! >= 0 ? item.total : undefined,
            unread: Number.isSafeInteger(item.unread) && item.unread! >= 0 ? item.unread : undefined,
            approximate: item.approximate === true || undefined,
          },
        ];
      }),
    );
  });
}

/** Loads one selected folder page on demand and caches its normalized metadata. */
export async function folder(accountID: string, id: string, cursor = ''): Promise<FolderPage> {
  if (!id || id.length > 512 || cursor.length > 4096) throw new Error(t('error_bad_message'));
  const ticket = cacheTicket(accountID);
  const limit = 50;
  return withAccount(accountID, async (module, account) => {
    if (!module.folder) throw new Error(t('folder_unsupported'));
    const value = await module.folder(account, id, limit, cursor);
    const page = {
      messages: value.messages.slice(0, limit).map(item => normalize({...item, folder: id})),
      next: String(value.next || '').slice(0, 4096),
    };
    await cacheView(ticket, 'folder', JSON.stringify([id, cursor]), page.messages, page.next);
    return page;
  });
}

/**
 * Applies an action to a message and updates the stored list.
 *
 * Archive and trash remove the message from the Inbox list; read, unread,
 * pin and unpin change its flags and the unread count.
 *
 * @param accountID The account ID.
 * @param messageID The provider message ID.
 * @param action The action.
 */
export async function act(
  accountID: string,
  messageID: string,
  action: MessageAction,
  entry?: MailMessage,
): Promise<void> {
  if (!ACTIONS.includes(action)) throw new Error(t('error_unknown_action'));
  if (!messageID || messageID.length > 512) throw new Error(t('error_bad_message'));
  invalidateCache(accountID);
  const changes = revision(accountID);
  changes.version++;
  changes.actions++;
  try {
    const {mailboxes = {}} = await readStore();
    const item = lookup(mailboxes[accountID], messageID, '', entry);
    await withAccount(accountID, (module, account) => module.act(account, item, action));
    await updateMessage(accountID, messageID, action);
  } finally {
    invalidateCache(accountID);
    changes.actions--;
    changes.version++;
  }
}

/** Reconciles a provider-confirmed action with the stored list and badge. */
async function updateMessage(accountID: string, messageID: string, action: MessageAction): Promise<void> {
  revision(accountID).version++;
  await writeStore(({mailboxes: current = {}}) => {
    const box = current[accountID];
    const listed = box?.messages.find(entry => entry.id === messageID);
    if (!box || !listed) return {};
    let unread = box.unread;
    let messages = box.messages;
    if (action === 'archive' || action === 'trash') {
      messages = messages.filter(entry => entry.id !== messageID);
      if (listed.unread) unread -= 1;
    } else {
      const next = {...listed};
      if (action === 'read' || action === 'unread') {
        next.unread = action === 'unread';
        if (next.unread !== listed.unread) unread += next.unread ? 1 : -1;
      } else next.pinned = action === 'pin';
      messages = messages.map(entry => (entry.id === messageID ? next : entry));
    }
    return {mailboxes: {...current, [accountID]: {...box, messages, unread: Math.max(0, unread)}}};
  });
  await cacheAction(accountID, messageID, action);
  await updateBadge();
}

/** Provider body requests shared across simultaneously opened popup/tab clients. */
const pendingThreads = new Map<string, Promise<ThreadMessage[]>>();

/**
 * Loads a conversation with bodies; opening it marks unread messages as read.
 *
 * @param accountID The account ID.
 * @param messageID The selected message.
 * @param threadID Its conversation ID.
 */
export async function thread(
  accountID: string,
  messageID: string,
  threadID: string,
  entry?: MailMessage,
): Promise<ThreadMessage[]> {
  if (!messageID || messageID.length > 512 || threadID.length > 512) throw new Error(t('error_bad_message'));
  const {mailboxes = {}} = await readStore();
  const item = lookup(mailboxes[accountID], messageID, threadID, entry);
  const ticket = cacheTicket(accountID);
  const key = JSON.stringify([
    accountID,
    item.thread || threadID || messageID,
    messageID,
    ticket.epoch,
    ticket.version,
  ]);
  let pending = pendingThreads.get(key);
  if (!pending) {
    pending = withAccount(accountID, (module, account) =>
      module.thread(account, {...item, thread: item.thread || threadID}),
    )
      .then(async messages => {
        if (messages.some(message => message.id === messageID))
          await cacheView(ticket, 'thread', item.thread || threadID || messageID, messages);
        return messages;
      })
      .finally(() => {
        if (pendingThreads.get(key) === pending) pendingThreads.delete(key);
      });
    pendingThreads.set(key, pending);
  }
  // Callers reconcile their own selected unread message, without mutating another caller's snapshot.
  const messages = (await pending).map(message => ({...message}));
  const target = messages.find(message => message.id === messageID);
  if (item.unread || target?.unread) {
    try {
      if (target && !target.unread) await updateMessage(accountID, messageID, 'read');
      else await act(accountID, messageID, 'read', item);
      if (target) target.unread = false;
    } catch (error) {
      if ((error as {reauth?: boolean})?.reauth) throw error;
    }
  }
  return messages;
}

/**
 * Sends a plain-text reply to a listed message.
 *
 * @param accountID The account ID.
 * @param messageID The message replied to.
 * @param text The reply text.
 */
export async function reply(accountID: string, messageID: string, text: string, entry?: MailMessage): Promise<void> {
  if (!messageID || messageID.length > 512) throw new Error(t('error_bad_message'));
  if (!text.trim() || text.length > 100_000) throw new Error(t('error_reply_text'));
  const {mailboxes = {}} = await readStore();
  const item = lookup(mailboxes[accountID], messageID, '', entry);
  await withAccount(accountID, (module, account) => {
    if (!module.reply) throw new Error(t('error_reply_webmail'));
    return module.reply(account, item, text);
  });
  invalidateCache(accountID);
  await cacheAction(accountID, messageID);
}

/**
 * Searches all accounts and merges hits, newest first.
 *
 * Accounts that fail are skipped so one broken mailbox does not hide results.
 *
 * @param query The provider search text.
 */
export async function search(query: string): Promise<SearchHit[]> {
  const text = query.trim().slice(0, 200);
  if (!text) return [];
  const {accounts = []} = await readStore();
  const eligible = accounts.filter(account => !account.settings.browser);
  if (!eligible.length) return [];
  const result = await searchPage(
    text,
    eligible.map(account => ({account: account.id, cursor: ''})),
  );
  if (result.pages.every(page => page.error)) throw new Error(result.pages[0].error);
  return result.hits;
}

/** Searches requested accounts independently, retaining retries and opaque per-account cursors. */
export async function searchPage(query: string, input: unknown): Promise<SearchPage> {
  const text = query.trim().slice(0, 200);
  if (!Array.isArray(input) || input.length > 20) throw new Error(t('error_bad_message'));
  const {accounts = []} = await readStore();
  const seen = new Set<string>();
  const cursors = input.map(value => {
    if (
      !value ||
      typeof value !== 'object' ||
      typeof value.account !== 'string' ||
      typeof value.cursor !== 'string' ||
      value.account.length > 512 ||
      value.cursor.length > 4096 ||
      seen.has(value.account) ||
      !accounts.some(account => account.id === value.account)
    )
      throw new Error(t('error_bad_message'));
    seen.add(value.account);
    return {account: value.account, cursor: value.cursor};
  });
  if (!text) return {hits: [], pages: []};
  const requested = cursors.length ? cursors : accounts.map(account => ({account: account.id, cursor: ''}));
  const pages = await Promise.all(
    requested.map(async ({account: id, cursor}) => {
      const account = accounts.find(account => account.id === id)!;
      const ticket = cacheTicket(id);
      if (!adapter(account).searchPage)
        return {hits: [], page: {account: id, cursor: '', error: '', unsupported: true}};
      try {
        const value = await withAccount(id, (module, current) => module.searchPage!(current, text, 20, cursor));
        const messages = value.messages.slice(0, 20).map(item => normalize(item));
        const next = String(value.next || '');
        if (next.length > 4096 || (next && next === cursor))
          throw new Error(t('error_unexpected_reply', adapter(account).label));
        await cacheView(ticket, 'search', JSON.stringify([text, cursor]), messages, next);
        return {
          hits: messages.map(message => ({account: id, message})),
          page: {account: id, cursor: next, error: '', limited: value.limited},
        };
      } catch (error) {
        return {hits: [], page: {account: id, cursor, error: (error as Error)?.message || t('error_generic')}};
      }
    }),
  );
  return {
    hits: pages.flatMap(page => page.hits).sort((a, b) => b.message.date - a.message.date),
    pages: pages.map(page => page.page as SearchAccountPage),
  };
}

/** Opens the webmail Inbox or a listed message in a new tab. */
export async function open(accountID: string, messageID?: string, entry?: MailMessage): Promise<void> {
  const {accounts = [], mailboxes = {}} = await readStore();
  const account = accounts.find(item => item.id === accountID);
  if (!account) throw new Error(t('error_account_missing'));
  const item = messageID ? lookup(mailboxes[accountID], messageID, '', entry) : null;
  await chrome.tabs.create({url: adapter(account).webURL(account, item)});
}
