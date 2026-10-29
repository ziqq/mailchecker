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
import {googleKey, googleToken} from './helpers/google.mjs';

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
        /** Supplies synthetic client IDs instead of registered production IDs. */
        setup(builder) {
          builder.onLoad({filter: /oauth[\\/]config\.ts$/}, () => ({
            contents:
              "export const oauthConfig = {google: 'test-google-id', googleSelection: 'test-selection-id', microsoft: 'test-microsoft-id'};",
            loader: 'ts',
          }));
        },
      },
    ],
  })
).outputFiles[0].text;

const EXTENSION = 'chrome-extension://test/';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
];

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
 * @param {Object} [options.local] Persisted storage restored into a fresh worker.
 */
function startWorker({identity = true, local = {}} = {}) {
  const stores = {local: structuredClone(local), session: {}};
  const identityCalls = {web: [], native: [], removed: [], cleared: 0};
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
      const list = keys == null ? Object.keys(stores[name]) : typeof keys === 'string' ? [keys] : keys;
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
    if (url.href === 'https://www.googleapis.com/oauth2/v3/certs') {
      assert.equal(auth, undefined, 'the public key request must not send a bearer token');
      return json({keys: [googleKey]});
    }
    if (url.href === 'https://www.googleapis.com/oauth2/v2/userinfo') {
      assert.equal(auth, 'Bearer google-token');
      return json({id: 'google-account'});
    }
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
      onClosed: event(),
      create: async (id, options) => notifications.push(options),
      clear: async () => {},
      onClicked: event(),
    },
    tabs: {create: async ({url}) => tabs.push(url)},
    permissions: {contains: async ({permissions}) => (permissions ? identity : true)},
    // Chromium has no `chrome.identity` until the optional permission is granted.
    identity: identity && {
      getRedirectURL: path => `https://test.chromiumapp.org/${path}`,
      async getAuthToken(options) {
        identityCalls.native.push(structuredClone(options));
        assert.equal(options.enableGranularPermissions, true);
        assert.equal(options.account?.id, 'google-account');
        return {token: 'google-token', grantedScopes: GOOGLE_SCOPES};
      },
      async removeCachedAuthToken({token}) {
        identityCalls.removed.push(token);
      },
      async clearAllCachedAuthTokens() {
        identityCalls.cleared++;
        throw Error('A mailbox operation must not clear every Google account');
      },
      async launchWebAuthFlow(options) {
        identityCalls.web.push(structuredClone(options));
        const request = new URL(options.url);
        const state = request.searchParams.get('state');
        if (request.host === 'accounts.google.com') {
          assert.equal(options.interactive, true);
          assert.equal(request.searchParams.get('client_id'), 'test-selection-id');
          assert.equal(request.searchParams.get('prompt'), 'select_account');
          assert.equal(request.searchParams.get('response_type'), 'id_token');
          assert.equal(request.searchParams.get('scope'), 'openid email');
          const idToken = await googleToken({nonce: request.searchParams.get('nonce')});
          return `https://test.chromiumapp.org/google#${new URLSearchParams({id_token: idToken, state})}`;
        }
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
  return {stores, calls, identityCalls, notifications, tabs, badge, server, send, ok, context, chrome};
}

/** Starts isolated Gmail servers whose native tokens resolve to two distinct mailbox identities. */
function multipleGmailWorker(local = {}) {
  const w = startWorker({local});
  const google = {
    selected: 'first-google',
    accounts: new Map([
      ['first-google', {token: 'first-token', email: 'first@example.test', messages: ['first-message']}],
      ['second-google', {token: 'second-token', email: 'second@example.test', messages: ['second-message']}],
    ]),
    tokens: new Map([
      ['first-token', 'first-google'],
      ['second-token', 'second-google'],
    ]),
    rejected: new Set(),
    requests: [],
  };
  const fetch = w.context.fetch;
  w.chrome.identity.launchWebAuthFlow = async options => {
    w.identityCalls.web.push(structuredClone(options));
    const request = new URL(options.url);
    assert.equal(options.interactive, true);
    assert.equal(request.searchParams.get('client_id'), 'test-selection-id');
    assert.equal(request.searchParams.get('prompt'), 'select_account');
    assert.equal(request.searchParams.get('response_type'), 'id_token');
    assert.equal(request.searchParams.get('scope'), 'openid email');
    const idToken = await googleToken({subject: google.selected, nonce: request.searchParams.get('nonce')});
    return `https://test.chromiumapp.org/google#${new URLSearchParams({
      id_token: idToken,
      state: request.searchParams.get('state'),
    })}`;
  };
  w.chrome.identity.getAuthToken = async options => {
    w.identityCalls.native.push(structuredClone(options));
    assert.equal(options.enableGranularPermissions, true);
    const account = google.accounts.get(options.account?.id);
    assert.ok(account, 'native Gmail access must target the verified Google identity');
    return {token: account.token, grantedScopes: GOOGLE_SCOPES};
  };
  w.context.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.host !== 'gmail.googleapis.com' && url.pathname !== '/oauth2/v2/userinfo') return fetch(input, init);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    const token = init.headers.Authorization?.replace(/^Bearer /, '');
    const subject = google.tokens.get(token);
    assert.ok(subject, 'provider requests must carry a token issued to a known Google identity');
    if (url.pathname === '/oauth2/v2/userinfo') return json({id: subject});
    const account = google.accounts.get(subject);
    const path = url.pathname.replace('/gmail/v1/users/me', '');
    google.requests.push({subject, token, path});
    if (google.rejected.has(token)) return json({}, 401);
    if (path === '/profile') return json({emailAddress: account.email});
    if (path === '/labels/INBOX') return json({messagesUnread: account.messages.length});
    if (path === '/messages') return json({messages: account.messages.map(id => ({id}))});
    const id = path.match(/^\/messages\/([^/]+)$/)?.[1];
    assert.ok(account.messages.includes(id), 'message metadata must be fetched from its own mailbox');
    return json({
      id,
      threadId: `t-${id}`,
      labelIds: ['INBOX', 'UNREAD'],
      snippet: account.email,
      internalDate: String(Date.now()),
      payload: {
        headers: [
          {name: 'Subject', value: id},
          {name: 'From', value: account.email},
        ],
      },
    });
  };
  return {...w, google};
}

