/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Provider contracts, bounded folder algorithms and audit #7/#8 regressions.
 *
 * @module tests/providers
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createContext, runInContext} from 'node:vm';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

/** Repository root and immutable bundles, reused across isolated provider instances. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundles = new Map();

/** Loads real provider code with observable HTTP, preserving the actual bounded request layer. */
async function load(
  entry,
  fetch = async () => {
    throw new Error('Unexpected HTTP request');
  },
) {
  if (!bundles.has(entry)) {
    const {outputFiles} = await build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      platform: 'browser',
      format: 'iife',
      globalName: 'subject',
      write: false,
    });
    bundles.set(entry, outputFiles[0].text);
  }
  const context = createContext({
    URL,
    URLSearchParams,
    Response,
    ReadableStream,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortSignal,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    fetch,
    chrome: {permissions: {contains: async () => true}},
  });
  runInContext(bundles.get(entry), context);
  return context.subject;
}

/** An HTTP JSON reply from a provider. */
const json = (value, status = 200) => new Response(JSON.stringify(value), {status});
/** A minimal account carrying only fake credentials. */
const account = {id: 'A', email: 'a@example.test', credentials: {token: 'test'}, settings: {}};

/** Two stable Yandex lite rows without machine-readable dates. */
const yandexPage =
  '<div class="b-folders"><a href="/lite/inbox">Inbox</a></div><div class="b-messages">' +
  ['one', 'two']
    .map(
      id =>
        '<div class="b-messages__message"><input name="ids" value="' +
        id +
        '"><a href="/lite/message/' +
        id +
        '"><span class="b-message__subject__text">' +
        id +
        '</span></a></div>',
    )
    .join('') +
  '</div>';

test('Yandex unknown dates stay stable and later pages sort after the first page', async () => {
  const {parseInbox} = await load('src/background/providers/yandex.ts');
  const {shortDate} = await load('src/shared/format.ts');
  const first = parseInbox(yandexPage).messages;
  const again = parseInbox(yandexPage).messages;
  const later = parseInbox(yandexPage.replaceAll('one', 'three').replaceAll('two', 'four'), 200).messages;
  assert.equal(JSON.stringify(first), JSON.stringify(again));
  const sorted = [...later, ...first].sort((a, b) => b.date - a.date);
  assert.equal(sorted.map(item => item.id).join(), 'one,two,three,four');
  for (const item of sorted) assert.equal(shortDate(item.date), '');
});

test('Outlook follows root and child folder continuations, retaining each child parent', async () => {
  const calls = [];
  const {outlook} = await load('src/background/providers/outlook.ts', async input => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname.endsWith('/childFolders'))
      return json(
        url.searchParams.has('$skiptoken')
          ? {value: [{id: 'child2', displayName: 'Child 2'}]}
          : {
              value: [{id: 'child1', displayName: 'Child 1'}],
              '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/first/childFolders?$skiptoken=a%2Bb',
            },
      );
    if (url.pathname.endsWith('/mailFolders'))
      return json(
        url.searchParams.has('$skiptoken')
          ? {value: [{id: 'second', displayName: 'Second'}]}
          : {
              value: [{id: 'first', displayName: 'First', childFolderCount: 2}],
              '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders?$skiptoken=root%2Bnext',
            },
      );
    return json({id: url.pathname.split('/').pop()});
  });
  const folders = await outlook.folders(account);
  assert.equal(folders.map(folder => folder.id).join(), 'first,second,child1,child2');
  assert.equal(folders.filter(folder => folder.parent === 'first').length, 2);
  assert.deepEqual(
    calls.filter(url => url.searchParams.has('$skiptoken')).map(url => url.searchParams.get('$skiptoken')),
    ['root+next', 'a+b'],
  );
});

for (const continuation of ['https://foreign.example.test/steal', 'https://graph.microsoft.com/v1.0/me/messages']) {
  test(`Outlook refuses a folder continuation that changes its collection: ${continuation}`, async () => {
    const calls = [];
    const {outlook} = await load('src/background/providers/outlook.ts', async input => {
      calls.push(input);
      return json(new URL(input).pathname.endsWith('/mailFolders') ? {value: [], '@odata.nextLink': continuation} : {});
    });
    await assert.rejects(outlook.folders(account));
    assert.equal(calls.includes(continuation), false);
    assert.equal(calls.length, 7);
  });
}

