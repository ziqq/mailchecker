/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Mock mailboxes for the sandbox build: six accounts (every provider ID),
 * every Smart Inbox category, notification stacks, pinned messages,
 * attachments, long text, HTML with remote images and a tracker, a
 * multi-message conversation, an expired sign-in and a failed check.
 *
 * Everything is created by functions, so release bundles tree-shake it.
 *
 * @module sandbox/fixtures
 */
import type {
  Attachment,
  Category,
  Mailbox,
  MailFolder,
  MailMessage,
  PublicAccount,
  ThreadMessage,
} from '../shared/types';
import {FOLDER_ROLES} from '../shared/folders';

/** Mock data: public accounts, mailboxes, extra mail found only by search, conversations and incoming mail. */
export interface Fixtures {
  accounts: PublicAccount[];
  mailboxes: Record<string, Mailbox>;
  /** Archived mail per account, found by search only. */
  archive: Record<string, MailMessage[]>;
  /** Conversations by `account/thread`, oldest first. */
  threads: Record<string, ThreadMessage[]>;
  /** Messages delivered by the next check, per account. */
  incoming: Record<string, MailMessage[]>;
  /** Server catalogs and non-Inbox messages used by on-demand folder navigation. */
  folders: Record<string, MailFolder[]>;
  folderMessages: Record<string, Record<string, MailMessage[]>>;
}

/** Message fields a fixture may set; the rest have defaults. */
type Draft = Partial<MailMessage> & Pick<MailMessage, 'id' | 'from' | 'subject'> & {ago: number};

/** Creates a list message [ago] milliseconds before [now]. */
function message(now: number, {ago, ...draft}: Draft): MailMessage {
  return {
    thread: draft.id,
    snippet: '',
    link: '',
    unread: false,
    pinned: false,
    category: 'people' as Category,
    attachments: false,
    ...draft,
    date: now - ago,
  };
}

/** Creates a conversation message. */
function reply(
  now: number,
  draft: Partial<ThreadMessage> & Pick<ThreadMessage, 'id' | 'from' | 'subject'> & {ago: number},
): ThreadMessage {
  const {ago, ...rest} = draft;
  return {
    to: 'Anton <anton@gmail.com>',
    cc: '',
    html: '',
    text: '',
    unread: false,
    attachments: [],
    ...rest,
    date: now - ago,
  };
}

/**
 * Creates the sandbox fixtures relative to [now].
 *
 * @param now Current time in milliseconds since the epoch.
 */
