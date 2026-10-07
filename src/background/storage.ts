/**
 * Trusted extension storage with serialized writes.
 *
 * Local storage is limited to trusted extension contexts. Writes run one
 * after another so concurrent checks and actions cannot lose each other's
 * read-modify-write updates.
 *
 * Keys: `preferences`, `accounts` (with credentials) and `mailboxes`
 * (the last check result per account ID).
 *
 * @module background/storage
 */
import type {Store} from '../shared/types';

/** Tail of the serialized write queue. */
let writes: Promise<unknown> = Promise.resolve();

/** Resolves once local storage is limited to trusted extension contexts. */
export const storageReady = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});

/** Reads the stored preferences, accounts and mailboxes. */
export async function readStore(): Promise<Store> {
  await storageReady;
  return (await chrome.storage.local.get(['preferences', 'accounts', 'mailboxes'])) as Store;
}

/**
 * Applies an update computed from the current store, after all earlier writes.
 *
 * A failed write rejects only its own promise; the queue continues.
 *
 * @param callback Returns the keys to store.
 * @returns The stored update.
 */
export function writeStore(callback: (current: Store) => Store | Promise<Store>): Promise<Store> {
  const result = writes.then(async () => {
    const update = await callback(await readStore());
    await chrome.storage.local.set(update);
    return update;
  });
  writes = result.catch(() => {});
  return result;
}