test('Outlook repeated continuations terminate and catalogs keep the 200-folder bound', async () => {
  let full = false;
  let pages = 0;
  const {outlook} = await load('src/background/providers/outlook.ts', async input => {
    const url = new URL(input);
    if (!url.pathname.endsWith('/mailFolders')) return json({});
    pages++;
    return json({
      value: full ? Array.from({length: 250}, (_, i) => ({id: String(i)})) : [{id: 'same'}],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders?$skiptoken=repeated',
    });
  });
  assert.equal((await outlook.folders(account)).length, 1);
  assert.equal(pages, 2);
  full = true;
  assert.equal((await outlook.folders(account)).length, 200);
});

/** Builds an observable Gmail multipart server; each inner reply can fail independently. */
async function gmailCatalog({failedLabel = 'L3', batchStatus = 200, partStatus = 200, partError = ''} = {}) {
  const calls = [];
  const {gmail} = await load('src/background/providers/gmail.ts', async (input, init) => {
    const url = new URL(input);
    calls.push({url, init});
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer test');
    if (url.pathname.endsWith('/labels'))
      return json({labels: Array.from({length: 200}, (_, i) => ({id: 'L' + i, name: 'Folder ' + i, type: 'user'}))});
    assert.equal(url.pathname, '/batch/gmail/v1');
    assert.equal(init.method, 'POST');
    assert.match(init.headers['Content-Type'], /^multipart\/mixed; boundary=/);
    const parts = [...init.body.matchAll(/Content-ID: <(\d+)@mailchecker>[\s\S]*?GET ([^\r\n ]+)/g)];
    assert.ok(parts.length > 0 && parts.length <= 50);
    if (batchStatus !== 200) return json({error: 'Temporary failure'}, batchStatus);
    const reply =
      parts
        .reverse()
        .map(([, id, path]) => {
          const status = path.includes('/labels/' + failedLabel + '?') ? 404 : partStatus;
          const data = partError
            ? {error: {errors: [{reason: partError}]}}
            : path.includes('/messages?')
              ? {resultSizeEstimate: 100}
              : {messagesTotal: 2, messagesUnread: 1};
          return (
            '--reply_boundary\r\nContent-Type: application/http\r\nContent-ID: <response-' +
            id +
            '@mailchecker>\r\n\r\nHTTP/1.1 ' +
            status +
            ' Test\r\nContent-Type: application/json\r\n\r\n' +
            JSON.stringify(data) +
            '\r\n'
          );
        })
        .join('') + '--reply_boundary--\r\n';
    return new Response(reply, {headers: {'Content-Type': 'multipart/mixed; boundary=reply_boundary'}});
  });
  return {gmail, calls};
}

test('Gmail batches at most 50 counters and retains names after an individual count failure', async () => {
  const {gmail, calls} = await gmailCatalog();
  const folders = await gmail.folders(account);
  assert.equal(folders.length, 200);
  assert.equal(calls.length, 5);
  assert.equal(folders.find(folder => folder.id === 'L3').total, undefined);
  assert.equal(folders.find(folder => folder.id === 'L4').total, 2);
  assert.equal(folders.find(folder => folder.id === 'L4').unread, 1);
  assert.equal(folders.find(folder => folder.id === 'archive').total, 100);
  assert.equal(folders.find(folder => folder.id === 'archive').approximate, true);
});

test('Gmail failed batches leave counts unknown while authentication failures still propagate', async () => {
  const transient = await gmailCatalog({batchStatus: 503});
  const folders = await transient.gmail.folders(account);
  assert.equal(folders.length, 200);
  assert.ok(folders.every(folder => folder.total == null && folder.unread == null));
  for (const status of [401, 403]) {
    const refused = await gmailCatalog({failedLabel: '', partStatus: status});
    await assert.rejects(refused.gmail.folders(account), error => error.reauth === true);
  }
});

