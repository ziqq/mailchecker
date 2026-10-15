/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Bounded worker-owned IndexedDB cache for mail actually requested by the user.
 * Failures fall back to the network; credentials and rendered documents never enter this database.
 *
 * @module background/cache
 */
import {threadMessage} from './providers/message';
import type {CachedThread, MailMessage, MessageAction, ThreadMessage} from '../shared/types';

/** Mail-data limits, independent of the browser's potentially smaller quota. */
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_MESSAGES = 5000;
const MAX_VIEWS = 1000;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const STORES = ['messages', 'views'];

/** One normalized message; bodies are shared by all referring views. */
interface CachedMessage {
  account: string;
  id: string;
  metadata?: MailMessage;
  body?: ThreadMessage;
  access: number;
  bytes: number;
}

/** A bounded ordered view of already fetched messages. */
interface CachedView {
  account: string;
  kind: 'inbox' | 'folder' | 'thread' | 'search';
  id: string;
  ids: string[];
  next: string;
  fetchedAt: number;
  access: number;
  bytes: number;
}

/** A request's lifetime; clear/removal/mutation invalidate every older cache write. */
export interface CacheTicket {
  account: string;
  epoch: number;
  version: number;
}

let epoch = 0;
const versions = new Map<string, number>();
let opening: Promise<IDBDatabase | null> | undefined;
let tasks: Promise<unknown> = Promise.resolve();

/** Captures the cache generation before beginning a provider request. */
export const cacheTicket = (account: string): CacheTicket => ({account, epoch, version: versions.get(account) || 0});

/** Invalidates writes already in flight, without discarding bodies after flag changes. */
export function invalidateCache(account: string): void {
  versions.set(account, (versions.get(account) || 0) + 1);
}

/** Whether a request may still store its provider snapshot. */
const current = (ticket: CacheTicket): boolean =>
  ticket.epoch === epoch && ticket.version === (versions.get(ticket.account) || 0);

/** Opens the database once; blocked/failed opens cannot delay reading mail indefinitely. */
function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  opening ??= new Promise<IDBDatabase | null>(resolve => {
    let settled = false;
    const finish = (value: IDBDatabase | null): void => {
      if (settled) {
        value?.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 1000);
    const request = indexedDB.open('mailchecker-cache', 1);
    request.onupgradeneeded = () => {
      for (const name of STORES) {
        const store = request.result.createObjectStore(name, {
          keyPath: name === 'messages' ? ['account', 'id'] : ['account', 'kind', 'id'],
        });
        store.createIndex('account', 'account');
        // Key-only traversal measures/evicts the cache without loading every body into memory.
        store.createIndex('lru', ['access', 'bytes']);
      }
    };
    request.onerror = request.onblocked = () => finish(null);
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        opening = undefined;
      };
      finish(request.result);
    };
  }).catch(() => null);
  return opening;
}

/** Promisifies a single IndexedDB operation within its live transaction. */
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Serializes cache work and isolates storage failures from the mailbox operation. */
function task<T>(fallback: T, run: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const pending = tasks
    .then(async () => {
      const db = await database();
      if (!db) return fallback;
      const transaction = db.transaction(STORES, 'readwrite');
      const complete = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => transaction.abort(), 2000);
        transaction.oncomplete = () => {
          clearTimeout(timer);
          resolve();
        };
        transaction.onabort = transaction.onerror = () => {
          clearTimeout(timer);
          reject(transaction.error);
        };
      });
      // Observe rejection before awaiting individual requests, including aborted transactions.
      complete.catch(() => {});
      try {
        const value = await run(transaction);
        await complete;
        return value;
      } catch {
        try {
          transaction.abort();
        } catch {
          /* Already completed or aborted. */
        }
        await complete.catch(() => {});
        return fallback;
      }
    })
    .catch(() => fallback);
  tasks = pending;
  return pending;
}

/** Estimates UTF-8 payload size without creating another full body-sized byte array. */
function bytes(value: unknown): number {
  return JSON.stringify(value).length * 3 + 128;
}

/** Collects only primary keys and size/access index keys, in least-recently-used order. */
function entries(store: IDBObjectStore): Promise<{key: IDBValidKey; access: number; bytes: number}[]> {
  return new Promise((resolve, reject) => {
    const values: {key: IDBValidKey; access: number; bytes: number}[] = [];
    const request = store.index('lru').openKeyCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(values);
        return;
      }
      const [access, size] = cursor.key as number[];
      values.push({key: cursor.primaryKey, access, bytes: size});
      cursor.continue();
    };
  });
}

