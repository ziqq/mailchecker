/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Service-worker regressions: the bundled worker runs in a VM with mocked
 * `chrome.*` APIs and mocked Gmail, Microsoft Graph and JMAP servers.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createContext, runInContext} from 'node:vm';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

/** Repository root. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bundled worker source, built once. */
const worker = (
  await build({
    absWorkingDir: root,
    entryPoints: ['src/background/index.ts'],
    bundle: true,
    format: 'iife',
    target: 'chrome116',
    write: false,
    plugins: [
      {
        name: 'test-oauth-config',
        /** Supplies test client IDs instead of the empty published ones. */
        setup(builder) {
          builder.onLoad({filter: /oauth[\\/]config\.ts$/}, () => ({
            contents: "export const oauthConfig = {google: 'test-google-id', microsoft: 'test-microsoft-id'};",
            loader: 'ts',
          }));
        },
      },
    ],
  })
).outputFiles[0].text;

const EXTENSION = 'chrome-extension://test/';

/** Creates an event with `addListener` and `fire`. */
function event() {
  const listeners = [];
  return {addListener: listener => listeners.push(listener), fire: (...args) => listeners.map(l => l(...args))};
}

/** Returns a JSON response. */
const json = (value, status = 200) =>
  new Response(value == null ? '' : JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});

/**
 * Starts a worker with mocked servers and returns helpers.
 *
 * @param {Object} [options]
 * @param {boolean} [options.identity=true] Whether the identity permission is granted.
 */
