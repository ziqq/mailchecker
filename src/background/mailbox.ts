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
 * Conversation bodies and search results are returned to the page and
 * never stored.
 *
 * @module background/mailbox
 */
import {senderName} from '../shared/format';
import {accents, preferences} from '../shared/preferences';
import type {Account, MailMessage, Mailbox, MessageAction, SearchHit, ThreadMessage} from '../shared/types';
import {adapter, withAccount} from './accounts';
import {message as normalize} from './providers/message';
import {hasNotifications, setBadge} from './platform';
import {readStore, writeStore} from './storage';
import {t} from '../shared/i18n';

/** The running check of all accounts, shared by concurrent callers. */
let running: Promise<void> | null = null;

/** Messages older than this are not announced even if newly listed. */
const NOTIFY_WINDOW = 24 * 60 * 60 * 1000;

/** Allowed message actions. */
const ACTIONS: readonly MessageAction[] = ['archive', 'trash', 'read', 'unread', 'pin', 'unpin'];

/** Checks every account, sharing an in-flight run. */
export function checkAll(): Promise<void> {
  running ??= (async () => {
    const store = await readStore();
    await Promise.all((store.accounts || []).map(account => checkAccount(account.id)));
    await updateBadge();
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Checks one account and records the result or error. */
export async function checkAccount(id: string): Promise<void> {
  const before = await readStore();
  const settings = preferences(before.preferences);
  const previous = before.mailboxes?.[id];
  let result: Mailbox;
  try {
    const value = await withAccount(id, (module, account) => module.inbox(account, settings.limit));
    result = {...value, error: '', reauth: false, checkedAt: Date.now(), notified: true};
  } catch (error) {
    const failure = error as Error & {reauth?: boolean};
    result = {
      unread: previous?.unread || 0,
      messages: previous?.messages || [],
      error: failure?.message || t('error_check_failed'),
      reauth: Boolean(failure?.reauth),
      checkedAt: Date.now(),
      notified: previous?.notified,
    };
  }
  let account: Account | undefined;
  await writeStore(({accounts = [], mailboxes = {}}) => {
    account = accounts.find(item => item.id === id);
    // The account may have been removed while the check ran.
    return account ? {mailboxes: {...mailboxes, [id]: result}} : {};
  });
  if (account && previous?.notified && !result.error && settings.notifications) {
    const known = new Set(previous.messages.map(item => item.id));
    const fresh = result.messages.filter(
      item => item.unread && !known.has(item.id) && item.date > Date.now() - NOTIFY_WINDOW,
    );
    await notify(account, fresh);
  }
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
  await chrome.storage.session.set({[`notification:${id}`]: url});
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
}

/** Opens the webmail page stored for a clicked notification. */
export async function openNotification(id: string): Promise<void> {
  const key = `notification:${id}`;
  const {[key]: url} = await chrome.storage.session.get(key);
  await chrome.storage.session.remove(key);
  if (typeof url === 'string' && url.startsWith('https://')) await chrome.tabs.create({url});
  await chrome.notifications.clear(id);
}

/** Returns a listed message, or a minimal record for a message outside the list (search hits). */
function lookup(box: Mailbox | undefined, id: string, thread = ''): MailMessage {
  return box?.messages.find(entry => entry.id === id) || normalize({id, thread});
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
export async function act(accountID: string, messageID: string, action: MessageAction): Promise<void> {
  if (!ACTIONS.includes(action)) throw new Error(t('error_unknown_action'));
  if (!messageID || messageID.length > 512) throw new Error(t('error_bad_message'));
  const {mailboxes = {}} = await readStore();
  const item = lookup(mailboxes[accountID], messageID);
  await withAccount(accountID, (module, account) => module.act(account, item, action));
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
  await updateBadge();
}

/**
 * Loads a conversation with bodies; opening it marks unread messages as read.
 *
 * @param accountID The account ID.
 * @param messageID The selected message.
 * @param threadID Its conversation ID.
 */
export async function thread(accountID: string, messageID: string, threadID: string): Promise<ThreadMessage[]> {
  if (!messageID || messageID.length > 512 || threadID.length > 512) throw new Error(t('error_bad_message'));
  const {mailboxes = {}} = await readStore();
  const item = lookup(mailboxes[accountID], messageID, threadID);
  const messages = await withAccount(accountID, (module, account) =>
    module.thread(account, {...item, thread: item.thread || threadID}),
  );
  if (item.unread) act(accountID, messageID, 'read').catch(() => {});
  return messages;
}

/**
 * Sends a plain-text reply to a listed message.
 *
 * @param accountID The account ID.
 * @param messageID The message replied to.
 * @param text The reply text.
 */
export async function reply(accountID: string, messageID: string, text: string): Promise<void> {
  if (!messageID || messageID.length > 512) throw new Error(t('error_bad_message'));
  if (!text.trim() || text.length > 100_000) throw new Error(t('error_reply_text'));
  const {mailboxes = {}} = await readStore();
  const item = lookup(mailboxes[accountID], messageID);
  await withAccount(accountID, (module, account) => {
    if (!module.reply) throw new Error(t('error_reply_webmail'));
    return module.reply(account, item, text);
  });
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
  const results = await Promise.allSettled(
    accounts.map(account =>
      withAccount(account.id, (module, current) => module.search(current, text, 20)).then(messages =>
        messages.map(message => ({account: account.id, message})),
      ),
    ),
  );
  return results
    .flatMap(result => (result.status === 'fulfilled' ? result.value : []))
    .sort((a, b) => b.message.date - a.message.date);
}

/** Opens the webmail Inbox or a listed message in a new tab. */
export async function open(accountID: string, messageID?: string): Promise<void> {
  const {accounts = [], mailboxes = {}} = await readStore();
  const account = accounts.find(item => item.id === accountID);
  if (!account) throw new Error(t('error_account_missing'));
  const item = messageID ? mailboxes[accountID]?.messages?.find(entry => entry.id === messageID) : null;
  await chrome.tabs.create({url: adapter(account).webURL(account, item)});
}