/** Bounds both object counts and estimated bytes; views missing an evicted message cannot be read. */
async function prune(transaction: IDBTransaction): Promise<void> {
  const groups = await Promise.all(STORES.map(name => entries(transaction.objectStore(name))));
  let total = groups.flat().reduce((sum, item) => sum + item.bytes, 0);
  const candidates = groups
    .flatMap((items, index) => {
      const store = transaction.objectStore(STORES[index]);
      const excess = Math.max(0, items.length - (index === 0 ? MAX_MESSAGES : MAX_VIEWS));
      return items.flatMap((item, position) => {
        if (position < excess || item.access < Date.now() - MAX_AGE) {
          store.delete(item.key);
          total -= item.bytes;
          return [];
        }
        return [{...item, store}];
      });
    })
    .sort((a, b) => a.access - b.access);
  for (const item of candidates) {
    if (total <= MAX_BYTES) break;
    item.store.delete(item.key);
    total -= item.bytes;
  }
}

/** Atomically merges fetched metadata/bodies and the view referencing them. */
export function cacheView(
  ticket: CacheTicket,
  kind: CachedView['kind'],
  id: string,
  messages: (MailMessage | ThreadMessage)[],
  next = '',
): Promise<void> {
  return task(undefined, async transaction => {
    if (!current(ticket)) return;
    const store = transaction.objectStore('messages');
    const access = Date.now();
    for (const message of messages) {
      if (!current(ticket)) return;
      const previous = await result<CachedMessage | undefined>(store.get([ticket.account, message.id]));
      const record: CachedMessage = {
        ...previous,
        account: ticket.account,
        id: message.id,
        access,
        bytes: 0,
        ...('html' in message ? {body: message} : {metadata: message}),
      };
      record.bytes = bytes(record);
      if (record.bytes <= MAX_BYTES && current(ticket)) store.put(record);
    }
    if (!current(ticket)) return;
    const view: CachedView = {
      account: ticket.account,
      kind,
      id,
      ids: messages.map(message => message.id),
      next,
      fetchedAt: access,
      access,
      bytes: 0,
    };
    view.bytes = bytes(view);
    transaction.objectStore('views').put(view);
    await prune(transaction);
  });
}

/** Reads a complete cached conversation; any missing/expired body is a network miss. */
export function cachedThread(account: string, id: string, message: string): Promise<CachedThread | null> {
  const ticket = cacheTicket(account);
  return task(null as CachedThread | null, async transaction => {
    const views = transaction.objectStore('views');
    const view = await result<CachedView | undefined>(views.get([account, 'thread', id]));
    if (
      !view ||
      !Number.isFinite(view.access) ||
      !Number.isFinite(view.fetchedAt) ||
      view.access < Date.now() - MAX_AGE ||
      !Array.isArray(view.ids) ||
      view.ids.length > MAX_MESSAGES ||
      !view.ids.includes(message)
    )
      return null;
    const store = transaction.objectStore('messages');
    const records = await Promise.all(view.ids.map(id => result<CachedMessage | undefined>(store.get([account, id]))));
    if (
      !current(ticket) ||
      records.some(
        record => !record?.body || typeof record.body.html !== 'string' || typeof record.body.text !== 'string',
      )
    )
      return null;
    const messages = records.map(record => threadMessage(record!.body!));
    if (messages.some((body, index) => body.id !== view.ids[index])) return null;
    const access = Date.now();
    views.put({...view, access});
    for (const record of records) store.put({...record!, access});
    return {messages, fetchedAt: view.fetchedAt};
  });
}

/** Reconciles confirmed flags, or invalidates moved/replied views atomically. */
export function cacheAction(account: string, id: string, action?: MessageAction): Promise<void> {
  return task(undefined, async transaction => {
    const store = transaction.objectStore('messages');
    const record = await result<CachedMessage | undefined>(store.get([account, id]));
    if (record && action && ['read', 'unread', 'pin', 'unpin'].includes(action)) {
      const change =
        action === 'read' || action === 'unread' ? {unread: action === 'unread'} : {pinned: action === 'pin'};
      if (record.metadata) record.metadata = {...record.metadata, ...change};
      if (record.body && 'unread' in change) record.body = {...record.body, unread: change.unread!};
      record.bytes = bytes(record);
      store.put(record);
      return;
    }
    const views = transaction.objectStore('views');
    const request = views.index('account').openCursor(account);
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if ((cursor.value as CachedView).ids.includes(id)) cursor.delete();
        cursor.continue();
      };
    });
  });
}

/** Clears all mail cache, or one removed account, rejecting late provider writes first. */
export function clearCache(account?: string): Promise<boolean> {
  if (account) invalidateCache(account);
  else epoch++;
  return task(false, async transaction => {
    for (const name of STORES) {
      const store = transaction.objectStore(name);
      if (!account) {
        store.clear();
        continue;
      }
      const request = store.index('account').openKeyCursor(account);
      await new Promise<void>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          store.delete(cursor.primaryKey);
          cursor.continue();
        };
      });
    }
    return true;
  });
}
