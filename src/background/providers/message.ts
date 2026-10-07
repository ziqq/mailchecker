/**
 * The provider contract, message normalization and Smart Inbox categories.
 *
 * @module background/providers/message
 */
import type {
  Account,
  AccountSettings,
  Attachment,
  Category,
  Credentials,
  InboxResult,
  JmapInput,
  MailMessage,
  MessageAction,
  ThreadMessage,
} from '../../shared/types';

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
  /** The latest Inbox messages, newest first, and the Inbox unread count. */
  inbox(account: Account, limit: number): Promise<InboxResult>;
  /** Messages of a conversation with bodies, oldest first. */
  thread(account: Account, message: Pick<MailMessage, 'id' | 'thread'>): Promise<ThreadMessage[]>;
  /** Applies an action to one message. */
  act(account: Account, message: Pick<MailMessage, 'id'>, action: MessageAction): Promise<void>;
  /** Searches all mail of the account, newest first. */
  search(account: Account, query: string, limit: number): Promise<MailMessage[]>;
  /** The webmail page for the Inbox or a message. */
  webURL(account: Account, message?: MailMessage | null): string;
}

/** Maximum stored characters of an HTML body (bodies are never persisted). */
const MAX_HTML = 2 * 1024 * 1024;

/** Returns a trimmed single-line string of at most [max] characters. */
export const text = (value: unknown, max: number): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Senders that send automated mail. */
const AUTOMATED =
  /(^|[.<\s"])(no-?reply|do-?not-?reply|notifications?|notify|alerts?|mailer(-daemon)?|bounces?|system|automated|support|billing|security|updates?)[@.+-]/i;

/** Signals used to categorize a message. */
export interface CategorySignals {
  from: string;
  /** A List-Unsubscribe header or provider flag. */
  listUnsubscribe?: boolean;
  /** A `Precedence: bulk|list` header. */
  bulk?: boolean;
  /** Gmail category labels. */
  labels?: string[];
}

/**
 * Returns the Smart Inbox category from provider signals.
 *
 * Newsletters carry List-Unsubscribe or Gmail's promotions label;
 * notifications come from automated senders or Gmail updates/social/forums;
 * everything else is from people.
 */
export function categorize({from, listUnsubscribe, bulk, labels = []}: CategorySignals): Category {
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'newsletters';
  if (labels.some(label => ['CATEGORY_UPDATES', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'].includes(label)))
    return listUnsubscribe ? 'newsletters' : 'notifications';
  if (AUTOMATED.test(from)) return listUnsubscribe && !/security|alert/i.test(from) ? 'newsletters' : 'notifications';
  if (listUnsubscribe || bulk) return 'newsletters';
  return 'people';
}

/** Untrusted provider fields for one message. */
export interface RawMessage {
  id: unknown;
  thread?: unknown;
  from?: unknown;
  subject?: unknown;
  snippet?: unknown;
  date?: unknown;
  link?: unknown;
  unread?: unknown;
  pinned?: unknown;
  category?: Category;
  attachments?: unknown;
}

/** Returns an HTTPS URL string or empty. */
function httpsLink(value: unknown): string {
  try {
    if (typeof value === 'string' && new URL(value).protocol === 'https:') return value.slice(0, 2048);
  } catch {
    /* An invalid link falls back to the Inbox URL. */
  }
  return '';
}

/** Returns a finite timestamp or now. */
const timestamp = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : Date.now());

/**
 * Returns a bounded message record from provider data.
 *
 * @param value Provider fields.
 */
export function message(value: RawMessage): MailMessage {
  return {
    id: text(value.id, 512),
    thread: text(value.thread, 512),
    from: text(value.from, 320),
    subject: text(value.subject, 300) || '(без темы)',
    snippet: text(value.snippet, 300),
    date: timestamp(value.date),
    link: httpsLink(value.link),
    unread: Boolean(value.unread),
    pinned: Boolean(value.pinned),
    category: value.category || 'people',
    attachments: Boolean(value.attachments),
  };
}

/** Untrusted provider fields for one conversation message. */
export interface RawThreadMessage {
  id: unknown;
  from?: unknown;
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  date?: unknown;
  html?: unknown;
  text?: unknown;
  unread?: unknown;
  attachments?: {name?: unknown; size?: unknown; type?: unknown}[];
}

/**
 * Returns a bounded conversation message from provider data.
 *
 * @param value Provider fields.
 */
export function threadMessage(value: RawThreadMessage): ThreadMessage {
  const attachments: Attachment[] = (Array.isArray(value.attachments) ? value.attachments : [])
    .slice(0, 50)
    .map(item => ({
      name: text(item.name, 255) || 'attachment',
      size: Math.max(0, Number(item.size) || 0),
      type: text(item.type, 120),
    }));
  return {
    id: text(value.id, 512),
    from: text(value.from, 320),
    to: text(value.to, 2000),
    cc: text(value.cc, 2000),
    subject: text(value.subject, 300) || '(без темы)',
    date: timestamp(value.date),
    html: String(value.html ?? '').slice(0, MAX_HTML),
    text: String(value.text ?? '').slice(0, MAX_HTML),
    unread: Boolean(value.unread),
    attachments,
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

/** Formats `{name, address}` pairs as a header value. */
export const addresses = (list: {name?: string; address?: string; email?: string}[] | undefined): string =>
  (list || [])
    .map(item => {
      const address = item.address || item.email || '';
      return item.name ? `${item.name} <${address}>` : address;
    })
    .join(', ');
