/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Shared data types for the service worker, the popup and Settings.
 *
 * @module shared/types
 */

/**
 * Provider identifiers.
 *
 * Gmail, Outlook and JMAP use APIs; Yandex and Mail.ru use the browser's
 * webmail session. iCloud is available only in sandbox fixtures.
 */
export type ProviderID = 'gmail' | 'outlook' | 'jmap' | 'yandex' | 'mailru' | 'icloud';

/** Theme preference: follow the system or force a scheme. */
export type Theme = 'auto' | 'light' | 'dark';

/** Palette preference: a warm palette with an accent colour, or monochrome graphite. */
export type Palette = 'orange' | 'blue' | 'cyan' | 'green' | 'pink' | 'purple' | 'red' | 'yellow' | 'gray' | 'neutral';

/** Toolbar popup size: the two-column client or a narrow one-column client. */
export type PopupSize = 'full' | 'mini';

/** Normalized user preferences. */
export interface Preferences {
  /** Minutes between background checks. */
  interval: number;
  /** Show a system notification for new messages. */
  notifications: boolean;
  /** Unread messages listed per mailbox. */
  limit: number;
  theme: Theme;
  palette: Palette;
  popup: PopupSize;
}

/** Access credentials; only the service worker sees them. */
export interface Credentials {
  token: string;
  refreshToken?: string;
  /** Stable Google account ID for account-specific Chrome token renewal; worker-only. */
  googleAccountID?: string;
  /** Expiry in milliseconds since the epoch; absent when expiration is managed externally. */
  expiresAt?: number;
}

/** Provider-specific account settings. */
export interface AccountSettings {
  /** JMAP session URL. */
  sessionURL?: string;
  /** JMAP webmail URL. */
  webURL?: string;
  /** Read through the browser's own sign-in instead of an API token (Gmail, Yandex Mail, Mail.ru). */
  browser?: boolean;
  /** The colour chosen for the account, one of `ACCOUNT_COLORS`; by position when absent. */
  color?: string;
}

/** A stored account, including credentials. */
export interface Account {
  id: string;
  provider: ProviderID;
  email: string;
  credentials: Credentials;
  settings: AccountSettings;
}

/** Smart Inbox category. */
export type Category = 'people' | 'notifications' | 'newsletters';

/** Well-known server folder roles, independent of provider names and IDs. */
export type FolderRole = 'inbox' | 'sent' | 'archive' | 'trash' | 'spam' | 'drafts';

/** A server folder or Gmail label. Custom names are shown as returned by the server. */
export interface MailFolder {
  id: string;
  name: string;
  role?: FolderRole;
  parent?: string;
  /** Total messages, when the server provides it; never the length of a loaded page. */
  total?: number;
  /** Unread messages reported by the server. */
  unread?: number;
  /** Gmail's virtual Archive uses the provider's result-size estimate. */
  approximate?: boolean;
  /** A common total includes only folders whose servers supplied a count, so it is a lower bound. */
  partial?: boolean;
}

/** One bounded page of folder messages; an empty cursor means the last page. */
export interface FolderPage {
  messages: MailMessage[];
  next: string;
}

/** A provider page can stop at a documented service ceiling rather than a complete result set. */
export interface SearchMessagePage extends FolderPage {
  limited?: boolean;
}

/** A continuation belongs to one account and is opaque to the client. */
export interface SearchCursor {
  account: string;
  cursor: string;
}

/** Success, retry position or unsupported status for one searched account. */
export interface SearchAccountPage extends SearchCursor {
  error: string;
  unsupported?: boolean;
  limited?: boolean;
}

/** A bounded global page; successful accounts survive another account's failure. */
export interface SearchPage {
  hits: SearchHit[];
  pages: SearchAccountPage[];
}

/** A bounded Inbox message record for lists. */
export interface MailMessage {
  id: string;
  thread: string;
  from: string;
  subject: string;
  snippet: string;
  /** Received time in milliseconds; nonpositive values preserve server order when the date is unknown. */
  date: number;
  /** HTTPS link to the message in webmail, or empty. */
  link: string;
  unread: boolean;
  /** Starred (Gmail), flagged (Outlook) or `$flagged` (JMAP). */
  pinned: boolean;
  category: Category;
  attachments: boolean;
  /** Server folder context for actions outside the stored Inbox. */
  folder?: string;
}

