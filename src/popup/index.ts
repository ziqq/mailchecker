/**
 * Toolbar popup: unread summary, an account filter and unread messages
 * with mark-read, trash and open actions.
 *
 * The popup reads only the public state from the worker and re-renders
 * when stored mailboxes change.
 *
 * @module popup/index
 */
import {applyTheme, byId, el, errorMessage, request} from '../shared/dom';
import {initial, plural, senderName, shortDate} from '../shared/format';
import {icon, providerMark} from '../shared/icons';
import {themes} from '../shared/preferences';
import type {MailMessage, Mailbox, Preferences, PublicAccount, PublicState, Request, Theme} from '../shared/types';

/** The rendered public state. */
let state: PublicState | null = null;

/** The selected account filter: `all` or an account ID. */
let filter = 'all';

/** The last action error shown above the list. */
let failure = '';

const app = byId('app');
const themeButton = byId<HTMLButtonElement>('theme');
const refreshButton = byId<HTMLButtonElement>('refresh');
const settingsButton = byId<HTMLButtonElement>('settings');

themeButton.append(icon('theme'));
refreshButton.append(icon('refresh'));
settingsButton.append(icon('settings'));

/** Theme button titles by preference. */
const themeTitles: Record<Theme, string> = {
  auto: 'Тема: как в системе',
  light: 'Тема: светлая',
  dark: 'Тема: тёмная',
};

/** Opens Settings and closes the popup. */
const openOptions = () => request({type: 'OPTIONS'}).then(() => window.close());

/** Opens webmail and closes the popup. */
const openMail = (account: string, message?: string) =>
  request({type: 'OPEN', account, message}).then(() => window.close());

/**
 * Runs a worker request for a control, disabling it meanwhile.
 *
 * @param button The control.
 * @param message The request; a reply with `accounts` replaces the state.
 */
async function run(button: HTMLButtonElement, message: Request): Promise<void> {
  button.disabled = true;
  try {
    const value = await request<PublicState | undefined>(message);
    if (value?.accounts) state = value;
    failure = '';
  } catch (error) {
    failure = errorMessage(error);
  }
  button.disabled = false;
  render();
}

/** Renders the whole popup from [state]. */
function render(): void {
  if (!state) return;
  applyTheme(state.preferences);
  themeButton.title = themeTitles[state.preferences.theme];
  const {accounts, mailboxes} = state;
  if (!accounts.some(account => account.id === filter)) filter = 'all';
  if (!accounts.length) {
    app.replaceChildren(
      el(
        'section',
        {class: 'empty'},
        el('p', {class: 'eyebrow'}, 'Почта в браузере'),
        el('h2', {}, 'Вся почта', el('span', {class: 'dot'}, '.'), ' Сразу', el('span', {class: 'dot'}, '.')),
        el('p', {}, 'Подключите Gmail, Microsoft 365 или JMAP-ящик на любом домене.'),
        el('button', {class: 'btn primary block', type: 'button', onclick: openOptions}, icon('plus'), 'Добавить ящик'),
      ),
    );
    return;
  }
  const total = accounts.reduce((sum, account) => sum + (mailboxes[account.id]?.unread || 0), 0);
  const visible = filter === 'all' ? accounts : accounts.filter(account => account.id === filter);
  app.replaceChildren(
    el(
      'section',
      {class: 'hero'},
      el('p', {class: 'eyebrow'}, 'Входящие'),
      el('h1', {}, String(total), el('span', {class: 'dot'}, '.')),
      el(
        'p',
        {},
        `${plural(total, ['непрочитанное', 'непрочитанных', 'непрочитанных'])} · ` +
          `${accounts.length} ${plural(accounts.length, ['ящик', 'ящика', 'ящиков'])}`,
      ),
    ),
    ...(accounts.length > 1 ? [filters(accounts, mailboxes, total)] : []),
    ...(failure ? [el('p', {class: 'toast error', role: 'alert'}, failure)] : []),
    ...visible.map(account => box(account, mailboxes[account.id])),
  );
}

