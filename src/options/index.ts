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
import {accents, palettes, popupSizes, themes} from '../shared/preferences';
import type {Palette, PopupSize, Preferences, ProviderID, PublicState, Request, Theme} from '../shared/types';

/** The rendered public state. */
let state: PublicState | null = null;

const form = byID<HTMLFormElement>('jmap-form');
const addressDialog = byID<HTMLDialogElement>('address-dialog');
const addressForm = byID<HTMLFormElement>('address-form');
const statusLine = byID('status');

/** Theme labels by preference. */
const themeNames: Record<Theme, string> = {auto: 'Авто', light: 'Светлая', dark: 'Тёмная'};

/** Popup size labels by preference. */
const popupNames: Record<PopupSize, string> = {full: 'Полное', mini: 'Мини'};

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

/**
 * A way to connect a mailbox: OAuth, the browser's own sign-in (`origin` is the webmail host; `address` is the
 * example shown when the user types the mailbox address), or the JMAP form.
 */
type Method = {label: string} & ({oauth: 'google' | 'microsoft'} | {origin: string; address?: string} | {jmap: true});

/** Add-mailbox rows; the first method is the primary button. */
const providerRows: {id: ProviderID; title: string; text: string; methods: Method[]}[] = [
  {
    id: 'gmail',
    title: 'Gmail / Google Workspace',
    text: 'Через вход в Gmail в этом браузере или через аккаунт Google.',
    methods: [
      {label: 'Через браузер', origin: 'https://mail.google.com/*'},
      {label: 'Через Google', oauth: 'google'},
    ],
  },
  {
    id: 'yandex',
    title: 'Яндекс Почта',
    text: 'Через вход в Яндекс Почту в этом браузере.',
    methods: [{label: 'Добавить', origin: 'https://mail.yandex.ru/*', address: 'name@yandex.ru'}],
  },
  {
    id: 'mailru',
    title: 'Почта Mail.ru',
    text: 'Через вход в Почту Mail.ru в этом браузере.',
    methods: [{label: 'Добавить', origin: 'https://*.mail.ru/*', address: 'name@mail.ru'}],
  },
  {
    id: 'outlook',
    title: 'Outlook / Microsoft 365',
    text: 'Outlook.com, Hotmail, Exchange Online на любом домене.',
    methods: [{label: 'Добавить', oauth: 'microsoft'}],
  },
  {
    id: 'jmap',
    title: 'JMAP',
    text: 'Fastmail, Stalwart, Cyrus — по API-токену.',
    methods: [{label: 'Добавить', jmap: true}],
  },
];

/** The provider and webmail host the address form adds a mailbox for. */
let addressTarget: {id: ProviderID; title: string; origin: string} | null = null;

/** Worker replies that carry the new state. */
type StateReply = PublicState | {email: string; state: PublicState};

/** Shows a status line. */
function status(text: string, error = false): void {
  const line = addressDialog.open ? byID('address-status') : statusLine;
  line.textContent = text;
  line.classList.toggle('error', error);
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
                    if (account.browser || (await allowIdentity()))
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

/** Requests the webmail host permission inside a click; the browser's sign-in is sent only there. */
async function allowSite(origin: string, title: string): Promise<boolean> {
  if (await chrome.permissions.request({origins: [origin]})) return true;
  status(`Без доступа к сайту «${title}» подключить ящик через браузер нельзя.`, true);
  return false;
}

/** Connects a mailbox with [method] from a click on [button]. */
async function connect(button: HTMLButtonElement, row: (typeof providerRows)[number], method: Method): Promise<void> {
  const added = (value: StateReply) => ('email' in value ? `Подключён ${value.email}` : 'Подключён.');
  if ('jmap' in method) {
    form.hidden = false;
    (form.elements.namedItem('token') as HTMLInputElement).focus();
  } else if ('oauth' in method) {
    if (await allowIdentity()) await run(button, {type: 'ADD_ACCOUNT', provider: row.id}, added);
  } else if (method.address) {
    addressTarget = {id: row.id, title: row.title, origin: method.origin};
    addressForm.reset();
    byID('address-status').textContent = '';
    byID('address-title').textContent = row.title;
    byID('address-mark').replaceChildren(providerMark(row.id));
    const input = addressForm.elements.namedItem('email') as HTMLInputElement;
    input.placeholder = method.address;
    addressDialog.showModal();
    input.focus();
  } else if (await allowSite(method.origin, row.title)) {
    await run(button, {type: 'ADD_ACCOUNT', provider: row.id, browser: true}, added);
  }
}

/** Renders the add-mailbox rows. */
function renderProviders({oauth}: PublicState): void {
  byID('providers').replaceChildren(
    ...providerRows.map(row => {
      const available = (method: Method) => !('oauth' in method) || oauth[method.oauth];
      const configured = row.methods.some(available);
      return el(
        'div',
        {class: 'provider'},
        el('span', {class: 'tile'}, providerMark(row.id)),
        el('div', {}, el('strong', {}, row.title), el('span', {}, configured ? row.text : 'Не настроен Client ID.')),
        el(
          'div',
          {class: 'provider-actions'},
          row.methods.map((method, index) =>
            el(
              'button',
              {
                class: index === 0 && !('jmap' in method) ? 'btn primary small' : 'btn small',
                type: 'button',
                disabled: !available(method),
                title: available(method) ? null : 'Не настроен Client ID.',
                onclick: (event: Event) => connect(event.currentTarget as HTMLButtonElement, row, method),
              },
              icon('plus'),
              method.label,
            ),
          ),
        ),
      );
    }),
  );
}

/** Renders a segmented control that saves preference [key]. */
function renderSegmented<K extends 'theme' | 'popup'>(
  id: string,
  key: K,
  values: readonly Preferences[K][],
  names: Record<Preferences[K], string>,
  current: Preferences[K],
): void {
  byID(id).replaceChildren(
    ...values.map(value =>
      el(
        'button',
        {type: 'button', 'aria-pressed': String(current === value), onclick: () => save({[key]: value})},
        names[value],
      ),
    ),
  );
}

/** Renders the theme, popup size and palette controls. */
function renderAppearance({theme, popup, palette}: Preferences): void {
  renderSegmented('theme-control', 'theme', themes, themeNames, theme);
  renderSegmented('popup-control', 'popup', popupSizes, popupNames, popup);
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
      el('div', {}, el('strong', {}, name), uri && el('code', {}, uri)),
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

addressForm.addEventListener('submit', async event => {
  event.preventDefault();
  const target = addressTarget;
  if (!target) return;
  const email = String(new FormData(addressForm).get('email') || '').trim();
  const submit = (event.submitter as HTMLButtonElement | null) || addressForm.querySelector('button[type=submit]')!;
  if (!(await allowSite(target.origin, target.title))) return;
  const ok = await run(
    submit as HTMLButtonElement,
    {type: 'ADD_ACCOUNT', provider: target.id, input: {email}, browser: true},
    value => ('email' in value ? `Подключён ${value.email}` : 'Подключён.'),
  );
  if (ok) {
    const done = byID('address-status').textContent || '';
    addressDialog.close();
    status(done);
  }
});
byID('address-cancel').addEventListener('click', () => addressDialog.close());
// A click on the backdrop (the dialog element itself, outside its form) closes it.
addressDialog.addEventListener('click', event => {
  if (event.target === addressDialog) addressDialog.close();
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
