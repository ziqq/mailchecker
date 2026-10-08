/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Mail client entry point for the toolbar popup (`popup.html`) and the
 * full-tab app (`app.html`).
 *
 * One responsive layout serves both: three columns in wide tabs, list and
 * reader in the popup and medium widths, and a single column that switches
 * between list and reader on narrow screens (including Safari on iOS).
 *
 * @module client/index
 */
import {createEffect, onCleanup, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {applyTheme} from '../shared/dom';
import {MessageList} from './components/MessageList';
import {Reader} from './components/Reader';
import {Sidebar} from './components/Sidebar';
import {TopBar} from './components/TopBar';
import {mode, store} from './store';

/** Set by the build: `true` only in the sandbox build, which has no extension APIs. */
declare const __SANDBOX__: boolean;

/** Keyboard shortcuts; ignored while typing. */
function onKey(event: KeyboardEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const entry = store.current();
  switch (event.key) {
    case 'j':
    case 'ArrowDown':
      store.move(1);
      break;
    case 'k':
    case 'ArrowUp':
      store.move(-1);
      break;
    case 'e':
      if (entry) store.act(entry, 'archive');
      break;
    case '#':
    case 'Delete':
      if (entry) store.act(entry, 'trash');
      break;
    case 'u':
      if (entry) store.act(entry, entry.message.unread ? 'read' : 'unread');
      break;
    case 's':
      if (entry) store.act(entry, entry.message.pinned ? 'unpin' : 'pin');
      break;
    case '/':
      document.getElementById('search')?.focus();
      break;
    case 'Escape':
      if (store.selected()) store.select(null);
      else return;
      break;
    default:
      return;
  }
  event.preventDefault();
  if (event.key !== '/' && event.key !== 'Escape')
    document.querySelector<HTMLElement>('.row[aria-selected="true"]')?.scrollIntoView({block: 'nearest'});
}

/** The client layout. */
function App() {
  createEffect(() => {
    const preferences = store.state()?.preferences;
    if (preferences) applyTheme(preferences);
  });
  onMount(() => {
    store.load();
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
    if (__SANDBOX__) return;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && (changes.mailboxes || changes.accounts || changes.preferences)) store.load();
    };
    chrome.storage.onChanged.addListener(listener);
    onCleanup(() => chrome.storage.onChanged.removeListener(listener));
  });
  return (
    <div class="app" data-mode={mode} data-view={store.selected() ? 'reader' : 'list'}>
      <TopBar />
      <Sidebar />
      <MessageList />
      <Reader />
      <Show when={store.toast()}>
        <div class="toast" role="alert">
          {store.toast()}
        </div>
      </Show>
    </div>
  );
}

// A popup on a phone-sized screen (Safari on iOS) fills the screen instead of a fixed 780×600 window.
if (mode === 'popup' && Math.min(screen.width, screen.height) < 820 && matchMedia('(pointer: coarse)').matches)
  document.documentElement.dataset.narrow = 'true';

render(() => <App />, document.getElementById('root')!);
