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
import {request, errorMessage, afterReturn} from '../shared/dom';
import {counts, merge, order, sections, type Entry, type Filter} from '../shared/inbox';
import type {MessageAction, Preferences, PublicState, SearchHit, ThreadMessage} from '../shared/types';
import {t} from '../shared/i18n';

/** Where the client runs: the toolbar popup or a full browser tab. */
export const mode: 'popup' | 'app' = document.documentElement.dataset.mode === 'app' ? 'app' : 'popup';

/** A selected message. */
export interface Selection {
  account: string;
  id: string;
  thread: string;
}

/** Conversation cache entries by `account/thread`. */
const threads = new Map<string, Promise<ThreadMessage[]>>();

/** Inbox metadata that can change conversation contents, excluding flags and check timestamps. */
const contents = (value: PublicState): string =>
  JSON.stringify(
    Object.entries(value.mailboxes).map(([account, box]) => [
      account,
      box.messages.map(({id, thread, date, from, subject, snippet}) => [id, thread, date, from, subject, snippet]),
    ]),
  );

export const store = createRoot(() => {
  const [state, setState] = createSignal<PublicState | null>(null);
  const [account, setAccount] = createSignal<string>('all');
  const [filter, setFilter] = createSignal<Filter>('all');
  const [selected, setSelected] = createSignal<Selection | null>(null);
  /** Last known metadata of the open message, retained when it leaves the Inbox feed. */
  const [retained, setRetained] = createSignal<Entry | null>(null);
  /** Refreshes the displayed conversation when its Inbox contents change or a reply is sent. */
  const [threadVersion, setThreadVersion] = createSignal(0);
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<Entry[] | null>(null);
  const [searching, setSearching] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [toast, setToast] = createSignal<{text: string; error: boolean} | null>(null);
  /** The reply editor is open for the selected message. */
  const [replying, setReplying] = createSignal(false);
  /** The archive or trash in progress, shown over the window; empty when idle. */
  const [busy, setBusy] = createSignal('');
  /** Cancels a pending browser-session check when another sign-in starts. */
  let cancelSignInRetry: (() => void) | undefined;

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
          id: 'inbox' as const,
          title: t('search_results'),
          items: hits.map(entry => ({kind: 'message' as const, entry})),
        },
      ];
    return sections(entries(), filter());
  });

  /** Unread counts per filter. */
  const unread = createMemo(() => counts(entries()));

  /** Keyboard navigation order. */
  const navigation = createMemo(() => order(list(), expanded()));

  /** The selected entry, independent of visible filters and unread-only Inbox feeds. */
  const current = createMemo(() => {
    const selection = selected();
    const value = state();
    if (!selection || !value?.accounts.some(account => account.id === selection.account)) return null;
    const listed = navigation().find(entry => entry.account === selection.account && entry.message.id === selection.id);
    const message = value.mailboxes[selection.account]?.messages.find(message => message.id === selection.id);
    if (message) return listed?.message === message ? listed : {account: selection.account, message};
    return listed || retained();
  });

  /** Updates public state while retaining the open message's most recent metadata. */
  function updateState(value: PublicState): void {
    batch(() => {
      const before = state();
      if (before && contents(before) !== contents(value)) invalidateThreads();
      setRetained(current());
      setState(value);
    });
  }

  /** Drops cached and in-flight conversation references and refreshes the open reader. */
  function invalidateThreads(): void {
    threads.clear();
    setThreadVersion(value => value + 1);
  }

  /** Shows a transient message; errors are red. */
  function notify(text: string, error = false): void {
    const value = {text, error};
    setToast(value);
    setTimeout(() => setToast(current => (current === value ? null : current)), 5000);
  }

  /** Shows a transient error. */
  function fail(error: unknown): void {
    notify(errorMessage(error), true);
  }

  /** Loads the public state. */
  async function load(): Promise<void> {
    try {
      updateState(await request<PublicState>({type: 'STATE'}));
    } catch (error) {
      fail(error);
    }
  }

  /** Loads the state, then checks old mailboxes and browser sessions awaiting sign-in. */
  async function open(): Promise<void> {
    await load();
    const boxes = Object.values(state()?.mailboxes || {});
    const current = state();
    const browserSignIn = current?.accounts.some(account => account.browser && current.mailboxes[account.id]?.reauth);
    if (browserSignIn || boxes.some(box => box.checkedAt < Date.now() - 30_000)) await refresh();
  }

  /** Rechecks sign-in now and once on returning from webmail when the browser session still needs authentication. */
  async function signIn(accountID: string): Promise<void> {
    cancelSignInRetry?.();
    cancelSignInRetry = undefined;
    try {
      const value = await request<PublicState>({type: 'SIGN_IN', account: accountID});
      updateState(value);
      if (
        value.accounts.some(account => account.id === accountID && account.browser) &&
        value.mailboxes[accountID]?.reauth
      )
        cancelSignInRetry = afterReturn(() => {
          cancelSignInRetry = undefined;
          return refresh();
        });
    } catch (error) {
      fail(error);
    }
  }

  /** Checks all mailboxes now. */
  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      updateState(await request<PublicState>({type: 'CHECK'}));
    } catch (error) {
      fail(error);
    } finally {
      setRefreshing(false);
    }
  }

  /** Opens the reply editor, or the message in the webmail when the account replies there. */
  function startReply(): void {
    const entry = current();
    if (!entry) return;
    if (state()?.accounts.find(account => account.id === entry.account)?.reply) setReplying(true);
    else request({type: 'OPEN', account: entry.account, message: entry.message.id}).catch(fail);
  }

  /** Sends a reply to [entry]; returns whether it was sent. */
  async function reply(entry: Entry, text: string): Promise<boolean> {
    try {
      await request<boolean>({type: 'REPLY', account: entry.account, message: entry.message.id, text});
      invalidateThreads();
      setReplying(false);
      notify(t('reply_sent'));
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  /** Selects an entry, or clears the selection. */
  function select(entry: Entry | null): void {
    batch(() => {
      setReplying(false);
      setRetained(entry);
      setSelected(entry ? {account: entry.account, id: entry.message.id, thread: entry.message.thread} : null);
    });
  }

  /** Moves the selection by [step] in navigation order. */
  function move(step: number): void {
    const items = navigation();
    if (!items.length) return;
    const selection = selected();
    const index = items.findIndex(entry => entry.account === selection?.account && entry.message.id === selection.id);
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
    const matches = (entry: Entry): boolean => entry.account === selection.account && entry.message.id === selection.id;
    const listed = state()?.mailboxes[selection.account]?.messages.find(item => item.id === selection.id);
    const hit = results()?.find(matches);
    const open = retained();
    if (listed?.unread || hit?.message.unread || (open && matches(open) && open.message.unread)) threads.delete(key);
    let pending = threads.get(key);
    const cached = Boolean(pending);
    if (!pending) {
      pending = request<ThreadMessage[]>({
        type: 'THREAD',
        account: selection.account,
        message: selection.id,
        thread: selection.thread,
      }).catch(error => {
        if (threads.get(key) === pending) threads.delete(key);
        throw error;
      });
      threads.set(key, pending);
      if (threads.size > 30) threads.delete(threads.keys().next().value!);
    }
    const value = await pending;
    if (cached && !value.some(item => item.id === selection.id)) {
      threads.delete(key);
      return thread(selection);
    }
    const target = value.find(item => item.id === selection.id);
    if (target && !target.unread && threads.get(key) === pending)
      batch(() => {
        const currentState = state();
        const box = currentState?.mailboxes[selection.account];
        const message = box?.messages.find(item => item.id === selection.id);
        if (currentState && box && message?.unread)
          updateState({
            ...currentState,
            mailboxes: {
              ...currentState.mailboxes,
              [selection.account]: {
                ...box,
                unread: Math.max(0, box.unread - 1),
                messages: box.messages.map(item => (item.id === selection.id ? {...item, unread: false} : item)),
              },
            },
          });
        if (results())
          setResults(hits =>
            hits!.map(entry => (matches(entry) ? {...entry, message: {...entry.message, unread: false}} : entry)),
          );
        setRetained(entry =>
          entry && matches(entry) ? {...entry, message: {...entry.message, unread: false}} : entry,
        );
      });
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
    /** Matches the message even when its list entry has been replaced by a state update. */
    const matches = (item: Entry): boolean => item.account === entry.account && item.message.id === entry.message.id;
    /** Whether the action still belongs to the open message. */
    const isSelected = (): boolean => selected()?.account === entry.account && selected()?.id === entry.message.id;
    let next: Entry | null = null;
    if (leaving && isSelected()) {
      const items = navigation();
      const index = items.findIndex(matches);
      next = items[index + 1] || items[index - 1] || null;
    }
    if (leaving) setBusy(t(action === 'trash' ? 'busy_deleting' : 'busy_archiving'));
    try {
      const value = await request<PublicState>({
        type: 'ACT',
        account: entry.account,
        message: entry.message.id,
        action,
      });
      batch(() => {
        const updated = {
          ...entry,
          message: {
            ...entry.message,
            unread: action === 'unread' ? true : action === 'read' ? false : entry.message.unread,
            pinned: action === 'pin' ? true : action === 'unpin' ? false : entry.message.pinned,
          },
        };
        updateState(value);
        if (action === 'unread') threads.delete(`${entry.account}/${entry.message.thread || entry.message.id}`);
        const hits = results();
        if (hits)
          setResults(leaving ? hits.filter(hit => !matches(hit)) : hits.map(hit => (matches(hit) ? updated : hit)));
        if (isSelected()) {
          if (leaving) select(next);
          else setRetained(updated);
        }
      });
    } catch (error) {
      fail(error);
    } finally {
      if (leaving) setBusy('');
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
    threadVersion,
    expanded,
    query,
    results,
    searching,
    refreshing,
    busy,
    toast,
    replying,
    setReplying,
    startReply,
    reply,
    entries,
    list,
    unread,
    load,
    open,
    refresh,
    signIn,
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
