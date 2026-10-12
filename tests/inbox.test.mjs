/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Unified Inbox model and Smart Inbox categorization regressions.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

/** Repository root. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bundles a TypeScript module and imports it. */
async function load(entry) {
  const {outputFiles} = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}

const inbox = await load('src/shared/inbox.ts');
const {categorize} = await load('src/background/providers/message.ts');

/** Creates a list message. */
const message = (id, overrides = {}) => ({
  id,
  thread: `t-${id}`,
  from: 'Ann <ann@example.com>',
  subject: `Subject ${id}`,
  snippet: '',
  date: 1000 - Number(id.replace(/\D/g, '') || 0),
  link: '',
  unread: true,
  pinned: false,
  category: 'people',
  attachments: false,
  ...overrides,
});

const accounts = [
  {id: 'a', provider: 'gmail', label: 'Gmail', email: 'a@example.com'},
  {id: 'b', provider: 'jmap', label: 'JMAP', email: 'b@example.com'},
];

test('merges accounts newest first and filters by account', () => {
  const mailboxes = {
    a: {messages: [message('1'), message('3')]},
    b: {messages: [message('2')]},
  };
  assert.equal(
    inbox
      .merge(accounts, mailboxes, 'all')
      .map(entry => entry.message.id)
      .join(),
    '1,2,3',
  );
  assert.equal(
    inbox
      .merge(accounts, mailboxes, 'b')
      .map(entry => entry.message.id)
      .join(),
    '2',
  );
});

test('stacks repeated notifications from the same sender and subject', () => {
  const ci = id =>
    message(id, {from: 'CI <notifications@github.com>', subject: 'Run failed', category: 'notifications'});
  const entries = [ci('1'), message('2'), ci('3'), ci('4'), message('5', {category: 'notifications'})].map(m => ({
    account: 'a',
    message: m,
  }));
  const items = inbox.stack(entries);
  assert.equal(
    items.map(item => (item.kind === 'stack' ? `stack${item.entries.length}` : item.entry.message.id)).join(),
    'stack3,2,5',
  );
});

test('Smart Inbox puts pinned first, then one list of the rest, and skips empty sections', () => {
  const entries = [message('1', {pinned: true}), message('2', {category: 'newsletters'}), message('3')].map(m => ({
    account: 'a',
    message: m,
  }));
  assert.equal(
    inbox
      .sections(entries, 'all')
      .map(section => section.id)
      .join(),
    'pinned,inbox',
  );
  assert.equal(inbox.sections(entries, 'pinned')[0].items.length, 1);
  assert.equal(inbox.sections(entries, 'notifications')[0].items.length, 0);
  const counts = inbox.counts(entries);
  assert.equal(`${counts.all}/${counts.people}/${counts.newsletters}/${counts.pinned}`, '3/2/1/1');
});

test('categorizes people, notifications and newsletters', () => {
  assert.equal(categorize({from: 'Ivan <ivan@partner.ru>'}), 'people');
  assert.equal(categorize({from: 'GitHub <notifications@github.com>'}), 'notifications');
  assert.equal(categorize({from: 'Google <no-reply@accounts.google.com>'}), 'notifications');
  assert.equal(categorize({from: 'Shop <news@shop.com>', listUnsubscribe: true}), 'newsletters');
  assert.equal(categorize({from: 'Ivan <ivan@partner.ru>', labels: ['CATEGORY_PROMOTIONS']}), 'newsletters');
  assert.equal(categorize({from: 'Jira <jira@corp.ru>', labels: ['CATEGORY_UPDATES']}), 'notifications');
});

const {accents, textOn} = await load('src/shared/preferences.ts');

test('accent buttons take the text colour with the higher APCA contrast', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(accents).map(([name, {text}]) => [name, text])), {
    orange: '#1a0f00',
    blue: '#ffffff',
    cyan: '#1a0f00',
    green: '#ffffff',
    pink: '#ffffff',
    purple: '#ffffff',
    red: '#ffffff',
    yellow: '#1a0f00',
    gray: '#ffffff',
  });
  assert.equal(textOn('#ffffff'), '#1a0f00');
  assert.equal(textOn('#000000'), '#ffffff');
});