function startWorker({identity = true} = {}) {
  const stores = {local: {}, session: {}};
  const calls = [];
  const notifications = [];
  const tabs = [];
  const badge = {};
  const server = {
    gmail: ['m1', 'm2'],
    gmailRead: new Set(),
    gmailStarred: new Set(),
    graph: ['o1'],
    graphUnread: 5,
    jmap: ['e1'],
    jmapSeen: new Set(),
    microsoftRefreshes: 0,
  };
  /** Gmail metadata for a message ID. */
  const gmailMessage = id => ({
    id,
    threadId: `t-${id}`,
    labelIds: [
      'INBOX',
      ...(server.gmailRead.has(id) ? [] : ['UNREAD']),
      ...(server.gmailStarred.has(id) ? ['STARRED'] : []),
    ],
    snippet: 'Hi &amp; bye',
    internalDate: String(Date.now()),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        {name: 'From', value: '"Bob" <bob@example.com>'},
        {name: 'Subject', value: `Subject ${id}`},
      ],
      parts: [
        {mimeType: 'text/plain', body: {data: Buffer.from('plain').toString('base64url')}},
        {mimeType: 'text/html', body: {data: Buffer.from('<p>Привет, <b>мир</b></p>').toString('base64url')}},
      ],
    },
  });

  const area = name => ({
    async get(keys) {
      const list = typeof keys === 'string' ? [keys] : keys;
      return structuredClone(Object.fromEntries(list.filter(k => k in stores[name]).map(k => [k, stores[name][k]])));
    },
    async set(value) {
      Object.assign(stores[name], structuredClone(value));
    },
    async remove(key) {
      delete stores[name][key];
    },
    async setAccessLevel() {},
  });
  const onMessage = event();

  async function fetch(input, init = {}) {
    const url = new URL(input);
    calls.push({method: init.method || 'GET', url: url.href, body: init.body});
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    const auth = init.headers?.Authorization;
    if (url.host === 'gmail.googleapis.com') {
      assert.equal(auth, 'Bearer google-token');
      const path = url.pathname.replace('/gmail/v1/users/me', '');
      if (path === '/profile') return json({emailAddress: 'me@company.com'});
      if (path === '/labels/INBOX')
        return json({messagesUnread: server.gmail.filter(id => !server.gmailRead.has(id)).length});
      if (path === '/messages') {
        const ids = url.searchParams.get('q') === 'in:inbox' ? server.gmail : ['m1'];
        return json({messages: ids.map(id => ({id}))});
      }
      const thread = path.match(/^\/threads\/t-([^/]+)$/);
      if (thread) return json({id: `t-${thread[1]}`, messages: [gmailMessage(thread[1])]});
      const [, id, action] = path.match(/^\/messages\/([^/]+)(?:\/(\w+))?$/);
      if (action === 'trash') server.gmail = server.gmail.filter(item => item !== id);
      if (action === 'modify') {
        const {addLabelIds = [], removeLabelIds = []} = JSON.parse(init.body);
        if (removeLabelIds.includes('INBOX')) server.gmail = server.gmail.filter(item => item !== id);
        if (removeLabelIds.includes('UNREAD')) server.gmailRead.add(id);
        if (addLabelIds.includes('UNREAD')) server.gmailRead.delete(id);
        if (addLabelIds.includes('STARRED')) server.gmailStarred.add(id);
        if (removeLabelIds.includes('STARRED')) server.gmailStarred.delete(id);
      }
      if (action) return json({});
      return json(gmailMessage(id));
    }
    if (url.host === 'login.microsoftonline.com') {
      const body = new URLSearchParams(init.body);
      if (body.get('grant_type') === 'authorization_code') assert.ok(body.get('code_verifier'));
      if (body.get('grant_type') === 'refresh_token') server.microsoftRefreshes += 1;
      return json({access_token: 'ms-token', refresh_token: 'ms-refresh', expires_in: 3600, token_type: 'Bearer'});
    }
    if (url.host === 'graph.microsoft.com') {
      assert.equal(auth, 'Bearer ms-token');
      const path = url.pathname.replace('/v1.0/me', '');
      if (path === '') return json({mail: 'boss@corp.example'});
      if (path === '/mailFolders/inbox') return json({unreadItemCount: server.graphUnread});
      if (path === '/mailFolders/inbox/messages')
        return json({
          value: server.graph.map(id => ({
            id,
            conversationId: `c-${id}`,
            subject: 'Report',
            from: {emailAddress: {name: 'Ann', address: 'ann@corp.example'}},
            receivedDateTime: new Date().toISOString(),
            bodyPreview: 'Preview',
            isRead: false,
            webLink: `https://outlook.office.com/mail/${id}`,
          })),
        });
      return json(null, 204);
    }
    if (url.host === 'api.fastmail.com') {
      if (auth !== 'Bearer jmap-token') return json({}, 401);
      if (url.pathname === '/jmap/session')
        return json({
          apiUrl: 'https://api.fastmail.com/jmap/api/',
          username: 'me@mydomain.example',
          primaryAccounts: {'urn:ietf:params:jmap:mail': 'A1'},
        });
      const {methodCalls} = JSON.parse(init.body);
      return json({
        methodResponses: methodCalls.map(([name, args, tag]) => {
          assert.equal(args.accountId, 'A1');
          if (name === 'Mailbox/get')
            return [
              name,
              {
                list: [
                  {id: 'IN', role: 'inbox', unreadEmails: server.jmap.filter(id => !server.jmapSeen.has(id)).length},
                  {id: 'AR', role: 'archive'},
                  {id: 'TR', role: 'trash'},
                ],
              },
              tag,
            ];
          if (name === 'Email/query') return [name, {ids: args.filter.text ? ['e1'] : server.jmap}, tag];
          if (name === 'Email/get')
            return [
              name,
              {
                list: server.jmap.map(id => ({
                  id,
                  threadId: 'T',
                  subject: `J ${id}`,
                  preview: 'p',
                  receivedAt: new Date().toISOString(),
                  from: [{name: 'Zed', email: 'zed@example.com'}],
                  keywords: server.jmapSeen.has(id) ? {$seen: true} : {},
                })),
              },
              tag,
            ];
          if (name === 'Email/set') {
            for (const [id, change] of Object.entries(args.update)) {
              if (change.mailboxIds) server.jmap = server.jmap.filter(item => item !== id);
              if (change['keywords/$seen']) server.jmapSeen.add(id);
            }
            return [name, {updated: args.update}, tag];
          }
          return ['error', {type: 'unknownMethod'}, tag];
        }),
      });
    }
    throw new Error(`Unexpected request: ${url.href}`);
  }

  const chrome = {
    runtime: {
      id: 'test',
      getURL: path => EXTENSION + path,
      getManifest: () => ({version: '0.0.0'}),
      onMessage,
      onInstalled: event(),
      onStartup: event(),
      openOptionsPage: async () => {},
    },
    storage: {local: area('local'), session: area('session'), onChanged: event()},
    alarms: {clear: async () => {}, create: async () => {}, onAlarm: event()},
    action: {
      setBadgeText: async ({text}) => (badge.text = text),
      setBadgeBackgroundColor: async ({color}) => (badge.background = color),
      setBadgeTextColor: async ({color}) => (badge.color = color),
      setTitle: async () => {},
    },
    notifications: {
      create: async (id, options) => notifications.push(options),
      clear: async () => {},
      onClicked: event(),
    },
    tabs: {create: async ({url}) => tabs.push(url)},
    permissions: {contains: async ({permissions}) => (permissions ? identity : true)},
    // Chromium has no `chrome.identity` until the optional permission is granted.
    identity: identity && {
      getRedirectURL: path => `https://test.chromiumapp.org/${path}`,
      async launchWebAuthFlow({url}) {
        const request = new URL(url);
        const state = request.searchParams.get('state');
        if (request.host === 'accounts.google.com')
          return `https://test.chromiumapp.org/google#access_token=google-token&expires_in=3600&state=${state}`;
        assert.equal(request.searchParams.get('code_challenge_method'), 'S256');
        return `https://test.chromiumapp.org/microsoft?code=CODE&state=${state}`;
      },
    },
  };

  const context = createContext({
    chrome,
    fetch,
    Response,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortSignal,
    crypto: globalThis.crypto,
    btoa,
    atob,
    structuredClone,
    console,
    setTimeout,
    clearTimeout,
  });
  runInContext(worker, context);

  /** Sends a message as a page: `popup`, `options` or any URL. */
  const send = (message, page = 'options') =>
    new Promise(resolve =>
      onMessage.fire(message, {id: page === 'foreign' ? 'other' : 'test', url: `${EXTENSION}${page}.html`}, resolve),
    );
  /** Sends and asserts success. */
  const ok = async (message, page) => {
    const reply = await send(message, page);
    assert.ok(reply.ok, reply.error);
    return reply.value;
  };
  return {stores, calls, notifications, tabs, badge, server, send, ok, context, chrome};
}

