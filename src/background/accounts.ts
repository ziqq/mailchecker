/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * Accounts, credentials and the public state sent to extension pages.
 *
 * Credentials never leave the service worker: `publicState` strips them.
 * Token renewals are deduplicated per account, and a renewal for an
 * account that was removed or replaced meanwhile is discarded.
 *
 * @module background/accounts
 */
import {preferences} from '../shared/preferences';
import type {Account, Credentials, JmapInput, ProviderId, PublicState, Store} from '../shared/types';
import {AuthError} from './http';
import * as oauth from './oauth/flow';
import {gmail} from './providers/gmail';
import {jmap} from './providers/jmap';
import type {Provider} from './providers/message';
import {outlook} from './providers/outlook';
import {readStore, writeStore} from './storage';

/** Provider adapters by ID. */
export const providers: Readonly<Record<ProviderId, Provider>> = Object.freeze({gmail, outlook, jmap});

/** Maximum connected accounts. */
const MAX_ACCOUNTS = 20;

/** In-flight renewals by account ID. */
const renewals = new Map<string, Promise<Account>>();

/**
 * Returns the provider adapter for an untrusted ID.
 *
 * @throws For an unknown provider.
 */
export function provider(id: unknown): Provider {
  if (typeof id !== 'string' || !Object.hasOwn(providers, id)) throw new Error('Неизвестный тип ящика.');
  return providers[id as ProviderId];
}

/** Returns the state extension pages may see: no credentials. */
export function publicState(store: Store): PublicState {
  return {
    preferences: preferences(store.preferences),
    accounts: (store.accounts || []).map(account => ({
      id: account.id,
      provider: account.provider,
      label: provider(account.provider).label,
      email: account.email,
    })),
    mailboxes: store.mailboxes || {},
    oauth: {
      google: oauth.available('google'),
      microsoft: oauth.available('microsoft'),
      redirect: {google: oauth.redirectUri('google'), microsoft: oauth.redirectUri('microsoft')},
    },
  };
}

/**
 * Connects a mailbox; an existing account with the same provider and address is updated.
 *
 * @param providerId The provider.
 * @param input JMAP form values.
 * @returns The stored account.
 */
export async function addAccount(providerId: unknown, input?: JmapInput): Promise<Account> {
  const connected = await provider(providerId).connect(input);
  let account!: Account;
  await writeStore(({accounts = []}) => {
    const existing = accounts.find(item => item.provider === providerId && item.email === connected.email);
    if (!existing && accounts.length >= MAX_ACCOUNTS) throw new Error(`Можно подключить до ${MAX_ACCOUNTS} ящиков.`);
    account = {id: existing?.id || crypto.randomUUID(), provider: providerId as ProviderId, ...connected};
    return {
      accounts: existing ? accounts.map(item => (item.id === account.id ? account : item)) : [...accounts, account],
    };
  });
  return account;
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
      throw new Error('Ящик изменился во время входа. Повторите.');
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
      .then(() => provider(account.provider).renew(account))
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
  if (!account) throw new Error('Ящик не найден.');
  const module = provider(account.provider);
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
  if (!account) throw new Error('Ящик не найден.');
  return saveCredentials(account, await provider(account.provider).signIn(account));
}