const {parseFeed} = await load('src/background/providers/gmailweb.ts');
const {parseInbox} = await load('src/background/providers/yandex.ts');
const {parseUnread} = await load('src/background/providers/mailru.ts');

test('the Gmail feed gives the address, unread count and messages', () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
<title>Gmail - Inbox for Me@Gmail.com</title><fullcount>7</fullcount>
<entry><title>Билеты &amp; гостиница</title><summary>Отлично, тогда бронирую&#8230;</summary>
<link rel="alternate" href="https://mail.google.com/mail/u/0?account_id=me@gmail.com&amp;message_id=18f2a&amp;view=conv&amp;extsrc=atom" type="text/html" />
<modified>2026-10-12T09:00:00Z</modified><issued>2026-10-12T08:59:00Z</issued><id>tag:gmail.google.com,2004:1</id>
<author><name>Мария</name><email>maria@example.com</email></author></entry>
</feed>`;
  const {email, unread, messages} = parseFeed(feed);
  assert.equal(email, 'me@gmail.com');
  assert.equal(unread, 7);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, '18f2a');
  assert.equal(messages[0].subject, 'Билеты & гостиница');
  assert.equal(messages[0].snippet, 'Отлично, тогда бронирую…');
  assert.equal(messages[0].from, 'Мария <maria@example.com>');
  assert.equal(messages[0].date, Date.parse('2026-10-12T08:59:00Z'));
  assert.equal(messages[0].unread, true);
});

test('the Yandex lite Inbox gives the unread count and rows, and a sign-in page needs a sign-in', () => {
  const page = `<div class="b-folders"><a class="b-folders__folder"><span class="b-folders__folder__num">3</span></a>
<a href="/lite/inbox">Входящие</a><a href="/lite/sent">Отправленные</a></div>
<div class="b-messages">
<div class="b-messages__message b-messages__message_unread"><a href="/lite/message/171"><span class="b-message__from" title="Папа">Папа</span>
<span class="b-message__subject__text">Без&nbsp;темы</span><span class="b-message__firstline">Позвони, как будет время.</span></a></div>
<div class="b-messages__message"><a href="/lite/thread/172"><span class="b-message__from__text">Банк</span>
<span class="b-message__subject__text">Выписка</span></a></div>
</div>`;
  const {unread, messages} = parseInbox(page, 1000_000);
  assert.equal(unread, 3);
  assert.deepEqual(
    messages.map(item => [item.id, item.from, item.subject, item.snippet, item.unread, item.link]),
    [
      ['171', 'Папа', 'Без темы', 'Позвони, как будет время.', true, 'https://mail.yandex.ru/lite/message/171'],
      ['172', 'Банк', 'Выписка', '', false, 'https://mail.yandex.ru/lite/thread/172'],
    ],
  );
  assert.ok(messages[0].date > messages[1].date);
  assert.throws(() => parseInbox('<form><input type="password" name="passwd"></form>'), /Войдите в Яндекс Почту/);
});

test('the Mail.ru checker reply gives unread messages, and a refused address needs a sign-in', () => {
  const {unread, messages} = parseUnread({
    status: 200,
    body: [
      {
        id: '17000:abc',
        fid: '0',
        subject: 'Счёт',
        snippet: 'Оплатите до пятницы',
        date: 1760000000,
        correspondents: {from: [{name: 'Магазин', email: 'shop@example.com'}]},
      },
    ],
  });
  assert.equal(unread, 1);
  assert.equal(messages[0].from, 'Магазин <shop@example.com>');
  assert.equal(messages[0].date, 1760000000 * 1000);
  assert.equal(messages[0].link, 'https://e.mail.ru/0/17000%3Aabc/');
  assert.throws(() => parseUnread({status: 403, body: 'user'}), /Войдите в Почту Mail\.ru/);
});

const http = await load('src/background/http.ts');

test('session requests send the browser sign-in only to the allowed webmail hosts', async () => {
  await assert.rejects(http.requestText('https://example.com/inbox', {session: true}), /не может использовать вход/);
  await assert.rejects(http.requestText('http://mail.google.com/mail/u/0/feed/atom', {session: true}), /HTTPS/);
  assert.deepEqual([...http.SESSION_HOSTS], ['mail.google.com', 'mail.yandex.ru', 'e.mail.ru', 'auth.mail.ru']);
});
