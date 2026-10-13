/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * The reading pane: actions and the selected conversation.
 *
 * The latest message and unread messages are expanded; earlier ones are
 * collapsed to one line. Remote images stay blocked until the user allows
 * them for the conversation.
 *
 * @module client/components/Reader
 */
import {createMemo, createResource, createSignal, For, Match, Show, Switch} from 'solid-js';
import {request} from '../../shared/dom';
import {initial, senderName, shortDate} from '../../shared/format';
import {locale, t, tn} from '../../shared/i18n';
import {icon} from '../../shared/icons';
import type {Entry} from '../../shared/inbox';
import type {ThreadMessage} from '../../shared/types';
import {store} from '../store';
import {MailFrame} from './MailFrame';

/** Formats a byte size with the interface language's units. */
function size(bytes: number): string {
  const [value, unit] =
    bytes >= 1024 * 1024
      ? [bytes / 1024 / 1024, 'megabyte']
      : bytes >= 1024
        ? [bytes / 1024, 'kilobyte']
        : [bytes, 'byte'];
  return new Intl.NumberFormat(locale(), {
    style: 'unit',
    unit,
    maximumFractionDigits: unit === 'megabyte' ? 1 : 0,
  }).format(value);
}

/** Returns a short file-type label for an attachment tile. */
const extension = (name: string): string => (/\.([a-z0-9]{1,4})$/i.exec(name)?.[1] || 'FILE').toUpperCase();

