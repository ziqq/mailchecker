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
 * `yandex`, `mailru` and `icloud` are IMAP-only services without an HTTP
 * mail API. They have no adapter yet (see docs/SAFARI.md, IMAP bridge):
 * the worker rejects them, and only the sandbox shows them.
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
  /** Expiry in milliseconds since the epoch; absent for non-expiring tokens. */
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

/** A bounded Inbox message record for lists. */
export interface MailMessage {
  id: string;
  thread: string;
  from: string;
  subject: string;
  snippet: string;
  /** Received time in milliseconds since the epoch. */
  date: number;
  /** HTTPS link to the message in webmail, or empty. */
  link: string;
  unread: boolean;
  /** Starred (Gmail), flagged (Outlook) or `$flagged` (JMAP). */
  pinned: boolean;
  category: Category;
  attachments: boolean;
}

/** Inbox state returned by a provider: the latest messages and the unread count. */
export interface InboxResult {
  unread: number;
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
  | {type: 'OPEN'; account: string; message?: string}
  | {type: 'THREAD'; account: string; message: string; thread: string}
  | {type: 'ACT'; account: string; message: string; action: MessageAction}
  | {type: 'SEARCH'; query: string}
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
