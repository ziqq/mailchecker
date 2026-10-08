/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Settings: mailbox connections, appearance, check preferences and OAuth status.
 *
 * Optional permissions (`identity` for OAuth, a JMAP server origin) are
 * requested here, inside the click that needs them; the worker verifies
 * them again before connecting.
 *
 * @module options/index
 */
import {applyTheme, byID, el, errorMessage, request} from '../shared/dom';
import {initial, shortDate} from '../shared/format';
import {icon, providerMark} from '../shared/icons';
import {accents, palettes, themes} from '../shared/preferences';
import type {Palette, Preferences, ProviderID, PublicState, Request, Theme} from '../shared/types';

/** The rendered public state. */
let state: PublicState | null = null;

const form = byID<HTMLFormElement>('jmap-form');
const statusLine = byID('status');

/** Theme labels by preference. */
const themeNames: Record<Theme, string> = {auto: 'Авто', light: 'Светлая', dark: 'Тёмная'};

/** Palette names; the swatch colours come from `accents`. */
const paletteNames: Record<Palette, string> = {
  orange: 'Оранжевый',
  blue: 'Синий',
  cyan: 'Голубой',
  green: 'Зелёный',
  pink: 'Розовый',
  purple: 'Фиолетовый',
  red: 'Красный',
  yellow: 'Жёлтый',
  gray: 'Серый',
  neutral: 'Графит',
};

/** Add-mailbox rows. */
const providerRows: {id: ProviderID; title: string; text: string; oauth?: 'google' | 'microsoft'}[] = [
  {id: 'gmail', title: 'Gmail / Google Workspace', text: 'Gmail и почта на своём домене в Google.', oauth: 'google'},
  {
    id: 'outlook',
    title: 'Outlook / Microsoft 365',
    text: 'Outlook.com, Hotmail, Exchange Online на любом домене.',
    oauth: 'microsoft',
  },
  {id: 'jmap', title: 'JMAP', text: 'Fastmail, Stalwart, Cyrus — по API-токену.'},
];

/** Worker replies that carry the new state. */
type StateReply = PublicState | {email: string; state: PublicState};

/** Shows a status line. */
function status(text: string, error = false): void {
  statusLine.textContent = text;
  statusLine.classList.toggle('error', error);
}

/**
 * Runs a worker request for a control and updates the state.
 *
 * @param button The control.
 * @param message The request.
 * @param done Returns the success message.
 * @returns Whether the request succeeded.
 */
async function run(button: HTMLButtonElement, message: Request, done: (value: StateReply) => string): Promise<boolean> {
  button.disabled = true;
  status('Подождите…');
  try {
    const value = await request<StateReply>(message);
    state = 'state' in value ? value.state : value;
    status(done(value));
    render();
    return true;
  } catch (error) {
    status(errorMessage(error), true);
    return false;
  } finally {
    button.disabled = false;
  }
}

/** Requests the browser sign-in permission inside a click. */
async function allowIdentity(): Promise<boolean> {
  if (await chrome.permissions.request({permissions: ['identity']})) return true;
  status('Без разрешения на вход через браузер подключить ящик нельзя.', true);
  return false;
}

/** Renders everything from [state]. */
function render(): void {
  if (!state) return;
  applyTheme(state.preferences);
  renderAccounts(state);
  renderProviders(state);
  renderAppearance(state.preferences);
  renderOAuth(state);
  byID<HTMLInputElement>('interval').value = String(state.preferences.interval);
  byID<HTMLInputElement>('limit').value = String(state.preferences.limit);
  byID<HTMLInputElement>('notifications').checked = state.preferences.notifications;
}

/** Renders the connected accounts. */
function renderAccounts({accounts, mailboxes}: PublicState): void {
  byID('accounts-count').textContent = String(accounts.length);
  if (!accounts.length) {
    byID('accounts').replaceChildren(el('p', {class: 'empty-accounts'}, 'Пока ни одного ящика. Добавьте первый ниже.'));
    return;
  }
  byID('accounts').replaceChildren(
    ...accounts.map(account => {
      const box = mailboxes[account.id];
      const detail = box?.error
        ? el('span', {class: 'error', title: box.error}, box.error)
        : el(
            'span',
            {},
            box
              ? `Непрочитанных: ${box.unread} · проверено ${shortDate(box.checkedAt)}`
              : `${account.label} · ещё не проверялся`,
          );
      return el(
        'div',
        {class: 'account'},
        el('span', {class: 'avatar', 'aria-hidden': 'true'}, initial(account.email)),
        el('div', {class: 'account-main'}, el('strong', {}, account.email), detail),
        el('span', {class: 'tile', title: account.label}, providerMark(account.provider)),
        el(
          'div',
          {class: 'account-actions'},
          box?.reauth && account.provider !== 'jmap'
            ? el(
                'button',
                {
                  class: 'btn primary small',
                  type: 'button',
                  onclick: async (event: Event) => {
                    const button = event.currentTarget as HTMLButtonElement;
                    if (await allowIdentity())
                      await run(
                        button,
                        {type: 'SIGN_IN', account: account.id},
                        () => `Вход выполнен: ${account.email}`,
                      );
                  },
                },
                'Войти заново',
              )
            : null,
          el(
            'button',
            {
              class: 'round ghost',
              type: 'button',
              title: 'Открыть почту',
              'aria-label': 'Открыть почту',
              onclick: () => request({type: 'OPEN', account: account.id}),
            },
            icon('external'),
          ),
          el(
            'button',
            {
              class: 'round ghost danger',
              type: 'button',
              title: 'Удалить',
              'aria-label': `Удалить ${account.email}`,
              onclick: (event: Event) => {
                if (confirm(`Удалить ${account.email} из расширения?`))
                  run(
                    event.currentTarget as HTMLButtonElement,
                    {type: 'REMOVE_ACCOUNT', account: account.id},
                    () => 'Ящик удалён.',
                  );
              },
            },
            icon('trash'),
          ),
        ),
      );
    }),
  );
}

