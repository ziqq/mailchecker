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
import {initial, plural, senderName, shortDate} from '../../shared/format';
import {icon} from '../../shared/icons';
import type {ThreadMessage} from '../../shared/types';
import {store} from '../store';
import {MailFrame} from './MailFrame';

/** Formats a byte size. */
function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
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
                props.message.to && `Кому: ${props.message.to}`,
                props.message.cc && `Копия: ${props.message.cc}`,
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
              Заблокировано: {blocked() - trackers()}{' '}
              {plural(blocked() - trackers(), ['картинка', 'картинки', 'картинок'])}
              {trackers() ? ` и ${trackers()} ${plural(trackers(), ['трекер', 'трекера', 'трекеров'])}` : ''}
            </span>
            <button class="btn small" type="button" onClick={() => props.onAllow()}>
              {icon('image')}Показать
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

/** The reading pane. */
export function Reader() {
  const [allowed, setAllowed] = createSignal<ReadonlySet<string>>(new Set());
  const [conversation] = createResource(
    () => store.selected(),
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
    <section class="reader" aria-label="Письмо">
      <Show
        when={store.selected()}
        fallback={
          <div class="reader-empty">
            <div class="empty">
              <p class="eyebrow">Чтение</p>
              <h2>
                Выберите письмо<span class="dot">.</span>
              </h2>
              <p class="muted">
                <kbd>J</kbd> <kbd>K</kbd> — по списку, <kbd>E</kbd> — в архив, <kbd>S</kbd> — закрепить, <kbd>/</kbd> —
                поиск
              </p>
            </div>
          </div>
        }
      >
        <div class="reader-bar">
          <button
            class="round ghost back"
            type="button"
            title="К списку · Esc"
            aria-label="К списку"
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
                  title="В архив · E"
                  aria-label="В архив"
                  onClick={() => act('archive')}
                >
                  {icon('archive')}
                </button>
                <button
                  class="round"
                  type="button"
                  title="Удалить · #"
                  aria-label="Удалить"
                  onClick={() => act('trash')}
                >
                  {icon('trash')}
                </button>
                <button
                  class="round"
                  type="button"
                  title={current().message.unread ? 'Прочитано · U' : 'Непрочитано · U'}
                  aria-label="Прочитано или непрочитано"
                  onClick={() => act(current().message.unread ? 'read' : 'unread')}
                >
                  {icon('unread')}
                </button>
                <button
                  class="round"
                  classList={{active: current().message.pinned}}
                  type="button"
                  title={current().message.pinned ? 'Открепить · S' : 'Закрепить · S'}
                  aria-label="Закрепить"
                  onClick={() => act(current().message.pinned ? 'unpin' : 'pin')}
                >
                  {icon('pin')}
                </button>
                <button
                  class="round ghost"
                  type="button"
                  title="Открыть в веб-почте"
                  aria-label="Открыть в веб-почте"
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
                  Не удалось открыть письмо<span class="dot">.</span>
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
                      {messages().length > 1
                        ? ` · ${messages().length} ${plural(messages().length, ['письмо', 'письма', 'писем'])}`
                        : ''}
                    </p>
                    <h2>{messages()[messages().length - 1]?.subject || entry()?.message.subject}</h2>
                    <Show when={entry()?.message.pinned}>
                      <div class="labels">
                        <span class="pill strong">Закреплено</span>
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
                </>
              )}
            </Match>
          </Switch>
        </div>
      </Show>
    </section>
  );
}
