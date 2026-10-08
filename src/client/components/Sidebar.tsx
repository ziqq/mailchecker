/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * The wide-layout sidebar: views, accounts and global actions.
 *
 * @module client/components/Sidebar
 */
import {For} from 'solid-js';
import {accountColor, type Filter} from '../../shared/inbox';
import {icon} from '../../shared/icons';
import {store} from '../store';
import {cycleTheme, openSettings, RefreshButton} from './TopBar';

/** Sidebar views. */
const VIEWS: {filter: Filter; label: string; icon: string}[] = [
  {filter: 'all', label: 'Входящие', icon: 'inbox'},
  {filter: 'pinned', label: 'Закреплённые', icon: 'pin'},
];

/** Renders the sidebar. */
export function Sidebar() {
  const accounts = () => store.state()?.accounts || [];
  const pick = (filter: Filter) => {
    store.setFilter(filter);
    store.search('');
  };
  const pickAccount = (id: string) => {
    store.setAccount(id);
    store.select(null);
  };
  return (
    <aside class="sidebar">
      <span class="logo">
        mailchecker<span class="dot">.</span>
      </span>
      <nav class="nav" aria-label="Разделы">
        <For each={VIEWS}>
          {view => (
            <a
              href="#"
              aria-current={store.filter() === view.filter && !store.results() ? 'page' : undefined}
              onClick={event => {
                event.preventDefault();
                pick(view.filter);
              }}
            >
              {icon(view.icon)}
              <span class="label">{view.label}</span>
              <span class="count">{store.unread()[view.filter] || ''}</span>
            </a>
          )}
        </For>
      </nav>
      <div>
        <h3 class="eyebrow">Ящики</h3>
        <nav class="nav" aria-label="Ящики">
          <a
            href="#"
            aria-current={store.account() === 'all' ? 'page' : undefined}
            onClick={event => {
              event.preventDefault();
              pickAccount('all');
            }}
          >
            {icon('layers')}
            <span class="label">Все ящики</span>
          </a>
          <For each={accounts()}>
            {account => (
              <a
                href="#"
                title={account.label}
                aria-current={store.account() === account.id ? 'page' : undefined}
                onClick={event => {
                  event.preventDefault();
                  pickAccount(account.id);
                }}
              >
                <span class="account-dot" style={{background: accountColor(accounts(), account.id)}} />
                <span class="label">{account.email}</span>
                <span class="count">{store.state()?.mailboxes[account.id]?.unread || ''}</span>
              </a>
            )}
          </For>
        </nav>
      </div>
      <div class="sidebar-foot">
        <RefreshButton />
        <button class="round ghost" type="button" title="Сменить тему" aria-label="Сменить тему" onClick={cycleTheme}>
          {icon('theme')}
        </button>
        <button class="round ghost" type="button" title="Настройки" aria-label="Настройки" onClick={openSettings}>
          {icon('settings')}
        </button>
      </div>
    </aside>
  );
}
