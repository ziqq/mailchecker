/**
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
import {preferences} from '../shared/preferences';
import type {Account, MailMessage, Mailbox, MessageAction, SearchHit, ThreadMessage} from '../shared/types';
import {provider, withAccount} from './accounts';
import {message as normalize} from './providers/message';
import {hasNotifications, setBadge} from './platform';
import {readStore, writeStore} from './storage';

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
    const fresh = result.messages.filter(
      item => item.unread && !known.has(item.id) && item.date > Date.now() - NOTIFY_WINDOW,
    );
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
  await setBadge(
    unread > 999 ? '999+' : unread ? String(unread) : problems ? '!' : '',
    unread ? {background: '#ff9418', text: '#1a0f00'} : {background: '#6b6b70', text: '#ffffff'},
    `Mail Checker · непрочитанных: ${unread}${problems ? ` · ящиков с ошибкой: ${problems}` : ''}`,
  );
}

/** Shows one notification for new messages of an account, where notifications exist. */
async function notify(account: Account, messages: MailMessage[]): Promise<void> {
  if (!messages.length || !hasNotifications()) return;
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
 * @param accountId The account ID.
 * @param messageId The provider message ID.
 * @param action The action.
 */
export async function act(accountId: string, messageId: string, action: MessageAction): Promise<void> {
  if (!ACTIONS.includes(action)) throw new Error('Неизвестное действие.');
  if (!messageId || messageId.length > 512) throw new Error('Некорректное письмо.');
  const {mailboxes = {}} = await readStore();
  const item = lookup(mailboxes[accountId], messageId);
  await withAccount(accountId, (module, account) => module.act(account, item, action));
  await writeStore(({mailboxes: current = {}}) => {
    const box = current[accountId];
    const listed = box?.messages.find(entry => entry.id === messageId);
    if (!box || !listed) return {};
    let unread = box.unread;
    let messages = box.messages;
    if (action === 'archive' || action === 'trash') {
      messages = messages.filter(entry => entry.id !== messageId);
      if (listed.unread) unread -= 1;
    } else {
      const next = {...listed};
      if (action === 'read' || action === 'unread') {
        next.unread = action === 'unread';
        if (next.unread !== listed.unread) unread += next.unread ? 1 : -1;
      } else next.pinned = action === 'pin';
      messages = messages.map(entry => (entry.id === messageId ? next : entry));
    }
    return {mailboxes: {...current, [accountId]: {...box, messages, unread: Math.max(0, unread)}}};
  });
  await updateBadge();
}

/**
 * Loads a conversation with bodies; opening it marks unread messages as read.
 *
 * @param accountId The account ID.
 * @param messageId The selected message.
 * @param threadId Its conversation ID.
 */
export async function thread(accountId: string, messageId: string, threadId: string): Promise<ThreadMessage[]> {
  if (!messageId || messageId.length > 512 || threadId.length > 512) throw new Error('Некорректное письмо.');
  const {mailboxes = {}} = await readStore();
  const item = lookup(mailboxes[accountId], messageId, threadId);
  const messages = await withAccount(accountId, (module, account) =>
    module.thread(account, {id: item.id, thread: item.thread || threadId}),
  );
  if (item.unread) act(accountId, messageId, 'read').catch(() => {});
  return messages;
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
export async function open(accountId: string, messageId?: string): Promise<void> {
  const {accounts = [], mailboxes = {}} = await readStore();
  const account = accounts.find(item => item.id === accountId);
  if (!account) throw new Error('Ящик не найден.');
  const item = messageId ? mailboxes[accountId]?.messages?.find(entry => entry.id === messageId) : null;
  await chrome.tabs.create({url: provider(account.provider).webURL(account, item)});
}
