/**
 * The provider contract and message normalization.
 *
 * @module background/providers/message
 */
import type {Account, AccountSettings, Credentials, InboxResult, JmapInput, MailMessage} from '../../shared/types';

/** Result of connecting a mailbox. */
export interface Connection {
  email: string;
  credentials: Credentials;
  settings: AccountSettings;
}

/** A mail provider adapter. */
export interface Provider {
  /** Display name. */
  readonly label: string;
  /** Verifies and creates an account; `input` is used by JMAP. */
  connect(input?: JmapInput): Promise<Connection>;
  /** Silent renewal; throws `AuthError` when a sign-in is needed. */
  renew(account: Account): Promise<Credentials>;
  /** Interactive sign-in for an existing account. */
  signIn(account: Account): Promise<Credentials>;
  /** Unread Inbox messages, newest first. */
  inbox(account: Account, limit: number): Promise<InboxResult>;
  markRead(account: Account, message: MailMessage): Promise<void>;
  trash(account: Account, message: MailMessage): Promise<void>;
  /** The webmail page for the Inbox or a message. */
  webURL(account: Account, message?: MailMessage | null): string;
}

/** Returns a trimmed single-line string of at most [max] characters. */
const text = (value: unknown, max: number): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Untrusted provider fields for one message. */
export interface RawMessage {
  id: unknown;
  thread?: unknown;
  from?: unknown;
  subject?: unknown;
  snippet?: unknown;
  date?: unknown;
  link?: unknown;
}

/**
 * Returns a bounded message record from provider data.
 *
 * @param value Provider fields.
 */
export function message(value: RawMessage): MailMessage {
  const date = Number(value.date);
  let link = '';
  try {
    if (typeof value.link === 'string' && new URL(value.link).protocol === 'https:') link = value.link.slice(0, 2048);
  } catch {
    /* An invalid link falls back to the Inbox URL. */
  }
  return {
    id: text(value.id, 512),
    thread: text(value.thread, 512),
    from: text(value.from, 320),
    subject: text(value.subject, 300) || '(без темы)',
    snippet: text(value.snippet, 300),
    date: Number.isFinite(date) ? date : Date.now(),
    link,
  };
}

/**
 * Returns a non-negative integer unread count, or [fallback].
 *
 * @param value The provider's count.
 * @param fallback The listed message count.
 */
export function count(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
