/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Persistent-cache integration in an unpacked MV3 extension with synthetic provider replies.
 *
 * @module e2e/cache-extension
 */
import {test, expect} from '@playwright/test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildExtension} from '../scripts/build.mjs';

/** A disposable Inbox entry, unrelated to the user's real accounts. */
const message = {
  id: 'm',
  thread: 'T',
  from: 'Sender',
  subject: 'Cache regression',
  snippet: 'Loaded body',
  date: 1,
  link: '',
  unread: true,
  pinned: false,
  category: 'people',
  attachments: false,
};

/** Waits for the extension API bindings, which may appear after the service-worker event. */
async function ready(context) {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  // A cold MV3 target can be announced before extension bindings become evaluable.
  // An actual extension page wakes the worker through its normal STATE request.
  const startup = await context.newPage();
  await startup.goto(worker.url().replace(/background\.js$/, 'options.html'));
  await expect
    .poll(() => worker.evaluate(() => Boolean(globalThis.chrome.storage?.local && globalThis.chrome.alarms)))
    .toBe(true);
  await worker.evaluate(() => globalThis.chrome.alarms.clear('check'));
  await startup.close();
  return worker;
}

/** Installs a controlled provider: body requests can be held until explicit release or rejected. */
async function provider(worker, {hold = false, fail = false} = {}) {
  await worker.evaluate(
    ({hold, fail}) => {
      globalThis.cacheServer = {calls: 0, waiting: [], hold, fail};
      globalThis.fetch = async input => {
        const server = globalThis.cacheServer;
        if (server.fail) throw Error('Synthetic offline response');
        const url = new URL(input);
        const payload = {
          id: 'm',
          threadId: 'T',
          internalDate: '1',
          labelIds: ['INBOX'],
          snippet: 'Loaded body',
          payload: {
            mimeType: 'text/plain',
            headers: [
              {name: 'From', value: 'Sender'},
              {name: 'Subject', value: 'Cache regression'},
            ],
            body: {data: btoa('Persistent loaded body')},
          },
        };
        if (url.pathname.includes('/threads/')) {
          server.calls++;
          if (server.hold) await new Promise(resolve => server.waiting.push(resolve));
          return new Response(JSON.stringify({messages: [payload]}));
        }
        if (url.pathname.endsWith('/labels/INBOX')) return new Response('{"messagesUnread":0}');
        if (url.pathname.endsWith('/messages')) return new Response('{"messages":[{"id":"m"}]}');
        if (url.pathname.endsWith('/messages/m')) return new Response(JSON.stringify(payload));
        return new Response('{}');
      };
    },
    {hold, fail},
  );
}

/** Releases every held HTTP body response. */
const release = worker =>
  worker.evaluate(() => {
    globalThis.cacheServer.hold = false;
    for (const done of globalThis.cacheServer.waiting.splice(0)) done();
  });

/** Waits for the actual iframe content, rather than a list preview. */
const visibleBody = page =>
  expect(
    page.frameLocator('iframe.mail-frame').last().getByText('Persistent loaded body', {exact: true}),
  ).toBeVisible();

/** Sends a request from an actual trusted extension page, through its real broker. */
const request = (page, message) => page.evaluate(message => globalThis.chrome.runtime.sendMessage(message), message);

/** Counts actual persisted messages, after all broker operations under test have settled. */
const countRecords = page =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('mailchecker-cache');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            transaction = db.transaction('messages');
          const count = transaction.objectStore('messages').count();
          transaction.oncomplete = () => {
            db.close();
            resolve(count.result);
          };
        };
      }),
  );