/** Connects both synthetic Google identities, retaining their public account IDs. */
async function connectBothGmail(w) {
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  w.google.selected = 'second-google';
  const {state} = await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  return state.accounts;
}

test('signed Google selection connects two independent mailboxes and keeps credentials out of public results', async () => {
  const w = multipleGmailWorker();
  const [first, second] = await connectBothGmail(w);
  assert.equal(first.email, 'first@example.test');
  assert.equal(second.email, 'second@example.test');
  assert.notEqual(first.id, second.id);
  assert.deepEqual(
    w.identityCalls.native.map(call => call.account.id),
    ['first-google', 'second-google'],
  );
  assert.ok(w.identityCalls.native.every(call => call.interactive));
  assert.equal(w.identityCalls.cleared, 0);
  w.google.requests.length = 0;
  const state = await w.ok({type: 'CHECK'}, 'popup');
  assert.equal(state.accounts.length, 2);
  assert.deepEqual(
    Array.from(state.mailboxes[first.id].messages, message => message.id),
    ['first-message'],
  );
  assert.deepEqual(
    Array.from(state.mailboxes[second.id].messages, message => message.id),
    ['second-message'],
  );
  assert.ok(w.google.requests.some(call => call.subject === 'first-google' && call.token === 'first-token'));
  assert.ok(w.google.requests.some(call => call.subject === 'second-google' && call.token === 'second-token'));
  const hits = await w.ok({type: 'SEARCH', query: 'message'}, 'app');
  assert.deepEqual(
    Array.from(hits, hit => [hit.account, hit.message.id]).sort(),
    [
      [first.id, 'first-message'],
      [second.id, 'second-message'],
    ].sort(),
  );
  for (const account of [first, second]) {
    await w.ok({type: 'OPEN', account: account.id}, 'app');
    assert.ok(w.tabs.at(-1).includes(`authuser=${encodeURIComponent(account.email)}`));
  }
  const publicResults = JSON.stringify({state, hits});
  for (const privateValue of [
    'credentials',
    'googleAccountID',
    'first-google',
    'second-google',
    'first-token',
    'second-token',
  ])
    assert.equal(publicResults.includes(privateValue), false, privateValue);
});

test('concurrent Gmail 401s renew only the rejected identity once without disturbing the other mailbox', async () => {
  const w = multipleGmailWorker();
  const [first, second] = await connectBothGmail(w);
  const otherCredentials = structuredClone(w.stores.local.accounts[1].credentials);
  w.google.rejected.add('first-token');
  w.google.accounts.get('first-google').token = 'renewed-first-token';
  w.google.tokens.set('renewed-first-token', 'first-google');
  const native = w.chrome.identity.getAuthToken;
  const gate = deferred();
  const renewalStarted = deferred();
  const checkStarted = deferred();
  const fetch = w.context.fetch;
  w.context.fetch = (input, init) => {
    if (new URL(input).pathname.endsWith('/labels/INBOX') && init.headers.Authorization === 'Bearer first-token')
      checkStarted.resolve();
    return fetch(input, init);
  };
  w.chrome.identity.getAuthToken = async options => {
    assert.equal(options.interactive, false);
    renewalStarted.resolve();
    await gate.promise;
    return native(options);
  };
  w.google.requests.length = 0;
  const search = w.ok({type: 'SEARCH', query: 'message'}, 'app');
  await renewalStarted.promise;
  const check = w.ok({type: 'CHECK'}, 'popup');
  await checkStarted.promise;
  gate.resolve();
  const [hits, state] = await Promise.all([search, check]);
  assert.equal(hits.length, 2);
  assert.equal(state.mailboxes[first.id].error, '');
  assert.equal(state.mailboxes[second.id].error, '');
  assert.equal(w.identityCalls.native.length, 3);
  assert.deepEqual(w.identityCalls.native.at(-1), {
    interactive: false,
    enableGranularPermissions: true,
    account: {id: 'first-google'},
  });
  assert.deepEqual(w.identityCalls.removed, ['first-token']);
  assert.equal(w.identityCalls.web.length, 2, 'renewal must not reopen account selection');
  assert.equal(w.identityCalls.cleared, 0);
  assert.equal(w.stores.local.accounts[0].credentials.token, 'renewed-first-token');
  assert.deepEqual(w.stores.local.accounts[1].credentials, otherCredentials);
});

