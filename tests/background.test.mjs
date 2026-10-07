/**
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
  const server = {gmail: ['m1', 'm2'], graph: ['o1'], graphUnread: 5, jmap: ['e1'], microsoftRefreshes: 0};

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
      if (path === '/labels/INBOX') return json({messagesUnread: server.gmail.length});
      if (path === '/messages') return json({messages: server.gmail.map(id => ({id}))});
      const [, id, action] = path.match(/^\/messages\/([^/]+)(?:\/(\w+))?$/);
      if (action) {
        server.gmail = server.gmail.filter(item => item !== id);
        return json({});
      }
      return json({
        id,
        threadId: `t-${id}`,
        snippet: 'Hi &amp; bye',
        internalDate: String(Date.now()),
        payload: {
          headers: [
            {name: 'From', value: '"Bob" <bob@example.com>'},
            {name: 'Subject', value: `Subject ${id}`},
          ],
        },
      });
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
                  {id: 'IN', role: 'inbox', unreadEmails: server.jmap.length},
                  {id: 'TR', role: 'trash'},
                ],
              },
              tag,
            ];
          if (name === 'Email/query') return [name, {ids: server.jmap}, tag];
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
                })),
              },
              tag,
            ];
          if (name === 'Email/set') {
            server.jmap = server.jmap.filter(id => !Object.hasOwn(args.update, id));
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
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {},
      setTitle: async () => {},
    },
    notifications: {
      create: async (id, options) => notifications.push(options),
      clear: async () => {},
      onClicked: event(),
    },
    tabs: {create: async ({url}) => tabs.push(url)},
    permissions: {contains: async ({permissions}) => (permissions ? identity : true)},
    identity: {
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
  return {stores, calls, notifications, tabs, badge, server, send, ok};
}

test('connects all three providers and counts unread mail', async () => {
  const w = startWorker();
  assert.equal((await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'})).email, 'me@company.com');
  await w.ok({type: 'ADD_ACCOUNT', provider: 'outlook'});
  await w.ok({
    type: 'ADD_ACCOUNT',
    provider: 'jmap',
    input: {sessionUrl: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
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

test('mark read, trash and open act on listed messages', async () => {
  const w = startWorker();
  await w.ok({type: 'ADD_ACCOUNT', provider: 'gmail'});
  const {accounts} = await w
    .ok({
      type: 'ADD_ACCOUNT',
      provider: 'jmap',
      input: {sessionUrl: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
    })
    .then(value => value.state);
  const [gmail, jmap] = accounts;
  const state = await w.ok({type: 'MARK_READ', account: gmail.id, message: 'm1'}, 'popup');
  assert.equal(state.mailboxes[gmail.id].messages.map(item => item.id).join(), 'm2');
  await w.ok({type: 'TRASH', account: jmap.id, message: 'e1'}, 'popup');
  assert.ok(w.calls.some(call => call.body?.includes('"TR":true')));
  assert.equal(w.badge.text, '1');
  await w.ok({type: 'OPEN', account: gmail.id, message: 'm2'}, 'popup');
  assert.equal(w.tabs.at(-1), 'https://mail.google.com/mail/?authuser=me%40company.com#inbox/t-m2');
  const missing = await w.send({type: 'TRASH', account: gmail.id, message: 'm1'}, 'popup');
  assert.equal(missing.ok, false);
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
    input: {sessionUrl: 'https://api.fastmail.com/jmap/session', token: 'jmap-token'},
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
});

test('OAuth accounts need the optional identity permission', async () => {
  const w = startWorker({identity: false});
  const reply = await w.send({type: 'ADD_ACCOUNT', provider: 'gmail'});
  assert.equal(reply.ok, false);
  assert.match(reply.error, /Разрешите/);
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
  });
});