test('connects all three providers and counts unread mail', async () => {
  const w = startWorker();
  assert.equal((await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'})).email, 'me@company.com');
  await w.ok({type: 'ADD_ACCOUNT', provider: 'outlook'});
  await w.ok({
    type: 'ADD_ACCOUNT',
    provider: 'jmap',
    input: {sessionURL: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
  });
  assert.equal(w.badge.text, '8');
  const state = await w.ok({type: 'STATE'}, 'popup');
  assert.equal(state.accounts.length, 3);
  assert.equal(JSON.stringify(state).includes('token'), false, 'public state must not contain credentials');
  assert.equal(state.mailboxes[state.accounts[0].id].messages[0].snippet, 'Hi & bye');
});

test('notifies only about messages that are new since the last check', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  assert.equal(w.notifications.length, 0);
  w.server.gmail.push('m3');
  await w.ok({type: 'CHECK'}, 'popup');
  assert.equal(w.notifications.length, 1);
  assert.equal(w.notifications[0].title, 'Bob');
  assert.equal(w.notifications[0].message, 'Subject m3');
});

test('message actions update the provider, the list and the badge', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const {accounts} = await w
    .ok({
      type: 'ADD_ACCOUNT',
      provider: 'jmap',
      input: {sessionURL: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
    })
    .then(value => value.state);
  const [gmail, jmap] = accounts;
  assert.equal(w.badge.text, '3');
  let state = await w.ok({type: 'ACT', account: gmail.id, message: 'm1', action: 'read'}, 'popup');
  assert.equal(state.mailboxes[gmail.id].messages.map(item => `${item.id}:${item.unread}`).join(), 'm1:false,m2:true');
  assert.equal(w.badge.text, '2');
  state = await w.ok({type: 'ACT', account: gmail.id, message: 'm1', action: 'pin'}, 'app');
  assert.equal(state.mailboxes[gmail.id].messages[0].pinned, true);
  assert.ok(w.server.gmailStarred.has('m1'));
  state = await w.ok({type: 'ACT', account: gmail.id, message: 'm2', action: 'archive'}, 'popup');
  assert.equal(state.mailboxes[gmail.id].messages.map(item => item.id).join(), 'm1');
  assert.equal(w.server.gmail.join(), 'm1');
  await w.ok({type: 'ACT', account: jmap.id, message: 'e1', action: 'trash'}, 'popup');
  assert.ok(w.calls.some(call => call.body?.includes('"TR":true')));
  assert.equal(w.badge.text, '');
  await w.ok({type: 'OPEN', account: gmail.id, message: 'm1'}, 'popup');
  assert.equal(w.tabs.at(-1), 'https://mail.google.com/mail/?authuser=me%40company.com#all/t-m1');
  const invalid = await w.send({type: 'ACT', account: gmail.id, message: 'm1', action: 'explode'}, 'popup');
  assert.equal(invalid.ok, false);
});

test('opening a conversation returns decoded bodies and marks it read', async () => {
  const w = startWorker();
  const {state} = await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const account = state.accounts[0].id;
  const messages = await w.ok({type: 'THREAD', account, message: 'm1', thread: 't-m1'}, 'popup');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].html, '<p>Привет, <b>мир</b></p>');
  assert.equal(messages[0].text, 'plain');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(w.server.gmailRead.has('m1'), 'opening marks the message read');
});

test('search merges hits from every account', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  await w.ok({
    type: 'ADD_ACCOUNT',
    provider: 'jmap',
    input: {sessionURL: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
  });
  const hits = await w.ok({type: 'SEARCH', query: 'report'}, 'app');
  assert.equal(
    hits
      .map(hit => hit.message.id)
      .sort()
      .join(),
    'e1,m1',
  );
  assert.ok(w.calls.some(call => call.url.includes('q=report')));
});