for (const failure of ['cancelled', 'wrong identity']) {
  test(`a ${failure} silent Gmail renewal preserves both credentials and checks the other mailbox`, async () => {
    const w = multipleGmailWorker();
    const [first, second] = await connectBothGmail(w);
    const accounts = structuredClone(w.stores.local.accounts);
    w.google.rejected.add('first-token');
    const attempts = [];
    w.chrome.identity.getAuthToken = async options => {
      attempts.push(structuredClone(options));
      if (failure === 'cancelled') throw Error('Interaction required');
      return {token: 'second-token', grantedScopes: GOOGLE_SCOPES};
    };
    const state = await w.ok({type: 'CHECK'}, 'popup');
    assert.deepEqual(attempts, [{interactive: false, enableGranularPermissions: true, account: {id: 'first-google'}}]);
    assert.equal(state.mailboxes[first.id].reauth, true);
    assert.equal(state.mailboxes[first.id].unread, 1, 'the last known unread count survives failed renewal');
    assert.equal(state.mailboxes[second.id].error, '');
    assert.equal(state.mailboxes[second.id].reauth, false);
    assert.deepEqual(w.stores.local.accounts, accounts);
    assert.deepEqual(w.identityCalls.removed, ['first-token']);
    assert.equal(w.identityCalls.web.length, 2, 'a background check must not open a consent window');
    assert.equal(w.identityCalls.cleared, 0);
  });
}

test('both Gmail credentials survive a fresh worker and one disconnect preserves the other mailbox', async () => {
  const w = multipleGmailWorker();
  const [first, second] = await connectBothGmail(w);
  const restarted = multipleGmailWorker(w.stores.local);
  restarted.chrome.identity.launchWebAuthFlow = async () => {
    throw Error('Restart must not prompt for selection');
  };
  await restarted.ok({type: 'CHECK'}, 'popup');
  assert.equal(restarted.identityCalls.native.length, 0, 'stored credentials work without another consent');
  assert.equal(restarted.notifications.length, 0, 'a worker restart preserves the notification baseline');
  assert.equal((await restarted.ok({type: 'STATE'}, 'popup')).accounts.length, 2);
  const otherCredentials = structuredClone(restarted.stores.local.accounts[1].credentials);
  const state = await restarted.ok({type: 'REMOVE_ACCOUNT', account: first.id});
  assert.equal(state.accounts.length, 1);
  assert.equal(state.accounts[0].id, second.id);
  assert.equal(state.mailboxes[first.id], undefined);
  assert.deepEqual(restarted.identityCalls.removed, ['first-token']);
  assert.equal(restarted.identityCalls.cleared, 0);
  assert.deepEqual(restarted.stores.local.accounts[0].credentials, otherCredentials);
  restarted.google.requests.length = 0;
  await restarted.ok({type: 'CHECK'}, 'popup');
  assert.ok(restarted.google.requests.length > 0);
  assert.ok(restarted.google.requests.every(call => call.subject === 'second-google'));
  assert.ok(!restarted.calls.some(call => call.url.includes('revoke')), 'disconnect does not revoke provider grants');
});

for (const failure of ['selection cancelled', 'native cancelled', 'wrong native identity', 'missing scope']) {
  test(`Google ${failure} leaves both connected accounts intact`, async () => {
    const w = multipleGmailWorker();
    await connectBothGmail(w);
    const accounts = structuredClone(w.stores.local.accounts);
    const nativeCalls = w.identityCalls.native.length;
    if (failure === 'selection cancelled')
      w.chrome.identity.launchWebAuthFlow = async () => {
        throw Error('The user did not approve access');
      };
    else if (failure === 'native cancelled')
      w.chrome.identity.getAuthToken = async () => {
        throw Error('The user did not approve access');
      };
    else
      w.chrome.identity.getAuthToken = async () => ({
        token: failure === 'wrong native identity' ? 'first-token' : 'second-token',
        grantedScopes: failure === 'missing scope' ? [GOOGLE_SCOPES[1]] : GOOGLE_SCOPES,
      });
    w.google.requests.length = 0;
    const result = await w.send({type: 'ADD_ACCOUNT', provider: 'gmail'});
    assert.equal(result.ok, false);
    assert.deepEqual(w.stores.local.accounts, accounts);
    assert.deepEqual(w.google.requests, [], 'invalid consent must not read a Gmail mailbox');
    assert.deepEqual(w.identityCalls.removed, []);
    assert.equal(w.identityCalls.cleared, 0);
    if (failure === 'selection cancelled') assert.equal(w.identityCalls.native.length, nativeCalls);
    for (const secret of ['first-token', 'second-token', 'first-google', 'second-google'])
      assert.equal(JSON.stringify(result).includes(secret), false);
  });
}

