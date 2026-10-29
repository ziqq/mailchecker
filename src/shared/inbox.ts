/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Unified Inbox model: merges accounts, filters by category and stacks
 * repeated notifications. Side-effect free, so lists are testable.
 *
 * @module shared/inbox
 */
import type {Category, MailMessage, Mailbox, PublicAccount} from './types';
import {t} from './i18n';

/** A message with its account ID. */
export interface Entry {
  account: string;
  message: MailMessage;
}

/** A list item: one message or a stack of repeated notifications. */
export type Item = {kind: 'message'; entry: Entry} | {kind: 'stack'; key: string; entries: Entry[]};

/** List filters: everything, pinned messages or one category. */
export type Filter = 'all' | 'pinned' | Category;

/** List sections in display order. */
export type Section = {id: 'pinned' | 'inbox' | Category; title: string; items: Item[]};

/** Section titles. */
const TITLES: Record<Section['id'], string> = {
  pinned: t('section_pinned'),
  inbox: t('section_inbox'),
  people: t('section_people'),
  notifications: t('section_notifications'),
  newsletters: t('section_newsletters'),
};

/** Account accent colours by position. */
export const ACCOUNT_COLORS = ['#ff9418', '#4f8cff', '#3ecf8e', '#c084fc', '#f472b6', '#facc15', '#22d3ee', '#fb7185'];

/** Returns the colour chosen for an account, or its colour by position. */
export const accountColor = (accounts: PublicAccount[], id: string): string =>
  accounts.find(account => account.id === id)?.color ||
  ACCOUNT_COLORS[
    Math.max(
      0,
      accounts.findIndex(account => account.id === id),
    ) % ACCOUNT_COLORS.length
  ];

/**
 * Merges the Inbox messages of the selected accounts, newest first.
 *
 * @param accounts Connected accounts.
 * @param mailboxes Last check results.
 * @param account An account ID, or `all`.
 */
export function merge(accounts: PublicAccount[], mailboxes: Record<string, Mailbox>, account: string): Entry[] {
  return accounts
    .filter(item => account === 'all' || item.id === account)
    .flatMap(item => (mailboxes[item.id]?.messages || []).map(message => ({account: item.id, message})))
    .sort((a, b) => b.message.date - a.message.date);
}

/** Matches plain words in already loaded sender, subject and preview text, newest first. */
export function searchLoaded(messages: MailMessage[], query: string): MailMessage[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return messages
    .filter(message => {
      const text = `${message.from} ${message.subject} ${message.snippet}`.toLowerCase();
      return words.every(word => text.includes(word));
    })
    .sort((a, b) => b.date - a.date || a.id.localeCompare(b.id));
}

/** Key that groups repeated notifications: same sender and subject. */
const stackKey = ({account, message}: Entry): string =>
  `${account}\u0000${message.from.toLowerCase()}\u0000${message.subject.toLowerCase().replace(/\s+/g, ' ')}`;

/**
 * Groups entries; notifications with the same sender and subject become one stack.
 *
 * Stacks keep the position of their newest message.
 */
export function stack(entries: Entry[]): Item[] {
  const items: Item[] = [];
  const stacks = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (entry.message.category !== 'notifications') {
      items.push({kind: 'message', entry});
      continue;
    }
    const key = stackKey(entry);
    const existing = stacks.get(key);
    if (existing) existing.push(entry);
    else {
      const group = [entry];
      stacks.set(key, group);
      items.push({kind: 'stack', key, entries: group});
    }
  }
  return items.map(item =>
    item.kind === 'stack' && item.entries.length === 1 ? {kind: 'message', entry: item.entries[0]} : item,
  );
}

/**
 * Builds Smart Inbox sections for a category filter.
 *
 * `all` shows pinned messages first, then every other message newest first,
 * repeated notifications stacked; `pinned` or a category shows only its messages.
 */
export function sections(entries: Entry[], filter: Filter): Section[] {
  if (filter === 'pinned')
    return [
      {
        id: 'pinned' as const,
        title: TITLES.pinned,
        items: entries.filter(e => e.message.pinned).map(entry => ({kind: 'message' as const, entry})),
      },
    ].filter(section => section.items.length);
  if (filter !== 'all')
    return [{id: filter, title: TITLES[filter], items: stack(entries.filter(e => e.message.category === filter))}];
  const pinned = entries.filter(entry => entry.message.pinned);
  const rest = entries.filter(entry => !entry.message.pinned);
  return [
    {id: 'pinned' as const, title: TITLES.pinned, items: pinned.map(entry => ({kind: 'message' as const, entry}))},
    {id: 'inbox' as const, title: TITLES.inbox, items: stack(rest)},
  ].filter(section => section.items.length);
}

/** Returns unread counts per category for the filter labels. */
export function counts(entries: Entry[]): Record<Filter, number> {
  const result = {all: 0, pinned: 0, people: 0, notifications: 0, newsletters: 0};
  for (const {message} of entries) {
    if (message.pinned) result.pinned += 1;
    if (message.unread) {
      result.all += 1;
      result[message.category] += 1;
    }
  }
  return result;
}

/** Flattens sections into the keyboard navigation order, expanding opened stacks. */
export function order(list: Section[], expanded: ReadonlySet<string>): Entry[] {
  return list.flatMap(section =>
    section.items.flatMap(item =>
      item.kind === 'message' ? [item.entry] : expanded.has(item.key) ? item.entries : [item.entries[0]],
    ),
  );
}