test('expired Microsoft tokens are refreshed once', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'outlook'});
  w.stores.local.accounts[0].credentials.expiresAt = 1;
  await Promise.all([w.ok({type: 'CHECK'}, 'popup'), w.ok({type: 'CHECK'}, 'popup')]);
  assert.equal(w.server.microsoftRefreshes, 1);
  assert.equal(w.stores.local.mailboxes[w.stores.local.accounts[0].id].error, '');
});

test('a rejected JMAP token is reported as needing a new token', async () => {
  const w = startWorker();
  await w.ok({
    type: 'ADD_ACCOUNT',
    provider: 'jmap',
    input: {sessionURL: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
  });
  w.stores.local.accounts[0].credentials.token = 'revoked';
  await w.ok({type: 'CHECK'}, 'popup');
  const box = w.stores.local.mailboxes[w.stores.local.accounts[0].id];
  assert.equal(box.reauth, true);
  assert.equal(w.badge.text, '1', 'the last known count is kept');
});

test('the broker rejects foreign senders and popup account management', async () => {
  const w = startWorker();
  assert.equal((await w.send({type: 'STATE'}, 'foreign')).ok, false);
  assert.equal((await w.send({type: 'STATE'}, 'other-page')).ok, false);
  assert.equal((await w.send({type: 'ADD_ACCOUNT', provider: 'gmail'}, 'popup')).ok, false);
  assert.equal((await w.send({type: 'ADD_ACCOUNT', provider: 'unknown'})).ok, false);
  assert.equal(
    (await w.send({type: 'ACT', account: 'x', message: 'y', action: 'read'})).ok,
    false,
    'Settings cannot act',
  );
  assert.equal((await w.send({type: 'STATE'}, 'app')).ok, true, 'the full-tab client is allowed');
});

test('OAuth accounts need the optional identity permission', async () => {
  const w = startWorker({identity: false});
  const reply = await w.send({type: 'ADD_ACCOUNT', provider: 'gmail'});
  assert.equal(reply.ok, false);
  assert.match(reply.error, /Разрешите/);
});

test('OAuth sign-in is offered before the identity permission is granted', async () => {
  const w = startWorker({identity: false});
  const {oauth} = await w.ok({type: 'STATE'}, 'options');
  assert.deepEqual(JSON.parse(JSON.stringify(oauth)), {
    google: true,
    microsoft: true,
    redirect: {google: 'https://test.chromiumapp.org/google', microsoft: 'https://test.chromiumapp.org/microsoft'},
  });
});

test('preferences default to graphite and a full popup, and keep a mini popup', async () => {
  const w = startWorker();
  const value = await w.ok({type: 'STATE'}, 'popup');
  assert.equal(value.preferences.palette, 'neutral');
  assert.equal(value.preferences.popup, 'full');
  assert.equal((await w.ok({type: 'PREFERENCES', value: {popup: 'mini'}}, 'options')).popup, 'mini');
  assert.equal((await w.ok({type: 'PREFERENCES', value: {popup: 'huge'}}, 'options')).popup, 'full');
});

test('preferences are bounded', async () => {
  const w = startWorker();
  const value = await w.ok(
    {type: 'PREFERENCES', value: {interval: 0, limit: 500, theme: 'x', palette: 'neutral'}},
    'popup',
  );
  assert.deepEqual(JSON.parse(JSON.stringify(value)), {
    interval: 0.5,
    notifications: true,
    limit: 50,
    theme: 'auto',
    palette: 'neutral',
    popup: 'full',
  });
});

test('preferences keep an accent palette', async () => {
  const w = startWorker();
  const pink = await w.ok({type: 'PREFERENCES', value: {palette: 'pink'}}, 'popup');
  assert.equal(pink.palette, 'pink');
});

test('the unread badge takes the accent colour', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  assert.deepEqual({...w.badge}, {text: '2', background: '#171717', color: '#fafafa'});
  await w.ok({type: 'PREFERENCES', value: {palette: 'orange'}}, 'options');
  assert.deepEqual({...w.badge}, {text: '2', background: '#ff9418', color: '#1a0f00'});
  await w.ok({type: 'PREFERENCES', value: {palette: 'pink'}}, 'options');
  assert.deepEqual({...w.badge}, {text: '2', background: '#eb6ca4', color: '#ffffff'});
  await w.ok({type: 'PREFERENCES', value: {palette: 'blue'}}, 'options');
  assert.deepEqual({...w.badge}, {text: '2', background: '#0088ff', color: '#ffffff'});
  await w.ok({type: 'PREFERENCES', value: {palette: 'neutral'}}, 'options');
  assert.deepEqual({...w.badge}, {text: '2', background: '#171717', color: '#fafafa'});
});

