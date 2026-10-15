/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Client state shared by the toolbar popup and the full-tab app.
 *
 * Holds the worker's public state, the selection, filters, search and an
 * in-memory conversation cache backed by the worker's bounded persistent mail cache.
 *
 * @module client/store
 */
import {batch, createMemo, createRoot, createSignal} from 'solid-js';
import {request, errorMessage, afterReturn} from '../shared/dom';
import {counts, merge, order, sections, type Entry, type Filter} from '../shared/inbox';
import {FOLDER_ROLES, folderName, folderPath} from '../shared/folders';
import type {
  CachedThread,
  FolderPage,
  MailFolder,
  MailMessage,
  MessageAction,
  Preferences,
  PublicState,
  SearchHit,
  SearchPage,
  SearchAccountPage,
  ThreadMessage,
} from '../shared/types';
import {t} from '../shared/i18n';

/** Where the client runs: the toolbar popup or a full browser tab. */
export const mode: 'popup' | 'app' = document.documentElement.dataset.mode === 'app' ? 'app' : 'popup';

/** A selected message. */
export interface Selection {
  account: string;
  id: string;
  thread: string;
}

/** A single account's folder, or a common system role across accounts. */
export interface FolderChoice {
  account: string;
  folder: MailFolder;
}

/** Conversation cache entries by `account/thread`. */
const threads = new Map<string, Promise<ThreadMessage[]>>();

/** Message metadata shared by Inbox and folder refreshes, excluding read and pin flags. */
const entryContents = (entries: Entry[]): string =>
  JSON.stringify(
    entries.map(({account, message: {id, thread, date, from, subject, snippet}}) => [
      account,
      id,
      thread,
      date,
      from,
      subject,
      snippet,
    ]),
  );

/** Conversation identities whose list metadata changed, including removed or moved messages. */
function changedThreads(previous: Entry[], next: Entry[]): Set<string> {
  const old = new Map(previous.map(entry => [`${entry.account}/${entry.message.id}`, entry]));
  const changed = new Set<string>();
  for (const entry of next) {
    const key = `${entry.account}/${entry.message.id}`;
    const before = old.get(key);
    if (!before || entryContents([before]) !== entryContents([entry])) {
      changed.add(`${entry.account}/${entry.message.thread || entry.message.id}`);
      if (before) changed.add(`${before.account}/${before.message.thread || before.message.id}`);
    }
    old.delete(key);
  }
  for (const entry of old.values()) changed.add(`${entry.account}/${entry.message.thread || entry.message.id}`);
  return changed;
}

/** Compares flat list records so transport clones and check timestamps keep the existing list mounted. */
function sameEntries(previous: Entry[], next: Entry[]): boolean {
  return (
    previous.length === next.length &&
    previous.every((entry, index) => {
      const item = next[index];
      const keys = Object.keys(entry.message) as (keyof MailMessage)[];
      return (
        entry.account === item.account &&
        keys.length === Object.keys(item.message).length &&
        keys.every(key => entry.message[key] === item.message[key])
      );
    })
  );
}

