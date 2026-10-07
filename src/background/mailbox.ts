/**
 * Mail checks, the toolbar badge, notifications and message actions.
 *
 * A check stores a `Mailbox` per account in `mailboxes`. Notifications are
 * shown only for messages that were not listed by the previous successful
 * check, so the first check after connecting an account is silent.
 *
 * @module background/mailbox
 */
import {senderName} from '../shared/format';
import {preferences} from '../shared/preferences';
import type {Account, MailMessage, Mailbox} from '../shared/types';
import {provider, withAccount} from './accounts';
import {readStore, writeStore} from './storage';

/** The running check of all accounts, shared by concurrent callers. */
let running: Promise<void> | null = null;

/** Messages older than this are not announced even if newly listed. */
const NOTIFY_WINDOW = 24 * 60 * 60 * 1000;

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
      error: failure?.message || 'Не удалось проверить почту.',
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
    const fresh = result.messages.filter(item => !known.has(item.id) && item.date > Date.now() - NOTIFY_WINDOW);
    await notify(account, fresh);
  }
}

/** Updates the toolbar badge with the total unread count, or `!` when only errors remain. */
export async function updateBadge(): Promise<void> {
  const {accounts = [], mailboxes = {}} = await readStore();
  let unread = 0;
  let problems = 0;
  for (const account of accounts) {
    unread += mailboxes[account.id]?.unread || 0;
    if (mailboxes[account.id]?.error) problems += 1;
  }
  const text = unread > 999 ? '999+' : unread ? String(unread) : problems ? '!' : '';
  await chrome.action.setBadgeText({text});
  await chrome.action.setBadgeBackgroundColor({color: unread ? '#ff9418' : '#6b6b70'});
  await chrome.action.setBadgeTextColor?.({color: unread ? '#1a0f00' : '#ffffff'});
  await chrome.action.setTitle({
    title: `Mail Checker · непрочитанных: ${unread}${problems ? ` · ящиков с ошибкой: ${problems}` : ''}`,
  });
}

/** Shows one notification for new messages of an account. */
async function notify(account: Account, messages: MailMessage[]): Promise<void> {
  if (!messages.length) return;
  const single = messages.length === 1;
  const id = `${account.id}:${Date.now()}`;
  const url = provider(account.provider).webURL(account, single ? messages[0] : null);
  await chrome.storage.session.set({[`notification:${id}`]: url});
  await chrome.notifications.create(id, {
    type: single ? 'basic' : 'list',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: single ? senderName(messages[0].from) : `Новых писем: ${messages.length}`,
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

/**
 * Marks a listed message as read or moves it to Trash, then removes it from the list.
 *
 * @param accountId The account ID.
 * @param messageId A message from the last check.
 * @param action The provider action.
 */
export async function act(accountId: string, messageId: string, action: 'markRead' | 'trash'): Promise<void> {
  const {mailboxes = {}} = await readStore();
  const item = mailboxes[accountId]?.messages?.find(entry => entry.id === messageId);
  if (!item) throw new Error('Письмо уже обработано. Обновите список.');
  await withAccount(accountId, (module, account) => module[action](account, item));
  await writeStore(({mailboxes: current = {}}) => {
    const box = current[accountId];
    if (!box) return {};
    const messages = box.messages.filter(entry => entry.id !== messageId);
    const unread = Math.max(0, box.unread - (messages.length < box.messages.length ? 1 : 0));
    return {mailboxes: {...current, [accountId]: {...box, messages, unread}}};
  });
  await updateBadge();
}

/** Opens the webmail Inbox or a listed message in a new tab. */
export async function open(accountId: string, messageId?: string): Promise<void> {
  const {accounts = [], mailboxes = {}} = await readStore();
  const account = accounts.find(item => item.id === accountId);
  if (!account) throw new Error('Ящик не найден.');
  const item = messageId ? mailboxes[accountId]?.messages?.find(entry => entry.id === messageId) : null;
  await chrome.tabs.create({url: provider(account.provider).webURL(account, item)});
}