for (const provider of ['gmail', 'outlook']) {
  for (const silent of [false, true]) {
    test(`${provider} ${silent ? 'renewal' : 'sign-in'} rejects another mailbox before replacing credentials`, async () => {
      const w = startWorker();
      await w.ok({type: 'ADD_ACCOUNT', provider});
      const account = w.stores.local.accounts[0];
      const token = account.credentials.token;
      const original = w.context.fetch;
      let wrongMailboxReads = 0;
      w.chrome.identity.launchWebAuthFlow = async ({url}) => {
        const state = new URL(url).searchParams.get('state');
        return provider === 'gmail'
          ? `https://test.chromiumapp.org/google#access_token=other-token&expires_in=3600&state=${state}`
          : `https://test.chromiumapp.org/microsoft?code=CODE&state=${state}`;
      };
      w.context.fetch = async (input, init) => {
        const url = new URL(input);
        if (url.host === 'login.microsoftonline.com')
          return json({access_token: 'other-token', refresh_token: 'other-refresh', expires_in: 3600});
        if (init.headers?.Authorization === 'Bearer other-token') {
          if (url.pathname.endsWith('/profile')) return json({emailAddress: 'other@example.test'});
          if (url.pathname.endsWith('/me')) return json({mail: 'other@example.test'});
          wrongMailboxReads++;
          return json({});
        }
        return original(input, init);
      };
      if (silent) account.credentials.expiresAt = 1;
      const result = await w.send({type: silent ? 'CHECK' : 'SIGN_IN', account: account.id}, 'popup');
      assert.equal(w.stores.local.accounts[0].credentials.token, token);
      assert.equal(wrongMailboxReads, 0);
      if (silent) assert.equal(w.stores.local.mailboxes[account.id].reauth, true);
      else assert.equal(result.ok, false);
    });
  }
  test(`${provider} accepts the same mailbox irrespective of address case`, async () => {
    const w = startWorker();
    await w.ok({type: 'ADD_ACCOUNT', provider});
    const account = w.stores.local.accounts[0];
    account.email = account.email.toUpperCase();
    await w.ok({type: 'SIGN_IN', account: account.id}, 'popup');
    assert.equal(w.stores.local.accounts[0].email, account.email);
  });
}

test('missing OAuth profile address does not replace credentials', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const account = w.stores.local.accounts[0];
  const original = w.context.fetch;
  w.context.fetch = (input, init) => (new URL(input).pathname.endsWith('/profile') ? json({}) : original(input, init));
  assert.equal((await w.send({type: 'SIGN_IN', account: account.id}, 'popup')).ok, false);
  assert.equal(w.stores.local.accounts[0].credentials.token, 'google-token');
});

/** Connects a JMAP account to the mock server. */
async function jmapWorker() {
  const w = startWorker();
  await w.ok({
    type: 'ADD_ACCOUNT',
    provider: 'jmap',
    input: {
      sessionURL: 'https://api.fastmail.com/jmap/session',
      token: 'jmap-token',
    },
  });
  return w;
}

/** Applies JMAP replacement or JSON Pointer membership updates like a server. */
function applyMemberships(memberships, patch) {
  if (patch.mailboxIds) return {...patch.mailboxIds};
  const next = {...memberships};
  for (const [path, value] of Object.entries(patch)) {
    if (!path.startsWith('mailboxIds/')) continue;
    const id = path.slice('mailboxIds/'.length).replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null) delete next[id];
    else next[id] = value;
  }
  return next;
}

for (const action of ['archive', 'trash']) {
  test(`JMAP ${action} changes the intended memberships and accepts a null acknowledgement`, async () => {
    const w = await jmapWorker();
    const account = w.stores.local.accounts[0].id;
    const original = w.context.fetch;
    let memberships = {IN: true, PROJECT: true};
    w.context.fetch = async (input, init) => {
      const call = init?.body && JSON.parse(init.body).methodCalls?.find(([name]) => name === 'Email/set');
      if (call) {
        memberships = applyMemberships(memberships, call[1].update.e1);
        return json({methodResponses: [['Email/set', {updated: {e1: null}, notUpdated: null}, 'set']]});
      }
      return original(input, init);
    };
    await w.ok({type: 'ACT', account, message: 'e1', action}, 'popup');
    assert.deepEqual(memberships, action === 'trash' ? {TR: true} : {PROJECT: true, AR: true});
    assert.equal(w.stores.local.mailboxes[account].messages.length, 0);
  });
}

