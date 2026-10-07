/**
 * Shared data types for the service worker, the popup and Settings.
 *
 * @module shared/types
 */

/** Provider identifiers. */
export type ProviderId = 'gmail' | 'outlook' | 'jmap';

/** Theme preference: follow the system or force a scheme. */
export type Theme = 'auto' | 'light' | 'dark';

/** Palette preference: orange accent or monochrome. */
export type Palette = 'accent' | 'neutral';

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
}

/** Access credentials; only the service worker sees them. */
export interface Credentials {
  token: string;
  refreshToken?: string;
  /** Expiry in milliseconds since the epoch; absent for non-expiring tokens. */
  expiresAt?: number;
}

/** Provider-specific account settings (JMAP URLs). */
export interface AccountSettings {
  sessionUrl?: string;
  webUrl?: string;
}

/** A stored account, including credentials. */
export interface Account {
  id: string;
  provider: ProviderId;
  email: string;
  credentials: Credentials;
  settings: AccountSettings;
}

/** A bounded unread message record. */
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
}

/** Unread Inbox state returned by a provider. */
export interface InboxResult {
  unread: number;
  messages: MailMessage[];
}

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
  provider: ProviderId;
  label: string;
  email: string;
}

/** State sent to the popup and Settings. */
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
  | {type: 'MARK_READ' | 'TRASH'; account: string; message: string}
  | {type: 'OPEN'; account: string; message?: string}
  | {type: 'SIGN_IN'; account: string}
  | {type: 'PREFERENCES'; value: Partial<Preferences>}
  | {type: 'ADD_ACCOUNT'; provider: ProviderId; input?: JmapInput}
  | {type: 'REMOVE_ACCOUNT'; account: string};

/** Request type names. */
export type RequestType = Request['type'];

/** Settings form values for a JMAP account. */
export interface JmapInput {
  sessionUrl: string;
  token: string;
  webUrl?: string;
}

/** Worker reply envelope. */
export type Reply<T = unknown> = {ok: true; value: T} | {ok: false; error: string};