for (const failure of [
  'wrong state',
  'duplicate state',
  'duplicate token',
  'missing token',
  'wrong origin',
  'wrong path',
  'callback credentials',
  'query pollution',
  'provider denial',
]) {
  test(`Google selection rejects ${failure} before native Gmail access`, async () => {
    const w = multipleGmailWorker();
    await connectBothGmail(w);
    const accounts = structuredClone(w.stores.local.accounts);
    const nativeCalls = w.identityCalls.native.length;
    const select = w.chrome.identity.launchWebAuthFlow;
    w.chrome.identity.launchWebAuthFlow = async options => {
      const callback = new URL(await select(options));
      const fragment = new URLSearchParams(callback.hash.slice(1));
      if (failure === 'wrong state') fragment.set('state', 'wrong-state');
      if (failure === 'duplicate state') fragment.append('state', fragment.get('state'));
      if (failure === 'duplicate token') fragment.append('id_token', fragment.get('id_token'));
      if (failure === 'missing token') fragment.delete('id_token');
      if (failure === 'wrong origin') callback.hostname = 'attacker.example';
      if (failure === 'wrong path') callback.pathname = '/microsoft';
      if (failure === 'callback credentials') callback.username = 'attacker';
      if (failure === 'query pollution') callback.search = '?state=another-state';
      if (failure === 'provider denial') fragment.set('error', 'access_denied');
      callback.hash = fragment.toString();
      return callback.href;
    };
    w.google.requests.length = 0;
    const result = await w.send({type: 'ADD_ACCOUNT', provider: 'gmail'});
    assert.equal(result.ok, false);
    assert.equal(w.identityCalls.native.length, nativeCalls);
    assert.deepEqual(w.google.requests, []);
    assert.deepEqual(w.stores.local.accounts, accounts);
    assert.equal(w.identityCalls.cleared, 0);
    assert.equal(JSON.stringify(result).includes('id_token'), false);
  });
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

for (const firstToFinish of ['CHECK', 'SIGN_IN']) {
  for (const hasBaseline of [true, false]) {
    test(`overlapping CHECK and SIGN_IN claim notifications once (${firstToFinish} first, baseline ${hasBaseline})`, async () => {
      const w = startWorker();
      await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
      const account = w.stores.local.accounts[0].id;
      w.stores.local.mailboxes[account].notified = hasBaseline;
      w.server.gmail.push('m3');
      const fetch = w.context.fetch;
      const gates = [deferred(), deferred()];
      const started = [deferred(), deferred()];
      let requests = 0;
      w.context.fetch = async (input, init) => {
        const url = new URL(input);
        if (url.pathname.endsWith('/messages') && url.searchParams.get('q') === 'in:inbox') {
          const index = requests++;
          const response = await fetch(input, init);
          started[index].resolve();
          await gates[index].promise;
          return response;
        }
        return fetch(input, init);
      };
      const checking = w.ok({type: 'CHECK'}, 'popup');
      await started[0].promise;
      const signing = w.ok({type: 'SIGN_IN', account}, 'options');
      await started[1].promise;
      const first = firstToFinish === 'CHECK' ? 0 : 1;
      gates[first].resolve();
      await (first === 0 ? checking : signing);
      gates[1 - first].resolve();
      await Promise.all([checking, signing]);
      assert.equal(w.notifications.length, hasBaseline ? 1 : 0);
      assert.equal(w.stores.local.mailboxes[account].notified, true);
      w.context.fetch = fetch;
      await w.ok({type: 'CHECK'}, 'popup');
      assert.equal(w.notifications.length, hasBaseline ? 1 : 0, 'the overlapping checks committed their baseline');
      w.server.gmail.push('m4');
      await w.ok({type: 'CHECK'}, 'popup');
      assert.equal(w.notifications.length, hasBaseline ? 2 : 1, 'later new mail still notifies');
      assert.equal(w.notifications.at(-1).message, 'Subject m4');
    });
  }
}

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
      if (provider === 'gmail')
        w.chrome.identity.getAuthToken = async () => ({token: 'other-token', grantedScopes: GOOGLE_SCOPES});
      w.context.fetch = async (input, init) => {
        const url = new URL(input);
        if (url.host === 'login.microsoftonline.com')
          return json({access_token: 'other-token', refresh_token: 'other-refresh', expires_in: 3600});
        if (init.headers?.Authorization === 'Bearer other-token') {
          if (url.pathname.endsWith('/userinfo')) return json({id: 'google-account'});
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
  const name =
    header === 'plain'
      ? owner
      : `<span class="b-pseudo-link"><b class="b-user"><b class="b-user__first-letter">${owner[0]}</b>${owner.slice(1)}</b></span>`;
  const label = header === 'plain' ? '' : ` aria-label="${owner}"`;
  const login =
    header === 'menu' || header === 'plain'
      ? `<div class="b-head-user"><div class="b-dropdown"><ul><li class="b-dropdown__item b-dropdown__visible"><a href="https://passport.yandex.ru/profile/avatars/" class="b-dropdown__or"${label}>${name}</a></li></ul></div></div>`
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
    test(`${page} sign-in checks ${provider} before opening webmail for a refused session`, async () => {
      const w = startWorker({identity: false});
      w.stores.local.accounts = [
        {id: 'session', provider, email: 'me@example.test', credentials: {token: ''}, settings: {browser: true}},
      ];
      w.stores.local.mailboxes = {session: {messages: [], unread: 0, error: 'Sign in', reauth: true, checkedAt: 1}};
      const before = structuredClone(w.stores.local);
      let checks = 0;
      w.context.fetch = async () => {
        checks++;
        return json({}, 401);
      };
      await w.ok({type: 'SIGN_IN', account: 'session'}, page);
      assert.deepEqual(w.tabs, [webURL]);
      assert.equal(checks, 1);
      assert.deepEqual(w.stores.local.accounts, before.accounts);
      assert.equal(w.stores.local.mailboxes.session.reauth, true);
      assert.equal(w.stores.local.mailboxes.session.unread, 0);
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

for (const page of ['popup', 'options']) {
  test(page + ' sign-in clears a stale Yandex error when the current session is valid', async () => {
    const w = startWorker({identity: false});
    w.stores.local.accounts = [
      {
        id: 'session',
        provider: 'yandex',
        email: 'my.address@yandex.ru',
        credentials: {token: ''},
        settings: {browser: true},
      },
    ];
    w.stores.local.mailboxes = {
      session: {messages: [], unread: 0, error: 'Sign in', reauth: true, checkedAt: Date.now()},
    };
    w.context.fetch = async () => new Response(yandexHTML('my-address'));
    const state = await w.ok({type: 'SIGN_IN', account: 'session'}, page);
    assert.equal(state.mailboxes.session.reauth, false);
    assert.equal(state.mailboxes.session.error, '');
    assert.deepEqual(w.tabs, [], 'a valid session must not send the user through sign-in again');
  });
}

for (const attributes of ['unquoted', 'changed profile URL']) {
  test('Yandex recognises the active account menu with ' + attributes, async () => {
    const w = startWorker();
    let html = yandexHTML('my-address');
    if (attributes === 'unquoted')
      html = html
        .replace('class="b-head-user"', 'class=b-head-user')
        .replace('class="b-dropdown__item b-dropdown__visible"', 'class=b-dropdown__visible');
    else
      html = html.replace(
        'https://passport.yandex.ru/profile/avatars/',
        '//passport.yandex.ru/profile/avatars/?origin=mail',
      );
    w.context.fetch = async () => new Response(html);
    await w.ok({type: 'ADD_ACCOUNT', provider: 'yandex', browser: true, input: {email: 'my.address@yandex.ru'}});
    assert.equal(w.stores.local.mailboxes[w.stores.local.accounts[0].id].reauth, false);
  });
}

test('Yandex keeps accepting a plain account-menu login without an accessible name', async () => {
  const w = startWorker();
  w.context.fetch = async () => new Response(yandexHTML('my-address', true, 'plain'));
  await w.ok({type: 'ADD_ACCOUNT', provider: 'yandex', browser: true, input: {email: 'my.address@yandex.ru'}});
  assert.equal(w.stores.local.mailboxes[w.stores.local.accounts[0].id].reauth, false);
});

test('unknown-date Yandex mail notifies only for unseen IDs after the initial baseline', async () => {
  const w = startWorker();
  let id = '171';
  w.context.fetch = async () => new Response(yandexHTML('my-address').replaceAll('171', id));
  await w.ok({type: 'ADD_ACCOUNT', provider: 'yandex', browser: true, input: {email: 'my.address@yandex.ru'}});
  const account = w.stores.local.accounts[0].id;
  assert.equal(w.notifications.length, 0);
  assert.ok(w.stores.local.mailboxes[account].messages[0].date < 0);
  id = '172';
  await w.ok({type: 'CHECK'}, 'popup');
  assert.equal(w.notifications.length, 1);
  await w.ok({type: 'CHECK'}, 'popup');
  assert.equal(w.notifications.length, 1);
});

test('Gmail quota 403 keeps cached mail and does not retry credentials or request sign-in', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const id = w.stores.local.accounts[0].id;
  let requests = 0;
  w.context.fetch = async () => {
    requests++;
    return json({error: {errors: [{reason: 'userRateLimitExceeded'}]}}, 403);
  };
  await w.ok({type: 'CHECK'}, 'popup');
  const box = w.stores.local.mailboxes[id];
  assert.equal(box.reauth, false);
  assert.match(box.error, /403/);
  assert.equal(box.messages.length, 2);
  assert.equal(requests, 2);
});

for (const mode of ['refused', 'moved', 'missing-trash', 'wrong-owner', 'unexpected-trash']) {
  test(`Yandex delete reconciles only a verified move: ${mode}`, async () => {
    const w = startWorker();
    let posted = false;
    const page = (present = true, owner = 'my-address') => {
      const html = yandexHTML(owner);
      return present
        ? html
        : html.slice(0, html.indexOf('<div class="b-messages">')) + '<div class="b-messages"></div>';
    };
    w.context.fetch = async (input, init = {}) => {
      if (init.method === 'POST') {
        posted = true;
        return new Response('<html>Action response</html>');
      }
      if (new URL(input).pathname === '/lite/trash')
        return new Response(
          mode === 'unexpected-trash'
            ? '<html>Unrelated</html>'
            : page(mode !== 'missing-trash', mode === 'wrong-owner' ? 'another' : 'my-address'),
        );
      return new Response(page(!posted || mode === 'refused'));
    };
    await w.ok({type: 'ADD_ACCOUNT', provider: 'yandex', browser: true, input: {email: 'my.address@yandex.ru'}});
    const id = w.stores.local.accounts[0].id;
    const reply = await w.send({type: 'ACT', account: id, message: '171', action: 'trash'}, 'popup');
    assert.equal(reply.ok, mode === 'moved');
    assert.equal(w.stores.local.mailboxes[id].messages.length, mode === 'moved' ? 0 : 1);
  });
}

test('all failed API searches fail explicitly while successful accounts survive', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const original = w.context.fetch;
  w.context.fetch = async () => {
    throw Error('failed transport');
  };
  const failed = await w.send({type: 'SEARCH', query: 'needle'}, 'popup');
  assert.equal(failed.ok, false);
  w.context.fetch = original;
  await w.ok({
    type: 'ADD_ACCOUNT',
    provider: 'jmap',
    input: {sessionURL: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
  });
  w.context.fetch = async (input, init) =>
    new URL(input).host === 'gmail.googleapis.com' ? Promise.reject(Error('failed Gmail')) : original(input, init);
  const partial = await w.ok({type: 'SEARCH', query: 'needle'}, 'popup');
  assert.ok(partial.some(hit => hit.message.id === 'e1'));
});

test('notification URLs are bounded and cleared on dismissal and click', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  for (let i = 0; i < 115; i++) {
    w.server.gmail = ['new-' + i];
    await new Promise(done => setTimeout(done, 2));
    await w.ok({type: 'CHECK'}, 'popup');
  }
  const keys = Object.keys(w.stores.session).filter(k => k.startsWith('notification:'));
  assert.equal(keys.length, 100);
  assert.equal(w.stores.session['notification-index'].length, 100);
  const id = w.stores.session['notification-index'].at(-1);
  w.chrome.notifications.onClosed.fire(id, true);
  await new Promise(done => setTimeout(done, 2));
  assert.equal(w.stores.session['notification:' + id], undefined);
  assert.equal(w.stores.session['notification-index'].length, 99);
  const click = w.stores.session['notification-index'].at(-1);
  w.chrome.notifications.onClicked.fire(click);
  await new Promise(done => setTimeout(done, 2));
  assert.equal(w.stores.session['notification:' + click], undefined);
  assert.ok(w.tabs.length);
  const q = startWorker();
  await q.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  q.chrome.storage.session.set = async () => {
    throw Error('quota exceeded');
  };
  q.server.gmail = ['new'];
  await q.ok({type: 'CHECK'}, 'popup');
});

test('legacy notification records are pruned and index failure does not block click navigation', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  for (let i = 0; i < 150; i++) w.stores.session['notification:legacy' + i] = 'https://mail.example.test/' + i;
  w.server.gmail = ['new'];
  await w.ok({type: 'CHECK'}, 'popup');
  assert.equal(Object.keys(w.stores.session).filter(k => k.startsWith('notification:')).length, 100);
  const id = w.stores.session['notification-index'].at(-1);
  w.chrome.storage.session.set = async () => {
    throw Error('quota');
  };
  w.chrome.notifications.onClicked.fire(id);
  await new Promise(done => setTimeout(done, 2));
  assert.ok(w.tabs.length);
});

test('a client cache miss falls back to the provider when IndexedDB is unavailable', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const account = w.stores.local.accounts[0].id;
  const selection = {account, message: 'm1', thread: 't-m1'};
  assert.equal(await w.ok({type: 'CACHED_THREAD', ...selection}, 'popup'), null);
  const messages = await w.ok({type: 'THREAD', ...selection}, 'popup');
  assert.ok(messages.some(message => message.id === 'm1' && message.html));
});

for (const [page, request] of [
  ['options', {type: 'CACHED_THREAD', account: 'A', message: 'm', thread: 'T'}],
  ['popup', {type: 'CLEAR_CACHE'}],
  ['popup', {type: 'CACHED_THREAD', account: 'missing', message: 'm', thread: 'T'}],
  ['popup', {type: 'CACHED_THREAD', account: 'A', message: '', thread: 'T'}],
  ['popup', {type: 'CACHED_THREAD', account: 'A', message: 'x'.repeat(513), thread: 'T'}],
]) {
  test(`cache broker rejects unauthorized or invalid ${request.type} from ${page} (${request.message?.length || 0})`, async () => {
    const w = startWorker();
    assert.equal((await w.send(request, page)).ok, false);
    assert.equal(w.calls.length, 0);
  });
}

test('Settings reports failure instead of claiming a successful clear without IndexedDB', async () => {
  const w = startWorker();
  assert.equal((await w.send({type: 'CLEAR_CACHE'})).ok, false);
});

test('paged search preserves partial successes and retries the failed mailbox cursor independently', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  await w.ok({
    type: 'ADD_ACCOUNT',
    provider: 'jmap',
    input: {sessionURL: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
  });
  const [gmail, jmap] = w.stores.local.accounts;
  const original = w.context.fetch;
  let failed = true;
  const pages = [];
  w.context.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.host === 'api.fastmail.com' && failed) throw Error('temporary JMAP');
    if (url.host === 'gmail.googleapis.com' && url.pathname.endsWith('/messages')) {
      pages.push(url.searchParams.get('pageToken') || '');
      return json({
        messages: [{id: url.searchParams.has('pageToken') ? 'last' : 'first'}],
        ...(url.searchParams.has('pageToken') ? {} : {nextPageToken: 'opaque+next'}),
      });
    }
    return original(input, init);
  };
  const first = await w.ok({type: 'SEARCH', query: 'needle', pages: []}, 'popup');
  assert.equal(first.hits.length, 1);
  assert.equal(first.pages.find(page => page.account === gmail.id).cursor, 'opaque+next');
  assert.match(first.pages.find(page => page.account === jmap.id).error, /JMAP/);
  failed = false;
  const retry = await w.ok({type: 'SEARCH', query: 'needle', pages: [{account: jmap.id, cursor: ''}]}, 'app');
  assert.equal(retry.pages.length, 1);
  assert.equal(retry.hits[0].account, jmap.id);
  const next = await w.ok(
    {type: 'SEARCH', query: 'needle', pages: [{account: gmail.id, cursor: 'opaque+next'}]},
    'app',
  );
  assert.equal(next.hits[0].message.id, 'last');
  assert.equal(next.pages[0].cursor, '');
  assert.deepEqual(pages, ['', 'opaque+next']);
  assert.equal(JSON.stringify(next).includes('google-token'), false);
});

