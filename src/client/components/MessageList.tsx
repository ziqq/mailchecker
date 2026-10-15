/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * The message list: title, search, category filter, sections, rows and notification stacks.
 *
 * @module client/components/MessageList
 */
import {createEffect, createSignal, For, Match, Show, Switch} from 'solid-js';
import {initial, senderName, shortDate} from '../../shared/format';
import {t, tn} from '../../shared/i18n';
import {accountColor, type Entry, type Filter, type Item} from '../../shared/inbox';
import {icon} from '../../shared/icons';
import {store} from '../store';
import {openSettings} from './TopBar';
import {FolderPicker} from './FolderPicker';

/** Category filter labels. */
const FILTERS: {id: Filter; label: string}[] = [
  {id: 'all', label: t('filter_all')},
  {id: 'notifications', label: t('section_notifications')},
  {id: 'newsletters', label: t('section_newsletters')},
];

/** Titles by filter. */
const TITLES: Record<Filter, string> = {
  all: t('view_inbox'),
  pinned: t('section_pinned'),
  people: t('section_people'),
  notifications: t('section_notifications'),
  newsletters: t('section_newsletters'),
};

/** A small action button that does not select the row. */
function RowAction(props: {name: string; title: string; onClick: () => void; danger?: boolean; disabled?: boolean}) {
  return (
    <button
      class="round ghost"
      classList={{danger: props.danger}}
      type="button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={event => {
        event.stopPropagation();
        props.onClick();
      }}
    >
      {icon(props.name)}
    </button>
  );
}

/** One message row. */
export function Row(props: {entry: Entry; nested?: boolean}) {
  const message = () => props.entry.message;
  const accounts = () => store.state()?.accounts || [];
  const selected = () => store.selected()?.id === message().id && store.selected()?.account === props.entry.account;
  return (
    <article
      class="row"
      classList={{read: !message().unread, nested: props.nested}}
      aria-selected={selected()}
      tabindex="0"
      data-id={message().id}
      onClick={() => store.select(props.entry)}
      onKeyDown={event => event.key === 'Enter' && store.select(props.entry)}
    >
      <span
        class="avatar"
        classList={{ringed: accounts().length > 1}}
        style={accounts().length > 1 ? {'--ring': accountColor(accounts(), props.entry.account)} : undefined}
      >
        {initial(senderName(message().from))}
      </span>
      <Show when={message().unread}>
        <span class="unread-dot" />
      </Show>
      <div class="row-body">
        <div class="row-top">
          <span class="from">{senderName(message().from)}</span>
          <span class="time">{shortDate(message().date)}</span>
        </div>
        <div class="subject">{message().subject}</div>
        <Show when={message().snippet}>
          <div class="snippet">{message().snippet}</div>
        </Show>
        <div class="row-meta">
          <Show when={message().pinned}>
            <span class="meta-icon pinned" title={t('label_pinned')}>
              {icon('pin')}
            </span>
          </Show>
          <Show when={message().attachments}>
            <span class="meta-icon" title={t('label_attachments')}>
              {icon('clip')}
            </span>
          </Show>
        </div>
      </div>
      <div class="row-actions">
        <RowAction
          name="pin"
          title={`${t(message().pinned ? 'action_unpin' : 'action_pin')} · S`}
          onClick={() => store.act(props.entry, message().pinned ? 'unpin' : 'pin')}
        />
        <RowAction
          name="unread"
          title={`${t(message().unread ? 'action_read' : 'action_unread')} · U`}
          onClick={() => store.act(props.entry, message().unread ? 'read' : 'unread')}
        />
        <RowAction
          name="archive"
          disabled={!store.canAct('archive')}
          title={`${t('action_archive')} · E`}
          onClick={() => store.act(props.entry, 'archive')}
        />
      </div>
    </article>
  );
}

/** A stack of repeated notifications. */
function Stack(props: {item: Extract<Item, {kind: 'stack'}>}) {
  const open = () => store.expanded().has(props.item.key);
  const first = () => props.item.entries[0].message;
  const unread = () => props.item.entries.filter(entry => entry.message.unread).length;
  // A collapsed stack shows the selection of any of its messages (keyboard or after an archive).
  const selected = () =>
    !open() &&
    props.item.entries.some(
      entry => store.selected()?.id === entry.message.id && store.selected()?.account === entry.account,
    );
  return (
    <div class="stack-card" classList={{open: open()}}>
      <button
        class="row stack-head"
        type="button"
        aria-selected={selected()}
        aria-expanded={open()}
        onClick={() => store.toggleStack(props.item.key)}
      >
        <Show when={unread()}>
          <span class="unread-dot" />
        </Show>
        <span class="avatar tile-avatar">{icon('layers')}</span>
        <div class="row-body">
          <div class="row-top">
            <span class="from">{senderName(first().from)}</span>
            <span class="time">{shortDate(first().date)}</span>
          </div>
          <div class="subject">{first().subject}</div>
          <div class="snippet">
            {tn('messages_count', props.item.entries.length)}
            {unread() ? ` · ${tn('unread_new', unread())}` : ''}
          </div>
        </div>
        <span class="count-badge">×{props.item.entries.length}</span>
      </button>
      <Show when={open()}>
        <div class="stack-items">
          <For each={props.item.entries}>{entry => <Row entry={entry} nested />}</For>
        </div>
      </Show>
    </div>
  );
}