test('JMAP archive preserves memberships for mailbox IDs containing slash and tilde', async () => {
  const w = await jmapWorker();
  const account = w.stores.local.accounts[0].id;
  const original = w.context.fetch;
  let memberships = {'IN/~': true, PROJECT: true};
  w.context.fetch = async (input, init) => {
    const calls = init?.body && JSON.parse(init.body).methodCalls;
    const box = calls?.find(([name]) => name === 'Mailbox/get');
    if (box)
      return json({
        methodResponses: [
          [
            'Mailbox/get',
            {
              list: [
                {id: 'IN/~', role: 'inbox'},
                {id: 'AR/~', role: 'archive'},
              ],
            },
            box[2],
          ],
        ],
      });
    const call = calls?.find(([name]) => name === 'Email/set');
    if (call) {
      memberships = applyMemberships(memberships, call[1].update.e1);
      return json({methodResponses: [['Email/set', {updated: {e1: null}}, 'set']]});
    }
    return original(input, init);
  };
  await w.ok({type: 'ACT', account, message: 'e1', action: 'archive'}, 'popup');
  assert.deepEqual(memberships, {PROJECT: true, 'AR/~': true});
});

for (const [name, value] of [
  ['record rejection', {updated: null, notUpdated: {e1: {type: 'forbidden'}}}],
  ['another ID acknowledged', {updated: {other: null}}],
  ['missing acknowledgement', {}],
  ['contradictory acknowledgement', {updated: {e1: null}, notUpdated: {e1: {type: 'forbidden'}}}],
]) {
  test(`JMAP ${name} preserves local mail and unread count`, async () => {
    const w = await jmapWorker();
    const account = w.stores.local.accounts[0].id;
    const original = w.context.fetch;
    const before = structuredClone(w.stores.local.mailboxes[account]);
    w.context.fetch = (input, init) => {
      const call = init?.body && JSON.parse(init.body).methodCalls?.find(([name]) => name === 'Email/set');
      return call ? json({methodResponses: [['Email/set', value, 'set']]}) : original(input, init);
    };
    assert.equal((await w.send({type: 'ACT', account, message: 'e1', action: 'archive'}, 'popup')).ok, false);
    assert.deepEqual(w.stores.local.mailboxes[account], before);
    assert.deepEqual(w.server.jmap, ['e1']);
  });
}

/** A manually released asynchronous operation, without timing-dependent sleeps. */
function deferred() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return {promise, resolve};
}

for (const fail of [false, true]) {
  test(`${fail ? 'failed' : 'successful'} old CHECK cannot restore completed archive`, async () => {
    const w = startWorker();
    await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
    const account = w.stores.local.accounts[0].id;
    const original = w.context.fetch;
    const gate = deferred();
    const started = deferred();
    w.context.fetch = async (input, init) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/messages') && url.searchParams.get('q') === 'in:inbox') {
        const snapshot = await original(input, init);
        started.resolve();
        await gate.promise;
        if (fail) throw new Error('Mock check failure');
        return snapshot;
      }
      return original(input, init);
    };
    const check = w.ok({type: 'CHECK'}, 'popup');
    await started.promise;
    await w.ok({type: 'ACT', account, message: 'm1', action: 'archive'}, 'popup');
    gate.resolve();
    await check;
    assert.equal(
      w.stores.local.mailboxes[account].messages.some(item => item.id === 'm1'),
      false,
    );
    assert.equal(w.stores.local.mailboxes[account].unread, 1);
  });
}

test('opening an unread search hit outside the Inbox marks it read before returning', async () => {
  const w = startWorker();
  w.server.gmail = ['m2'];
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const account = w.stores.local.accounts[0].id;
  const messages = await w.ok({type: 'THREAD', account, message: 'm1', thread: 't-m1'}, 'popup');
  assert.equal(messages[0].unread, false);
  assert.ok(w.server.gmailRead.has('m1'));
});

/** Installs a Gmail unread-only feed and browser action endpoint. */
function gmailSession(w) {
  const session = {owner: 'a@example.test', unread: true, action: 0, posts: 0, bodies: 0};
  w.chrome.cookies = {get: async () => ({value: 'mock-cookie'})};
  w.context.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/feed/atom'))
      return new Response(
        `<feed><title>Gmail - ${session.owner}</title><fullcount>${session.unread ? 1 : 0}</fullcount>${session.unread ? `<entry><id>m1</id><title>${session.owner} mail</title><link href="https://mail.google.com/mail/u/0/?message_id=m1"/><author><name>Sender</name></author><issued>2026-10-13T09:00:00Z</issued></entry>` : ''}</feed>`,
      );
    if (init.method === 'POST') {
      session.posts++;
      session.action = JSON.parse(new URLSearchParams(init.body).get('s_jr'))[1][0][3][1];
      if ([1, 3, 9].includes(session.action)) session.unread = false;
      return new Response('OK');
    }
    if (url.searchParams.get('view') === 'pt') {
      session.bodies++;
      return new Response('<table class="message"><tr><td>Body</td></tr></table>');
    }
    return new Response("<script>var ID_KEY='mock-key';</script>");
  };
  return session;
}

