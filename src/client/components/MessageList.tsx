/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * The message list: title, search, category filter, sections, rows and notification stacks.
 *
 * @module client/components/MessageList
 */
import {createSignal, For, Match, Show, Switch} from 'solid-js';
import {request} from '../../shared/dom';
import {initial, plural, senderName, shortDate} from '../../shared/format';
import {accountColor, type Entry, type Filter, type Item} from '../../shared/inbox';
import {icon} from '../../shared/icons';
import {store} from '../store';
import {openSettings} from './TopBar';

/** Category filter labels. */
const FILTERS: {id: Filter; label: string}[] = [
  {id: 'all', label: 'Все'},
  {id: 'notifications', label: 'Уведомления'},
  {id: 'newsletters', label: 'Рассылки'},
];

/** Titles by filter. */
const TITLES: Record<Filter, string> = {
  all: 'Входящие',
  pinned: 'Закреплённые',
  people: 'Личные',
  notifications: 'Уведомления',
  newsletters: 'Рассылки',
};

/** A small action button that does not select the row. */
function RowAction(props: {name: string; title: string; onClick: () => void; danger?: boolean}) {
  return (
    <button
      class="round ghost"
      classList={{danger: props.danger}}
      type="button"
      title={props.title}
      aria-label={props.title}
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
      <Show when={message().unread}>
        <span class="unread-dot" />
      </Show>
      <span class="avatar">{initial(senderName(message().from))}</span>
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
          <Show when={accounts().length > 1}>
            <span class="account-dot" style={{background: accountColor(accounts(), props.entry.account)}} />
          </Show>
          <Show when={message().pinned}>
            <span class="meta-icon pinned" title="Закреплено">
              {icon('pin')}
            </span>
          </Show>
          <Show when={message().attachments}>
            <span class="meta-icon" title="Есть вложения">
              {icon('clip')}
            </span>
          </Show>
        </div>
      </div>
      <div class="row-actions">
        <RowAction
          name="pin"
          title={message().pinned ? 'Открепить · S' : 'Закрепить · S'}
          onClick={() => store.act(props.entry, message().pinned ? 'unpin' : 'pin')}
        />
        <RowAction
          name="unread"
          title={message().unread ? 'Прочитано · U' : 'Непрочитано · U'}
          onClick={() => store.act(props.entry, message().unread ? 'read' : 'unread')}
        />
        <RowAction name="archive" title="В архив · E" onClick={() => store.act(props.entry, 'archive')} />
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
            {props.item.entries.length} {plural(props.item.entries.length, ['письмо', 'письма', 'писем'])}
            {unread() ? ` · ${unread()} новых` : ''}
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
              onClick={() => request({type: 'SIGN_IN', account: account.id}).then(() => store.load(), store.fail)}
            >
              Войти
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
        placeholder="Поиск по всем ящикам"
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
  return (
    <section class="list-pane" aria-label="Письма">
      <header class="list-head">
        <div class="list-title">
          <h1>
            {store.results() ? `«${store.query()}»` : TITLES[store.filter()]}
            <span class="dot">.</span>
          </h1>
          <Show when={!store.results() && total()}>
            <span class="pill strong">
              {total()} {plural(total(), ['новое', 'новых', 'новых'])}
            </span>
          </Show>
        </div>
        <SearchField />
        <Show when={!store.results()}>
          <div class="segmented" role="tablist" aria-label="Категории">
            <For each={FILTERS}>
              {filter => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={store.filter() === filter.id}
                  aria-pressed={store.filter() === filter.id}
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
        <Notices />
        <Switch>
          <Match when={!store.state()}>
            <div class="skeletons" aria-hidden="true">
              <For each={[1, 2, 3, 4, 5]}>{() => <div class="skeleton" />}</For>
            </div>
          </Match>
          <Match when={!accounts().length}>
            <div class="empty">
              <p class="eyebrow">Почта в браузере</p>
              <h2>
                Вся почта<span class="dot">.</span> Сразу<span class="dot">.</span>
              </h2>
              <p>Подключите Gmail, Microsoft 365 или JMAP-ящик на любом домене.</p>
              <button class="btn primary" type="button" onClick={openSettings}>
                {icon('plus')}Добавить ящик
              </button>
            </div>
          </Match>
          <Match when={!store.list().length}>
            <div class="empty small">
              <h2>
                {store.results() ? 'Ничего не нашлось' : 'Всё разобрано'}
                <span class="dot">.</span>
              </h2>
              <p>{store.results() ? 'Попробуйте другой запрос.' : 'Новых писем здесь нет.'}</p>
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
      </div>
    </section>
  );
}
