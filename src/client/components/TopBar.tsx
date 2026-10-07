/**
 * The compact header: logo, account switcher and global actions.
 *
 * Shown in the popup and in narrow tabs; wide tabs use the sidebar instead.
 *
 * @module client/components/TopBar
 */
import {createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {request} from '../../shared/dom';
import {accountColor} from '../../shared/inbox';
import {icon} from '../../shared/icons';
import {themes} from '../../shared/preferences';
import {mode, store} from '../store';

/** Theme button titles. */
const THEME_TITLES = {auto: 'Тема: как в системе', light: 'Тема: светлая', dark: 'Тема: тёмная'};

/** Cycles the theme preference. */
export function cycleTheme(): void {
  const theme = store.state()?.preferences.theme || 'auto';
  store.savePreferences({theme: themes[(themes.indexOf(theme) + 1) % themes.length]});
}

/** Opens Settings; the popup closes itself. */
export function openSettings(): void {
  request({type: 'OPTIONS'}).then(() => mode === 'popup' && window.close(), store.fail);
}

/** The account selector with unread counts. */
export function AccountSwitcher() {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;
  const close = (event: MouseEvent) => {
    if (!root.contains(event.target as Node)) setOpen(false);
  };
  onMount(() => document.addEventListener('click', close));
  onCleanup(() => document.removeEventListener('click', close));

  const accounts = () => store.state()?.accounts || [];
  const label = () => {
    const id = store.account();
    const account = accounts().find(item => item.id === id);
    return account ? account.email : 'Все ящики';
  };
  const choose = (id: string) => {
    store.setAccount(id);
    store.select(null);
    setOpen(false);
  };

  return (
    <div class="switcher-wrap" ref={root}>
      <button
        class="switcher"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <span class="stack">
          <For each={accounts().slice(0, 3)}>
            {account => <span class="account-dot big" style={{background: accountColor(accounts(), account.id)}} />}
          </For>
        </span>
        <span class="switcher-label">{label()}</span>
        {icon('chevron')}
      </button>
      <Show when={open()}>
        <div class="menu" role="menu">
          <button
            class="menu-item"
            role="menuitemradio"
            aria-checked={store.account() === 'all'}
            onClick={() => choose('all')}
          >
            {icon('inbox')}
            <span>Все ящики</span>
            <span class="menu-count">{store.unread().all || ''}</span>
          </button>
          <For each={accounts()}>
            {account => (
              <button
                class="menu-item"
                role="menuitemradio"
                aria-checked={store.account() === account.id}
                onClick={() => choose(account.id)}
              >
                <span class="account-dot" style={{background: accountColor(accounts(), account.id)}} />
                <span>{account.email}</span>
                <span class="menu-count">{store.state()?.mailboxes[account.id]?.unread || ''}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** Refresh button with a spinning icon while checking. */
export function RefreshButton(props: {class?: string}) {
  return (
    <button
      class={props.class || 'round ghost'}
      classList={{busy: store.refreshing()}}
      type="button"
      title="Проверить сейчас"
      aria-label="Проверить сейчас"
      disabled={store.refreshing()}
      onClick={() => store.refresh()}
    >
      {icon('refresh')}
    </button>
  );
}

/** The compact header. */
export function TopBar() {
  const expand = () => request({type: 'OPEN_APP'}).then(() => window.close(), store.fail);
  return (
    <header class="topbar">
      <span class="logo">
        mailchecker<span class="dot">.</span>
      </span>
      <Show when={(store.state()?.accounts.length || 0) > 1}>
        <AccountSwitcher />
      </Show>
      <span class="spacer" />
      <RefreshButton />
      <button
        class="round ghost"
        type="button"
        title={THEME_TITLES[store.state()?.preferences.theme || 'auto']}
        aria-label="Сменить тему"
        onClick={cycleTheme}
      >
        {icon('theme')}
      </button>
      <Show when={mode === 'popup'}>
        <button
          class="round ghost"
          type="button"
          title="Открыть во весь экран"
          aria-label="Открыть во весь экран"
          onClick={expand}
        >
          {icon('expand')}
        </button>
      </Show>
      <button class="round ghost" type="button" title="Настройки" aria-label="Настройки" onClick={openSettings}>
        {icon('settings')}
      </button>
    </header>
  );
}