/** Whether the document currently uses the dark scheme. */
function isDark(): boolean {
  const theme = store.state()?.preferences.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/** One expanded or collapsed conversation message. */
function Message(props: {message: ThreadMessage; open: boolean; allowRemote: boolean; onAllow: () => void}) {
  const [open, setOpen] = createSignal(props.open);
  const [blocked, setBlocked] = createSignal(0);
  const [trackers, setTrackers] = createSignal(0);
  return (
    <Show
      when={open()}
      fallback={
        <button class="msg collapsed" type="button" onClick={() => setOpen(true)}>
          <span class="avatar sm">{initial(senderName(props.message.from))}</span>
          <strong>{senderName(props.message.from)}</strong>
          <span class="snippet">{props.message.text.slice(0, 160) || props.message.subject}</span>
          <span class="time">{shortDate(props.message.date)}</span>
        </button>
      }
    >
      <article class="msg">
        <header class="msg-head">
          <span class="avatar">{initial(senderName(props.message.from))}</span>
          <div class="who">
            <strong>{senderName(props.message.from)}</strong>
            <span
              title={[
                props.message.from,
                props.message.to && t('header_to', props.message.to),
                props.message.cc && t('header_cc', props.message.cc),
              ]
                .filter(Boolean)
                .join('\n')}
            >
              {props.message.from.match(/<([^>]+)>/)?.[1] || props.message.from}
              {props.message.to ? ` → ${senderName(props.message.to.split(',')[0])}` : ''}
              {' · '}
              {shortDate(props.message.date)}
            </span>
          </div>
        </header>
        <Show when={blocked() && !props.allowRemote}>
          <div class="privacy">
            {icon('shield')}
            <span>
              {tn('privacy_images', blocked() - trackers())}
              {trackers() ? ` ${tn('privacy_trackers', trackers())}` : ''}
            </span>
            <button class="btn small" type="button" onClick={() => props.onAllow()}>
              {icon('image')}
              {t('action_show')}
            </button>
          </div>
        </Show>
        <div class="msg-content" classList={{paper: Boolean(props.message.html.trim())}}>
          <MailFrame
            html={props.message.html}
            text={props.message.text}
            allowRemote={props.allowRemote}
            dark={isDark()}
            onBlocked={(count, pixels) => {
              setBlocked(count);
              setTrackers(pixels);
            }}
          />
        </div>
        <Show when={props.message.attachments.length}>
          <div class="attachments">
            <For each={props.message.attachments}>
              {file => (
                <span class="attachment" title={file.name}>
                  <span class="tile">{extension(file.name)}</span>
                  <span class="attachment-name">{file.name}</span>
                  <span class="muted">{size(file.size)}</span>
                </span>
              )}
            </For>
          </div>
        </Show>
      </article>
    </Show>
  );
}

/** The reply editor under a conversation: plain text, sent by the worker. */
function Composer(props: {entry: Entry}) {
  const [text, setText] = createSignal('');
  const [sending, setSending] = createSignal(false);
  const send = async (event: Event) => {
    event.preventDefault();
    if (!text().trim() || sending()) return;
    setSending(true);
    if (!(await store.reply(props.entry, text()))) setSending(false);
  };
  return (
    <form class="composer" onSubmit={send}>
      <p class="eyebrow">{t('reply_heading', senderName(props.entry.message.from))}</p>
      <textarea
        ref={element => queueMicrotask(() => element.focus())}
        rows={6}
        maxLength={100_000}
        placeholder={t('reply_placeholder')}
        value={text()}
        onInput={event => setText(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send(event);
          if (event.key === 'Escape') store.setReplying(false);
        }}
      />
      <div class="form-actions">
        <span class="muted">{t('reply_hint')}</span>
        <button class="btn" type="button" onClick={() => store.setReplying(false)}>
          {t('action_cancel')}
        </button>
        <button class="btn primary" type="submit" disabled={!text().trim() || sending()}>
          {sending() ? t('reply_sending') : t('reply_send')}
        </button>
      </div>
    </form>
  );
}

/** The reading pane. */
export function Reader() {
  const [allowed, setAllowed] = createSignal<ReadonlySet<string>>(new Set());
  const [conversation] = createResource(
    () => {
      const selection = store.selected();
      return selection ? {...selection, version: store.threadVersion()} : null;
    },
    selection => store.thread(selection),
  );
  const entry = () => store.current();
  const key = () => `${store.selected()?.account}/${store.selected()?.thread || store.selected()?.id}`;
  const accountEmail = createMemo(
    () => store.state()?.accounts.find(item => item.id === entry()?.account)?.email || '',
  );
  const act = (action: Parameters<typeof store.act>[1]) => {
    const current = entry();
    if (current) store.act(current, action);
  };

  return (
    <section class="reader" aria-label={t('label_message')}>
      <Show
        when={store.selected()}
        fallback={
          <div class="reader-empty">
            <div class="empty">
              <p class="eyebrow">{t('reader_eyebrow')}</p>
              <h2>
                {t('reader_empty')}
                <span class="dot">.</span>
              </h2>
              <p class="muted">
                <kbd>J</kbd> <kbd>K</kbd> — {t('hint_navigate')}, <kbd>E</kbd> — {t('hint_archive')}, <kbd>S</kbd> —{' '}
                {t('hint_pin')}, <kbd>/</kbd> — {t('hint_search')}
              </p>
            </div>
          </div>
        }
      >
        <div class="reader-bar">
          <button
            class="round ghost back"
            type="button"
            title={`${t('action_back')} · Esc`}
            aria-label={t('action_back')}
            onClick={() => store.select(null)}
          >
            {icon('back')}
          </button>
          <span class="spacer" />
          <Show when={entry()}>
            {current => (
              <>
                <button
                  class="round"
                  type="button"
                  title={`${t('action_reply')} · R`}
                  aria-label={t('action_reply')}
                  onClick={() => store.startReply()}
                >
                  {icon('reply')}
                </button>
                <button
                  class="round"
                  type="button"
                  title={`${t('action_archive')} · E`}
                  aria-label={t('action_archive')}
                  onClick={() => act('archive')}
                >
                  {icon('archive')}
                </button>
                <button
                  class="round"
                  type="button"
                  title={`${t('action_delete')} · #`}
                  aria-label={t('action_delete')}
                  onClick={() => act('trash')}
                >
                  {icon('trash')}
                </button>
                <button
                  class="round"
                  type="button"
                  title={`${t(current().message.unread ? 'action_read' : 'action_unread')} · U`}
                  aria-label={t('action_read_toggle')}
                  onClick={() => act(current().message.unread ? 'read' : 'unread')}
                >
                  {icon('unread')}
                </button>
                <button
                  class="round"
                  classList={{active: current().message.pinned}}
                  type="button"
                  title={`${t(current().message.pinned ? 'action_unpin' : 'action_pin')} · S`}
                  aria-label={t('action_pin')}
                  onClick={() => act(current().message.pinned ? 'unpin' : 'pin')}
                >
                  {icon('pin')}
                </button>
                <button
                  class="round ghost"
                  type="button"
                  title={t('action_open_webmail')}
                  aria-label={t('action_open_webmail')}
                  onClick={() =>
                    request({type: 'OPEN', account: current().account, message: current().message.id}).catch(store.fail)
                  }
                >
                  {icon('external')}
                </button>
              </>
            )}
          </Show>
        </div>

        <div class="reader-body">
          <Switch>
            <Match when={conversation.loading}>
              <div class="thread-title">
                <div class="skeleton line" />
                <div class="skeleton title" />
              </div>
              <div class="skeleton block" />
            </Match>
            <Match when={conversation.error}>
              <div class="empty small">
                <h2>
                  {t('reader_failed')}
                  <span class="dot">.</span>
                </h2>
                <p class="muted">{String((conversation.error as Error)?.message || conversation.error)}</p>
              </div>
            </Match>
            <Match when={conversation()}>
              {messages => (
                <>
                  <div class="thread-title">
                    <p class="eyebrow">
                      {accountEmail()}
                      {messages().length > 1 ? ` · ${tn('messages_count', messages().length)}` : ''}
                    </p>
                    <h2>{messages()[messages().length - 1]?.subject || entry()?.message.subject}</h2>
                    <Show when={entry()?.message.pinned}>
                      <div class="labels">
                        <span class="pill strong">{t('label_pinned')}</span>
                      </div>
                    </Show>
                  </div>
                  <For each={messages()}>
                    {(message, index) => (
                      <Message
                        message={message}
                        open={index() === messages().length - 1 || message.unread}
                        allowRemote={allowed().has(key())}
                        onAllow={() => setAllowed(new Set([...allowed(), key()]))}
                      />
                    )}
                  </For>
                  <Show when={store.replying() && entry()}>{current => <Composer entry={current()} />}</Show>
                </>
              )}
            </Match>
          </Switch>
        </div>
      </Show>
    </section>
  );
}
