/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Persistent-cache regressions using the real IndexedDB engine in a dedicated worker.
 *
 * @module e2e/cache
 */
import {test, expect} from '@playwright/test';
import {build} from 'esbuild';

/** Actual cache module, bundled without substituting its IndexedDB implementation. */
const source = (
  await build({
    entryPoints: ['src/background/cache.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'cache',
    write: false,
  })
).outputFiles[0].text;
/** A normalized body; all tests use disposable synthetic mail. */
const body = {
  id: 'm',
  from: 'Sender',
  to: 'a@example.test',
  cc: '',
  subject: 'Saved body',
  date: 1,
  html: '<p>Saved body</p>',
  text: 'Saved body',
  unread: true,
  attachments: [],
};

/** Starts an isolated RPC worker on the test page's origin, retaining its database on restart. */
async function start(page, unavailable = false) {
  await page.route('**/__cache_worker.js', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body:
        (unavailable ? "Object.defineProperty(self, 'indexedDB', {value: undefined});\n" : '') +
        source +
        `
self.onmessage = async ({data: {id, method, args}}) => {
  try {
    if (method === 'quota') {
      if (args[0]) { self.originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('Test quota', 'QuotaExceededError'); }; }
      else IDBObjectStore.prototype.put = self.originalPut;
      postMessage({id, value: true});
    } else postMessage({id, value: await cache[method](...args)});
  } catch (error) { postMessage({id, error: String(error)}); }
};`,
    }),
  );
  await page.route('**/__cache_test.html', route =>
    route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Cache regression</title>'}),
  );
  await page.goto('__cache_test.html');
  await page.evaluate(() => {
    let worker,
      id = 0;
    const pending = new Map();
    const restart = () => {
      worker?.terminate();
      worker = new Worker('/__cache_worker.js');
      worker.onmessage = ({data}) => {
        const job = pending.get(data.id);
        pending.delete(data.id);
        data.error ? job.reject(Error(data.error)) : job.resolve(data.value);
      };
    };
    restart();
    window.cacheTest = {
      restart,
      call: (method, ...args) =>
        new Promise((resolve, reject) => {
          pending.set(++id, {resolve, reject});
          worker.postMessage({id, method, args});
        }),
    };
  });
  return (method, ...args) => page.evaluate(({method, args}) => window.cacheTest.call(method, ...args), {method, args});
}

/** Reads or seeds actual object stores; seeds create boundary/corruption fixtures, never replace cache logic. */
async function records(page, seeds = []) {
  return page.evaluate(
    seeds =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('mailchecker-cache');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['messages', 'views'], 'readwrite');
          for (const {store, value} of seeds) transaction.objectStore(store).put(value);
          const messages = transaction.objectStore('messages').getAll();
          const views = transaction.objectStore('views').getAll();
          transaction.oncomplete = () => {
            db.close();
            resolve({messages: messages.result, views: views.result});
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
    seeds,
  );
}

test('bodies survive worker/page restart and are deduplicated across views', async ({page}) => {
  let call = await start(page);
  const ticket = await call('cacheTicket', 'A');
  await call('cacheView', ticket, 'thread', 'T', [body]);
  await call('cacheView', ticket, 'folder', 'F', [{id: 'm', thread: 'T', subject: 'Metadata', unread: true}]);
  const stored = await records(page);
  expect(stored.messages).toHaveLength(1);
  expect(stored.views).toHaveLength(2);
  await page.evaluate(() => window.cacheTest.restart());
  expect((await call('cachedThread', 'A', 'T', 'm')).messages[0].text).toBe('Saved body');
  call = await start(page);
  expect((await call('cachedThread', 'A', 'T', 'm')).messages[0].html).toBe('<p>Saved body</p>');
});

test('loaded-mail metadata survives restart, excludes bodies and expired records, and reconciles actions', async ({
  page,
}) => {
  let call = await start(page);
  const metadata = {
    id: 'm',
    thread: 'T',
    from: 'Sender <sender@example.test>',
    subject: 'Loaded search metadata',
    snippet: 'Saved preview',
    date: 1,
    unread: true,
    pinned: false,
    category: 'people',
    attachments: false,
    link: '',
  };
  await call('cacheView', await call('cacheTicket', 'A'), 'folder', 'F', [metadata]);
  await call('cacheView', await call('cacheTicket', 'A'), 'thread', 'T', [body]);
  await call('cacheView', await call('cacheTicket', 'A'), 'thread', 'body-only', [{...body, id: 'body-only'}]);
  await call('cacheView', await call('cacheTicket', 'B'), 'folder', 'F', [{...metadata, subject: 'Other account'}]);
  expect(await call('cachedMessages', 'A')).toEqual([metadata]);
  call = await start(page);
  expect(await call('cachedMessages', 'A')).toEqual([metadata]);
  await records(page, [
    {
      store: 'messages',
      value: {
        account: 'A',
        id: 'expired',
        metadata: {...metadata, id: 'expired'},
        access: Date.now() - 31 * 24 * 60 * 60 * 1000,
        bytes: 500,
      },
    },
  ]);
  expect(await call('cachedMessages', 'A')).toEqual([metadata]);
  await call('cacheAction', 'A', 'm', 'read');
  await call('cacheAction', 'A', 'm', 'pin');
  expect(await call('cachedMessages', 'A')).toEqual([{...metadata, unread: false, pinned: true}]);
  for (const action of ['archive', 'trash']) {
    await call('cacheView', await call('cacheTicket', 'A'), 'folder', 'F', [metadata]);
    await call('cacheAction', 'A', 'm', action);
    expect(await call('cachedMessages', 'A')).toEqual([]);
  }
  expect((await call('cachedMessages', 'B'))[0].subject).toBe('Other account');
  await call('clearCache', 'B');
  expect(await call('cachedMessages', 'B')).toEqual([]);
  call = await start(page, true);
  expect(await call('cachedMessages', 'A')).toEqual([]);
});

