/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * JMAP mail (RFC 8620/8621): Fastmail, Stalwart, Cyrus and other servers on any domain.
 *
 * Accounts use a revocable API token created in the mail service. Access to
 * the server's origin is an optional host permission granted in Settings.
 *
 * @module background/providers/jmap
 */
import type {Account, FolderPage, FolderRole, MailMessage} from '../../shared/types';
import {FOLDER_ROLES} from '../../shared/folders';
import {AuthError, requestJSON} from '../http';
import {addresses, categorize, count, message, replySubject, threadMessage, type Provider} from './message';
import {t} from '../../shared/i18n';

/** JMAP capabilities used by every request. */
const USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];

/** The JMAP capability for sending mail. */
const SUBMISSION = 'urn:ietf:params:jmap:submission';

/** One JMAP method call: name, arguments without `accountId`, tag. */
type Call = [string, Record<string, unknown>, string];

/** JMAP mailbox fields used here. */
interface JMAPMailbox {
  id: string;
  name?: string;
  parentId?: string | null;
  role?: string | null;
  unreadEmails?: number;
  totalEmails?: number;
}

/** JMAP address. */
type JMAPAddress = {name?: string; email?: string};

/** JMAP email fields used here. */
interface JMAPEmail {
  id: string;
  threadId?: string;
  from?: JMAPAddress[];
  to?: JMAPAddress[];
  cc?: JMAPAddress[];
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
    throw new Error(t('error_bad_address', name));
  }
  if (url.protocol !== 'https:') throw new Error(t('error_need_https', name));
  return url.toString();
}

/** Returns the session URL of an account. */
const sessionURL = (account: Pick<Account, 'settings'>): string => account.settings.sessionURL || '';

/** Loads the JMAP session: API URL, mail account ID and username. */
async function session(account: Pick<Account, 'credentials' | 'settings'>) {
  const value = await requestJSON<{apiUrl?: unknown; username?: unknown; primaryAccounts?: Record<string, unknown>}>(
    sessionURL(account),
    {token: account.credentials.token, service: 'JMAP'},
  );
  const accountID = value?.primaryAccounts?.['urn:ietf:params:jmap:mail'];
  if (typeof value?.apiUrl !== 'string' || typeof accountID !== 'string') throw new Error(t('error_jmap_mail'));
  const apiURL = new URL(value.apiUrl, sessionURL(account)).toString();
  if (new URL(apiURL).origin !== new URL(sessionURL(account)).origin) throw new Error(t('error_jmap_origin'));
  return {apiURL, accountID, username: String(value.username || 'JMAP').slice(0, 320)};
}

/** Runs JMAP method calls (with the capabilities in [using]) and returns responses by call tag. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(account: Account, calls: Call[], using = USING): Promise<Record<string, any>> {
  const current = await session(account);
  const value = await requestJSON<{methodResponses?: [string, Record<string, unknown>, string][]}>(current.apiURL, {
    method: 'POST',
    token: account.credentials.token,
    service: 'JMAP',
    json: {
      using,
      methodCalls: calls.map(([name, args, tag]) => [name, {accountId: current.accountID, ...args}, tag]),
    },
  });
  const replies: Record<string, Record<string, unknown>> = {};
  for (const [name, args, tag] of value?.methodResponses || []) {
    if (name === 'error')
      throw new Error(t('error_jmap_generic', String(args?.description || args?.type || t('error_generic'))));
    replies[tag] = args;
  }
  return replies;
}

/** Returns mailboxes by role. */
async function mailboxes(account: Account): Promise<Record<string, JMAPMailbox>> {
  const replies = await run(account, [
    ['Mailbox/get', {ids: null, properties: ['id', 'role', 'unreadEmails']}, 'mailboxes'],
  ]);
  const list: JMAPMailbox[] = Array.isArray(replies.mailboxes?.list) ? replies.mailboxes.list : [];
  const roles: Record<string, JMAPMailbox> = {};
  for (const box of list) if (box.role) roles[box.role] = box;
  if (!roles.inbox) throw new Error(t('error_no_folder', t('folder_inbox')));
  return roles;
}

