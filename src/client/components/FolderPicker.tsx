/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * On-demand folder navigation for one mailbox and common system folders.
 *
 * @module client/components/FolderPicker
 */
import {createEffect, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import {t, tn} from '../../shared/i18n';
import type {MailFolder} from '../../shared/types';
import {icon} from '../../shared/icons';
import {store, type FolderChoice} from '../store';

/** Shows a numeric badge and explains the server count in its accessible tooltip. */
function FolderCounter(props: {folder?: MailFolder}) {
  const count = () => props.folder?.total ?? props.folder?.unread;
  const label = () => {
    if (props.folder?.total == null)
      return props.folder?.unread != null ? tn('unread_new', props.folder.unread) : undefined;
    const messages = tn('messages_count', props.folder.total);
    return props.folder.partial
      ? t('folder_count_partial', messages)
      : props.folder.approximate
        ? t('folder_count_estimated', messages)
        : messages;
  };
  return (
    <Show when={count() != null}>
      <span class="pill menu-count" title={label()} aria-label={label()}>
        {count()}
      </span>
    </Show>
  );
}

/** Displays the folder selector without loading message pages until a choice is made. */
export function FolderPicker(props: {title: string}) {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;
  let button!: HTMLButtonElement;
  const close = (event: MouseEvent) => {
    if (!root.contains(event.target as Node)) setOpen(false);
  };
  onMount(() => document.addEventListener('click', close));
  onCleanup(() => document.removeEventListener('click', close));

  /** Fits the menu to complete items within its CSS height limit. */
  function fitMenu(): void {
    const menu = root.querySelector<HTMLElement>('.folder-menu-items');
    if (!menu) return;
    const scrollTop = menu.scrollTop;
    menu.style.removeProperty('height');
    const bounds = menu.getBoundingClientRect();
    const panel = menu.parentElement!;
    const style = getComputedStyle(panel);
    const limit =
      panel.getBoundingClientRect().bottom -
      bounds.top -
      parseFloat(style.paddingBottom) -
      parseFloat(style.borderBottomWidth);
    let height = 0;
    for (const child of menu.children) {
      const bottom = child.getBoundingClientRect().bottom - bounds.top + menu.scrollTop;
      if (bottom > limit) break;
      height = bottom;
    }
    if (height) menu.style.height = `${Math.ceil(height)}px`;
    menu.scrollTop = scrollTop;
  }

  createEffect(
    on([open, store.folderChoices, store.catalogLoading, store.catalogErrors], () => {
      if (!open()) return;
      let frame = 0;
      /** Waits for rendered folder rows and coalesces window resizes. */
      const scheduleFit = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(fitMenu);
      };
      scheduleFit();
      window.addEventListener('resize', scheduleFit);
      onCleanup(() => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', scheduleFit);
      });
    }),
  );

  const choose = (choice: FolderChoice | null) => {
    setOpen(false);
    store.chooseFolder(choice);
  };
  const email = (account: string) => store.state()?.accounts.find(item => item.id === account)?.email || '';
  return (
    <div
      class="folder-picker"
      ref={root}
      on:keydown={event => {
        if (!open()) return;
        event.stopPropagation();
        if (event.key === 'Escape') {
          setOpen(false);
          button.focus();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : event.key === 'ArrowDown'
                  ? (index + 1) % items.length
                  : (index <= 0 ? items.length : index) - 1;
          items[next]?.focus();
        }
      }}
    >
      <h1>
        <button
          ref={button}
          type="button"
          class="folder-title"
          aria-label={`${t('label_folders')}: ${props.title}`}
          title={props.title}
          disabled={!store.state()?.accounts.length}
          aria-haspopup="menu"
          aria-expanded={open()}
          onClick={() => {
            setOpen(!open());
            if (open()) store.loadFolders();
          }}
        >
          <span>
            {props.title}
            <span class="dot">.</span>
          </span>
          {icon('chevron')}
        </button>
      </h1>
      <Show when={open()}>
        <div class="menu folder-menu" role="menu" aria-label={t('label_folders')}>
          <div class="folder-menu-items">
            <button
              class="menu-item"
              type="button"
              role="menuitemradio"
              aria-checked={!store.folder()}
              onClick={() => choose(null)}
            >
              {icon('inbox')}
              <span>{t('folder_inbox')}</span>
              <FolderCounter folder={store.folderChoices().find(choice => choice.folder.role === 'inbox')?.folder} />
            </button>
            <For each={store.folderChoices().filter(choice => choice.folder.role !== 'inbox')}>
              {choice => (
                <button
                  class="menu-item"
                  type="button"
                  role="menuitemradio"
                  aria-checked={
                    store.folder()?.account === choice.account && store.folder()?.folder.id === choice.folder.id
                  }
                  onClick={() => choose(choice)}
                >
                  {icon(
                    choice.folder.role === 'trash' ? 'trash' : choice.folder.role === 'archive' ? 'archive' : 'mail',
                  )}
                  <span class="folder-label">
                    {store.folderLabel(choice)}
                    <Show when={store.account() === 'all' && choice.account !== 'all'}>
                      <small>{email(choice.account)}</small>
                    </Show>
                  </span>
                  <FolderCounter folder={choice.folder} />
                </button>
              )}
            </For>
            <Show when={store.catalogLoading()}>
              <div class="folder-status" role="status">
                <span class="spinner" />
                {t('folder_loading')}
              </div>
            </Show>
            <For
              each={store.catalogErrors().filter(item => store.account() === 'all' || item.account === store.account())}
            >
              {item => (
                <p class="folder-status error">
                  {email(item.account)} · {item.error}
                </p>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
