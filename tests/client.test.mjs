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
  const server = {
    bodies: [body('m1', 'Old body')],
    search: [],
    calls: [],
    request: null,
    folderRequest: null,
    catalogRequest: null,
    folders: [{id: 'projects', name: 'Projects'}],
    page: {messages: [message('m1')], next: '50'},
    authenticated: false,
  };
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
      if (request.type === 'FOLDERS')
        return server.catalogRequest ? server.catalogRequest(request) : structuredClone(server.folders);
      if (request.type === 'FOLDER')
        return server.folderRequest ? server.folderRequest(request) : structuredClone(server.page);
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

test('timestamp-only state clones keep list identity while changed flags remain visible', async () => {
  const w = start();
  await w.store.load();
  const entries = w.store.entries();
  const list = w.store.list();
  w.data.mailboxes.A.checkedAt++;
  await w.store.load();
  assert.equal(w.store.entries(), entries);
  assert.equal(w.store.list(), list);
  w.data.mailboxes.A.messages[0].pinned = true;
  await w.store.load();
  assert.notEqual(w.store.entries(), entries);
  assert.equal(w.store.entries()[0].message.pinned, true);
});

for (const action of ['trash', 'archive', 'read', 'unread', 'pin', 'unpin']) {
  test(`an old folder page cannot undo a completed ${action}`, async () => {
    const w = start();
    // Outlook moves archived mail out of custom folders; Gmail/JMAP retain those memberships.
    w.data.accounts[0].provider = 'outlook';
    w.server.page.messages[0].unread = action === 'read';
    w.server.page.messages[0].pinned = action === 'unpin';
    await w.store.load();
    await w.store.loadFolders();
    await w.store.chooseFolder({account: 'A', folder: w.server.folders[0]});
    let release;
    w.server.folderRequest = () => new Promise(done => (release = done));
    const loading = w.store.loadFolder();
    await w.store.act(w.store.entries()[0], action);
    release(structuredClone(w.server.page));
    await loading;
    const entries = w.store.entries();
    if (action === 'archive' || action === 'trash') assert.equal(entries.length, 0);
    else if (action === 'read' || action === 'unread') assert.equal(entries[0].message.unread, action === 'unread');
    else assert.equal(entries[0].message.pinned, action === 'pin');
    assert.equal(w.store.folderLoading(), false);
    assert.equal(w.store.folderNext()[0].cursor, '50');
  });
}

test('a pending next page preserves combined read and pin mutations', async () => {
  const w = start();
  w.server.page.messages[0].unread = true;
  await w.store.load();
  await w.store.loadFolders();
  await w.store.chooseFolder({account: 'A', folder: w.server.folders[0]});
  let release;
  w.server.folderRequest = () => new Promise(done => (release = done));
  const loading = w.store.loadFolder(true);
  await w.store.act(w.store.entries()[0], 'read');
  await w.store.act(w.store.entries()[0], 'pin');
  release({...structuredClone(w.server.page), next: ''});
  await loading;
  assert.equal(w.store.entries()[0].message.unread, false);
  assert.equal(w.store.entries()[0].message.pinned, true);
  assert.equal(w.store.folderNext().length, 0);
});

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

for (const provider of ['gmail', 'jmap', 'outlook']) {
  test(`${provider} archive reconciles custom-folder membership through a refresh`, async () => {
    const w = start();
    w.data.accounts[0].provider = provider;
    await w.store.load();
    await w.store.loadFolders();
    await w.store.chooseFolder({account: 'A', folder: w.server.folders[0]});
    const entry = w.store.entries()[0];
    w.store.select(entry);
    await w.store.act(entry, 'archive');
    const retained = provider !== 'outlook';
    assert.equal(w.store.entries().length, Number(retained));
    assert.equal(w.store.selected()?.id, retained ? 'm1' : undefined);
    // The provider's confirmed membership is the source of truth for the next page.
    if (!retained) w.server.page.messages = [];
    await w.store.refresh();
    assert.equal(w.store.entries().length, Number(retained));
    if (retained) {
      await w.store.act(w.store.entries()[0], 'trash');
      assert.equal(w.store.entries().length, 0);
    }
  });
}

test('catalog loads are deduplicated per account without blocking a newly selected mailbox', async () => {
  const w = start();
  w.data.accounts.push({...w.data.accounts[0], id: 'B'});
  w.data.mailboxes.B = structuredClone(w.data.mailboxes.A);
  let release;
  w.server.catalogRequest = request =>
    request.account === 'A'
      ? new Promise(done => (release = done))
      : Promise.resolve([{id: 'b-projects', name: 'B projects'}]);
  await w.store.load();
  w.store.setAccount('A');
  const first = w.store.loadFolders();
  const duplicate = w.store.loadFolders();
  assert.equal(w.store.catalogLoading(), true);
  assert.equal(w.server.calls.filter(call => call.type === 'FOLDERS' && call.account === 'A').length, 1);
  w.store.setAccount('B');
  await w.store.loadFolders();
  assert.equal(w.store.catalogLoading(), false);
  assert.equal(w.store.folderChoices()[0].folder.id, 'b-projects');
  release([{id: 'a-projects', name: 'A projects'}]);
  await Promise.all([first, duplicate]);
  assert.equal(w.store.folderChoices()[0].folder.id, 'b-projects');
  w.store.setAccount('A');
  await w.store.loadFolders();
  assert.equal(w.store.folderChoices()[0].folder.id, 'a-projects');
  assert.equal(w.server.calls.filter(call => call.type === 'FOLDERS').length, 2);
});