/** Renders the add-mailbox rows. */
function renderProviders({oauth}: PublicState): void {
  byID('providers').replaceChildren(
    ...providerRows.map(row => {
      const configured = !row.oauth || oauth[row.oauth];
      return el(
        'div',
        {class: 'provider'},
        el('span', {class: 'tile'}, providerMark(row.id)),
        el('div', {}, el('strong', {}, row.title), el('span', {}, configured ? row.text : 'Не настроен Client ID.')),
        el(
          'button',
          {
            class: row.id === 'jmap' ? 'btn small' : 'btn primary small',
            type: 'button',
            disabled: !configured,
            onclick: async (event: Event) => {
              const button = event.currentTarget as HTMLButtonElement;
              if (row.id === 'jmap') {
                form.hidden = false;
                (form.elements.namedItem('token') as HTMLInputElement).focus();
                return;
              }
              if (await allowIdentity())
                await run(button, {type: 'ADD_ACCOUNT', provider: row.id}, value =>
                  'email' in value ? `Подключён ${value.email}` : 'Подключён.',
                );
            },
          },
          icon('plus'),
          'Добавить',
        ),
      );
    }),
  );
}

/** Renders the theme and palette controls. */
function renderAppearance({theme, palette}: Preferences): void {
  byID('theme-control').replaceChildren(
    ...themes.map(value =>
      el(
        'button',
        {type: 'button', 'aria-pressed': String(theme === value), onclick: () => save({theme: value})},
        themeNames[value],
      ),
    ),
  );
  byID('palette-control').replaceChildren(
    ...palettes.map(value =>
      el('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(palette === value),
        'aria-label': paletteNames[value],
        title: paletteNames[value],
        'data-accent': value,
        style: value === 'neutral' ? null : `--accent: ${accents[value].color}`,
        onclick: () => save({palette: value}),
      }),
    ),
  );
  byID('theme').title = `Тема: ${themeNames[theme].toLowerCase()}`;
}

/** Renders the OAuth configuration status and redirect URIs. */
function renderOAuth({oauth}: PublicState): void {
  const row = (provider: ProviderID, name: string, configured: boolean, uri: string) =>
    el(
      'div',
      {class: 'oauth-row'},
      el('span', {class: 'tile'}, providerMark(provider)),
      el('div', {}, el('strong', {}, name), el('code', {}, uri)),
      el('span', {class: configured ? 'pill strong' : 'pill'}, configured ? 'Настроен' : 'Нет ID'),
    );
  byID('oauth').replaceChildren(
    row('gmail', 'Google', oauth.google, oauth.redirect.google),
    row('outlook', 'Microsoft', oauth.microsoft, oauth.redirect.microsoft),
  );
}

/** Saves preferences and re-renders. */
async function save(value: Partial<Preferences>): Promise<void> {
  if (!state) return;
  try {
    state.preferences = await request<Preferences>({type: 'PREFERENCES', value});
    render();
  } catch (error) {
    status(errorMessage(error), true);
  }
}

/** Loads the public state and renders it. */
async function load(): Promise<void> {
  try {
    state = await request<PublicState>({type: 'STATE'});
    render();
  } catch (error) {
    status(errorMessage(error), true);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(form);
  const input = {
    sessionURL: String(data.get('sessionURL') || ''),
    token: String(data.get('token') || ''),
    webURL: String(data.get('webURL') || ''),
  };
  let origin: string;
  try {
    origin = `${new URL(input.sessionURL).origin}/*`;
  } catch {
    status('Некорректный JMAP Session URL.', true);
    return;
  }
  if (!(await chrome.permissions.request({origins: [origin]}))) {
    status('Доступ к серверу JMAP не разрешён.', true);
    return;
  }
  const submit = (event.submitter as HTMLButtonElement | null) || form.querySelector('button[type=submit]')!;
  const ok = await run(submit as HTMLButtonElement, {type: 'ADD_ACCOUNT', provider: 'jmap', input}, value =>
    'email' in value ? `Подключён ${value.email}` : 'Подключён.',
  );
  if (ok) {
    form.reset();
    form.hidden = true;
  }
});
byID('jmap-cancel').addEventListener('click', () => {
  form.reset();
  form.hidden = true;
});

byID<HTMLInputElement>('interval').addEventListener('change', event =>
  save({interval: Number((event.target as HTMLInputElement).value)}),
);
byID<HTMLInputElement>('limit').addEventListener('change', event =>
  save({limit: Number((event.target as HTMLInputElement).value)}),
);
byID<HTMLInputElement>('notifications').addEventListener('change', event =>
  save({notifications: (event.target as HTMLInputElement).checked}),
);
byID('theme').addEventListener('click', () => {
  if (state) save({theme: themes[(themes.indexOf(state.preferences.theme) + 1) % themes.length]});
});

byID('theme').append(icon('theme'));
byID('version').textContent = `v${chrome.runtime.getManifest().version}`;
for (const tile of document.querySelectorAll<HTMLElement>('[data-icon]')) tile.append(icon(tile.dataset.icon || ''));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.mailboxes || changes.accounts)) load();
});

load();
