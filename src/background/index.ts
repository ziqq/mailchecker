/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Service-worker entry point: the trusted message broker and scheduler.
 *
 * The client (toolbar popup and full-tab app) and Settings send typed
 * `Request` messages and receive `{ok: true, value}` or `{ok: false, error}`.
 * Only this extension's own pages are accepted; account management is
 * limited to Settings.
 *
 * @module background/index
 */
import {cachedThread, clearCache} from './cache';
import {preferences} from '../shared/preferences';
import type {MailMessage, MessageAction, Preferences, Reply, RequestType} from '../shared/types';
import {addAccount, publicState, removeAccount, setAccountColor, signIn} from './accounts';
import {
  act,
  checkAccount,
  checkAll,
  closeNotification,
  folder,
  folders,
  open,
  openNotification,
  reply,
  search,
  thread,
  updateBadge,
} from './mailbox';
import {hasNotifications, onNotificationClosed, openApp} from './platform';
import {readStore, writeStore} from './storage';
import {t} from '../shared/i18n';

/** Alarm name for periodic checks. */
const ALARM = 'check';

/** Extension pages that may message the worker. */
type Page = 'client' | 'options';

/** Message types each page may send. */
const allowed: Readonly<Record<Page, ReadonlySet<RequestType>>> = Object.freeze({
  client: new Set<RequestType>([
    'STATE',
    'CHECK',
    'THREAD',
    'CACHED_THREAD',
    'FOLDERS',
    'FOLDER',
    'REPLY',
    'ACT',
    'SEARCH',
    'OPEN',
    'OPEN_APP',
    'SIGN_IN',
    'PREFERENCES',
    'OPTIONS',
  ]),
  options: new Set<RequestType>([
    'STATE',
    'CHECK',
    'OPEN',
    'SIGN_IN',
    'PREFERENCES',
    'ADD_ACCOUNT',
    'REMOVE_ACCOUNT',
    'ACCOUNT_COLOR',
    'CLEAR_CACHE',
  ]),
});

/** Returns which extension page sent a message, or `null`. */
function senderPage(sender: chrome.runtime.MessageSender): Page | null {
  if (sender.id !== chrome.runtime.id || typeof sender.url !== 'string') return null;
  const path = sender.url.split(/[?#]/)[0];
  if (path === chrome.runtime.getURL('popup.html') || path === chrome.runtime.getURL('app.html')) return 'client';
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
    throw new Error(t('error_identity_permission'));
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
  if (!page || typeof type !== 'string' || !allowed[page].has(type)) throw new Error(t('error_request_denied'));
  const account = String(message.account ?? '');
  const entry = message.entry && typeof message.entry === 'object' ? (message.entry as MailMessage) : undefined;
  switch (type) {
    case 'STATE':
      return publicState(await readStore());
    case 'CHECK':
      await checkAll();
      return publicState(await readStore());
    case 'ACT':
      await act(account, String(message.message ?? ''), message.action as MessageAction, entry);
      return publicState(await readStore());
    case 'CLEAR_CACHE':
      if (!(await clearCache())) throw new Error(t('error_generic'));
      return true;
    case 'CACHED_THREAD': {
      const id = String(message.message ?? '');
      const thread = String(message.thread ?? '');
      if (!id || id.length > 512 || thread.length > 512) throw new Error(t('error_bad_message'));
      if (!((await readStore()).accounts || []).some(item => item.id === account))
        throw new Error(t('error_account_missing'));
      return cachedThread(account, thread || id, id);
    }
    case 'THREAD':
      return thread(account, String(message.message ?? ''), String(message.thread ?? ''), entry);
    case 'FOLDERS':
      return folders(account);
    case 'FOLDER':
      return folder(account, String(message.folder ?? ''), String(message.cursor ?? ''));
    case 'REPLY':
      await reply(account, String(message.message ?? ''), String(message.text ?? ''), entry);
      return true;
    case 'SEARCH':
      return search(String(message.query ?? ''));
    case 'OPEN_APP':
      await openApp();
      return true;
    case 'OPEN':
      await open(account, message.message == null ? undefined : String(message.message), entry);
      return true;
    case 'OPTIONS':
      await chrome.runtime.openOptionsPage();
      return true;
    case 'SIGN_IN': {
      const stored = ((await readStore()).accounts || []).find(item => item.id === account);
      if (stored?.settings?.browser) {
        await checkAccount(account);
        await updateBadge();
        const state = publicState(await readStore());
        if (state.mailboxes[account]?.reauth) await open(account);
        return state;
      }
      await requireIdentity();
      await signIn(account);
      await checkAccount(account);
      await updateBadge();
      return publicState(await readStore());
    }
    case 'PREFERENCES': {
      const value = (message.value ?? {}) as Partial<Preferences>;
      const update = await writeStore(current => ({
        preferences: preferences({...preferences(current.preferences), ...value}),
      }));
      await schedule();
      await updateBadge();
      return update.preferences;
    }
    case 'ADD_ACCOUNT': {
      const browser = message.browser === true;
      if (message.provider !== 'jmap' && !browser) await requireIdentity();
      const input = (message.input ?? undefined) as Record<string, unknown> | undefined;
      const added = await addAccount(
        message.provider,
        input && {
          sessionURL: input.sessionURL == null ? undefined : String(input.sessionURL),
          token: input.token == null ? undefined : String(input.token),
          webURL: input.webURL == null ? undefined : String(input.webURL),
          email: input.email == null ? undefined : String(input.email).slice(0, 320),
        },
        browser,
      );
      await checkAccount(added.id);
      await updateBadge();
      return {email: added.email, state: publicState(await readStore())};
    }
    case 'ACCOUNT_COLOR':
      await setAccountColor(account, String(message.color ?? '').slice(0, 16));
      return publicState(await readStore());
    case 'REMOVE_ACCOUNT':
      await removeAccount(account);
      await updateBadge();
      return publicState(await readStore());
  }
}

chrome.runtime.onMessage.addListener((message: Message, sender, reply: (value: Reply) => void) => {
  handle(message, sender).then(
    value => reply({ok: true, value}),
    (error: Error) => reply({ok: false, error: error?.message || t('error_unknown')}),
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
if (hasNotifications())
  chrome.notifications.onClicked.addListener(id => {
    openNotification(id).catch(() => {});
  });
onNotificationClosed(id => {
  closeNotification(id).catch(() => {});
});