test('failed catalogs retry and timestamp-only checks do not refetch fresh counters', async () => {
  const w = start();
  let attempts = 0;
  w.server.catalogRequest = async () => {
    if (++attempts === 1) throw new Error('Temporary catalog failure');
    return w.server.folders;
  };
  await w.store.load();
  await w.store.loadFolders();
  assert.equal(w.store.catalogLoading(), false);
  assert.equal(w.store.catalogErrors().length, 1);
  await w.store.loadFolders();
  assert.equal(w.store.catalogErrors().length, 0);
  w.data.mailboxes.A.checkedAt++;
  await w.store.load();
  await w.store.loadFolders();
  assert.equal(attempts, 2);
  w.data.mailboxes.A.unread++;
  await w.store.load();
  await w.store.loadFolders();
  assert.equal(attempts, 3);
});

test('global search from Trash ignores hidden folder restrictions, pagination and refresh', async () => {
  const w = start();
  const trash = {id: 'trash', name: 'Trash', role: 'trash'};
  await w.store.load();
  await w.store.chooseFolder({account: 'A', folder: trash});
  assert.equal(w.store.canAct('archive'), false);
  assert.equal(w.store.canAct('trash'), false);
  w.server.search = [{account: 'A', message: message('found')}];
  await w.store.search('found');
  assert.equal(w.store.canAct('archive'), true);
  assert.equal(w.store.canAct('trash'), true);
  const before = w.server.calls.filter(call => call.type === 'FOLDER').length;
  await w.store.loadFolder(true);
  w.server.search = [];
  await w.store.refresh();
  assert.equal(w.store.results().length, 0);
  assert.equal(w.server.calls.filter(call => call.type === 'FOLDER').length, before);
  assert.equal(w.server.calls.filter(call => call.type === 'SEARCH').length, 2);
  await w.store.search('');
  assert.equal(w.store.canAct('trash'), false);
});

test('unread headings use server totals and preserve account-specific partial status', async () => {
  const w = start();
  w.data.mailboxes.A.unread = 120;
  w.data.mailboxes.A.messages[0].unread = true;
  w.data.accounts.push({...w.data.accounts[0], id: 'B'});
  w.data.mailboxes.B = {...structuredClone(w.data.mailboxes.A), unread: 50, unreadPartial: true};
  await w.store.load();
  assert.equal(w.store.unread().all, 170);
  assert.equal(w.store.unreadPartial(), true);
  w.store.setAccount('A');
  assert.equal(w.store.unread().all, 120);
  assert.equal(w.store.unread().people, 1);
  assert.equal(w.store.unreadPartial(), false);
  w.store.setAccount('B');
  assert.equal(w.store.unread().all, 50);
  assert.equal(w.store.unreadPartial(), true);
});

test('known folder totals follow successful reads and moves without treating unknown counts as zero', async () => {
  const w = start();
  const folder = {id: 'projects', name: 'Projects', unread: 90, total: 120};
  w.server.folders = [folder];
  w.server.page.messages[0].unread = true;
  await w.store.load();
  await w.store.loadFolders();
  await w.store.chooseFolder({account: 'A', folder});
  assert.equal(w.store.unread().all, 90);
  assert.equal(w.store.unreadPartial(), false);
  await w.store.act(w.store.entries()[0], 'read');
  assert.equal(w.store.unread().all, 89);
  assert.equal(w.store.folder().folder.total, 120);
  await w.store.act(w.store.entries()[0], 'unread');
  assert.equal(w.store.unread().all, 90);
  await w.store.act(w.store.entries()[0], 'trash');
  assert.equal(w.store.unread().all, 89);
  assert.equal(w.store.folder().folder.total, 119);
  assert.equal(w.store.folderChoices()[0].folder.total, 119);
  await w.store.chooseFolder({account: 'A', folder: {id: 'unknown', name: 'Unknown'}});
  assert.equal(w.store.unreadPartial(), true);
  await w.store.act(w.store.entries()[0], 'read');
  assert.equal(w.store.folder().folder.total, undefined);
  assert.equal(w.store.folder().folder.unread, undefined);
});

test('a transient body error is retried on reopening, then the full body is cached', async () => {
  const w = start();
  let attempts = 0;
  w.server.request = async () => {
    if (++attempts === 1) throw new Error('Temporary body failure');
    return [body('m1', 'Complete body')];
  };
  await w.store.load();
  const selection = {account: 'A', id: 'm1', thread: 'T'};
  await assert.rejects(w.store.thread(selection), /Temporary body failure/);
  assert.equal((await w.store.thread(selection))[0].text, 'Complete body');
  assert.equal((await w.store.thread(selection))[0].text, 'Complete body');
  assert.equal(attempts, 2);
});