test('paged search rejects invalid account targets and oversized cursors before provider requests', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const account = w.stores.local.accounts[0].id;
  const before = w.calls.length;
  for (const pages of [
    null,
    {},
    [{account: 'missing', cursor: ''}],
    [
      {account, cursor: ''},
      {account, cursor: ''},
    ],
    [{account, cursor: 1}],
    [{account, cursor: 'x'.repeat(4097)}],
    Array.from({length: 21}, () => ({account, cursor: ''})),
  ]) {
    const reply = await w.send({type: 'SEARCH', query: 'needle', pages}, 'popup');
    assert.equal(reply.ok, false, JSON.stringify(pages));
  }
  assert.equal((await w.send({type: 'SEARCH', query: 'needle', pages: []}, 'options')).ok, false);
  assert.equal((await w.send({type: 'SEARCH', query: 'needle', pages: []}, 'foreign')).ok, false);
  assert.equal(w.calls.length, before);
});

test('paged search rejects repeated and oversized provider continuations without exposing credentials', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const account = w.stores.local.accounts[0].id;
  const original = w.context.fetch;
  for (const nextPageToken of ['same', 'x'.repeat(4097)]) {
    w.context.fetch = async (input, init) =>
      new URL(input).pathname.endsWith('/messages') ? json({messages: [], nextPageToken}) : original(input, init);
    const reply = await w.ok({type: 'SEARCH', query: 'needle', pages: [{account, cursor: 'same'}]}, 'popup');
    assert.equal(reply.hits.length, 0);
    assert.equal(reply.pages[0].cursor, 'same');
    assert.ok(reply.pages[0].error);
    assert.equal(JSON.stringify(reply).includes('google-token'), false);
  }
});