for (const metadata of ['exact', 'missing', 'failure', 'auth']) {
  test(`Mail.ru full unread feed uses honest totals with ${metadata} folder metadata`, async () => {
    let tokens = 0;
    const {mailru} = await load('src/background/providers/mailru.ts', async input => {
      const url = new URL(input);
      if (url.pathname.endsWith('/tokens')) {
        tokens++;
        return json({status: 200, body: {token: 'fixture'}});
      }
      if (url.pathname.endsWith('/messages/status/unread'))
        return json({
          status: 200,
          body: Array.from({length: 50}, (_, i) => ({id: String(i), fid: '0', date: 1700000000})),
        });
      assert.equal(url.searchParams.get('token'), 'fixture');
      if (metadata === 'failure') return json({}, 503);
      if (metadata === 'auth') return json({status: 403});
      return json({
        status: 200,
        body: {
          folders: [{id: '0', type: 'inbox', ...(metadata === 'exact' ? {messages_unread: 120} : {})}],
          threads: [],
        },
      });
    });
    if (metadata === 'auth') await assert.rejects(mailru.inbox(account, 30), error => error.reauth === true);
    else {
      const result = await mailru.inbox(account, 30);
      assert.equal(result.unread, metadata === 'exact' ? 120 : 50);
      assert.equal(result.unreadPartial === true, metadata !== 'exact');
      assert.equal(result.messages.length, 30);
    }
    assert.equal(tokens, 1);
  });
}

test('nested folder ordering stays bounded, complete and cycle-safe', async () => {
  const {orderFolders, folderPath} = await load('src/shared/folders.ts');
  let reads = 0;
  const folders = Array.from({length: 200}, (_, index) => {
    const i = (index * 73) % 200;
    return {
      id: String(i),
      name: 'Folder ' + i,
      get parent() {
        reads++;
        return i ? String(i - 1) : undefined;
      },
    };
  });
  assert.equal(
    orderFolders(folders)
      .map(folder => folder.id)
      .join(),
    Array.from({length: 200}, (_, i) => i).join(),
  );
  assert.ok(reads < 50_000, `parent traversal budget exceeded: ${reads}`);
  const cycle = [
    {id: 'a', name: 'A', parent: 'b'},
    {id: 'b', name: 'B', parent: 'a'},
  ];
  assert.equal(folderPath(cycle[0], cycle), 'B / A');
  assert.equal(orderFolders(cycle).length, 2);
});

test('a session body failure propagates and the next attempt obtains the complete message', async () => {
  const {sessionProvider} = await load('src/background/providers/session.ts');
  let attempts = 0;
  const provider = sessionProvider({
    label: 'Fixture',
    bodyMarksRead: true,
    async body() {
      if (++attempts === 1) throw new Error('Temporary body failure');
      return {html: '<p>Complete body</p>'};
    },
  });
  const item = {id: 'm1', date: 1, snippet: 'Only a snippet', unread: true};
  await assert.rejects(provider.thread(account, item), /Temporary body failure/);
  const result = await provider.thread(account, item);
  assert.equal(result[0].html, '<p>Complete body</p>');
  assert.equal(result[0].unread, false);
  assert.equal(attempts, 2);
});

for (const [entry, name] of [
  ['gmailweb', 'gmailWeb'],
  ['yandex', 'yandex'],
  ['mailru', 'mailru'],
]) {
  test(`${entry} browser-session search explicitly rejects unsupported queries without an HTTP request`, async () => {
    const module = await load('src/background/providers/' + entry + '.ts');
    await assert.rejects(module[name].search(account, 'needle', 20), /.+/);
  });
}

test('Gmail API search sends the query and configured limit independently of folder browsing', async () => {
  const {gmail} = await load('src/background/providers/gmail.ts', async input => {
    const url = new URL(input);
    assert.equal(url.pathname, '/gmail/v1/users/me/messages');
    assert.equal(url.searchParams.get('q'), 'from:sender@example.test is:unread');
    assert.equal(url.searchParams.get('maxResults'), '20');
    assert.equal(url.searchParams.has('labelIds'), false);
    return json({messages: []});
  });
  assert.equal((await gmail.search(account, 'from:sender@example.test is:unread', 20)).length, 0);
});

test('Graph search sends its documented search parameter without a hidden folder restriction', async () => {
  const {outlook} = await load('src/background/providers/outlook.ts', async input => {
    const url = new URL(input);
    assert.equal(url.pathname, '/v1.0/me/messages');
    assert.equal(url.searchParams.get('$search'), '"subject:meeting"');
    assert.equal(url.searchParams.get('$top'), '20');
    return json({value: []});
  });
  assert.equal((await outlook.search(account, 'subject:meeting', 20)).length, 0);
});