test('Gmail browser owner changes cannot expose bodies or apply actions under the saved account', async () => {
  const w = startWorker();
  const session = gmailSession(w);
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail', browser: true});
  const account = w.stores.local.accounts[0].id;
  session.owner = 'other@example.test';
  await w.ok({type: 'CHECK'}, 'popup');
  const box = w.stores.local.mailboxes[account];
  assert.equal(box.messages[0].subject, 'a@example.test mail');
  assert.equal(box.reauth, true);
  assert.equal((await w.send({type: 'THREAD', account, message: 'm1', thread: 'm1'}, 'popup')).ok, false);
  assert.equal((await w.send({type: 'ACT', account, message: 'm1', action: 'trash'}, 'popup')).ok, false);
  assert.equal(session.bodies, 0);
  assert.equal(session.posts, 0);
});

for (const action of ['archive', 'trash']) {
  test(`Gmail read metadata survives repeated CHECKs until explicit ${action}`, async () => {
    const w = startWorker();
    const session = gmailSession(w);
    await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail', browser: true});
    const account = w.stores.local.accounts[0].id;
    await w.ok({type: 'THREAD', account, message: 'm1', thread: 'm1'}, 'popup');
    await w.ok({type: 'CHECK'}, 'popup');
    await w.ok({type: 'CHECK'}, 'popup');
    const box = w.stores.local.mailboxes[account];
    assert.equal(box.messages.length, 1);
    assert.equal(box.messages[0].unread, false);
    assert.equal(box.unread, 0);
    await w.ok({type: 'ACT', account, message: 'm1', action}, 'popup');
    assert.equal(session.action, action === 'trash' ? 9 : 1);
    await w.ok({type: 'CHECK'}, 'popup');
    assert.equal(w.stores.local.mailboxes[account].messages.length, 0);
  });
}

/** A Yandex lite account menu and message list; sender text must not establish ownership. */
function yandexHTML(owner, unread = true, header = 'menu') {
  const login =
    header === 'menu'
      ? `<div class="b-head-user"><div class="b-dropdown"><ul><li class="b-dropdown__item b-dropdown__visible"><a href="https://passport.yandex.ru/profile/avatars/" class="b-dropdown__or">${owner}</a></li></ul></div></div>`
      : header === 'legacy'
        ? `<span class="b-head-user__login">${owner}</span>`
        : '';
  return `${login}<input name="_ckey" value="mock-key"><div class="b-folders"><span class="b-folders__folder__num">${unread ? 1 : 0}</span><a href="/lite/inbox">Inbox</a></div><div class="b-messages"><div class="b-messages__message ${unread ? 'b-messages__message_unread' : ''}"><input name="ids" value="171"><a href="/lite/message/171"><span class="b-message__from" title="claimed@yandex.ru">Sender</span><span class="b-message__subject__text">Mail</span></a></div></div>`;
}

for (const [owner, header] of [
  ['other', 'menu'],
  ['claimed@yandex.ru', 'missing'],
]) {
  test(`Yandex rejects ${header === 'missing' ? 'missing' : 'different'} account owner despite matching sender`, async () => {
    const w = startWorker();
    w.context.fetch = async () => new Response(yandexHTML(owner, true, header));
    assert.equal(
      (await w.send({type: 'ADD_ACCOUNT', provider: 'yandex', browser: true, input: {email: 'claimed@yandex.ru'}})).ok,
      false,
    );
    assert.equal((w.stores.local.accounts || []).length, 0);
  });
}

for (const email of ['my.address@yandex.ru', 'my-address@ya.ru', 'MY.ADDRESS@yandex.com']) {
  test(`Yandex accepts its real lite login menu and documented alias ${email}`, async () => {
    const w = startWorker();
    w.context.fetch = async () => new Response(yandexHTML('my-address'));
    await w.ok({type: 'ADD_ACCOUNT', provider: 'yandex', browser: true, input: {email}});
    assert.equal(w.stores.local.accounts[0].email, email.toLowerCase());
    assert.equal(w.stores.local.mailboxes[w.stores.local.accounts[0].id].reauth, false);
  });
}

