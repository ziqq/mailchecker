/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Client state shared by the toolbar popup and the full-tab app.
 *
 * Holds the worker's public state, the selection, filters, search and an
 * in-memory conversation cache. Bodies are never written to storage.
 *
 * @module client/store
 */
import {batch, createMemo, createRoot, createSignal} from 'solid-js';
import {request, errorMessage} from '../shared/dom';
import {counts, merge, order, sections, type Entry, type Filter} from '../shared/inbox';
import type {MessageAction, Preferences, PublicState, SearchHit, ThreadMessage} from '../shared/types';

/** Where the client runs: the toolbar popup or a full browser tab. */
export const mode: 'popup' | 'app' = document.documentElement.dataset.mode === 'app' ? 'app' : 'popup';

/** A selected message. */
export interface Selection {
  account: string;
  id: string;
  thread: string;
}

/** Conversation cache entries by `account/thread`. */
const threads = new Map<string, ThreadMessage[]>();

export const store = createRoot(() => {
  const [state, setState] = createSignal<PublicState | null>(null);
  const [account, setAccount] = createSignal<string>('all');
  const [filter, setFilter] = createSignal<Filter>('all');
  const [selected, setSelected] = createSignal<Selection | null>(null);
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<Entry[] | null>(null);
  const [searching, setSearching] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [toast, setToast] = createSignal('');

  /** All Inbox entries of the selected account(s). */
  const entries = createMemo(() => {
    const current = state();
    return current ? merge(current.accounts, current.mailboxes, account()) : [];
  });

  /** Sections shown in the list: search results or Smart Inbox. */
  const list = createMemo(() => {
    const hits = results();
    if (hits)
      return [
        {
          id: 'people' as const,
          title: 'Результаты поиска',
          items: hits.map(entry => ({kind: 'message' as const, entry})),
        },
      ];
    return sections(entries(), filter());
  });

  /** Unread counts per filter. */
  const unread = createMemo(() => counts(entries()));

  /** Keyboard navigation order. */
  const navigation = createMemo(() => order(list(), expanded()));

  /** The selected entry, from the list or search results. */
  const current = createMemo(() => {
    const selection = selected();
    if (!selection) return null;
    return navigation().find(entry => entry.account === selection.account && entry.message.id === selection.id) || null;
  });

  /** Shows a transient error. */
  function fail(error: unknown): void {
    setToast(errorMessage(error));
    setTimeout(() => setToast(''), 5000);
  }

  /** Loads the public state. */
  async function load(): Promise<void> {
    try {
      setState(await request<PublicState>({type: 'STATE'}));
    } catch (error) {
      fail(error);
    }
  }

  /** Checks all mailboxes now. */
  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      setState(await request<PublicState>({type: 'CHECK'}));
    } catch (error) {
      fail(error);
    } finally {
      setRefreshing(false);
    }
  }

  /** Selects an entry, or clears the selection. */
  function select(entry: Entry | null): void {
    setSelected(entry ? {account: entry.account, id: entry.message.id, thread: entry.message.thread} : null);
  }

  /** Moves the selection by [step] in navigation order. */
  function move(step: number): void {
    const items = navigation();
    if (!items.length) return;
    const index = items.findIndex(entry => entry === current());
    select(items[Math.min(items.length - 1, Math.max(0, index < 0 ? 0 : index + step))]);
  }

  /** Expands or collapses a notification stack. */
  function toggleStack(key: string): void {
    const next = new Set(expanded());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  }

  /**
   * Loads a conversation, cached for the session.
   *
   * @param selection The selected message.
   */
  async function thread(selection: Selection): Promise<ThreadMessage[]> {
    const key = `${selection.account}/${selection.thread || selection.id}`;
    const cached = threads.get(key);
    if (cached) return cached;
    const value = await request<ThreadMessage[]>({
      type: 'THREAD',
      account: selection.account,
      message: selection.id,
      thread: selection.thread,
    });
    threads.set(key, value);
    if (threads.size > 30) threads.delete(threads.keys().next().value!);
    return value;
  }

  /**
   * Applies an action; archive and trash move the selection to the next message.
   *
   * @param entry The message.
   * @param action The action.
   */
  async function act(entry: Entry, action: MessageAction): Promise<void> {
    const leaving = action === 'archive' || action === 'trash';
    let next: Entry | null = null;
    if (leaving && selected()?.id === entry.message.id) {
      const items = navigation();
      const index = items.indexOf(entry);
      next = items[index + 1] || items[index - 1] || null;
    }
    try {
      const value = await request<PublicState>({
        type: 'ACT',
        account: entry.account,
        message: entry.message.id,
        action,
      });
      batch(() => {
        setState(value);
        const hits = results();
        if (hits)
          setResults(
            leaving
              ? hits.filter(hit => hit !== entry)
              : hits.map(hit =>
                  hit === entry
                    ? {
                        ...hit,
                        message: {
                          ...hit.message,
                          unread: action === 'unread' ? true : action === 'read' ? false : hit.message.unread,
                          pinned: action === 'pin' ? true : action === 'unpin' ? false : hit.message.pinned,
                        },
                      }
                    : hit,
                ),
          );
        if (leaving && selected()?.id === entry.message.id) select(next);
      });
    } catch (error) {
      fail(error);
    }
  }

  /** Runs a search across all accounts; an empty query returns to the Inbox. */
  async function search(text: string): Promise<void> {
    setQuery(text);
    if (!text.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const hits = await request<SearchHit[]>({type: 'SEARCH', query: text});
      if (query() === text) setResults(hits.map(hit => ({account: hit.account, message: hit.message})));
    } catch (error) {
      fail(error);
    } finally {
      setSearching(false);
    }
  }

  /** Saves preferences (theme, palette). */
  async function savePreferences(value: Partial<Preferences>): Promise<void> {
    try {
      const preferences = await request<Preferences>({type: 'PREFERENCES', value});
      const currentState = state();
      if (currentState) setState({...currentState, preferences});
    } catch (error) {
      fail(error);
    }
  }

  return {
    state,
    account,
    setAccount,
    filter,
    setFilter,
    selected,
    current,
    expanded,
    query,
    results,
    searching,
    refreshing,
    toast,
    entries,
    list,
    unread,
    load,
    refresh,
    select,
    move,
    toggleStack,
    thread,
    act,
    search,
    savePreferences,
    fail,
  };
});
