/**
 * JMAP mail (RFC 8620/8621): Fastmail, Stalwart, Cyrus and other servers on any domain.
 *
 * Accounts use a revocable API token created in the mail service. Access to
 * the server's origin is an optional host permission granted in Settings.
 *
 * @module background/providers/jmap
 */
import type {Account} from '../../shared/types';
import {AuthError, requestJSON} from '../http';
import {count, message, type Provider} from './message';

/** JMAP capabilities used by every request. */
const USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];

/** One JMAP method call: name, arguments without `accountId`, tag. */
type Call = [string, Record<string, unknown>, string];

/** JMAP mailbox fields used here. */
interface JmapMailbox {
  id: string;
  role?: string | null;
  unreadEmails?: number;
}

/** JMAP email fields used here. */
interface JmapEmail {
  id: string;
  threadId?: string;
  from?: {name?: string; email?: string}[];
  subject?: string;
  preview?: string;
  receivedAt?: string;
}

/** Returns a validated HTTPS URL string. */
function httpsURL(value: unknown, name: string): string {
  let url: URL;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error(`${name}: некорректный адрес.`);
  }
  if (url.protocol !== 'https:') throw new Error(`${name}: нужен адрес HTTPS.`);
  return url.toString();
}

/** Returns the session URL of an account. */
const sessionURL = (account: Pick<Account, 'settings'>): string => account.settings.sessionUrl || '';

/** Loads the JMAP session: API URL, mail account ID and username. */
async function session(account: Pick<Account, 'credentials' | 'settings'>) {
  const value = await requestJSON<{apiUrl?: unknown; username?: unknown; primaryAccounts?: Record<string, unknown>}>(
    sessionURL(account),
    {token: account.credentials.token, service: 'JMAP'},
  );
  const accountId = value?.primaryAccounts?.['urn:ietf:params:jmap:mail'];
  if (typeof value?.apiUrl !== 'string' || typeof accountId !== 'string')
    throw new Error('Сервер не поддерживает JMAP Mail.');
  const apiUrl = new URL(value.apiUrl, sessionURL(account)).toString();
  if (new URL(apiUrl).origin !== new URL(sessionURL(account)).origin)
    throw new Error('JMAP API находится на другом домене; такой сервер не поддерживается.');
  return {apiUrl, accountId, username: String(value.username || 'JMAP').slice(0, 320)};
}

/** Runs JMAP method calls and returns responses by call tag. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(account: Account, calls: Call[]): Promise<Record<string, any>> {
  const current = await session(account);
  const value = await requestJSON<{methodResponses?: [string, Record<string, unknown>, string][]}>(current.apiUrl, {
    method: 'POST',
    token: account.credentials.token,
    service: 'JMAP',
    json: {
      using: USING,
      methodCalls: calls.map(([name, args, tag]) => [name, {accountId: current.accountId, ...args}, tag]),
    },
  });
  const replies: Record<string, Record<string, unknown>> = {};
  for (const [name, args, tag] of value?.methodResponses || []) {
    if (name === 'error') throw new Error(`JMAP: ${String(args?.description || args?.type || 'ошибка')}.`);
    replies[tag] = args;
  }
  return replies;
}

/** Returns the Inbox and Trash mailboxes. */
async function mailboxes(account: Account): Promise<{inbox: JmapMailbox; trash?: JmapMailbox}> {
  const replies = await run(account, [
    ['Mailbox/get', {ids: null, properties: ['id', 'role', 'unreadEmails']}, 'mailboxes'],
  ]);
  const list: JmapMailbox[] = Array.isArray(replies.mailboxes?.list) ? replies.mailboxes.list : [];
  const inbox = list.find(item => item.role === 'inbox');
  if (!inbox) throw new Error('В ящике нет папки «Входящие».');
  return {inbox, trash: list.find(item => item.role === 'trash')};
}

/** JMAP provider. */
export const jmap: Provider = {
  label: 'JMAP',

  async connect(input) {
    const sessionUrl = httpsURL(input?.sessionUrl, 'JMAP Session URL');
    const webUrl = input?.webUrl ? httpsURL(input.webUrl, 'Ссылка на веб-почту') : '';
    const token = String(input?.token || '').trim();
    if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('Укажите API-токен без пробелов.');
    if (!(await chrome.permissions.contains({origins: [`${new URL(sessionUrl).origin}/*`]})))
      throw new Error('Разрешите доступ к серверу JMAP и повторите.');
    const credentials = {token};
    const settings = {sessionUrl, webUrl};
    const current = await session({credentials, settings});
    return {email: current.username, credentials, settings};
  },

  /** API tokens do not expire on their own; a rejected token needs a new one. */
  async renew() {
    throw new AuthError('Токен JMAP отклонён. Удалите ящик и добавьте новый токен.');
  },

  async signIn() {
    throw new Error('Для JMAP удалите ящик и добавьте его с новым токеном.');
  },

  async inbox(account, limit) {
    const boxes = await mailboxes(account);
    const replies = await run(account, [
      [
        'Email/query',
        {
          filter: {inMailbox: boxes.inbox.id, notKeyword: '$seen'},
          sort: [{property: 'receivedAt', isAscending: false}],
          limit,
        },
        'query',
      ],
      [
        'Email/get',
        {
          '#ids': {resultOf: 'query', name: 'Email/query', path: '/ids'},
          properties: ['id', 'threadId', 'from', 'subject', 'preview', 'receivedAt'],
        },
        'emails',
      ],
    ]);
    const list: JmapEmail[] = Array.isArray(replies.emails?.list) ? replies.emails.list : [];
    const messages = list.slice(0, limit).map(item =>
      message({
        id: item.id,
        thread: item.threadId,
        from: item.from?.[0] ? `${item.from[0].name || ''} <${item.from[0].email || ''}>` : '',
        subject: item.subject,
        snippet: item.preview,
        date: Date.parse(item.receivedAt || ''),
      }),
    );
    return {unread: count(boxes.inbox.unreadEmails, messages.length), messages};
  },

  async markRead(account, item) {
    await run(account, [['Email/set', {update: {[item.id]: {'keywords/$seen': true}}}, 'set']]);
  },

  async trash(account, item) {
    const boxes = await mailboxes(account);
    if (!boxes.trash) throw new Error('В ящике нет папки «Корзина».');
    await run(account, [['Email/set', {update: {[item.id]: {mailboxIds: {[boxes.trash.id]: true}}}}, 'set']]);
  },

  webURL: account => account.settings.webUrl || new URL(sessionURL(account)).origin,
};