export const store = createRoot(() => {
  const [state, setState] = createSignal<PublicState | null>(null);
  const [account, changeAccount] = createSignal<string>('all');
  const [catalog, setCatalog] = createSignal<Record<string, MailFolder[]>>({});
  const [pendingCatalogs, setPendingCatalogs] = createSignal<ReadonlySet<string>>(new Set());
  const catalogRequests = new Map<string, Promise<void>>();
  const catalogCheckedAt = new Map<string, number>();
  const catalogLoading = createMemo(() =>
    (state()?.accounts || []).some(
      item => (account() === 'all' || item.id === account()) && pendingCatalogs().has(item.id),
    ),
  );
  const [catalogErrors, setCatalogErrors] = createSignal<{account: string; error: string}[]>([]);
  const [folder, setFolder] = createSignal<FolderChoice | null>(null);
  const [folderEntries, setFolderEntries] = createSignal<Entry[]>([]);
  const [folderLoading, setFolderLoading] = createSignal(false);
  const [folderErrors, setFolderErrors] = createSignal<{account: string; error: string}[]>([]);
  const [folderNext, setFolderNext] = createSignal<{account: string; id: string; cursor: string}[]>([]);
  /** Invalidates responses when the user changes the account or folder during loading. */
  let folderGeneration = 0;
  /** Successful mutations made while the current folder page is in flight. */
  let folderChanges: Map<string, Partial<Pick<MailMessage, 'unread' | 'pinned'>> | null> | null = null;
  /** Catalog counters are refreshed on the next opening after mail state changes, never by an alarm. */
  const dirtyCatalogs = new Set<string>();
  const [filter, setFilter] = createSignal<Filter>('all');
  const [selected, setSelected] = createSignal<Selection | null>(null);
  /** Last known metadata of the open message, retained when it leaves the Inbox feed. */
  const [retained, setRetained] = createSignal<Entry | null>(null);
  /** Refreshes the displayed conversation when its Inbox contents change or a reply is sent. */
  const [threadVersion, setThreadVersion] = createSignal(0);
  const [threadCache, setThreadCache] = createSignal<{
    key: string;
    fetchedAt: number;
    refreshing: boolean;
    error: string;
  } | null>(null);
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<Entry[] | null>(null);
  const [searching, setSearching] = createSignal(false);
  const [searchError, setSearchError] = createSignal('');
  const [searchPages, setSearchPages] = createSignal<SearchAccountPage[]>([]);
  let searchChanges: Map<string, Partial<Pick<MailMessage, 'unread' | 'pinned'>> | null> | null = null;
  /** Identifies the latest search even when query text repeats. */
  let searchGeneration = 0;
  const [refreshing, setRefreshing] = createSignal(false);
  const [toast, setToast] = createSignal<{text: string; error: boolean} | null>(null);
  /** The reply editor is open for the selected message. */
  const [replying, setReplying] = createSignal(false);
  /** The archive or trash in progress, shown over the window; empty when idle. */
  const [busy, setBusy] = createSignal('');
  /** Cancels a pending browser-session check when another sign-in starts. */
  let cancelSignInRetry: (() => void) | undefined;

  /** Inbox entries and counts stay separate from on-demand folder pages. */
  const inboxEntries = createMemo(
    () => {
      const current = state();
      return current ? merge(current.accounts, current.mailboxes, account()) : [];
    },
    [],
    {equals: sameEntries},
  );
  const inboxUnread = createMemo(() => ({
    ...counts(inboxEntries()),
    all: (state()?.accounts || [])
      .filter(item => account() === 'all' || item.id === account())
      .reduce((sum, item) => sum + (state()?.mailboxes[item.id]?.unread || 0), 0),
  }));

  /** Entries in the selected folder, or in the selected account(s)' Inbox. */
  const entries = createMemo(() => {
    if (folder()) return folderEntries();
    return inboxEntries();
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
    if (folder())
      return [
        {
          id: 'inbox' as const,
          title: folderName(folder()!.folder),
          items: entries().map(entry => ({kind: 'message' as const, entry})),
        },
      ];
    return sections(entries(), filter());
  });

  /** Unread counts per filter. */
  const unread = createMemo(() =>
    folder() ? {...counts(entries()), all: folder()!.folder.unread ?? counts(entries()).all} : inboxUnread(),
  );

  /** Loaded category counts and unknown folder totals are explicitly presented as lower bounds. */
  const unreadPartial = createMemo(() =>
    folder()
      ? folder()!.folder.unread == null || folder()!.folder.partial === true
      : (state()?.accounts || []).some(
          item => (account() === 'all' || item.id === account()) && state()?.mailboxes[item.id]?.unreadPartial,
        ),
  );

  /** Keyboard navigation order. */
  const navigation = createMemo(() => order(list(), expanded()));

  /** The selected entry, independent of visible filters and unread-only Inbox feeds. */
  const current = createMemo(() => {
    const selection = selected();
    const value = state();
    if (!selection || !value?.accounts.some(account => account.id === selection.account)) return null;
    const listed = navigation().find(entry => entry.account === selection.account && entry.message.id === selection.id);
    if (folder() && listed) return listed;
    const message = value.mailboxes[selection.account]?.messages.find(message => message.id === selection.id);
    if (message) return listed?.message === message ? listed : {account: selection.account, message};
    return listed || retained();
  });

  /** Folder choices for the selected mailbox; common roles never merge custom folders by name. */
  const folderChoices = createMemo<FolderChoice[]>(() => {
    const id = account();
    const value = catalog();
    const failed = new Set(catalogErrors().map(error => error.account));
    if (id !== 'all') return (value[id] || []).map(folder => ({account: id, folder}));
    const connected = state()?.accounts || [];
    const roles = FOLDER_ROLES.filter(role =>
      connected.some(item => value[item.id]?.some(folder => folder.role === role)),
    );
    return [
      ...roles.map(role => {
        const folders = connected.flatMap(item => (value[item.id] || []).filter(folder => folder.role === role));
        const complete = connected.every(item => value[item.id] && !failed.has(item.id));
        const counted = folders.filter(folder => folder.total != null);
        const partial = !complete || counted.length !== folders.length;
        const approximate = counted.some(folder => folder.approximate);
        return {
          account: 'all',
          folder: {
            id: role,
            name: '',
            role,
            total:
              counted.length && !(partial && approximate)
                ? counted.reduce((sum, folder) => sum + folder.total!, 0)
                : undefined,
            unread:
              complete && folders.every(folder => folder.unread != null)
                ? folders.reduce((sum, folder) => sum + folder.unread!, 0)
                : undefined,
            approximate: approximate || undefined,
            partial: partial || undefined,
          },
        };
      }),
      ...(state()?.accounts || []).flatMap(item =>
        (value[item.id] || []).filter(folder => !folder.role).map(folder => ({account: item.id, folder})),
      ),
    ];
  });

  /** Names a selected folder with its server parent path. */
  function folderLabel(choice: FolderChoice): string {
    return folderPath(choice.folder, catalog()[choice.account] || []);
  }

  /** Keeps folder browsing from introducing permanent deletion or re-archiving an archived message. */
  function canAct(action: MessageAction): boolean {
    const role = results() ? undefined : folder()?.folder.role;
    if (action === 'trash' && role === 'trash') return false;
    if (action === 'archive' && (role === 'archive' || role === 'trash' || role === 'drafts')) return false;
    return true;
  }

  /** Switches the mailbox and returns to its Inbox without fetching other folders. */
  function setAccount(id: string): void {
    folderGeneration++;
    searchGeneration++;
    searchChanges = null;
    folderChanges = null;
    batch(() => {
      changeAccount(id);
      setFolder(null);
      setFolderEntries([]);
      setFolderNext([]);
      setFolderLoading(false);
      setFolderErrors([]);
      setResults(null);
      setSearchPages([]);
      setQuery('');
      setSearching(false);
      setSearchError('');
      select(null);
    });
  }

  /** Fetches only missing folder catalogs when the selector is opened. */
  async function loadFolders(): Promise<void> {
    const accounts = (state()?.accounts || []).filter(
      item =>
        (account() === 'all' || item.id === account()) &&
        (catalogRequests.has(item.id) ||
          !catalog()[item.id] ||
          dirtyCatalogs.has(item.id) ||
          Date.now() - (catalogCheckedAt.get(item.id) || 0) > 30_000),
    );
    await Promise.all(
      accounts.map(item => {
        const active = catalogRequests.get(item.id);
        if (active) return active;
        dirtyCatalogs.delete(item.id);
        const pending = (async () => {
          try {
            const folders = await request<MailFolder[]>({type: 'FOLDERS', account: item.id});
            setCatalog(value => ({...value, [item.id]: folders}));
            catalogCheckedAt.set(item.id, Date.now());
            setCatalogErrors(errors => errors.filter(error => error.account !== item.id));
            reconcileFolder();
          } catch (error) {
            dirtyCatalogs.add(item.id);
            setCatalogErrors(errors => [
              ...errors.filter(error => error.account !== item.id),
              {account: item.id, error: errorMessage(error)},
            ]);
            const choice = folder();
            if (choice && (choice.account === 'all' || choice.account === item.id))
              setFolder({...choice, folder: {...choice.folder, unread: undefined, partial: true}});
          } finally {
            catalogRequests.delete(item.id);
            setPendingCatalogs(new Set(catalogRequests.keys()));
          }
        })();
        catalogRequests.set(item.id, pending);
        setPendingCatalogs(new Set(catalogRequests.keys()));
        return pending;
      }),
    );
  }

  /** Rebinds the active folder to freshly loaded server counters, including common roles. */
  function reconcileFolder(): void {
    const choice = folder();
    if (!choice) return;
    const latest = folderChoices().find(item => item.account === choice.account && item.folder.id === choice.folder.id);
    if (latest) setFolder(latest);
  }

  /** Loads the selected folder or the next pages, retaining successful accounts when another fails. */
  async function loadFolder(more = false): Promise<void> {
    const selectedFolder = folder();
    if (!selectedFolder || folderLoading() || results()) return;
    const generation = ++folderGeneration;
    folderChanges = new Map();
    const targets = more
      ? folderNext()
      : selectedFolder.account === 'all'
        ? (state()?.accounts || []).flatMap(item =>
            (catalog()[item.id] || [])
              .filter(folder => folder.role === selectedFolder.folder.role)
              .map(folder => ({account: item.id, id: folder.id, cursor: ''})),
          )
        : [{account: selectedFolder.account, id: selectedFolder.folder.id, cursor: ''}];
    setFolderLoading(true);
    const errors: {account: string; error: string}[] = [];
    const next: {account: string; id: string; cursor: string}[] = [];
    const pages = await Promise.all(
      targets.map(async target => {
        try {
          const page = await request<FolderPage>({
            type: 'FOLDER',
            account: target.account,
            folder: target.id,
            cursor: target.cursor,
          });
          if (page.next) next.push({...target, cursor: page.next});
          return page.messages.map(message => ({account: target.account, message}));
        } catch (error) {
          errors.push({account: target.account, error: errorMessage(error)});
          if (more) next.push(target);
          return [];
        }
      }),
    );
    if (generation !== folderGeneration) return;
    batch(() => {
      const unique = new Map(
        (more ? [...folderEntries(), ...pages.flat()] : pages.flat()).map(entry => [
          `${entry.account}/${entry.message.id}`,
          entry,
        ]),
      );
      for (const [key, change] of folderChanges || []) {
        if (change === null) unique.delete(key);
        else {
          const entry = unique.get(key);
          if (entry) unique.set(key, {...entry, message: {...entry.message, ...change}});
        }
      }
      folderChanges = null;
      const entries = [...unique.values()].sort((a, b) => b.message.date - a.message.date);
      if (!more) invalidateThreads(changedThreads(folderEntries(), entries));
      setFolderEntries(entries);
      setFolderNext(next);
      setFolderErrors(errors);
      setFolderLoading(false);
    });
  }

  /** Opens a folder from the selector; null keeps the account's existing Inbox view. */
  async function chooseFolder(value: FolderChoice | null): Promise<void> {
    folderGeneration++;
    searchGeneration++;
    searchChanges = null;
    folderChanges = null;
    batch(() => {
      if (value) changeAccount(value.account);
      setFolder(value?.folder.role === 'inbox' ? null : value);
      setFolderEntries([]);
      setFolderNext([]);
      setFolderErrors([]);
      setFolderLoading(false);
      setResults(null);
      setSearchPages([]);
      setQuery('');
      setSearching(false);
      setSearchError('');
      setFilter('all');
      select(null);
    });
    if (folder()) await loadFolder();
  }

  /** Overlays successful actions on in-flight list responses that may describe the old server state. */
  function rememberListChange(
    account: string,
    id: string,
    change: Partial<Pick<MailMessage, 'unread' | 'pinned'>> | null,
  ): void {
    const key = `${account}/${id}`;
    for (const changes of [folderChanges, searchChanges]) {
      if (!changes) continue;
      const previous = changes.get(key);
      changes.set(key, previous === null || change === null ? null : {...previous, ...change});
    }
  }

  /** Keeps known folder totals consistent with successful local reads and moves until the next catalog refresh. */
  function updateFolderCounts(account: string, id: string, unread: boolean | undefined, leaving = false): void {
    const choice = folder();
    const item = folderEntries().find(entry => entry.account === account && entry.message.id === id);
    if (!choice || !item) return;
    const difference = leaving
      ? -Number(item.message.unread)
      : unread == null
        ? 0
        : Number(unread) - Number(item.message.unread);
    if (!difference && !leaving) return;
    /** Adjusts only authoritative numbers; missing counts remain unknown. */
    const adjust = (value: MailFolder): MailFolder => ({
      ...value,
      unread: value.unread == null ? undefined : Math.max(0, value.unread + difference),
      total: value.total == null ? undefined : Math.max(0, value.total - Number(leaving)),
    });
    setFolder({...choice, folder: adjust(choice.folder)});
    setCatalog(value => ({
      ...value,
      [account]: (value[account] || []).map(folder =>
        folder.id === (item.message.folder || choice.folder.id) ? adjust(folder) : folder,
      ),
    }));
  }

  /** Updates public state while retaining the open message's most recent metadata. */
  function updateState(value: PublicState): void {
    batch(() => {
      const before = state();
      if (before) {
        /** Flattens only bounded Inbox metadata for per-conversation invalidation. */
        const entries = (state: PublicState): Entry[] =>
          Object.entries(state.mailboxes).flatMap(([account, box]) =>
            box.messages.map(message => ({account, message})),
          );
        invalidateThreads(changedThreads(entries(before), entries(value)));
      }
      for (const item of value.accounts) {
        const previous = before?.mailboxes[item.id];
        const next = value.mailboxes[item.id];
        if (
          previous &&
          (previous.unread !== next?.unread ||
            previous.messages.map(item => item.id).join('\0') !== next?.messages.map(item => item.id).join('\0'))
        )
          dirtyCatalogs.add(item.id);
      }
      setRetained(current());
      setState(value);
    });
  }

  /** Drops only affected conversations and refreshes the reader only when its own key changed. */
  function invalidateThreads(keys: ReadonlySet<string>): void {
    for (const key of keys) threads.delete(key);
    const selection = selected();
    if (selection && keys.has(`${selection.account}/${selection.thread || selection.id}`))
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
      if (results()) await search(query());
      else if (folder()) {
        const choice = folder()!;
        for (const item of state()?.accounts || [])
          if (choice.account === 'all' || choice.account === item.id) dirtyCatalogs.add(item.id);
        setFolder({...choice, folder: {...choice.folder, unread: undefined, partial: true}});
        await loadFolders();
        await loadFolder();
      }
    } catch (error) {
      fail(error);
    } finally {
      const cached = threadCache();
      if (cached?.error && !cached.refreshing) invalidateThreads(new Set([cached.key]));
      setRefreshing(false);
    }
  }

  /** Opens the reply editor, or the message in the webmail when the account replies there. */
  function startReply(): void {
    const entry = current();
    if (!entry) return;
    if (state()?.accounts.find(account => account.id === entry.account)?.reply) setReplying(true);
    else request({type: 'OPEN', account: entry.account, message: entry.message.id, entry: entry.message}).catch(fail);
  }

  /** Sends a reply to [entry]; returns whether it was sent. */
  async function reply(entry: Entry, text: string): Promise<boolean> {
    try {
      await request<boolean>({
        type: 'REPLY',
        account: entry.account,
        message: entry.message.id,
        text,
        entry: entry.message,
      });
      invalidateThreads(new Set([`${entry.account}/${entry.message.thread || entry.message.id}`]));
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

  /** Reconciles read flags only after the provider has acknowledged them. */
  function confirmRead(selection: Selection, value: ThreadMessage[]): void {
    const matches = (entry: Entry): boolean => entry.account === selection.account && entry.message.id === selection.id;
    const target = value.find(item => item.id === selection.id);
    if (target && !target.unread)
      batch(() => {
        rememberListChange(selection.account, selection.id, {unread: false});
        updateFolderCounts(selection.account, selection.id, false);
        dirtyCatalogs.add(selection.account);
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
        setFolderEntries(entries =>
          entries.map(entry => (matches(entry) ? {...entry, message: {...entry.message, unread: false}} : entry)),
        );
        setRetained(entry =>
          entry && matches(entry) ? {...entry, message: {...entry.message, unread: false}} : entry,
        );
      });
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
    const folderEntry = folderEntries().find(matches);
    const open = retained();
    if (
      listed?.unread ||
      hit?.message.unread ||
      folderEntry?.message.unread ||
      (open && matches(open) && open.message.unread)
    )
      threads.delete(key);
    let fromCache = false;
    let pending = threads.get(key);
    const cached = Boolean(pending);
    if (!pending) {
      const network = request<ThreadMessage[]>({
        type: 'THREAD',
        account: selection.account,
        message: selection.id,
        thread: selection.thread,
        entry: folderEntry?.message || (open && matches(open) ? open.message : undefined),
      });
      network.catch(() => {});
      pending = (async () => {
        const saved = await request<CachedThread | null>({
          type: 'CACHED_THREAD',
          account: selection.account,
          message: selection.id,
          thread: selection.thread,
        }).catch(() => null);
        if (!saved || !Array.isArray(saved.messages) || !saved.messages.some(item => item.id === selection.id)) {
          setThreadCache(value => (value?.key === key ? null : value));
          return network;
        }
        fromCache = true;
        setThreadCache({key, fetchedAt: saved.fetchedAt, refreshing: true, error: ''});
        network
          .then(value => {
            if (threads.get(key) !== pending) return;
            const stable = value.map((item, index) => {
              const previous = saved.messages[index];
              if (
                previous &&
                JSON.stringify({...item, unread: false}) === JSON.stringify({...previous, unread: false})
              ) {
                // A confirmed read flag alone must not replace the mounted message/frame.
                previous.unread = item.unread;
                return previous;
              }
              return item;
            });
            threads.set(key, Promise.resolve(stable));
            confirmRead(selection, stable);
            setThreadCache(value => (value?.key === key ? null : value));
            if (selected()?.account === selection.account && selected()?.id === selection.id)
              setThreadVersion(version => version + 1);
          })
          .catch(error => {
            if (threads.get(key) === pending)
              setThreadCache({key, fetchedAt: saved.fetchedAt, refreshing: false, error: errorMessage(error)});
          });
        return saved.messages;
      })().catch(error => {
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
    if (!fromCache && threadCache()?.key !== key && threads.get(key) === pending) confirmRead(selection, value);
    return value;
  }

  /**
   * Applies an action; archive and trash move the selection to the next message.
   *
   * @param entry The message.
   * @param action The action.
   */
  async function act(entry: Entry, action: MessageAction): Promise<void> {
    if (!canAct(action)) return;
    const moving = action === 'archive' || action === 'trash';
    const provider = state()?.accounts.find(item => item.id === entry.account)?.provider;
    const retainsFolder = folder() && (provider === 'gmail' || provider === 'jmap');
    const leaving = action === 'trash' || (action === 'archive' && !results() && !retainsFolder);
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
    if (moving) setBusy(t(action === 'trash' ? 'busy_deleting' : 'busy_archiving'));
    try {
      let value = await request<PublicState>({
        type: 'ACT',
        account: entry.account,
        message: entry.message.id,
        action,
        entry: entry.message,
      });
      batch(() => {
        const change: Partial<Pick<MailMessage, 'unread' | 'pinned'>> =
          action === 'read' || action === 'unread'
            ? {unread: action === 'unread'}
            : action === 'pin' || action === 'unpin'
              ? {pinned: action === 'pin'}
              : {};
        /** Changes only the confirmed fields of the latest entry, preserving concurrent actions. */
        const update = (item: Entry): Entry => ({...item, message: {...item.message, ...change}});
        const latest = state()?.mailboxes[entry.account]?.messages.find(item => item.id === entry.message.id);
        const box = value.mailboxes[entry.account];
        const returned = box?.messages.find(item => item.id === entry.message.id);
        if (!moving && latest && box && returned) {
          const updated = {...returned, unread: latest.unread, pinned: latest.pinned, ...change};
          value = {
            ...value,
            mailboxes: {
              ...value.mailboxes,
              [entry.account]: {
                ...box,
                unread: Math.max(0, box.unread + Number(updated.unread) - Number(returned.unread)),
                messages: box.messages.map(item => (item.id === latest.id ? updated : item)),
              },
            },
          };
        }
        updateState(value);
        dirtyCatalogs.add(entry.account);
        updateFolderCounts(
          entry.account,
          entry.message.id,
          action === 'read' ? false : action === 'unread' ? true : undefined,
          leaving,
        );
        rememberListChange(entry.account, entry.message.id, leaving ? null : change);
        setFolderEntries(entries =>
          leaving ? entries.filter(item => !matches(item)) : entries.map(item => (matches(item) ? update(item) : item)),
        );
        if (action === 'unread') threads.delete(`${entry.account}/${entry.message.thread || entry.message.id}`);
        const hits = results();
        if (hits)
          setResults(leaving ? hits.filter(hit => !matches(hit)) : hits.map(hit => (matches(hit) ? update(hit) : hit)));
        if (isSelected()) {
          if (leaving) select(next);
          else setRetained(item => update(item && matches(item) ? item : entry));
        }
      });
    } catch (error) {
      fail(error);
    } finally {
      if (moving) setBusy('');
    }
  }

  /** Applies one search response without losing successful pages from other accounts. */
  function acceptSearch(value: SearchPage | SearchHit[], append: boolean): void {
    const hits = Array.isArray(value) ? value : value.hits;
    const pages = Array.isArray(value) ? [] : value.pages;
    const next = new Map((append ? results() || [] : []).map(entry => [`${entry.account}/${entry.message.id}`, entry]));
    for (const hit of hits) {
      const key = `${hit.account}/${hit.message.id}`;
      if (!append || !next.has(key)) next.set(key, hit);
    }
    for (const [key, change] of searchChanges || []) {
      const entry = next.get(key);
      if (change === null) next.delete(key);
      else if (entry) next.set(key, {...entry, message: {...entry.message, ...change}});
    }
    const statuses = new Map((append ? searchPages() : []).map(page => [page.account, page]));
    for (const page of pages) statuses.set(page.account, page);
    const supported = [...statuses.values()].filter(page => !page.unsupported);
    batch(() => {
      setResults([...next.values()].sort((a, b) => b.message.date - a.message.date));
      setSearchPages([...statuses.values()]);
      setSearchError(
        !next.size && supported.length && supported.every(page => page.error)
          ? supported
              .map(
                page => `${state()?.accounts.find(account => account.id === page.account)?.email || ''}: ${page.error}`,
              )
              .join(' · ')
          : '',
      );
    });
  }

  /** Runs a server search across all accounts; an empty query returns to the Inbox. */
  async function search(text: string): Promise<void> {
    const generation = ++searchGeneration;
    setQuery(text);
    setSearchError('');
    setSearchPages([]);
    searchChanges = null;
    if (!text.trim()) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchChanges = new Map();
    try {
      const value = await request<SearchPage | SearchHit[]>({type: 'SEARCH', query: text, pages: []});
      if (generation === searchGeneration) acceptSearch(value, false);
    } catch (error) {
      if (generation === searchGeneration)
        batch(() => {
          setResults([]);
          setSearchError(errorMessage(error));
        });
    } finally {
      if (generation === searchGeneration) {
        setSearching(false);
        searchChanges = null;
      }
    }
  }

  /** Loads the next successful account pages, or retries only the failed accounts. */
  async function searchMore(retry = false): Promise<void> {
    if (searching()) return;
    const pages = searchPages().filter(page => !page.unsupported && (retry ? page.error : !page.error && page.cursor));
    if (!pages.length) return;
    const generation = searchGeneration;
    setSearching(true);
    searchChanges = new Map();
    try {
      const value = await request<SearchPage>({
        type: 'SEARCH',
        query: query(),
        pages: pages.map(({account, cursor}) => ({account, cursor})),
      });
      if (generation === searchGeneration) acceptSearch(value, true);
    } catch (error) {
      if (generation === searchGeneration) {
        const failed = new Set(pages.map(page => page.account));
        acceptSearch(
          {
            hits: [],
            pages: searchPages().map(page => (failed.has(page.account) ? {...page, error: errorMessage(error)} : page)),
          },
          true,
        );
      }
    } finally {
      if (generation === searchGeneration) {
        setSearching(false);
        searchChanges = null;
      }
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
    folder,
    folderChoices,
    folderLabel,
    folderEntries,
    folderLoading,
    folderErrors: () => [...folderErrors(), ...(folder()?.account === 'all' ? catalogErrors() : [])],
    folderNext,
    catalogLoading,
    catalogErrors: () => catalogErrors().filter(item => account() === 'all' || item.account === account()),
    loadFolders,
    chooseFolder,
    loadFolder,
    filter,
    setFilter,
    selected,
    current,
    threadVersion,
    threadCache,
    expanded,
    query,
    results,
    searching,
    searchError,
    searchPages,
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
    unreadPartial,
    inboxUnread,
    load,
    open,
    refresh,
    signIn,
    select,
    move,
    toggleStack,
    thread,
    act,
    canAct,
    search,
    searchMore,
    savePreferences,
    fail,
  };
});
