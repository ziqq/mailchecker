/**
 * Service-worker entry point: the trusted message broker and scheduler.
 *
 * The popup and Settings send `{type, …}` messages and receive
 * `{ok: true, value}` or `{ok: false, error}`. Only this extension's own
 * pages are accepted; account management is limited to Settings.
 *
 * @module background/index
 */
import {preferences} from '../shared/preferences';
import type {JmapInput, Preferences, Reply, RequestType} from '../shared/types';
import {addAccount, publicState, removeAccount, signIn} from './accounts';
import {act, checkAccount, checkAll, open, openNotification, updateBadge} from './mailbox';
import {readStore, writeStore} from './storage';

/** Alarm name for periodic checks. */
const ALARM = 'check';

/** Extension pages that may message the worker. */
type Page = 'popup' | 'options';

/** Message types each page may send. */
const allowed: Readonly<Record<Page, ReadonlySet<RequestType>>> = Object.freeze({
  popup: new Set<RequestType>(['STATE', 'CHECK', 'MARK_READ', 'TRASH', 'OPEN', 'SIGN_IN', 'PREFERENCES', 'OPTIONS']),
  options: new Set<RequestType>(['STATE', 'CHECK', 'OPEN', 'SIGN_IN', 'PREFERENCES', 'ADD_ACCOUNT', 'REMOVE_ACCOUNT']),
});

/** Returns which extension page sent a message, or `null`. */
function senderPage(sender: chrome.runtime.MessageSender): Page | null {
  if (sender.id !== chrome.runtime.id || typeof sender.url !== 'string') return null;
  const path = sender.url.split(/[?#]/)[0];
  if (path === chrome.runtime.getURL('popup.html')) return 'popup';
  if (path === chrome.runtime.getURL('options.html')) return 'options';
  return null;
}

/** Re-creates the check alarm from the saved interval. */
async function schedule(): Promise<void> {
  const {interval} = preferences((await readStore()).preferences);
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, {periodInMinutes: interval, delayInMinutes: 0.1});
}

/** Throws unless the optional `identity` permission is granted. */
async function requireIdentity(): Promise<void> {
  if (!(await chrome.permissions.contains({permissions: ['identity']})))
    throw new Error('Разрешите вход через браузер в настройках расширения и повторите.');
}

/** An untrusted message; fields are validated per type. */
type Message = {type?: unknown} & Record<string, unknown>;

/**
 * Validates and dispatches one message.
 *
 * @returns The reply value.
 * @throws With a user-facing message.
 */
async function handle(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const page = senderPage(sender);
  const type = message?.type as RequestType;
  if (!page || typeof type !== 'string' || !allowed[page].has(type)) throw new Error('Этот запрос не разрешён.');
  const account = String(message.account ?? '');
  switch (type) {
    case 'STATE':
      return publicState(await readStore());
    case 'CHECK':
      await checkAll();
      return publicState(await readStore());
    case 'MARK_READ':
    case 'TRASH':
      await act(account, String(message.message), type === 'TRASH' ? 'trash' : 'markRead');
      return publicState(await readStore());
    case 'OPEN':
      await open(account, message.message == null ? undefined : String(message.message));
      return true;
    case 'OPTIONS':
      await chrome.runtime.openOptionsPage();
      return true;
    case 'SIGN_IN':
      await requireIdentity();
      await signIn(account);
      await checkAccount(account);
      await updateBadge();
      return publicState(await readStore());
    case 'PREFERENCES': {
      const value = (message.value ?? {}) as Partial<Preferences>;
      const update = await writeStore(current => ({
        preferences: preferences({...preferences(current.preferences), ...value}),
      }));
      await schedule();
      return update.preferences;
    }
    case 'ADD_ACCOUNT': {
      if (message.provider !== 'jmap') await requireIdentity();
      const added = await addAccount(message.provider, message.input as JmapInput | undefined);
      await checkAccount(added.id);
      await updateBadge();
      return {email: added.email, state: publicState(await readStore())};
    }
    case 'REMOVE_ACCOUNT':
      await removeAccount(account);
      await updateBadge();
      return publicState(await readStore());
  }
}

chrome.runtime.onMessage.addListener((message: Message, sender, reply: (value: Reply) => void) => {
  handle(message, sender).then(
    value => reply({ok: true, value}),
    (error: Error) => reply({ok: false, error: error?.message || 'Неизвестная ошибка.'}),
  );
  return true;
});

chrome.runtime.onInstalled.addListener(async ({reason}) => {
  await schedule();
  await updateBadge();
  if (reason === 'install') await chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(async () => {
  await schedule();
  await updateBadge();
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) checkAll().catch(() => {});
});
chrome.notifications.onClicked.addListener(id => {
  openNotification(id).catch(() => {});
});
