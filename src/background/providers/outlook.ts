/**
 * Outlook.com, Hotmail and Microsoft 365 / Exchange Online (any domain) through Microsoft Graph.
 *
 * @module background/providers/outlook
 */
import type {Credentials} from '../../shared/types';
import {AuthError, requestJSON, type RequestOptions} from '../http';
import * as oauth from '../oauth/flow';
import {count, message, type Provider} from './message';

/** Graph API base for the signed-in user. */
const API = 'https://graph.microsoft.com/v1.0/me';

/** Graph message fields used here. */
interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: {emailAddress?: {name?: string; address?: string}};
  receivedDateTime?: string;
  bodyPreview?: string;
  webLink?: string;
}

/** Sends an authorized Graph request. */
const call = <T>(credentials: Credentials, path: string, options: RequestOptions = {}) =>
  requestJSON<T>(API + path, {...options, token: credentials.token, service: 'Microsoft Graph'});

/** Outlook / Microsoft 365 provider. */
export const outlook: Provider = {
  label: 'Outlook / Microsoft 365',

  async connect() {
    const credentials = await oauth.microsoft();
    const me = await call<{mail?: unknown; userPrincipalName?: unknown}>(
      credentials,
      '?$select=mail,userPrincipalName',
    );
    const email = me?.mail || me?.userPrincipalName;
    if (typeof email !== 'string') throw new Error('Microsoft не вернул адрес ящика.');
    return {email, credentials, settings: {}};
  },

  async renew(account) {
    if (!account.credentials.refreshToken) throw new AuthError();
    return oauth.microsoftRefresh(account.credentials.refreshToken);
  },

  signIn: account => oauth.microsoft({loginHint: account.email}),

  /** Graph rejects `$orderby` combined with this filter, so results are sorted locally. */
  async inbox(account, limit) {
    const query = new URLSearchParams({
      $filter: 'isRead eq false',
      $top: String(limit),
      $select: 'id,conversationId,subject,from,receivedDateTime,bodyPreview,webLink',
    });
    const [folder, list] = await Promise.all([
      call<{unreadItemCount?: unknown}>(account.credentials, '/mailFolders/inbox?$select=unreadItemCount'),
      call<{value?: GraphMessage[]}>(account.credentials, `/mailFolders/inbox/messages?${query}`),
    ]);
    const messages = (Array.isArray(list?.value) ? list.value : [])
      .slice(0, limit)
      .map(item => {
        const sender = item.from?.emailAddress;
        return message({
          id: item.id,
          thread: item.conversationId,
          from: sender ? `${sender.name || ''} <${sender.address || ''}>` : '',
          subject: item.subject,
          snippet: item.bodyPreview,
          date: Date.parse(item.receivedDateTime || ''),
          link: item.webLink,
        });
      })
      .sort((a, b) => b.date - a.date);
    return {unread: count(folder?.unreadItemCount, messages.length), messages};
  },

  async markRead(account, item) {
    await call(account.credentials, `/messages/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      json: {isRead: true},
    });
  },

  async trash(account, item) {
    await call(account.credentials, `/messages/${encodeURIComponent(item.id)}/move`, {
      method: 'POST',
      json: {destinationId: 'deleteditems'},
    });
  },

  webURL: (_account, item) => item?.link || 'https://outlook.office.com/mail/inbox',
};