test('MV3 cache survives restart, revalidates without replacing mail, and isolates storage failures', async ({
  playwright,
}, testInfo) => {
  test.setTimeout(90_000);
  const directory = await mkdtemp(join(tmpdir(), 'mailchecker-cache-regression-'));
  const outdir = join(directory, 'extension');
  await buildExtension({outdir});
  const launch = () =>
    playwright.chromium.launchPersistentContext(join(directory, 'profile'), {
      channel: 'chromium',
      headless: true,
      viewport: {width: 780, height: 600},
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${outdir}`,
        `--load-extension=${outdir}`,
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
      ],
    });
  let context;
  try {
    context = await launch();
    let worker = await ready(context);
    const base = worker.url().replace(/background\.js$/, '');
    await worker.evaluate(
      async message =>
        globalThis.chrome.storage.local.set({
          accounts: [
            {
              id: 'A',
              provider: 'gmail',
              email: 'a@example.test',
              settings: {},
              credentials: {token: 'synthetic-token'},
            },
          ],
          mailboxes: {A: {messages: [message], unread: 1, error: '', reauth: false, checkedAt: Date.now()}},
          preferences: {notifications: false, interval: 60},
        }),
      message,
    );
    await provider(worker);
    let app = await context.newPage();
    await app.goto(base + 'app.html');
    await app.locator('.row[data-id="m"]').click();
    await visibleBody(app);

    // The same broker must retain API history search and use IndexedDB only for a browser connection.
    const apiSearch = await request(app, {type: 'SEARCH', query: 'Cache regression', pages: []});
    expect(apiSearch.value.hits.map(hit => hit.message.id)).toEqual(['m']);
    expect(apiSearch.value.pages[0].local).toBeUndefined();
    const originalState = await worker.evaluate(() => globalThis.chrome.storage.local.get(['accounts', 'mailboxes']));
    await worker.evaluate(async () => {
      const {accounts, mailboxes} = await globalThis.chrome.storage.local.get(['accounts', 'mailboxes']);
      accounts[0].settings.browser = true;
      mailboxes.A.messages = [];
      globalThis.searchFetch = globalThis.fetch;
      globalThis.searchNetworkCalls = 0;
      globalThis.fetch = async () => {
        globalThis.searchNetworkCalls++;
        throw Error('Loaded search must not use the network');
      };
      await globalThis.chrome.storage.local.set({accounts, mailboxes});
    });
    const cachedSearch = await request(app, {type: 'SEARCH', query: 'Cache regression', pages: []});
    expect(cachedSearch.value.pages[0].local).toBe(true);
    expect(cachedSearch.value.hits.map(hit => hit.message.id)).toEqual(['m']);
    await worker.evaluate(async message => {
      const {mailboxes} = await globalThis.chrome.storage.local.get('mailboxes');
      mailboxes.A.messages = [
        {...message, subject: 'Fresh Inbox metadata'},
        {...message, id: 'inbox-only', subject: 'Cache regression'},
      ];
      await globalThis.chrome.storage.local.set({mailboxes});
    }, message);
    const fresh = await request(app, {type: 'SEARCH', query: 'Fresh', pages: []});
    expect(fresh.value.hits.map(hit => hit.message.id)).toEqual(['m']);
    const merged = await request(app, {type: 'SEARCH', query: 'Sender', pages: []});
    expect(merged.value.hits.map(hit => hit.message.id).sort()).toEqual(['inbox-only', 'm']);
    const obsolete = await request(app, {type: 'SEARCH', query: 'Cache regression', pages: []});
    expect(obsolete.value.hits.map(hit => hit.message.id)).toEqual(['inbox-only']);
    expect(await worker.evaluate(() => globalThis.searchNetworkCalls)).toBe(0);
    await worker.evaluate(async state => {
      globalThis.fetch = globalThis.searchFetch;
      await globalThis.chrome.storage.local.set(state);
    }, originalState);
    await context.close();

    context = await launch();
    worker = await ready(context);
    await worker.evaluate(async () => {
      const {mailboxes} = await globalThis.chrome.storage.local.get('mailboxes');
      mailboxes.A.checkedAt = Date.now();
      mailboxes.A.unread = 1;
      mailboxes.A.messages[0].unread = true;
      await globalThis.chrome.storage.local.set({mailboxes});
    });
    await provider(worker, {hold: true});
    app = await context.newPage();
    await app.goto(base + 'app.html');
    await app.locator('.row[data-id="m"]').click();
    await visibleBody(app);
    await expect.poll(() => worker.evaluate(() => globalThis.cacheServer.waiting.length)).toBe(1);
    expect(
      await worker.evaluate(
        async () => (await globalThis.chrome.storage.local.get('mailboxes')).mailboxes.A.messages[0].unread,
      ),
    ).toBe(true);
    const frame = await app.locator('iframe.mail-frame').last().elementHandle();
    await release(worker);
    await expect(app.locator('.reader [role="status"]')).toHaveCount(0);
    expect(await frame.evaluate(element => element.isConnected)).toBe(true);
    expect(
      await worker.evaluate(
        async () => (await globalThis.chrome.storage.local.get('mailboxes')).mailboxes.A.messages[0].unread,
      ),
    ).toBe(false);
    await app.close();

    await provider(worker, {fail: true});
    app = await context.newPage();
    await app.goto(base + 'app.html');
    await app.locator('.row[data-id="m"]').click();
    await visibleBody(app);
    const offlineText = await app.evaluate(() => globalThis.chrome.i18n.getMessage('cache_offline'));
    await expect(app.locator('.reader [role="status"]')).toContainText(offlineText);
    for (const viewport of [
      {width: 780, height: 600},
      {width: 400, height: 600},
      {width: 1440, height: 900},
      {width: 390, height: 844},
    ]) {
      await app.setViewportSize(viewport);
      await visibleBody(app);
      expect(await app.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
    await app.screenshot({path: testInfo.outputPath('cached-offline.png')});
    const retryFrame = await app.locator('iframe.mail-frame').last().elementHandle();
    await provider(worker);
    const checkLabel = await app.evaluate(() => globalThis.chrome.i18n.getMessage('action_check_now'));
    await app.getByRole('button', {name: checkLabel, exact: true}).click();
    await expect(app.locator('.reader [role="status"]')).toHaveCount(0);
    expect(await retryFrame.evaluate(element => element.isConnected)).toBe(true);

    const options = await context.newPage();
    await options.goto(base + 'options.html');
    await options.locator('#clear-cache').click();
    await expect(options.locator('#clear-cache')).toBeEnabled();
    expect((await request(app, {type: 'CACHED_THREAD', account: 'A', message: 'm', thread: 'T'})).value).toBeNull();
    expect(
      await worker.evaluate(async () => (await globalThis.chrome.storage.local.get('accounts')).accounts.length),
    ).toBe(1);
    // Client pages cannot clear all mail, and Settings cannot request private bodies.
    expect((await request(app, {type: 'CLEAR_CACHE'})).ok).toBe(false);
    expect((await request(options, {type: 'CACHED_THREAD', account: 'A', message: 'm', thread: 'T'})).ok).toBe(false);

    await provider(worker, {hold: true});
    const joined = request(app, {type: 'THREAD', account: 'A', message: 'm', thread: 'T'});
    const duplicate = request(app, {type: 'THREAD', account: 'A', message: 'm', thread: 'T'});
    await expect.poll(() => worker.evaluate(() => globalThis.cacheServer.calls)).toBe(1);
    await release(worker);
    expect((await joined).ok).toBe(true);
    expect((await duplicate).ok).toBe(true);
    expect(await worker.evaluate(() => globalThis.cacheServer.calls)).toBe(1);

    await options.locator('#clear-cache').click();
    await worker.evaluate(() => {
      globalThis.originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('Synthetic quota', 'QuotaExceededError');
      };
    });
    expect((await request(app, {type: 'THREAD', account: 'A', message: 'm', thread: 'T'})).ok).toBe(true);
    await worker.evaluate(() => {
      IDBObjectStore.prototype.put = globalThis.originalPut;
    });
    expect(await countRecords(options)).toBe(0);

    await provider(worker, {hold: true});
    const late = request(app, {type: 'THREAD', account: 'A', message: 'm', thread: 'T'});
    await expect.poll(() => worker.evaluate(() => globalThis.cacheServer.waiting.length)).toBe(1);
    expect((await request(options, {type: 'REMOVE_ACCOUNT', account: 'A'})).ok).toBe(true);
    await release(worker);
    await late;
    expect(await countRecords(options)).toBe(0);
    expect((await request(app, {type: 'CACHED_THREAD', account: 'A', message: 'm', thread: 'T'})).ok).toBe(false);
  } finally {
    await context?.close();
    await rm(directory, {recursive: true, force: true});
  }
});
