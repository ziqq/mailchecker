/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Client-store regressions with the real Solid state and a mocked worker transport.
 *
 * @module tests/client
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createContext, runInContext} from 'node:vm';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

/** Repository root. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Real store bundled once, replacing only the extension transport. */
const bundled = (
  await build({
    absWorkingDir: root,
    stdin: {
      contents: (await readFile(resolve(root, 'src/client/store.ts'), 'utf8')) + '\nglobalThis.client = store;',
      resolveDir: resolve(root, 'src/client'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    plugins: [
      {
        name: 'mock-worker-transport',
        /** Routes actual store requests to the test worker, without replacing the store logic. */
        setup(builder) {
          builder.onLoad({filter: /shared[\\/]dom\.ts$/}, async () => ({
            contents: (await readFile(resolve(root, 'src/shared/dom.ts'), 'utf8')).replace(
              /export async function request<R = unknown>\(message: Request\): Promise<R> \{[\s\S]*?\n\}/,
              'export const request = message => globalThis.transport(message);',
            ),
            loader: 'ts',
            resolveDir: resolve(root, 'src/shared'),
          }));
        },
      },
    ],
  })
).outputFiles[0].text;

/** A normalized Inbox record. */
const message = (id, date = 1, thread = 'T') => ({
  id,
  thread,
  date,
  from: 'Sender <sender@example.test>',
  subject: id,
  snippet: id,
  unread: false,
  pinned: false,
  category: 'people',
  attachments: false,
  link: '',
});
/** A provider-confirmed read message body. */
const body = (id, text) => ({
  id,
  date: 1,
  from: 'Sender',
  to: 'a@example.test',
  cc: '',
  subject: id,
  html: '',
  text,
  unread: false,
  attachments: [],
});

/** Starts an isolated store with serialized worker replies and observable provider calls. */
function start() {
  const data = {
    preferences: {theme: 'dark', palette: 'neutral', popup: 'full'},
    accounts: [{id: 'A', provider: 'gmail', email: 'a@example.test', browser: false, color: '', reply: true}],
    mailboxes: {A: {messages: [message('m1')], unread: 0, checkedAt: Date.now(), error: '', reauth: false}},
    oauth: {},
  };
  const server = {bodies: [body('m1', 'Old body')], search: [], calls: [], request: null, authenticated: false};
  const document = Object.assign(new EventTarget(), {
    documentElement: {dataset: {mode: 'app'}},
    visibilityState: 'visible',
  });
  const window = new EventTarget();
  const context = createContext({
    document,
    window,
    setTimeout: () => 0,
    clearTimeout() {},
    async transport(request) {
      server.calls.push(request);
      if (server.authenticated && (request.type === 'CHECK' || request.type === 'SIGN_IN')) {
        data.mailboxes.A.reauth = false;
        data.mailboxes.A.error = '';
      }
      if (request.type === 'THREAD') return server.request ? server.request(request) : structuredClone(server.bodies);
      if (request.type === 'SEARCH') return structuredClone(server.search);
      if (request.type === 'REPLY') {
        server.bodies.push(body('reply', 'Sent reply'));
        return true;
      }
      if (request.type === 'ACT' && request.action === 'unread') {
        data.mailboxes.A.messages[0].unread = true;
        data.mailboxes.A.unread = 1;
      }
      return structuredClone(data);
    },
  });
  runInContext(bundled, context);
  return {store: context.client, data, server, document, window};
}

test('conversation refresh returns new mail while timestamp-only checks reuse the cache', async () => {
  const w = start();
  await w.store.load();
  w.store.select(w.store.entries()[0]);
  const selection = w.store.selected();
  await w.store.thread(selection);
  w.data.mailboxes.A.checkedAt++;
  await w.store.load();
  await w.store.thread(selection);
  assert.equal(w.server.calls.filter(call => call.type === 'THREAD').length, 1);
  w.data.mailboxes.A.messages.unshift(message('m2', 2));
  w.server.bodies.push(body('m2', 'New body'));
  await w.store.refresh();
  const messages = await w.store.thread({account: 'A', id: 'm2', thread: 'T'});
  assert.equal(messages.find(item => item.id === 'm2').text, 'New body');
});

test('sent reply appears when the same conversation is reopened', async () => {
  const w = start();
  await w.store.load();
  const entry = w.store.entries()[0];
  w.store.select(entry);
  await w.store.thread(w.store.selected());
  assert.equal(await w.store.reply(entry, 'Reply'), true);
  const messages = await w.store.thread(w.store.selected());
  assert.equal(messages.find(item => item.id === 'reply').text, 'Sent reply');
});

test('reopening mail marked unread reaches the worker and reconciles its confirmed read state', async () => {
  const w = start();
  await w.store.load();
  w.store.select(w.store.entries()[0]);
  await w.store.thread(w.store.selected());
  await w.store.act(w.store.current(), 'unread');
  w.store.select(null);
  w.store.select(w.store.entries()[0]);
  await w.store.thread(w.store.selected());
  assert.equal(w.server.calls.filter(call => call.type === 'THREAD').length, 2);
  assert.equal(w.store.current().message.unread, false);
  assert.equal(w.store.state().mailboxes.A.unread, 0);
});

test('confirmed read state updates an unread search result outside the Inbox', async () => {
  const w = start();
  await w.store.load();
  w.server.search = [{account: 'A', message: {...message('archive', 1, 'AT'), unread: true}}];
  w.server.bodies = [body('archive', 'Archived body')];
  await w.store.search('archive');
  w.store.select(w.store.results()[0]);
  await w.store.thread(w.store.selected());
  assert.equal(w.store.results()[0].message.unread, false);
  assert.equal(w.store.current().message.unread, false);
});

test('late old conversation response cannot replace a newer refreshed cache', async () => {
  const w = start();
  await w.store.load();
  let release;
  const delayed = new Promise(resolve => {
    release = resolve;
  });
  let calls = 0;
  w.server.request = async () => (++calls === 1 ? delayed : [body('m1', 'New'), body('m2', 'New')]);
  const old = w.store.thread({account: 'A', id: 'm1', thread: 'T'});
  w.data.mailboxes.A.messages.push(message('m2', 2));
  await w.store.refresh();
  await w.store.thread({account: 'A', id: 'm2', thread: 'T'});
  release([body('m1', 'Old')]);
  await old;
  const messages = await w.store.thread({account: 'A', id: 'm2', thread: 'T'});
  assert.equal(messages.find(item => item.id === 'm2').text, 'New');
});

test('reader metadata survives a filter or Inbox refresh that hides the selected message', async () => {
  const w = start();
  await w.store.load();
  w.store.select(w.store.entries()[0]);
  w.store.setFilter('newsletters');
  assert.equal(w.store.current().message.id, 'm1');
  w.data.mailboxes.A.messages = [];
  await w.store.refresh();
  assert.equal(w.store.current().message.id, 'm1');
  await w.store.act(w.store.current(), 'trash');
  assert.equal(w.server.calls.at(-1).message, 'm1');
  assert.equal(w.server.calls.at(-1).action, 'trash');
  assert.equal(w.store.selected(), null);
});

test('returning from browser sign-in rechecks once and removes the old authentication error', async () => {
  const w = start();
  w.data.accounts[0].browser = true;
  w.data.mailboxes.A.reauth = true;
  w.data.mailboxes.A.error = 'Sign in';
  await w.store.load();
  await w.store.signIn('A');
  assert.equal(w.store.state().mailboxes.A.reauth, true);
  w.server.authenticated = true;
  w.window.dispatchEvent(new Event('focus'));
  w.document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.server.calls.filter(call => call.type === 'CHECK').length, 1);
  assert.equal(w.store.state().mailboxes.A.reauth, false);
  assert.equal(w.store.state().mailboxes.A.error, '');
});

test('a recent browser sign-in error is checked when the popup is reopened', async () => {
  const w = start();
  w.data.accounts[0].browser = true;
  w.data.mailboxes.A.reauth = true;
  w.data.mailboxes.A.error = 'Sign in';
  w.server.authenticated = true;
  await w.store.open();
  assert.equal(w.server.calls.filter(call => call.type === 'CHECK').length, 1);
  assert.equal(w.store.state().mailboxes.A.reauth, false);
});

test('browser sign-in return waits until the page is visible', async () => {
  const w = start();
  w.data.accounts[0].browser = true;
  w.data.mailboxes.A.reauth = true;
  await w.store.load();
  await w.store.signIn('A');
  w.document.visibilityState = 'hidden';
  w.window.dispatchEvent(new Event('focus'));
  assert.equal(w.server.calls.filter(call => call.type === 'CHECK').length, 0);
  w.server.authenticated = true;
  w.document.visibilityState = 'visible';
  w.document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.store.state().mailboxes.A.reauth, false);
});

test('a completed sign-in cancels a previous pending return check', async () => {
  const w = start();
  w.data.accounts[0].browser = true;
  w.data.mailboxes.A.reauth = true;
  await w.store.load();
  await w.store.signIn('A');
  w.server.authenticated = true;
  await w.store.signIn('A');
  w.window.dispatchEvent(new Event('focus'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.server.calls.filter(call => call.type === 'CHECK').length, 0);
  assert.equal(w.store.state().mailboxes.A.reauth, false);
});