test('browser Gmail uses loaded-mail matching while Yandex and Mail.ru advertise server search', async () => {
  const w = startWorker();
  await w.ok({type: 'STATE'}, 'popup');
  w.stores.local.accounts = ['gmail', 'yandex', 'mailru'].map(provider => ({
    id: provider,
    provider,
    email: 'a@example.test',
    settings: {browser: true},
    credentials: {},
  }));
  const state = await w.ok({type: 'STATE'}, 'popup');
  assert.equal(state.accounts.find(account => account.id === 'gmail').search, false);
  assert.equal(state.accounts.find(account => account.id === 'yandex').search, true);
  assert.equal(state.accounts.find(account => account.id === 'mailru').search, true);
  const before = w.calls.length;
  const reply = await w.ok({type: 'SEARCH', query: 'needle', pages: [{account: 'gmail', cursor: ''}]}, 'popup');
  assert.equal(reply.pages[0].local, true);
  assert.equal(reply.pages[0].unsupported, undefined);
  assert.equal(reply.hits.length, 0);
  assert.equal(w.calls.length, before);
});

test('loaded-mail search paginates stored Inbox metadata without HTTP and keeps accounts isolated', async () => {
  const messages = Array.from({length: 45}, (_, index) => ({
    id: `loaded-${index}`,
    thread: `loaded-${index}`,
    from: 'Sender <sender@example.test>',
    subject: `Loaded needle ${index}`,
    snippet: 'Local preview',
    date: 1000 - index,
    link: '',
    unread: true,
    pinned: false,
    category: 'people',
    attachments: false,
  }));
  const local = {
    accounts: ['A', 'B'].map(id => ({
      id,
      provider: 'gmail',
      email: `${id.toLowerCase()}@example.test`,
      settings: {browser: true},
      credentials: {},
    })),
    mailboxes: {
      A: {messages, unread: 45, checkedAt: 1, error: ''},
      B: {messages: [{...messages[0], subject: 'Private other mailbox'}], unread: 1, checkedAt: 1, error: ''},
    },
  };
  const w = startWorker({local});
  await w.ok({type: 'STATE'}, 'popup');
  const before = w.calls.length;
  const ids = [];
  let cursor = '';
  for (const size of [20, 20, 5]) {
    const page = await w.ok({type: 'SEARCH', query: '  NEEDLE sender  ', pages: [{account: 'A', cursor}]}, 'popup');
    assert.equal(page.pages[0].local, true);
    assert.equal(page.hits.length, size);
    assert.ok(page.hits.every(hit => hit.account === 'A'));
    ids.push(...page.hits.map(hit => hit.message.id));
    cursor = page.pages[0].cursor;
  }
  assert.equal(cursor, '');
  assert.equal(new Set(ids).size, 45);
  for (const query of ['Local preview', 'a@example.test', 'from:sender', 'Private', 'absent']) {
    const page = await w.ok({type: 'SEARCH', query, pages: [{account: 'A', cursor: ''}]}, 'popup');
    assert.equal(page.hits.length, query === 'Local preview' ? 20 : 0);
  }
  const both = await w.ok({type: 'SEARCH', query: 'sender', pages: []}, 'popup');
  assert.ok(both.hits.some(hit => hit.account === 'A' && hit.message.id === 'loaded-0'));
  assert.ok(both.hits.some(hit => hit.account === 'B' && hit.message.id === 'loaded-0'));
  for (const value of ['-1', '1.5', '01', 'https://example.test/', '100000']) {
    const page = await w.ok({type: 'SEARCH', query: 'needle', pages: [{account: 'A', cursor: value}]}, 'popup');
    assert.equal(page.hits.length, 0);
    assert.ok(page.pages[0].error);
  }
  assert.equal(w.calls.length, before);
  const restarted = startWorker({local: w.stores.local});
  const page = await restarted.ok({type: 'SEARCH', query: 'needle', pages: []}, 'app');
  assert.equal(page.hits.length, 20);
  assert.equal(page.pages.find(page => page.account === 'A').cursor, '20');
});

test('Gmail API keeps server search and does not silently replace server failures with loaded mail', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const account = w.stores.local.accounts[0].id;
  const reply = await w.ok({type: 'SEARCH', query: 'from:sender', pages: [{account, cursor: ''}]}, 'popup');
  assert.ok(reply.hits.length);
  assert.equal(reply.pages[0].local, undefined);
  assert.ok(w.calls.some(call => new URL(call.url).searchParams.get('q') === 'from:sender'));
  const original = w.context.fetch;
  w.context.fetch = async (input, init) =>
    new URL(input).host === 'gmail.googleapis.com' ? Promise.reject(Error('Synthetic offline')) : original(input, init);
  const failed = await w.ok({type: 'SEARCH', query: 'Subject', pages: [{account, cursor: ''}]}, 'popup');
  assert.ok(w.stores.local.mailboxes[account].messages.some(message => message.subject.includes('Subject')));
  assert.equal(failed.hits.length, 0);
  assert.ok(failed.pages[0].error);
  assert.equal(failed.pages[0].local, undefined);
});
