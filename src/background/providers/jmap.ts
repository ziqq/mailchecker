/**
 * JMAP mail (RFC 8620/8621): Fastmail, Stalwart, Cyrus and other servers on any domain.
 *
 * Accounts use a revocable API token created in the mail service. Access to
 * the server's origin is an optional host permission granted in Settings.
 *
 * @module background/providers/jmap
 */
import type {Account, MailMessage} from '../../shared/types';
import {AuthError, requestJSON} from '../http';
import {addresses, categorize, count, message, threadMessage, type Provider} from './message';

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

/** JMAP address. */
type JmapAddress = {name?: string; email?: string};

/** JMAP email fields used here. */
interface JmapEmail {
  id: string;
  threadId?: string;
  from?: JmapAddress[];
  to?: JmapAddress[];
  cc?: JmapAddress[];
  subject?: string;
  preview?: string;
  receivedAt?: string;
  keywords?: Record<string, boolean>;
  hasAttachment?: boolean;
  'header:List-Unsubscribe:asText'?: string | null;
  htmlBody?: {partId?: string; type?: string}[];
  textBody?: {partId?: string; type?: string}[];
  attachments?: {name?: string; size?: number; type?: string}[];
  bodyValues?: Record<string, {value?: string}>;
}

/** Properties requested for lists. */
const LIST_PROPERTIES = [
  'id',
  'threadId',
  'from',
  'subject',
  'preview',
  'receivedAt',
  'keywords',
  'hasAttachment',
  'header:List-Unsubscribe:asText',
];

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

/** Returns mailboxes by role. */
async function mailboxes(account: Account): Promise<Record<string, JmapMailbox>> {
  const replies = await run(account, [
    ['Mailbox/get', {ids: null, properties: ['id', 'role', 'unreadEmails']}, 'mailboxes'],
  ]);
  const list: JmapMailbox[] = Array.isArray(replies.mailboxes?.list) ? replies.mailboxes.list : [];
  const roles: Record<string, JmapMailbox> = {};
  for (const box of list) if (box.role) roles[box.role] = box;
  if (!roles.inbox) throw new Error('В ящике нет папки «Входящие».');
  return roles;
}

/** Converts a JMAP email to a list message. */
function listMessage(item: JmapEmail): MailMessage {
  const from = addresses(item.from?.slice(0, 1));
  return message({
    id: item.id,
    thread: item.threadId,
    from,
    subject: item.subject,
    snippet: item.preview,
    date: Date.parse(item.receivedAt || ''),
    unread: !item.keywords?.$seen,
    pinned: Boolean(item.keywords?.$flagged),
    attachments: item.hasAttachment,
    category: categorize({from, listUnsubscribe: Boolean(item['header:List-Unsubscribe:asText'])}),
  });
}

/** Queries emails with a filter and returns list messages. */
async function query(account: Account, filter: Record<string, unknown>, limit: number): Promise<MailMessage[]> {
  const replies = await run(account, [
    ['Email/query', {filter, sort: [{property: 'receivedAt', isAscending: false}], limit}, 'query'],
    [
      'Email/get',
      {'#ids': {resultOf: 'query', name: 'Email/query', path: '/ids'}, properties: LIST_PROPERTIES},
      'emails',
    ],
  ]);
  const list: JmapEmail[] = Array.isArray(replies.emails?.list) ? replies.emails.list : [];
  return list.slice(0, limit).map(listMessage);
}

/** Keyword and mailbox patches for each action. */
async function patch(account: Account, action: string): Promise<Record<string, unknown>> {
  switch (action) {
    case 'read':
      return {'keywords/$seen': true};
    case 'unread':
      return {'keywords/$seen': null};
    case 'pin':
      return {'keywords/$flagged': true};
    case 'unpin':
      return {'keywords/$flagged': null};
  }
  const roles = await mailboxes(account);
  const target = roles[action === 'archive' ? 'archive' : 'trash'];
  if (!target) throw new Error(action === 'archive' ? 'В ящике нет папки «Архив».' : 'В ящике нет папки «Корзина».');
  return {mailboxIds: {[target.id]: true}};
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
    const roles = await mailboxes(account);
    const messages = await query(account, {inMailbox: roles.inbox.id}, limit);
    return {unread: count(roles.inbox.unreadEmails, messages.filter(item => item.unread).length), messages};
  },

  async thread(account, item) {
    const replies = await run(account, [
      ['Thread/get', {ids: [item.thread || item.id]}, 'thread'],
      [
        'Email/get',
        {
          '#ids': {resultOf: 'thread', name: 'Thread/get', path: '/list/*/emailIds'},
          properties: [
            'id',
            'from',
            'to',
            'cc',
            'subject',
            'receivedAt',
            'keywords',
            'htmlBody',
            'textBody',
            'attachments',
            'bodyValues',
          ],
          fetchHTMLBodyValues: true,
          fetchTextBodyValues: true,
          maxBodyValueBytes: 2 * 1024 * 1024,
        },
        'emails',
      ],
    ]);
    const list: JmapEmail[] = Array.isArray(replies.emails?.list) ? replies.emails.list : [];
    return list
      .map(entry => {
        const value = (parts?: {partId?: string; type?: string}[], type?: string) =>
          (parts || [])
            .filter(part => !type || part.type === type)
            .map(part => entry.bodyValues?.[part.partId || '']?.value || '')
            .join('\n');
        return threadMessage({
          id: entry.id,
          from: addresses(entry.from),
          to: addresses(entry.to),
          cc: addresses(entry.cc),
          subject: entry.subject,
          date: Date.parse(entry.receivedAt || ''),
          html: value(entry.htmlBody, 'text/html'),
          text: value(entry.textBody),
          unread: !entry.keywords?.$seen,
          attachments: entry.attachments,
        });
      })
      .sort((a, b) => a.date - b.date);
  },

  async act(account, item, action) {
    await run(account, [['Email/set', {update: {[item.id]: await patch(account, action)}}, 'set']]);
  },

  search: (account, text, limit) => query(account, {text}, limit),

  webURL: account => account.settings.webUrl || new URL(sessionURL(account)).origin,
};