/** Account errors that need attention, with a sign-in button where possible. */
function Notices() {
  const failing = () => {
    const current = store.state();
    if (!current) return [];
    return current.accounts
      .filter(account => store.account() === 'all' || store.account() === account.id)
      .map(account => ({account, box: current.mailboxes[account.id]}))
      .filter(({box}) => box?.error);
  };
  return (
    <For each={failing()}>
      {({account, box}) => (
        <div class="notice" role="alert">
          {icon('alert')}
          <span>
            <b>{account.email}</b> · {box!.error}
          </span>
          <Show when={box!.reauth && account.provider !== 'jmap'}>
            <button
              class="btn primary small"
              type="button"
              onClick={async event => {
                const button = event.currentTarget;
                button.disabled = true;
                await store.signIn(account.id);
                button.disabled = false;
              }}
            >
              {t('action_sign_in')}
            </button>
          </Show>
        </div>
      )}
    </For>
  );
}

/** The search field; searches after a short pause or on Enter. */
function SearchField() {
  const [value, setValue] = createSignal(store.query());
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    setValue(store.query());
    clearTimeout(timer);
  });
  const run = (text: string) => {
    clearTimeout(timer);
    store.search(text);
  };
  return (
    <label class="search">
      {icon('search')}
      <input
        id="search"
        type="search"
        placeholder={t('search_placeholder')}
        autocomplete="off"
        value={value()}
        onInput={event => {
          setValue(event.currentTarget.value);
          clearTimeout(timer);
          timer = setTimeout(() => run(value()), 450);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') run(value());
          if (event.key === 'Escape') {
            setValue('');
            run('');
            event.currentTarget.blur();
          }
        }}
      />
      <Show when={store.searching()} fallback={<kbd>/</kbd>}>
        <span class="spinner" />
      </Show>
    </label>
  );
}