/** Renders the account filter. */
function filters(accounts: PublicAccount[], mailboxes: Record<string, Mailbox>, total: number): HTMLElement {
  const option = (id: string, text: string, count: number) =>
    el(
      'button',
      {
        type: 'button',
        'aria-pressed': String(filter === id),
        onclick: () => {
          filter = id;
          render();
        },
      },
      text,
      count ? el('span', {class: 'count'}, String(count)) : null,
    );
  return el(
    'nav',
    {class: 'segmented', 'aria-label': 'Ящики'},
    option('all', 'Все', total),
    accounts.map(account => option(account.id, account.email.split('@')[0], mailboxes[account.id]?.unread || 0)),
  );
}

/** Renders one mailbox card. */
function box(account: PublicAccount, mailbox?: Mailbox): HTMLElement {
  const messages = mailbox?.messages || [];
  const unread = mailbox?.unread || 0;
  return el(
    'section',
    {class: 'box card'},
    el(
      'div',
      {class: 'box-head'},
      el('span', {class: 'avatar', 'aria-hidden': 'true'}, initial(account.email)),
      el(
        'button',
        {class: 'box-title', type: 'button', title: 'Открыть почту', onclick: () => openMail(account.id)},
        el('strong', {}, account.email),
        el('span', {}, account.label),
      ),
      el('span', {class: 'tile', title: account.label}, providerMark(account.provider)),
      el('span', {class: unread ? 'pill strong' : 'pill'}, String(unread)),
    ),
    mailbox?.error
      ? el(
          'div',
          {class: 'notice', role: 'alert'},
          icon('alert'),
          el('span', {}, mailbox.error),
          mailbox.reauth && account.provider !== 'jmap'
            ? el(
                'button',
                {
                  class: 'btn primary small',
                  type: 'button',
                  onclick: (event: Event) =>
                    run(event.currentTarget as HTMLButtonElement, {type: 'SIGN_IN', account: account.id}),
                },
                'Войти',
              )
            : null,
        )
      : null,
    messages.length
      ? messages.map(message => row(account, message))
      : mailbox?.error
        ? null
        : el('div', {class: 'all-read'}, 'Всё прочитано'),
  );
}

/** Renders one unread message. */
function row(account: PublicAccount, message: MailMessage): HTMLElement {
  const openMessage = () => openMail(account.id, message.id);
  const action = (name: string, type: 'MARK_READ' | 'TRASH', title: string, extra = '') =>
    el(
      'button',
      {
        class: `round ghost ${extra}`,
        type: 'button',
        title,
        'aria-label': title,
        onclick: (event: Event) => {
          event.stopPropagation();
          run(event.currentTarget as HTMLButtonElement, {type, account: account.id, message: message.id});
        },
      },
      icon(name),
    );
  return el(
    'article',
    {
      class: 'message',
      tabindex: '0',
      title: message.subject,
      onclick: openMessage,
      onkeydown: (event: Event) => {
        if ((event as KeyboardEvent).key === 'Enter') openMessage();
      },
    },
    el(
      'div',
      {class: 'message-body'},
      el(
        'div',
        {class: 'message-top'},
        el('span', {class: 'from'}, senderName(message.from)),
        el('span', {class: 'date'}, shortDate(message.date)),
      ),
      el('div', {class: 'subject'}, message.subject),
      message.snippet ? el('div', {class: 'snippet'}, message.snippet) : null,
    ),
    el(
      'div',
      {class: 'message-actions'},
      action('check', 'MARK_READ', 'Отметить прочитанным'),
      action('trash', 'TRASH', 'В корзину', 'danger'),
    ),
  );
}

/** Loads the public state and renders it. */
async function load(): Promise<void> {
  try {
    state = await request<PublicState>({type: 'STATE'});
    render();
  } catch (error) {
    app.replaceChildren(el('p', {class: 'error'}, errorMessage(error)));
  }
}

themeButton.addEventListener('click', async () => {
  if (!state) return;
  const theme = themes[(themes.indexOf(state.preferences.theme) + 1) % themes.length];
  state.preferences = await request<Preferences>({type: 'PREFERENCES', value: {theme}});
  render();
});

refreshButton.addEventListener('click', async () => {
  refreshButton.firstElementChild?.classList.add('spin');
  await run(refreshButton, {type: 'CHECK'});
  refreshButton.firstElementChild?.classList.remove('spin');
});

settingsButton.addEventListener('click', openOptions);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.mailboxes || changes.accounts || changes.preferences)) load();
});

load();
