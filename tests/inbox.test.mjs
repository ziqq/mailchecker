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

test('Smart Inbox sections put pinned first and skip empty sections', () => {
  const entries = [message('1', {pinned: true}), message('2', {category: 'newsletters'}), message('3')].map(m => ({
    account: 'a',
    message: m,
  }));
  assert.equal(
    inbox
      .sections(entries, 'all')
      .map(section => section.id)
      .join(),
    'pinned,people,newsletters',
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