test('JMAP search uses the RFC text filter and bounded Email/query without an inMailbox filter', async () => {
  let queried = false;
  const {jmap} = await load('src/background/providers/jmap.ts', async (input, init) => {
    const url = new URL(input);
    if (url.pathname === '/session')
      return json({apiUrl: '/api', primaryAccounts: {'urn:ietf:params:jmap:mail': 'mail'}});
    assert.equal(url.pathname, '/api');
    const {methodCalls} = JSON.parse(init.body);
    const query = methodCalls.find(([name]) => name === 'Email/query')[1];
    assert.deepEqual(query.filter, {text: 'needle'});
    assert.equal(query.limit, 20);
    assert.equal(query.accountId, 'mail');
    queried = true;
    return json({
      methodResponses: [
        ['Email/query', {ids: []}, 'query'],
        ['Email/get', {list: []}, 'emails'],
      ],
    });
  });
  const result = await jmap.search(
    {...account, settings: {sessionURL: 'https://mail.example.test/session'}},
    'needle',
    20,
  );
  assert.equal(result.length, 0);
  assert.equal(queried, true);
});

for (const reason of [
  'userRateLimitExceeded',
  'rateLimitExceeded',
  'dailyLimitExceeded',
  'domainPolicy',
  'insufficientPermissions',
]) {
  test(`Gmail explicit 403 ${reason} remains an HTTP error rather than expired credentials`, async () => {
    const {requestJSON} = await load('src/background/http.ts', async () => json({error: {errors: [{reason}]}}, 403));
    await assert.rejects(
      requestJSON('https://gmail.googleapis.com/api', {token: 'test'}),
      error => error.status === 403 && !error.reauth,
    );
  });
}

for (const status of [401, 403]) {
  test(`explicit Gmail authentication failure ${status} still requests sign-in`, async () => {
    const {requestJSON} = await load('src/background/http.ts', async () =>
      json({error: {errors: [{reason: 'authError'}]}}, status),
    );
    await assert.rejects(
      requestJSON('https://gmail.googleapis.com/api', {token: 'test'}),
      error => error.reauth === true,
    );
  });
}

test('Gmail inner batch quota failures preserve names without requesting sign-in', async () => {
  const {gmail} = await gmailCatalog({failedLabel: '', partStatus: 403, partError: 'userRateLimitExceeded'});
  const folders = await gmail.folders(account);
  assert.equal(folders.length, 200);
  assert.ok(folders.every(folder => folder.total == null && folder.unread == null));
});

for (const mode of [
  'accepted',
  'empty',
  'draft-only',
  'send-only',
  'wrong-key',
  'wrong-id-type',
  'contradiction',
  'refused',
]) {
  test(`JMAP reply requires both creation acknowledgements: ${mode}`, async () => {
    const calls = [];
    const {jmap} = await load('src/background/providers/jmap.ts', async (input, init) => {
      if (new URL(input).pathname === '/session')
        return json({apiUrl: '/api', primaryAccounts: {'urn:ietf:params:jmap:mail': 'A'}});
      const {methodCalls} = JSON.parse(init.body);
      calls.push(...methodCalls);
      return json({
        methodResponses: methodCalls.map(([name, , tag]) => {
          let data = {};
          if (name === 'Mailbox/get')
            data = {
              list: [
                {id: 'IN', role: 'inbox'},
                {id: 'DR', role: 'drafts'},
                {id: 'SE', role: 'sent'},
              ],
            };
          if (name === 'Identity/get') data = {list: [{id: 'identity', email: account.email}]};
          if (name === 'Email/get') data = {list: [{from: [{email: 'sender@example.test'}]}]};
          if (name === 'Email/set' && mode !== 'empty' && mode !== 'send-only')
            data = {created: {[mode === 'wrong-key' ? 'other' : 'draft']: {id: mode === 'wrong-id-type' ? 123 : 'D'}}};
          if (name === 'EmailSubmission/set' && mode !== 'empty' && mode !== 'draft-only')
            data = {
              ...(mode === 'refused' ? {} : {created: {send: {id: 'S'}}}),
              ...(['contradiction', 'refused'].includes(mode) ? {notCreated: {send: {type: 'forbidden'}}} : {}),
            };
          return [name, data, tag];
        }),
      });
    });
    const send = jmap.reply(
      {...account, settings: {sessionURL: 'https://mail.example.test/session'}},
      {id: 'original', subject: 'Test'},
      'hello',
    );
    if (mode === 'accepted') await send;
    else await assert.rejects(send);
    assert.equal(calls.filter(([name]) => name === 'EmailSubmission/set').length, 1);
  });
}

/** A Graph conversation message with a body and stable conversation identity. */
const graphBody = (id, conversationId = 'T') => ({
  id,
  conversationId,
  receivedDateTime: '2026-01-01T00:00:00Z',
  body: {content: id, contentType: 'text'},
});