/** Inbox state returned by a provider: the latest messages and the unread count. */
export interface InboxResult {
  unread: number;
  /** The unread count is a lower bound because the provider did not return an authoritative total. */
  unreadPartial?: boolean;
  messages: MailMessage[];
}

/** Attachment metadata; content is not downloaded in v0.2. */
export interface Attachment {
  name: string;
  size: number;
  type: string;
}

/** A message of an opened conversation, with its body. */
export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: number;
  /** Untrusted HTML; pages sanitize it before rendering. */
  html: string;
  /** Plain-text body when no HTML part exists. */
  text: string;
  unread: boolean;
  attachments: Attachment[];
}

/** Persisted conversation returned before its network revalidation. */
export interface CachedThread {
  messages: ThreadMessage[];
  fetchedAt: number;
}

/** Message actions available in lists and the reader. */
export type MessageAction = 'archive' | 'trash' | 'read' | 'unread' | 'pin' | 'unpin';

/** The last check result for an account. */
export interface Mailbox extends InboxResult {
  /** User-facing error of the last check, or empty. */
  error: string;
  /** Whether the account needs a new sign-in or token. */
  reauth: boolean;
  checkedAt: number;
  /** Whether a successful check established the baseline for notifications. */
  notified?: boolean;
}

/** Data kept in `chrome.storage.local`. */
export interface Store {
  preferences?: Partial<Preferences>;
  accounts?: Account[];
  mailboxes?: Record<string, Mailbox>;
}

/** An account as extension pages see it: no credentials. */
export interface PublicAccount {
  id: string;
  provider: ProviderID;
  label: string;
  email: string;
  /** Read through the browser's own sign-in. */
  browser: boolean;
  /** The chosen colour, or empty for the colour by position. */
  color: string;
  /** The worker has a server-search adapter for this connection. */
  search?: boolean;
  /** Replies are written in the extension; otherwise they open in the webmail. */
  reply: boolean;
}

/** State sent to the client pages and Settings. */
export interface PublicState {
  preferences: Preferences;
  accounts: PublicAccount[];
  mailboxes: Record<string, Mailbox>;
  oauth: {
    google: boolean;
    microsoft: boolean;
    redirect: {google: string; microsoft: string};
  };
}

/** Requests from extension pages to the service worker. */
export type Request =
  | {type: 'STATE'}
  | {type: 'CHECK'}
  | {type: 'OPTIONS'}
  | {type: 'OPEN_APP'}
  | {type: 'OPEN'; account: string; message?: string; entry?: MailMessage}
  | {type: 'FOLDERS'; account: string}
  | {type: 'FOLDER'; account: string; folder: string; cursor?: string}
  | {type: 'CACHED_THREAD'; account: string; message: string; thread: string}
  | {type: 'CLEAR_CACHE'}
  | {type: 'THREAD'; account: string; message: string; thread: string; entry?: MailMessage}
  | {type: 'REPLY'; account: string; message: string; text: string; entry?: MailMessage}
  | {type: 'ACT'; account: string; message: string; action: MessageAction; entry?: MailMessage}
  | {type: 'SEARCH'; query: string; pages?: SearchCursor[]}
  | {type: 'SIGN_IN'; account: string}
  | {type: 'PREFERENCES'; value: Partial<Preferences>}
  | {type: 'ADD_ACCOUNT'; provider: ProviderID; input?: AccountInput; browser?: boolean}
  | {type: 'REMOVE_ACCOUNT'; account: string}
  | {type: 'ACCOUNT_COLOR'; account: string; color: string};

/** A search hit: a message with its account. */
export interface SearchHit {
  account: string;
  message: MailMessage;
}

/** Request type names. */
export type RequestType = Request['type'];

/** Settings form values for a new account: JMAP fields, or the address of a mailbox read through the browser. */
export type AccountInput = Partial<JMAPInput> & {email?: string};

/** Settings form values for a JMAP account. */
export interface JMAPInput {
  sessionURL: string;
  token: string;
  webURL?: string;
}

/** Worker reply envelope. */
export type Reply<T = unknown> = {ok: true; value: T} | {ok: false; error: string};