export function createFixtures(now: number): Fixtures {
  /** Minutes, hours and days in milliseconds. */
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  const m = (draft: Draft) => message(now, draft);

  /** A newsletter with remote images and a tracking pixel. */
  const NEWSLETTER_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif">
  <tr><td style="padding:24px;background:#1d1d1f;color:#fff"><h1 style="margin:0;font-size:22px">Weekly digest</h1></td></tr>
  <tr><td style="padding:16px"><img src="https://images.example.com/hero.jpg" width="560" alt="Cover" style="max-width:100%"></td></tr>
  <tr><td style="padding:0 16px 16px;line-height:1.5">
  <h2>Five articles worth reading</h2>
  <ol><li><a href="https://example.com/1">How Manifest V3 works</a></li>
  <li><a href="https://example.com/2">JMAP vs. IMAP: why HTTP</a></li>
  <li><a href="https://example.com/3">SolidJS without a virtual DOM</a></li>
  <li><a href="https://example.com/4">Dark mode without flicker</a></li>
  <li><a href="https://example.com/5">Sandboxed iframes and CSP</a></li></ol>
  <p style="color:#888;font-size:12px">You received this email because you subscribed to our newsletter. <a href="https://example.com/unsubscribe">Unsubscribe</a></p>
  </td></tr></table>
  <img src="https://track.example.com/open.gif?u=42" width="1" height="1" alt="">`;

  /** A notification with a styled call to action. */
  const CI_HTML = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px">
  <p><strong>build / test (ubuntu-latest)</strong> failed.</p>
  <pre style="background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto">✗ tests/inbox.test.mjs › stacks repeated notifications
    AssertionError: expected 2 stacks, got 3</pre>
  <p><a href="https://github.com/ziqq/mailchecker/actions" style="display:inline-block;padding:8px 14px;background:#1f883d;color:#fff;border-radius:6px;text-decoration:none">View workflow run</a></p>
  </div>`;

  /** A long plain-text letter. */
  const LONG_TEXT = Array.from(
    {length: 12},
    (_, index) =>
      `${index + 1}. This is a paragraph in a long plain-text email. It checks line wrapping, ` +
      'reader scrolling and frame height: text should wrap at word boundaries and stay within the column.',
  ).join('\n\n');

  /** An attachment list. */
  const FILES: Attachment[] = [
    {name: 'Contract_2026_final_version_with_legal_review.pdf', size: 2_457_600, type: 'application/pdf'},
    {name: 'Estimate.xlsx', size: 48_300, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
    {name: 'photo.jpg', size: 912, type: 'image/jpeg'},
  ];

  const accounts: PublicAccount[] = [
    {
      id: 'gmail',
      provider: 'gmail',
      label: 'Gmail / Google Workspace',
      email: 'anton@gmail.com',
      browser: false,
      color: '',
      reply: true,
    },
    {
      id: 'work',
      provider: 'outlook',
      label: 'Outlook / Microsoft 365',
      email: 'a.ustinoff@company.onmicrosoft.com',
      browser: false,
      color: '',
      reply: true,
    },
    {
      id: 'fastmail',
      provider: 'jmap',
      label: 'JMAP',
      email: 'anton@fastmail.com',
      browser: false,
      color: '',
      reply: true,
    },
    {
      id: 'yandex',
      provider: 'yandex',
      label: 'Yandex Mail',
      email: 'anton@yandex.ru',
      browser: true,
      color: '',
      reply: false,
    },
    {
      id: 'mailru',
      provider: 'mailru',
      label: 'Mail.ru',
      email: 'anton@mail.ru',
      browser: true,
      color: '',
      reply: false,
    },
    {
      id: 'icloud',
      provider: 'icloud',
      label: 'iCloud Mail',
      email: 'anton@icloud.com',
      browser: false,
      color: '',
      reply: true,
    },
  ];

  const inbox: Record<string, MailMessage[]> = {
    gmail: [
      m({
        id: 'g1',
        thread: 'g-trip',
        from: 'Maria Ivanova <maria@example.com>',
        subject: 'Re: Trip to Kazan — tickets and hotel',
        snippet: 'Great, I will book the hotel for the 12th–15th. I sent the tickets in my previous email.',
        ago: 6 * MINUTE,
        unread: true,
        attachments: true,
      }),
      m({
        id: 'g2',
        from: 'GitHub <notifications@github.com>',
        subject: '[ziqq/mailchecker] Run failed: Verify mailchecker - main',
        snippet: 'build / test (ubuntu-latest) failed.',
        ago: 18 * MINUTE,
        unread: true,
        category: 'notifications',
      }),
      m({
        id: 'g3',
        from: 'GitHub <notifications@github.com>',
        subject: '[ziqq/mailchecker] Run failed: Verify mailchecker - main',
        snippet: 'build / test (ubuntu-latest) failed.',
        ago: 2 * HOUR,
        unread: true,
        category: 'notifications',
      }),
      m({
        id: 'g4',
        from: 'GitHub <notifications@github.com>',
        subject: '[ziqq/mailchecker] Run failed: Verify mailchecker - main',
        snippet: 'build / test (ubuntu-latest) failed.',
        ago: 5 * HOUR,
        category: 'notifications',
      }),
      m({
        id: 'g5',
        from: 'Habr Digest <digest@habr.com>',
        subject: 'Weekly digest: Manifest V3, JMAP and SolidJS',
        snippet: 'Five articles worth reading this weekend.',
        ago: 9 * HOUR,
        unread: true,
        category: 'newsletters',
      }),
      m({
        id: 'g6',
        from: 'Alexey Smirnov <alexey@example.com>',
        subject: 'Contract for review',
        snippet: 'The final contract and estimate are attached. Please review them by Friday.',
        ago: 1 * DAY,
        pinned: true,
        attachments: true,
      }),
      m({
        id: 'g7',
        from: 'Google <no-reply@accounts.google.com>',
        subject: 'Security alert',
        snippet: 'A new device signed in to your account.',
        ago: 2 * DAY,
        category: 'notifications',
      }),
    ],
    work: [
      m({
        id: 'w1',
        from: 'Elena Kuznetsova <e.kuznetsova@company.com>',
        subject: 'Team meeting moved to 3:00 PM',
        snippet: 'The team meeting is moving to avoid a conflict with the client call.',
        ago: 40 * MINUTE,
        unread: true,
      }),
      m({
        id: 'w2',
        from: 'Microsoft Teams <noreply@email.teams.microsoft.com>',
        subject: 'You have missed messages',
        snippet: 'Elena Kuznetsova: could you review the presentation?',
        ago: 3 * HOUR,
        category: 'notifications',
      }),
    ],
    fastmail: [
      m({
        id: 'f1',
        from: 'Dmitry <dmitry@example.org>',
        subject:
          'A very long email subject that does not fit on a single list row and should truncate neatly with an ellipsis at every width',
        snippet: LONG_TEXT.slice(0, 200),
        ago: 3 * HOUR,
        unread: true,
      }),
      m({
        id: 'f2',
        from: 'Fastmail <support@fastmail.com>',
        subject: 'Your October invoice',
        snippet: 'Thank you for using Fastmail.',
        ago: 4 * DAY,
        category: 'notifications',
      }),
    ],
    yandex: [
      m({
        id: 'y1',
        from: 'Yandex Market <noreply@market.yandex.ru>',
        subject: 'Order #48213 is on its way',
        snippet: 'Your courier will arrive tomorrow between 10:00 AM and 2:00 PM.',
        ago: 50 * MINUTE,
        unread: true,
        category: 'notifications',
      }),
      m({
        id: 'y2',
        from: 'Olga Petrova <olga.petrova@yandex.ru>',
        subject: 'Photos from the weekend',
        snippet: 'I finally sorted the photos. Here are my favorites!',
        ago: 7 * HOUR,
        attachments: true,
        pinned: true,
      }),
    ],
    mailru: [],
    icloud: [
      m({
        id: 'i1',
        from: 'Apple <no_reply@email.apple.com>',
        subject: 'Your receipt from Apple',
        snippet: 'iCloud+ 50 GB — RUB 149 per month.',
        ago: 1 * DAY + 2 * HOUR,
        category: 'notifications',
      }),
      m({
        id: 'i2',
        from: 'Dad <papa@icloud.com>',
        subject: 'No subject',
        snippet: 'Call me when you have a moment.',
        ago: 26 * MINUTE,
        unread: true,
      }),
    ],
  };

  const mailboxes: Record<string, Mailbox> = {};
  const extra: Record<string, number> = {gmail: 12, work: 3, fastmail: 0, yandex: 41, mailru: 0, icloud: 0};
  for (const {id} of accounts)
    mailboxes[id] = {
      unread: inbox[id].filter(item => item.unread).length + extra[id],
      messages: inbox[id],
      error: '',
      reauth: false,
      checkedAt: now - 2 * MINUTE,
      notified: true,
    };
  mailboxes.work = {...mailboxes.work, error: 'Your session has expired. Sign in again.', reauth: true};
  mailboxes.mailru = {
    ...mailboxes.mailru,
    error: 'The server did not respond in time. Try again later.',
    checkedAt: now - HOUR,
  };

  const archive: Record<string, MailMessage[]> = {
    gmail: [
      m({
        id: 'g-old',
        from: 'Maria Ivanova <maria@example.com>',
        subject: 'Trip to Kazan',
        snippet: 'Shall we go to Kazan next month?',
        ago: 20 * DAY,
      }),
    ],
    yandex: [
      m({
        id: 'y-old',
        from: 'Yandex ID <id@yandex.ru>',
        subject: 'Account sign-in',
        snippet: 'Someone signed in to your Yandex ID account.',
        ago: 30 * DAY,
        category: 'notifications',
      }),
    ],
  };

  const threads: Record<string, ThreadMessage[]> = {
    'gmail/g-trip': [
      reply(now, {
        id: 'g-old',
        from: 'Maria Ivanova <maria@example.com>',
        subject: 'Trip to Kazan',
        text: 'Hi! Shall we go to Kazan next month? I found tickets for a convenient train on Friday evening.',
        ago: 20 * DAY,
      }),
      reply(now, {
        id: 'g-mine',
        from: 'Anton <anton@gmail.com>',
        to: 'Maria Ivanova <maria@example.com>',
        subject: 'Re: Trip to Kazan',
        html: '<p>Sounds great! Please book the lower berths.</p><blockquote>Hi! Shall we go to Kazan…</blockquote>',
        ago: 19 * DAY,
      }),
      reply(now, {
        id: 'g1',
        from: 'Maria Ivanova <maria@example.com>',
        cc: 'Olga Petrova <olga.petrova@yandex.ru>',
        subject: 'Re: Trip to Kazan — tickets and hotel',
        html: '<p>Great, I will book the hotel for the <b>12th–15th</b>. The tickets are attached.</p><p>Olga, are you joining us?</p>',
        unread: true,
        attachments: [FILES[0], FILES[2]],
        ago: 6 * MINUTE,
      }),
    ],
    'gmail/g2': [
      reply(now, {
        id: 'g2',
        from: 'GitHub <notifications@github.com>',
        subject: '[ziqq/mailchecker] Run failed: Verify mailchecker - main',
        html: CI_HTML,
        ago: 18 * MINUTE,
      }),
    ],
    'gmail/g5': [
      reply(now, {
        id: 'g5',
        from: 'Habr Digest <digest@habr.com>',
        subject: 'Weekly digest: Manifest V3, JMAP and SolidJS',
        html: NEWSLETTER_HTML,
        ago: 9 * HOUR,
      }),
    ],
    'gmail/g6': [
      reply(now, {
        id: 'g6',
        from: 'Alexey Smirnov <alexey@example.com>',
        subject: 'Contract for review',
        text: 'Hi!\n\nThe final contract and estimate are attached. Please review them by Friday.\n\n— Alexey',
        attachments: FILES.slice(0, 2),
        ago: 1 * DAY,
      }),
    ],
    'fastmail/f1': [
      reply(now, {
        id: 'f1',
        from: 'Dmitry <dmitry@example.org>',
        to: 'anton@fastmail.com',
        subject:
          'A very long email subject that does not fit on a single list row and should truncate neatly with an ellipsis at every width',
        text: LONG_TEXT,
        ago: 3 * HOUR,
      }),
    ],
  };

  const incoming: Record<string, MailMessage[]> = {
    icloud: [
      m({
        id: 'i-new',
        from: 'Mom <mama@icloud.com>',
        subject: 'Where are you?',
        snippet: 'I could not reach you. Please call me back.',
        ago: 0,
        unread: true,
      }),
    ],
  };

  const folders = Object.fromEntries(
    accounts.map(account => [
      account.id,
      [
        ...FOLDER_ROLES.map(role => ({id: role, name: '', role})),
        {id: 'projects', name: 'Projects'},
        {id: 'projects/client', name: 'Client', parent: 'projects'},
      ],
    ]),
  );
  const folderMessages = Object.fromEntries(
    accounts.map(account => [
      account.id,
      Object.fromEntries([
        ...FOLDER_ROLES.filter(role => role !== 'inbox').map(role => [
          role,
          role === 'archive'
            ? archive[account.id] || []
            : [
                m({
                  id: `${account.id}-${role}`,
                  from: role === 'sent' || role === 'drafts' ? account.email : 'Sender <sender@example.com>',
                  subject: `${role} · ${account.email}`,
                  snippet: 'A message in this folder.',
                  ago: HOUR,
                  unread: role === 'spam',
                  folder: role,
                }),
              ],
        ]),
        [
          'projects',
          Array.from({length: 55}, (_, index) =>
            m({
              id: `${account.id}-project-${index}`,
              from: 'Project <project@example.com>',
              subject: `Project ${index + 1}`,
              snippet: 'A message in a custom folder.',
              ago: (index + 1) * MINUTE,
              folder: 'projects',
            }),
          ),
        ],
        ['projects/client', []],
      ]),
    ]),
  );
  return {accounts, mailboxes, archive, threads, incoming, folders, folderMessages};
}