test('Outlook follows conversation pages, preserves opaque tokens and deduplicates the selected message', async () => {
  const calls = [];
  const {outlook} = await load('src/background/providers/outlook.ts', async input => {
    const url = new URL(input);
    calls.push(url);
    return json(
      url.searchParams.has('$skiptoken')
        ? {value: [graphBody('old'), graphBody('selected')]}
        : {
            value: [graphBody('old')],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=a%2Bb',
          },
    );
  });
  const messages = await outlook.thread(account, {id: 'selected', thread: 'T'});
  assert.equal(messages.map(message => message.id).join(','), 'old,selected');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get('$skiptoken'), 'a+b');
});

test('Outlook explicitly fetches the selected message when the conversation response omits it', async () => {
  const calls = [];
  const {outlook} = await load('src/background/providers/outlook.ts', async input => {
    calls.push(input);
    return json(new URL(input).pathname.endsWith('/selected') ? graphBody('selected') : {value: [graphBody('old')]});
  });
  const messages = await outlook.thread(account, {id: 'selected', thread: 'T'});
  assert.ok(messages.some(message => message.id === 'selected'));
  assert.equal(calls.length, 2);
});

for (const mode of ['foreign-origin', 'foreign-path', 'cycle', 'limit', 'wrong-selection']) {
  test(`Outlook rejects an incomplete or invalid conversation: ${mode}`, async () => {
    let calls = 0;
    const {outlook} = await load('src/background/providers/outlook.ts', async input => {
      calls++;
      const url = new URL(input);
      assert.equal(url.host, 'graph.microsoft.com');
      if (mode === 'wrong-selection')
        return json(url.pathname.endsWith('/selected') ? graphBody('selected', 'other') : {value: [graphBody('old')]});
      const link =
        mode === 'foreign-origin'
          ? 'https://foreign.example.test/token'
          : mode === 'foreign-path'
            ? 'https://graph.microsoft.com/v1.0/me/sendMail'
            : `https://graph.microsoft.com/v1.0/me/messages?$skip=${mode === 'cycle' ? 50 : calls}`;
      return json({value: [graphBody('old')], '@odata.nextLink': link});
    });
    await assert.rejects(outlook.thread(account, {id: 'selected', thread: 'T'}));
    assert.ok(calls <= 4);
  });
}

test('Yandex paginates every row when server pages exceed the requested client page', async () => {
  const owner =
    '<div class="b-head-user"><a href="https://passport.yandex.ru/profile/avatars/">my-address</a></div><div class="b-folders"><a href="/lite/inbox">Inbox</a></div>';
  const calls = [];
  const {yandex} = await load('src/background/providers/yandex.ts', async input => {
    calls.push(input);
    const second = new URL(input).pathname.endsWith('page_number=1');
    const offset = second ? 100 : 0;
    const rows = Array.from(
      {length: 100},
      (_, i) =>
        '<div class="b-messages__message"><input name="ids" value="' +
        (offset + i) +
        '"><a href="/lite/message/' +
        (offset + i) +
        '"><span class="b-message__subject__text">Mail</span></a></div>',
    ).join('');
    return new Response(
      owner +
        '<div class="b-messages">' +
        rows +
        '</div>' +
        (second
          ? ''
          : '<div class="b-pager"><a class="b-pager__next" href="/lite/folder/42/page_number=1">Next</a></div>'),
    );
  });
  let cursor = '';
  const ids = [];
  do {
    const page = await yandex.folder({email: 'my.address@yandex.ru'}, 'folder/42', 50, cursor);
    ids.push(...page.messages.map(m => m.id));
    cursor = page.next;
  } while (cursor);
  assert.equal(ids.length, 200);
  assert.equal(new Set(ids).size, 200);
  assert.equal(ids.join(','), Array.from({length: 200}, (_, i) => String(i)).join(','));
  assert.equal(calls.length, 4);
});