test('confirmed flags reject older writes and moves/replies invalidate referenced views', async ({page}) => {
  const call = await start(page);
  const old = await call('cacheTicket', 'A');
  await call('cacheView', old, 'thread', 'T', [body]);
  await call('invalidateCache', 'A');
  await call('cacheAction', 'A', 'm', 'read');
  await call('cacheAction', 'A', 'm', 'pin');
  await call('cacheView', old, 'thread', 'T', [body]);
  expect((await call('cachedThread', 'A', 'T', 'm')).messages[0].unread).toBe(false);
  await call('cacheAction', 'A', 'm', 'unread');
  expect((await call('cachedThread', 'A', 'T', 'm')).messages[0].unread).toBe(true);
  for (const action of ['trash', 'archive', undefined]) {
    await call('cacheView', await call('cacheTicket', 'A'), 'thread', 'T', [body]);
    await call('cacheAction', 'A', 'm', action);
    expect(await call('cachedThread', 'A', 'T', 'm')).toBeNull();
  }
});

test('account removal and clear reject late writes while preserving other accounts', async ({page}) => {
  const call = await start(page);
  const a = await call('cacheTicket', 'A'),
    b = await call('cacheTicket', 'B');
  await call('cacheView', a, 'thread', 'T', [body]);
  await call('cacheView', b, 'thread', 'T', [body]);
  expect(await call('clearCache', 'A')).toBe(true);
  await call('cacheView', a, 'thread', 'T', [body]);
  expect(await call('cachedThread', 'A', 'T', 'm')).toBeNull();
  expect((await call('cachedThread', 'B', 'T', 'm')).messages).toHaveLength(1);
  expect(await call('clearCache')).toBe(true);
  await call('cacheView', b, 'thread', 'T', [body]);
  expect(await records(page)).toEqual({messages: [], views: []});
});

test('LRU and age limits bound messages/views and never return incomplete conversations', async ({page}) => {
  const call = await start(page);
  await call('clearCache');
  const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  await records(page, [
    ...Array.from({length: 5000}, (_, i) => ({
      store: 'messages',
      value: {account: 'A', id: 'old' + i, body: {...body, id: 'old' + i}, access: now + i, bytes: 500},
    })),
    ...Array.from({length: 1001}, (_, i) => ({
      store: 'views',
      value: {
        account: 'A',
        kind: 'thread',
        id: 'view' + i,
        ids: ['old' + i],
        access: i ? now + i : old,
        fetchedAt: now,
        bytes: 100,
      },
    })),
  ]);
  expect(await call('cachedThread', 'A', 'view0', 'old0')).toBeNull();
  const ticket = await call('cacheTicket', 'A');
  await call('cacheView', ticket, 'thread', 'new', [{...body, id: 'new'}]);
  const stored = await records(page);
  expect(stored.messages).toHaveLength(5000);
  expect(stored.views).toHaveLength(1000);
  expect(stored.views.some(view => view.id === 'view0')).toBe(false);
  expect(stored.messages.some(message => message.id === 'old0')).toBe(false);
  // An evicted member makes even an otherwise valid view a cache miss.
  await records(page, [
    {
      store: 'views',
      value: {
        account: 'A',
        kind: 'thread',
        id: 'incomplete',
        ids: ['missing'],
        access: now,
        fetchedAt: now,
        bytes: 100,
      },
    },
  ]);
  expect(await call('cachedThread', 'A', 'incomplete', 'missing')).toBeNull();
});

test('estimated bytes stay below 50 MiB and failed writes expose no partial view', async ({page}) => {
  const call = await start(page);
  const ticket = await call('cacheTicket', 'A');
  await call(
    'cacheView',
    ticket,
    'thread',
    'large',
    Array.from({length: 9}, (_, i) => ({...body, id: 'large' + i, text: 'x'.repeat(2 * 1024 * 1024)})),
  );
  const stored = await records(page);
  expect(stored.messages.length).toBeLessThan(9);
  expect([...stored.messages, ...stored.views].reduce((sum, value) => sum + value.bytes, 0)).toBeLessThanOrEqual(
    50 * 1024 * 1024,
  );
  await call('clearCache');
  await call('quota', true);
  await call('cacheView', await call('cacheTicket', 'A'), 'thread', 'failed', [body]);
  await call('quota', false);
  expect(await records(page)).toEqual({messages: [], views: []});
  await call('cacheView', await call('cacheTicket', 'A'), 'thread', 'recovered', [body]);
  expect((await call('cachedThread', 'A', 'recovered', 'm')).messages).toHaveLength(1);
});

test('corrupt body records are cache misses and unavailable IndexedDB degrades gracefully', async ({page}) => {
  let call = await start(page);
  await call('cacheView', await call('cacheTicket', 'A'), 'thread', 'T', [body]);
  await records(page, [
    {store: 'messages', value: {account: 'A', id: 'm', body: {...body, html: null}, access: Date.now(), bytes: 500}},
  ]);
  expect(await call('cachedThread', 'A', 'T', 'm')).toBeNull();
  call = await start(page, true);
  await call('cacheView', await call('cacheTicket', 'A'), 'thread', 'T', [body]);
  expect(await call('cachedThread', 'A', 'T', 'm')).toBeNull();
  expect(await call('clearCache')).toBe(false);
});
