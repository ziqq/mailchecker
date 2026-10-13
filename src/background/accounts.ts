/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Accounts, credentials and the public state sent to extension pages.
 *
 * Credentials never leave the service worker: `publicState` strips them.
 * Token renewals are deduplicated per account, and a renewal for an
 * account that was removed or replaced meanwhile is discarded.
 *
 * @module background/accounts
 */
import {ACCOUNT_COLORS} from '../shared/inbox';
import {preferences} from '../shared/preferences';
import type {Account, AccountInput, Credentials, ProviderID, PublicState, Store} from '../shared/types';
import {AuthError} from './http';
import * as oauth from './oauth/flow';
import {gmail} from './providers/gmail';
import {gmailWeb} from './providers/gmailweb';
import {jmap} from './providers/jmap';
import {mailru} from './providers/mailru';
import type {Provider} from './providers/message';
import {outlook} from './providers/outlook';
import {readStore, writeStore} from './storage';
import {yandex} from './providers/yandex';
import {t} from '../shared/i18n';

/** API adapters by provider ID (OAuth or token). */
export const providers: Readonly<Partial<Record<ProviderID, Provider>>> = Object.freeze({gmail, outlook, jmap});

/** Adapters reading a mailbox through the browser's own sign-in, by provider ID. */
export const browserProviders: Readonly<Partial<Record<ProviderID, Provider>>> = Object.freeze({
  gmail: gmailWeb,
  yandex,
  mailru,
});

/** Maximum connected accounts. */
const MAX_ACCOUNTS = 20;

/** In-flight renewals by account ID. */
const renewals = new Map<string, Promise<Account>>();

/**
 * Returns the provider adapter for an untrusted ID.
 *
 * @param id The provider ID.
 * @param browser Read through the browser's sign-in instead of an API.
 * @throws For an unknown provider.
 */
export function provider(id: unknown, browser = false): Provider {
  const registry = browser ? browserProviders : providers;
  if (typeof id !== 'string' || !Object.hasOwn(registry, id)) throw new Error(t('error_unknown_provider'));
  return registry[id as ProviderID]!;
}

/** Returns the adapter of a stored account. */
export const adapter = (account: Account): Provider => provider(account.provider, account.settings?.browser === true);

/** Returns the state extension pages may see: no credentials. */
export function publicState(store: Store): PublicState {
  return {
    preferences: preferences(store.preferences),
    accounts: (store.accounts || []).map(account => ({
      id: account.id,
      provider: account.provider,
      label: adapter(account).label,
      email: account.email,
      browser: account.settings?.browser === true,
      color: account.settings?.color || '',
      reply: typeof adapter(account).reply === 'function',
    })),
    mailboxes: store.mailboxes || {},
    oauth: {
      google: oauth.available('google'),
      microsoft: oauth.available('microsoft'),
      redirect: {google: oauth.redirectURI('google'), microsoft: oauth.redirectURI('microsoft')},
    },
  };
}

/**
 * Connects a mailbox; an existing account with the same provider and address is updated.
 *
 * @param providerID The provider.
 * @param input JMAP form values, or the address of a browser-session mailbox.
 * @param browser Read the mailbox through the browser's sign-in.
 * @returns The stored account.
 */
export async function addAccount(providerID: unknown, input?: AccountInput, browser = false): Promise<Account> {
  const connected = await provider(providerID, browser).connect(input);
  let account!: Account;
  await writeStore(({accounts = []}) => {
    const existing = accounts.find(item => item.provider === providerID && item.email === connected.email);
    if (!existing && accounts.length >= MAX_ACCOUNTS) throw new Error(t('error_too_many_accounts', MAX_ACCOUNTS));
    account = {id: existing?.id || crypto.randomUUID(), provider: providerID as ProviderID, ...connected};
    return {
      accounts: existing ? accounts.map(item => (item.id === account.id ? account : item)) : [...accounts, account],
    };
  });
  return account;
}

/**
 * Sets the colour of an account, or the colour by position for an empty [color].
 *
 * @throws When [color] is not one of `ACCOUNT_COLORS`.
 */
export async function setAccountColor(id: string, color: string): Promise<void> {
  if (color && !ACCOUNT_COLORS.includes(color)) throw new Error(t('error_unknown_color'));
  await writeStore(({accounts = []}) => ({
    accounts: accounts.map(account =>
      account.id === id ? {...account, settings: {...account.settings, color: color || undefined}} : account,
    ),
  }));
}

/**
 * Removes an account and its last check result.
 *
 * Provider-side grants stay until revoked in the provider's account settings.
 */
export async function removeAccount(id: string): Promise<void> {
  renewals.delete(id);
  await writeStore(({accounts = [], mailboxes = {}}) => {
    const rest = {...mailboxes};
    delete rest[id];
    return {accounts: accounts.filter(account => account.id !== id), mailboxes: rest};
  });
}

/**
 * Stores new credentials if the account still has the credentials they replace.
 *
 * @throws When the account was removed or replaced meanwhile.
 */
async function saveCredentials(account: Account, credentials: Credentials): Promise<Account> {
  let updated!: Account;
  await writeStore(({accounts = []}) => {
    const current = accounts.find(item => item.id === account.id);
    if (!current || current.credentials.token !== account.credentials.token)
      throw new Error(t('error_account_changed'));
    updated = {...current, credentials};
    return {accounts: accounts.map(item => (item.id === account.id ? updated : item))};
  });
  return updated;
}

/** Renews an account's credentials once, sharing the result between concurrent callers. */
function renew(account: Account): Promise<Account> {
  let pending = renewals.get(account.id);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => adapter(account).renew(account))
      .then(credentials => saveCredentials(account, credentials))
      .finally(() => renewals.delete(account.id));
    renewals.set(account.id, pending);
  }
  return pending;
}

/**
 * Runs [callback] with a fresh account and its provider.
 *
 * Expired credentials are renewed first. If the provider rejects a token
 * that looked valid, it is renewed once and the call is retried.
 */
export async function withAccount<T>(
  id: string,
  callback: (module: Provider, account: Account) => Promise<T>,
): Promise<T> {
  let account = ((await readStore()).accounts || []).find(item => item.id === id);
  if (!account) throw new Error(t('error_account_missing'));
  const module = adapter(account);
  const expires = account.credentials.expiresAt;
  if (expires && expires <= Date.now()) account = await renew(account);
  else {
    try {
      return await callback(module, account);
    } catch (error) {
      if (!(error instanceof AuthError) || !expires) throw error;
      account = await renew(account);
    }
  }
  return callback(module, account);
}

/** Signs in to an existing account again with a visible window. */
export async function signIn(id: string): Promise<Account> {
  const account = ((await readStore()).accounts || []).find(item => item.id === id);
  if (!account) throw new Error(t('error_account_missing'));
  return saveCredentials(account, await adapter(account).signIn(account));
}