/** The list pane. */
export function MessageList() {
  const accounts = () => store.state()?.accounts || [];
  const total = () => store.unread().all;
  const searchUnavailable = () =>
    accounts().filter(account => account.search === false || (account.search === undefined && account.browser));
  const webmailSearchOnly = () => accounts().length > 0 && searchUnavailable().length === accounts().length;
  return (
    <section class="list-pane" aria-label={t('label_messages')}>
      <header class="list-head">
        <div class="list-title">
          <FolderPicker
            title={
              store.results()
                ? t('search_title', store.query())
                : store.folder()
                  ? store.folderLabel(store.folder()!)
                  : TITLES[store.filter()]
            }
          />
          <Show when={!store.results() && total()}>
            <span
              class="pill strong"
              title={store.unreadPartial() ? t('folder_count_partial', tn('unread_new', total())) : undefined}
            >
              {tn('unread_new', total())}
            </span>
          </Show>
        </div>
        <SearchField />
        <Show when={!store.results() && !store.folder()}>
          <div class="segmented" role="tablist" aria-label={t('label_categories')}>
            <For each={FILTERS}>
              {filter => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={store.filter() === filter.id}
                  aria-pressed={store.filter() === filter.id}
                  title={
                    filter.id !== 'all' && total() > store.entries().filter(entry => entry.message.unread).length
                      ? t('folder_count_partial', tn('unread_new', store.unread()[filter.id]))
                      : undefined
                  }
                  onClick={() => store.setFilter(filter.id)}
                >
                  {filter.label}
                  <Show when={store.unread()[filter.id]}>
                    <span class="n">{store.unread()[filter.id]}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>
      </header>

      <div class="list-body">
        <Show when={store.searchError()}>
          <div class="notice" role="alert">
            {icon('alert')}
            <span>{store.searchError()}</span>
            <button
              type="button"
              class="btn small"
              disabled={store.searching()}
              onClick={() =>
                store.searchPages().some(page => page.error) ? store.searchMore(true) : store.search(store.query())
              }
            >
              {t('action_check_now')}
            </button>
          </div>
        </Show>
        <Show when={store.results() && searchUnavailable().length}>
          <p class="folder-status" role="status">
            {t(
              'search_webmail_only',
              searchUnavailable()
                .map(account => account.email)
                .join(', '),
            )}
          </p>
        </Show>
        <For each={store.searchError() ? [] : store.searchPages().filter(page => page.error)}>
          {page => (
            <div class="notice" role="alert">
              {icon('alert')}
              <span>
                <b>{accounts().find(account => account.id === page.account)?.email}</b> · {page.error}
              </span>
              <button
                type="button"
                class="btn small"
                disabled={store.searching()}
                onClick={() => store.searchMore(true)}
              >
                {t('action_check_now')}
              </button>
            </div>
          )}
        </For>
        <For each={store.searchPages().filter(page => page.limited)}>
          {page => (
            <p class="folder-status" role="status">
              {t('search_limit', accounts().find(account => account.id === page.account)?.email || '')}
            </p>
          )}
        </For>
        <Show when={!store.folder() && !store.results()}>
          <Notices />
        </Show>
        <For each={store.results() ? [] : store.folderErrors()}>
          {item => (
            <div class="notice" role="alert">
              {icon('alert')}
              <span>
                <b>{store.state()?.accounts.find(account => account.id === item.account)?.email}</b> · {item.error}
              </span>
              <button
                type="button"
                class="btn small"
                disabled={store.folderLoading() || store.catalogLoading()}
                onClick={async () => {
                  await store.loadFolders();
                  await store.loadFolder();
                }}
              >
                {t('action_check_now')}
              </button>
            </div>
          )}
        </For>
        <Switch>
          <Match when={!store.state() || (!store.results() && store.folderLoading() && !store.folderEntries().length)}>
            <div class="skeletons" aria-hidden="true">
              <For each={[1, 2, 3, 4, 5]}>{() => <div class="skeleton" />}</For>
            </div>
          </Match>
          <Match when={!accounts().length}>
            <div class="empty">
              <p class="eyebrow">{t('welcome_eyebrow')}</p>
              <h2>
                {t('welcome_title_1')}
                <span class="dot">.</span> {t('welcome_title_2')}
                <span class="dot">.</span>
              </h2>
              <p>{t('welcome_text')}</p>
              <button class="btn primary" type="button" onClick={openSettings}>
                {icon('plus')}
                {t('action_add_mailbox')}
              </button>
            </div>
          </Match>
          <Match when={store.folder() && store.folderErrors().length && !store.folderEntries().length}>
            <span />
          </Match>
          <Match when={store.searchError()}>
            <span />
          </Match>
          <Match when={store.results() && !store.results()!.length && store.searchPages().some(page => page.error)}>
            <span />
          </Match>
          <Match when={!store.list().some(section => section.items.length)}>
            <div class="empty small">
              <h2>
                {store.results()
                  ? t(webmailSearchOnly() ? 'search_webmail_title' : 'search_empty')
                  : store.folder()
                    ? t('folder_empty')
                    : t('inbox_empty')}
                <span class="dot">.</span>
              </h2>
              <Show when={(store.results() && !webmailSearchOnly()) || (!store.results() && !store.folder())}>
                <p>{store.results() ? t('search_empty_text') : t('inbox_empty_text')}</p>
              </Show>
            </div>
          </Match>
          <Match when={true}>
            <For each={store.list()}>
              {section => (
                <div class="section">
                  <Show when={store.list().length > 1 || store.results()}>
                    <div class="section-head">
                      <span class="eyebrow">{section.title}</span>
                    </div>
                  </Show>
                  <For each={section.items}>
                    {item => (item.kind === 'message' ? <Row entry={item.entry} /> : <Stack item={item} />)}
                  </For>
                </div>
              )}
            </For>
          </Match>
        </Switch>
        <Show when={store.results() && store.searchPages().some(page => !page.error && page.cursor)}>
          <button type="button" class="btn folder-more" disabled={store.searching()} onClick={() => store.searchMore()}>
            <Show when={store.searching()} fallback={t('folder_more')}>
              <span class="spinner" />
              {t('folder_loading')}
            </Show>
          </button>
        </Show>
        <Show when={!store.results() && store.folderNext().length}>
          <button
            type="button"
            class="btn folder-more"
            disabled={store.folderLoading()}
            onClick={() => store.loadFolder(true)}
          >
            <Show when={store.folderLoading()} fallback={t('folder_more')}>
              <span class="spinner" />
              {t('folder_loading')}
            </Show>
          </button>
        </Show>
      </div>
    </section>
  );
}