/** Converts a JMAP email to a list message. */
function listMessage(item: JMAPEmail): MailMessage {
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
async function queryPage(
  account: Account,
  filter: Record<string, unknown>,
  limit: number,
  position = 0,
): Promise<FolderPage> {
  const replies = await run(account, [
    ['Email/query', {filter, sort: [{property: 'receivedAt', isAscending: false}], limit, position}, 'query'],
    [
      'Email/get',
      {'#ids': {resultOf: 'query', name: 'Email/query', path: '/ids'}, properties: LIST_PROPERTIES},
      'emails',
    ],
  ]);
  const list: JMAPEmail[] = Array.isArray(replies.emails?.list) ? replies.emails.list : [];
  const messages = list.slice(0, limit).map(listMessage);
  return {messages, next: messages.length === limit ? String(position + messages.length) : ''};
}

/** Queries the first bounded page for Inbox checks and search. */
async function query(account: Account, filter: Record<string, unknown>, limit: number): Promise<MailMessage[]> {
  return (await queryPage(account, filter, limit)).messages;
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
  if (!target) throw new Error(t('error_no_folder', t(action === 'archive' ? 'folder_archive' : 'folder_trash')));
  if (action === 'archive') return {[mailboxPath(roles.inbox.id)]: null, [mailboxPath(target.id)]: true};
  return {mailboxIds: {[target.id]: true}};
}

/** Returns a JSON Pointer patch path for a mailbox membership. */
const mailboxPath = (id: string): string => `mailboxIds/${id.replace(/~/g, '~0').replace(/\//g, '~1')}`;

/** JMAP provider. */
export const jmap: Provider = {
  label: 'JMAP',

  async connect(input) {
    const settings = {
      sessionURL: httpsURL(input?.sessionURL, 'JMAP Session URL'),
      webURL: input?.webURL ? httpsURL(input.webURL, t('field_webmail_link')) : '',
    };
    const token = String(input?.token || '').trim();
    if (!token || token.length > 4096 || /\s/.test(token)) throw new Error(t('error_jmap_token'));
    if (!(await chrome.permissions.contains({origins: [`${new URL(settings.sessionURL).origin}/*`]})))
      throw new Error(t('error_jmap_permission'));
    const credentials = {token};
    const current = await session({credentials, settings});
    return {email: current.username, credentials, settings};
  },

  /** API tokens do not expire on their own; a rejected token needs a new one. */
  async renew() {
    throw new AuthError(t('error_jmap_rejected'));
  },

  async signIn() {
    throw new Error(t('error_jmap_renew'));
  },

  async inbox(account, limit) {
    const roles = await mailboxes(account);
    const messages = await query(account, {inMailbox: roles.inbox.id}, limit);
    return {unread: count(roles.inbox.unreadEmails, messages.filter(item => item.unread).length), messages};
  },

  async folders(account) {
    const replies = await run(account, [
      [
        'Mailbox/get',
        {ids: null, properties: ['id', 'name', 'parentId', 'role', 'totalEmails', 'unreadEmails']},
        'folders',
      ],
    ]);
    const list: JMAPMailbox[] = Array.isArray(replies.folders?.list) ? replies.folders.list : [];
    return list
      .slice(0, 200)
      .filter(item => item.id)
      .map(item => ({
        id: item.id,
        name: item.name || item.id,
        parent: item.parentId || undefined,
        role: FOLDER_ROLES.includes(item.role as FolderRole) ? (item.role as FolderRole) : undefined,
        total: item.totalEmails,
        unread: item.unreadEmails,
      }));
  },

  async folder(account, id, limit, cursor) {
    if (cursor && !/^\d{1,7}$/.test(cursor)) throw new Error(t('error_bad_message'));
    const page = await queryPage(account, {inMailbox: id}, limit, Number(cursor || 0));
    return {...page, messages: page.messages.map(item => ({...item, folder: id}))};
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
    const list: JMAPEmail[] = Array.isArray(replies.emails?.list) ? replies.emails.list : [];
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
    const replies = await run(account, [['Email/set', {update: {[item.id]: await patch(account, action)}}, 'set']]);
    const failure = replies.set?.notUpdated?.[item.id];
    if (
      Object.hasOwn(replies.set?.notUpdated || {}, item.id) ||
      !replies.set?.updated ||
      !Object.hasOwn(replies.set.updated, item.id)
    )
      throw new Error(t('error_jmap_generic', String(failure?.description || failure?.type || t('error_generic'))));
  },

  search: (account, text, limit) => query(account, {text}, limit),

  webURL: account => account.settings.webURL || new URL(sessionURL(account)).origin,

  // A draft in Drafts, submitted with the first identity and moved to Sent on success (RFC 8621 §7).
  async reply(account, item, text) {
    const roles = await mailboxes(account);
    if (!roles.drafts || !roles.sent) throw new Error(t('error_jmap_folders'));
    const replies = await run(
      account,
      [
        ['Identity/get', {ids: null}, 'identities'],
        [
          'Email/get',
          {ids: [item.id], properties: ['messageId', 'references', 'from', 'replyTo', 'subject']},
          'original',
        ],
      ],
      [...USING, SUBMISSION],
    );
    const identity = replies.identities?.list?.[0] as {id?: string; email?: string; name?: string} | undefined;
    const original = replies.original?.list?.[0] as
      | {messageId?: string[]; references?: string[]; from?: unknown[]; replyTo?: unknown[]; subject?: string}
      | undefined;
    if (!identity?.id || !identity.email) throw new Error(t('error_jmap_identity'));
    const ids = Array.isArray(original?.messageId) ? original.messageId : [];
    const set = await run(
      account,
      [
        [
          'Email/set',
          {
            create: {
              draft: {
                mailboxIds: {[roles.drafts.id]: true},
                keywords: {$draft: true, $seen: true},
                from: [{email: identity.email, name: identity.name || null}],
                to: original?.replyTo?.length ? original.replyTo : original?.from || [],
                subject: replySubject(original?.subject || item.subject),
                inReplyTo: ids.length ? ids : null,
                references: ids.length ? [...(original?.references || []), ...ids] : null,
                bodyValues: {body: {value: text}},
                textBody: [{partId: 'body', type: 'text/plain'}],
              },
            },
          },
          'email',
        ],
        [
          'EmailSubmission/set',
          {
            create: {send: {identityId: identity.id, emailId: '#draft'}},
            onSuccessUpdateEmail: {
              '#send': {
                [mailboxPath(roles.drafts.id)]: null,
                [mailboxPath(roles.sent.id)]: true,
                'keywords/$draft': null,
              },
            },
          },
          'submission',
        ],
      ],
      [...USING, SUBMISSION],
    );
    if (set.email?.notCreated || set.submission?.notCreated) throw new Error(t('error_jmap_send'));
  },
};
