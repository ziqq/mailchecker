/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * In-memory stand-in for the service worker in the sandbox build.
 *
 * Answers the client's `Request`s from fixtures with no extension APIs and
 * no network, so `popup.html` and `app.html` run in a plain browser tab.
 * Actions change the in-memory state; a reload starts over. Initial
 * preferences come from the page query (`?theme=dark&palette=pink`).
 *
 * @module sandbox/worker
 */
import {preferences} from '../shared/preferences';
import type {MailMessage, Preferences, PublicState, Reply, Request, SearchHit, ThreadMessage} from '../shared/types';
import {createFixtures, type Fixtures} from './fixtures';

/** Simulated worker latency, so loading states are visible. */
const LATENCY = 120;

/** Fixtures and preferences, created on the first request. */
let data: (Fixtures & {preferences: Preferences}) | null = null;

/** Returns the sandbox data, creating it on first use. */
function current(): Fixtures & {preferences: Preferences} {
  if (!data) {
    const query = new URLSearchParams(location.search);
    data = {
      ...createFixtures(Date.now()),
      preferences: preferences({
        theme: query.get('theme') ?? undefined,
        palette: query.get('palette') ?? undefined,
        popup: query.get('popup') ?? undefined,
      }),
    };
  }
  return data;
}

/** Returns the public state. */
function state(): PublicState {
  const {accounts, mailboxes, preferences} = current();
  return {
    preferences,
    accounts,
    mailboxes,
    oauth: {
      google: true,
      microsoft: true,
      redirect: {
        google: 'https://sandbox.chromiumapp.org/google',
        microsoft: 'https://sandbox.chromiumapp.org/microsoft',
      },
    },
  };
}

/** Replaces the listed messages of [account] and adjusts its unread count by the difference. */
function update(account: string, messages: MailMessage[]): void {
  const {mailboxes} = current();
  const box = mailboxes[account];
  const listed = (items: MailMessage[]) => items.filter(item => item.unread).length;
  mailboxes[account] = {...box, messages, unread: Math.max(0, box.unread - listed(box.messages) + listed(messages))};
}

/** Returns a known account ID or throws. */
function account(id: string): string {
  if (!current().mailboxes[id]) throw new Error('Ящик не найден.');
  return id;
}

/** Applies a message action. */
function act(id: string, message: string, action: string): void {
  const {mailboxes, archive} = current();
  const messages = mailboxes[account(id)].messages;
  const target = messages.find(item => item.id === message);
  if (!target) throw new Error('Письмо не найдено.');
  if (action === 'archive' || action === 'trash') {
    if (action === 'archive') archive[id] = [{...target, unread: false}, ...(archive[id] || [])];
    update(
      id,
      messages.filter(item => item !== target),
    );
    return;
  }
  const flags: Record<string, Partial<MailMessage>> = {
    read: {unread: false},
    unread: {unread: true},
    pin: {pinned: true},
    unpin: {pinned: false},
  };
  if (!flags[action]) throw new Error('Неизвестное действие.');
  update(
    id,
    messages.map(item => (item === target ? {...item, ...flags[action]} : item)),
  );
}

/** Delivers queued incoming mail and marks every mailbox as checked. */
function check(): void {
  const {mailboxes, incoming} = current();
  const now = Date.now();
  for (const [id, box] of Object.entries(mailboxes)) {
    const delivered = (incoming[id] || []).map(item => ({...item, date: now}));
    incoming[id] = [];
    if (delivered.length) update(id, [...delivered, ...box.messages]);
    if (!mailboxes[id].reauth) mailboxes[id] = {...mailboxes[id], checkedAt: now};
  }
}

/** Returns a conversation; messages without a fixture conversation become one-message threads. */
function thread(id: string, message: string, key: string): ThreadMessage[] {
  const {mailboxes, archive, threads, accounts} = current();
  const fixture = threads[`${account(id)}/${key || message}`];
  if (fixture) return fixture;
  const item = [...mailboxes[id].messages, ...(archive[id] || [])].find(entry => entry.id === message);
  if (!item) throw new Error('Письмо не найдено.');
  const email = accounts.find(entry => entry.id === id)!.email;
  return [
    {
      id: item.id,
      from: item.from,
      to: email,
      cc: '',
      subject: item.subject,
      date: item.date,
      html: '',
      text: item.snippet,
      unread: item.unread,
      attachments: item.attachments ? [{name: 'Вложение.pdf', size: 120_000, type: 'application/pdf'}] : [],
    },
  ];
}

/** Searches Inbox and archived mail of every account by sender, subject and snippet. */
function search(query: string): SearchHit[] {
  const {accounts, mailboxes, archive} = current();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return accounts
    .flatMap(({id}) => [...mailboxes[id].messages, ...(archive[id] || [])].map(message => ({account: id, message})))
    .filter(({message}) => {
      const haystack = `${message.from} ${message.subject} ${message.snippet}`.toLowerCase();
      return words.every(word => haystack.includes(word));
    })
    .sort((a, b) => b.message.date - a.message.date);
}

/** Answers one request. */
function answer(message: Request): unknown {
  switch (message.type) {
    case 'STATE':
      return state();
    case 'CHECK':
      check();
      return state();
    case 'ACT':
      act(message.account, message.message, message.action);
      return state();
    case 'THREAD':
      return thread(message.account, message.message, message.thread);
    case 'SEARCH':
      return search(message.query);
    case 'REPLY':
      if (!message.text.trim()) throw new Error('Напишите ответ.');
      return true;
    case 'PREFERENCES': {
      const sandbox = current();
      sandbox.preferences = preferences({...sandbox.preferences, ...message.value});
      return sandbox.preferences;
    }
    case 'SIGN_IN': {
      const {mailboxes} = current();
      const id = account(message.account);
      mailboxes[id] = {...mailboxes[id], error: '', reauth: false, checkedAt: Date.now()};
      return state();
    }
    case 'OPEN_APP':
      window.open('app.html', '_blank', 'noopener');
      return true;
    default:
      throw new Error('В песочнице это действие недоступно.');
  }
}

/**
 * Handles a client request like the service worker would, after a short delay.
 *
 * @param message The typed request.
 * @returns The worker reply envelope.
 */
export async function handle(message: Request): Promise<Reply> {
  await new Promise(resolve => setTimeout(resolve, LATENCY));
  try {
    return {ok: true, value: structuredClone(answer(message))};
  } catch (error) {
    return {ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка.'};
  }
}