test('Gmail retains all system roles after 200 custom labels', async () => {
  const {gmail} = await load('src/background/providers/gmail.ts', async (input, init) =>
    new URL(input).pathname.endsWith('/labels')
      ? json({
          labels: [
            ...Array.from({length: 200}, (_, i) => ({id: 'L' + i, name: 'User ' + i, type: 'user'})),
            ...['INBOX', 'SENT', 'TRASH', 'SPAM', 'DRAFT'].map(id => ({id, name: id, type: 'system'})),
          ],
        })
      : new Response(
          [...init.body.matchAll(/Content-ID: <(\d+)@mailchecker>/g)]
            .map(
              ([, id]) =>
                '--response\r\nContent-Type: application/http\r\nContent-ID: <response-' +
                id +
                '@mailchecker>\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"messagesTotal":1,"messagesUnread":0}\r\n',
            )
            .join('') + '--response--\r\n',
        ),
  );
  const folders = await gmail.folders({credentials: {token: 'test'}});
  assert.equal(folders.length, 200);
  assert.equal(folders.filter(f => f.role).length, 6);
});

test('deep MIME input fails explicitly while normal traversal preserves the first body', async () => {
  const {gmail} = await load(
    'src/background/providers/gmail.ts',
    async () =>
      new Response(
        '{"messages":[{"id":"m","payload":' + '{"parts":['.repeat(12000) + '{}' + ']}'.repeat(12000) + '}]}',
      ),
  );
  await assert.rejects(
    gmail.thread({credentials: {token: 'test'}}, {id: 'm', thread: 'T'}),
    error => error.name !== 'RangeError',
  );
  const normal = await load('src/background/providers/gmail.ts', async () =>
    json({
      messages: [
        {
          id: 'm',
          payload: {
            parts: [
              {mimeType: 'text/plain', body: {data: Buffer.from('First body').toString('base64url')}},
              {mimeType: 'text/plain', body: {data: Buffer.from('Second body').toString('base64url')}},
            ],
          },
        },
      ],
    }),
  );
  assert.equal(
    (await normal.gmail.thread({credentials: {token: 'test'}}, {id: 'm', thread: 'T'}))[0].text,
    'First body',
  );
});

test('20 accounts share eight HTTP slots and preserve all 1000 messages', async () => {
  let active = 0,
    peak = 0,
    total = 0;
  const {gmail} = await load('src/background/providers/gmail.ts', async input => {
    const url = new URL(input);
    total++;
    active++;
    peak = Math.max(peak, active);
    await new Promise(done => setTimeout(done, 1));
    active--;
    if (url.pathname.endsWith('/labels/INBOX')) return json({messagesUnread: 50});
    if (url.pathname.endsWith('/messages'))
      return json({messages: Array.from({length: 50}, (_, i) => ({id: String(i)}))});
    return json({id: url.pathname.split('/').pop(), labelIds: ['INBOX', 'UNREAD'], payload: {headers: []}});
  });
  const boxes = await Promise.all(
    Array.from({length: 20}, (_, i) => gmail.inbox({id: String(i), credentials: {token: 'test'}}, 50)),
  );
  assert.ok(boxes.every(b => b.messages.length === 50));
  assert.equal(total, 1040);
  assert.equal(peak, 8);
});

test('HTTP concurrency slots remain held through delayed response body reads', async () => {
  let active = 0,
    peak = 0;
  const {requestJSON} = await load('src/background/http.ts', async () => {
    active++;
    peak = Math.max(peak, active);
    let emitted = false;
    return new Response(
      new ReadableStream({
        async pull(controller) {
          if (emitted) return;
          emitted = true;
          await new Promise(done => setTimeout(done, 2));
          controller.enqueue(new TextEncoder().encode('{"ok":true}'));
          controller.close();
          active--;
        },
      }),
    );
  });
  await Promise.all(Array.from({length: 40}, () => requestJSON('https://example.test/api')));
  assert.equal(peak, 8);
  assert.equal(active, 0);
});

test('wide MIME trees terminate at the work bound', async () => {
  const {gmail} = await load(
    'src/background/providers/gmail.ts',
    async () =>
      new Response(JSON.stringify({messages: [{id: 'm', payload: {parts: Array.from({length: 2001}, () => ({}))}}]})),
  );
  await assert.rejects(gmail.thread({credentials: {token: 'test'}}, {id: 'm', thread: 'T'}));
});

test('HTTP failures release slots for queued successful requests', async () => {
  const http = await load('src/background/http.ts', async input => {
    if (new URL(input).pathname.endsWith('bad')) throw Error('failed');
    return json({ok: true});
  });
  const replies = await Promise.allSettled(
    Array.from({length: 32}, (_, i) => http.requestJSON('https://example.test/' + (i % 3 ? 'ok' : 'bad'))),
  );
  assert.equal(replies.filter(reply => reply.status === 'fulfilled').length, 21);
});