test('Yandex row read reaches the provider; a changed owner blocks body and trash', async () => {
  const w = startWorker();
  let owner = 'my-address';
  let unread = true;
  let reads = 0;
  let posts = 0;
  w.context.fetch = async (input, init = {}) => {
    if (init.method === 'POST') {
      posts++;
      return new Response('OK');
    }
    if (new URL(input).pathname.startsWith('/lite/message/')) {
      reads++;
      unread = false;
      return new Response('<div class="b-message-body">Read body</div>');
    }
    return new Response(yandexHTML(owner, unread));
  };
  await w.ok({type: 'ADD_ACCOUNT', provider: 'yandex', browser: true, input: {email: 'my.address@yandex.ru'}});
  const account = w.stores.local.accounts[0].id;
  await w.ok({type: 'ACT', account, message: '171', action: 'read'}, 'popup');
  assert.equal(reads, 1);
  await w.ok({type: 'CHECK'}, 'popup');
  assert.equal(w.stores.local.mailboxes[account].messages[0].unread, false);
  owner = 'another';
  assert.equal((await w.send({type: 'THREAD', account, message: '171', thread: 'ids=171'}, 'popup')).ok, false);
  assert.equal((await w.send({type: 'ACT', account, message: '171', action: 'trash'}, 'popup')).ok, false);
  assert.equal(reads, 1);
  assert.equal(posts, 0);
});

for (const [provider, webURL] of [
  ['gmail', 'https://mail.google.com/mail/u/0/#inbox'],
  ['yandex', 'https://mail.yandex.ru/'],
  ['mailru', 'https://e.mail.ru/inbox/'],
]) {
  for (const page of ['popup', 'options']) {
    test(`${page} sign-in opens ${provider} webmail without rechecking a refused session`, async () => {
      const w = startWorker({identity: false});
      w.stores.local.accounts = [
        {id: 'session', provider, email: 'me@example.test', credentials: {token: ''}, settings: {browser: true}},
      ];
      w.stores.local.mailboxes = {session: {messages: [], unread: 0, error: 'Sign in', reauth: true, checkedAt: 1}};
      const before = structuredClone(w.stores.local);
      w.context.fetch = async () => {
        assert.fail('Sign-in must open the webmail, not repeat a refused request');
      };
      await w.ok({type: 'SIGN_IN', account: 'session'}, page);
      assert.deepEqual(w.tabs, [webURL]);
      assert.deepEqual(w.stores.local, before, 'opening a tab must not claim successful authentication');
    });
  }
}

test('Mail.ru body-confirmed read persists without a duplicate POST; refused bodies propagate auth errors', async () => {
  const w = startWorker();
  let unread = true;
  let refused = false;
  let posts = 0;
  w.context.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/tokens')) return json({status: 200, body: {token: 'mock-token'}});
    if (url.pathname.endsWith('/messages/status/unread'))
      return json({
        status: 200,
        body: unread ? [{id: 'r1', fid: '0', from: 'Sender', subject: 'Mail', date: 1_700_000_000}] : [],
      });
    if (url.pathname.endsWith('/messages/message')) {
      if (refused) return json({status: 403});
      unread = false;
      return json({status: 200, body: {html: '<p>Body</p>'}});
    }
    if (init.method === 'POST') {
      posts++;
      return json({status: 200});
    }
    throw new Error('Unexpected Mail.ru mock route');
  };
  await w.ok({type: 'ADD_ACCOUNT', provider: 'mailru', browser: true, input: {email: 'me@example.test'}});
  const account = w.stores.local.accounts[0].id;
  const messages = await w.ok({type: 'THREAD', account, message: 'r1', thread: '0:r1:0'}, 'popup');
  assert.equal(messages[0].unread, false);
  assert.equal(posts, 0);
  await w.ok({type: 'CHECK'}, 'popup');
  assert.equal(w.stores.local.mailboxes[account].messages[0].unread, false);
  refused = true;
  assert.equal((await w.send({type: 'THREAD', account, message: 'r1', thread: '0:r1:0'}, 'popup')).ok, false);
  assert.equal(posts, 0);
});

test('a bare Yandex login does not establish ownership of an unrelated custom domain', async () => {
  const w = startWorker();
  w.context.fetch = async () => new Response(yandexHTML('my-address'));
  const reply = await w.send({
    type: 'ADD_ACCOUNT',
    provider: 'yandex',
    browser: true,
    input: {email: 'my.address@example.test'},
  });
  assert.equal(reply.ok, false);
});

test('Yandex thread links cannot claim a successful row read without a supported provider operation', async () => {
  const w = startWorker();
  let bodies = 0;
  w.context.fetch = async input => {
    if (new URL(input).pathname.startsWith('/lite/thread/')) {
      bodies++;
      return new Response('Thread');
    }
    return new Response(yandexHTML('my-address').replace('/lite/message/171', '/lite/thread/171'));
  };
  await w.ok({type: 'ADD_ACCOUNT', provider: 'yandex', browser: true, input: {email: 'my.address@yandex.ru'}});
  const account = w.stores.local.accounts[0].id;
  const result = await w.send({type: 'ACT', account, message: '171', action: 'read'}, 'popup');
  assert.equal(result.ok, false);
  assert.equal(w.stores.local.mailboxes[account].messages[0].unread, true);
  assert.equal(bodies, 0);
});
