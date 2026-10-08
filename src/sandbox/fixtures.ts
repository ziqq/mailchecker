/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * Mock mailboxes for the sandbox build: six accounts (every provider ID),
 * every Smart Inbox category, notification stacks, pinned messages,
 * attachments, long text, HTML with remote images and a tracker, a
 * multi-message conversation, an expired sign-in and a failed check.
 *
 * Everything is created by functions, so release bundles tree-shake it.
 *
 * @module sandbox/fixtures
 */
import type {Attachment, Category, Mailbox, MailMessage, PublicAccount, ThreadMessage} from '../shared/types';

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
}

/** Minutes, hours and days in milliseconds. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
    to: 'Антон <anton@gmail.com>',
    cc: '',
    html: '',
    text: '',
    unread: false,
    attachments: [],
    ...rest,
    date: now - ago,
  };
}

/** A newsletter with remote images and a tracking pixel. */
const NEWSLETTER_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif">
<tr><td style="padding:24px;background:#1d1d1f;color:#fff"><h1 style="margin:0;font-size:22px">Дайджест недели</h1></td></tr>
<tr><td style="padding:16px"><img src="https://images.example.com/hero.jpg" width="560" alt="Обложка" style="max-width:100%"></td></tr>
<tr><td style="padding:0 16px 16px;line-height:1.5">
<h2>Пять статей, которые стоит прочитать</h2>
<ol><li><a href="https://example.com/1">Как устроен Manifest V3</a></li>
<li><a href="https://example.com/2">JMAP против IMAP: почему HTTP</a></li>
<li><a href="https://example.com/3">SolidJS без виртуального DOM</a></li>
<li><a href="https://example.com/4">Тёмная тема без мерцания</a></li>
<li><a href="https://example.com/5">Песочницы iframe и CSP</a></li></ol>
<p style="color:#888;font-size:12px">Вы получили это письмо, потому что подписались на рассылку. <a href="https://example.com/unsubscribe">Отписаться</a></p>
</td></tr></table>
<img src="https://track.example.com/open.gif?u=42" width="1" height="1" alt="">`;

/** A notification with a styled call to action. */
const CI_HTML = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px">
<p><strong>build / test (ubuntu-latest)</strong> завершился с ошибкой.</p>
<pre style="background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto">✗ tests/inbox.test.mjs › stacks repeated notifications
  AssertionError: expected 2 stacks, got 3</pre>
<p><a href="https://github.com/ziqq/mailchecker/actions" style="display:inline-block;padding:8px 14px;background:#1f883d;color:#fff;border-radius:6px;text-decoration:none">Открыть запуск</a></p>
</div>`;

/** A long plain-text letter. */
const LONG_TEXT = Array.from(
  {length: 12},
  (_, index) =>
    `${index + 1}. Это абзац длинного письма без HTML-части. Он нужен, чтобы проверить переносы строк, ` +
    'прокрутку читалки и высоту фрейма: текст должен переноситься по словам и не выходить за край колонки.',
).join('\n\n');

/** An attachment list. */
const FILES: Attachment[] = [
  {name: 'Договор_2026_финальная_версия_с_правками_юриста.pdf', size: 2_457_600, type: 'application/pdf'},
  {name: 'Смета.xlsx', size: 48_300, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
  {name: 'photo.jpg', size: 912, type: 'image/jpeg'},
];

/**
 * Creates the sandbox fixtures relative to [now].
 *
 * @param now Current time in milliseconds since the epoch.
 */
export function createFixtures(now: number): Fixtures {
  const m = (draft: Draft) => message(now, draft);
  const accounts: PublicAccount[] = [
    {id: 'gmail', provider: 'gmail', label: 'Gmail / Google Workspace', email: 'anton@gmail.com'},
    {id: 'work', provider: 'outlook', label: 'Outlook / Microsoft 365', email: 'a.ustinoff@company.onmicrosoft.com'},
    {id: 'fastmail', provider: 'jmap', label: 'JMAP', email: 'anton@fastmail.com'},
    {id: 'yandex', provider: 'yandex', label: 'Яндекс Почта', email: 'anton@yandex.ru'},
    {id: 'mailru', provider: 'mailru', label: 'Почта Mail.ru', email: 'anton@mail.ru'},
    {id: 'icloud', provider: 'icloud', label: 'iCloud Mail', email: 'anton@icloud.com'},
  ];

  const inbox: Record<string, MailMessage[]> = {
    gmail: [
      m({
        id: 'g1',
        thread: 'g-trip',
        from: 'Мария Иванова <maria@example.com>',
        subject: 'Re: Поездка в Казань — билеты и гостиница',
        snippet: 'Отлично, тогда бронирую гостиницу на 12–15 число. Билеты скинула в предыдущем письме.',
        ago: 6 * MINUTE,
        unread: true,
        attachments: true,
      }),
      m({
        id: 'g2',
        from: 'GitHub <notifications@github.com>',
        subject: '[ziqq/mailchecker] Run failed: Verify mailchecker - main',
        snippet: 'build / test (ubuntu-latest) завершился с ошибкой.',
        ago: 18 * MINUTE,
        unread: true,
        category: 'notifications',
      }),
      m({
        id: 'g3',
        from: 'GitHub <notifications@github.com>',
        subject: '[ziqq/mailchecker] Run failed: Verify mailchecker - main',
        snippet: 'build / test (ubuntu-latest) завершился с ошибкой.',
        ago: 2 * HOUR,
        unread: true,
        category: 'notifications',
      }),
      m({
        id: 'g4',
        from: 'GitHub <notifications@github.com>',
        subject: '[ziqq/mailchecker] Run failed: Verify mailchecker - main',
        snippet: 'build / test (ubuntu-latest) завершился с ошибкой.',
        ago: 5 * HOUR,
        category: 'notifications',
      }),
      m({
        id: 'g5',
        from: 'Хабр Дайджест <digest@habr.com>',
        subject: 'Дайджест недели: Manifest V3, JMAP и SolidJS',
        snippet: 'Пять статей, которые стоит прочитать на выходных.',
        ago: 9 * HOUR,
        unread: true,
        category: 'newsletters',
      }),
      m({
        id: 'g6',
        from: 'Алексей Смирнов <alexey@example.com>',
        subject: 'Договор на согласование',
        snippet: 'Прикладываю финальную версию договора и смету. Посмотри, пожалуйста, до пятницы.',
        ago: 1 * DAY,
        pinned: true,
        attachments: true,
      }),
      m({
        id: 'g7',
        from: 'Google <no-reply@accounts.google.com>',
        subject: 'Оповещение системы безопасности',
        snippet: 'В ваш аккаунт выполнен вход с нового устройства.',
        ago: 2 * DAY,
        category: 'notifications',
      }),
    ],
    work: [
      m({
        id: 'w1',
        from: 'Елена Кузнецова <e.kuznetsova@company.com>',
        subject: 'Планёрка перенесена на 15:00',
        snippet: 'Коллеги, из-за пересечения с клиентом переносим планёрку.',
        ago: 40 * MINUTE,
        unread: true,
      }),
      m({
        id: 'w2',
        from: 'Microsoft Teams <noreply@email.teams.microsoft.com>',
        subject: 'У вас пропущенные сообщения',
        snippet: 'Елена Кузнецова: можешь глянуть презентацию?',
        ago: 3 * HOUR,
        category: 'notifications',
      }),
    ],
    fastmail: [
      m({
        id: 'f1',
        from: 'Дмитрий <dmitry@example.org>',
        subject:
          'Очень длинная тема письма, которая не помещается в одну строку списка и должна аккуратно обрезаться многоточием в любой ширине',
        snippet: LONG_TEXT.slice(0, 200),
        ago: 3 * HOUR,
        unread: true,
      }),
      m({
        id: 'f2',
        from: 'Fastmail <support@fastmail.com>',
        subject: 'Ваш счёт за октябрь',
        snippet: 'Спасибо, что пользуетесь Fastmail.',
        ago: 4 * DAY,
        category: 'notifications',
      }),
    ],
    yandex: [
      m({
        id: 'y1',
        from: 'Яндекс Маркет <noreply@market.yandex.ru>',
        subject: 'Заказ №48213 передан в доставку',
        snippet: 'Курьер привезёт заказ завтра с 10:00 до 14:00.',
        ago: 50 * MINUTE,
        unread: true,
        category: 'notifications',
      }),
      m({
        id: 'y2',
        from: 'Ольга Петрова <olga.petrova@yandex.ru>',
        subject: 'Фото с выходных',
        snippet: 'Наконец-то разобрала фотографии, держи лучшие!',
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
        subject: 'Ваш чек от Apple',
        snippet: 'iCloud+ 50 ГБ — 149 ₽ в месяц.',
        ago: 1 * DAY + 2 * HOUR,
        category: 'notifications',
      }),
      m({
        id: 'i2',
        from: 'Папа <papa@icloud.com>',
        subject: 'Без темы',
        snippet: 'Позвони, как будет время.',
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
  mailboxes.work = {...mailboxes.work, error: 'Сеанс истёк. Войдите снова.', reauth: true};
  mailboxes.mailru = {...mailboxes.mailru, error: 'Сервер не ответил вовремя. Повторите позже.', checkedAt: now - HOUR};

  const archive: Record<string, MailMessage[]> = {
    gmail: [
      m({
        id: 'g-old',
        from: 'Мария Иванова <maria@example.com>',
        subject: 'Поездка в Казань',
        snippet: 'Давай съездим в Казань в следующем месяце?',
        ago: 20 * DAY,
      }),
    ],
    yandex: [
      m({
        id: 'y-old',
        from: 'Яндекс ID <id@yandex.ru>',
        subject: 'Вход в аккаунт',
        snippet: 'Выполнен вход в ваш аккаунт Яндекс ID.',
        ago: 30 * DAY,
        category: 'notifications',
      }),
    ],
  };

  const threads: Record<string, ThreadMessage[]> = {
    'gmail/g-trip': [
      reply(now, {
        id: 'g-old',
        from: 'Мария Иванова <maria@example.com>',
        subject: 'Поездка в Казань',
        text: 'Привет! Давай съездим в Казань в следующем месяце? Я посмотрела билеты — есть удобный поезд в пятницу вечером.',
        ago: 20 * DAY,
      }),
      reply(now, {
        id: 'g-mine',
        from: 'Антон <anton@gmail.com>',
        to: 'Мария Иванова <maria@example.com>',
        subject: 'Re: Поездка в Казань',
        html: '<p>Давай! Я за. Возьми, пожалуйста, нижние полки.</p><blockquote>Привет! Давай съездим в Казань…</blockquote>',
        ago: 19 * DAY,
      }),
      reply(now, {
        id: 'g1',
        from: 'Мария Иванова <maria@example.com>',
        cc: 'Ольга Петрова <olga.petrova@yandex.ru>',
        subject: 'Re: Поездка в Казань — билеты и гостиница',
        html: '<p>Отлично, тогда бронирую гостиницу на <b>12–15 число</b>. Билеты во вложении.</p><p>Оля, ты с нами?</p>',
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
        from: 'Хабр Дайджест <digest@habr.com>',
        subject: 'Дайджест недели: Manifest V3, JMAP и SolidJS',
        html: NEWSLETTER_HTML,
        ago: 9 * HOUR,
      }),
    ],
    'gmail/g6': [
      reply(now, {
        id: 'g6',
        from: 'Алексей Смирнов <alexey@example.com>',
        subject: 'Договор на согласование',
        text: 'Привет!\n\nПрикладываю финальную версию договора и смету. Посмотри, пожалуйста, до пятницы.\n\n— Алексей',
        attachments: FILES.slice(0, 2),
        ago: 1 * DAY,
      }),
    ],
    'fastmail/f1': [
      reply(now, {
        id: 'f1',
        from: 'Дмитрий <dmitry@example.org>',
        to: 'anton@fastmail.com',
        subject:
          'Очень длинная тема письма, которая не помещается в одну строку списка и должна аккуратно обрезаться многоточием в любой ширине',
        text: LONG_TEXT,
        ago: 3 * HOUR,
      }),
    ],
  };

  const incoming: Record<string, MailMessage[]> = {
    icloud: [
      m({
        id: 'i-new',
        from: 'Мама <mama@icloud.com>',
        subject: 'Ты где?',
        snippet: 'Не могу дозвониться, перезвони.',
        ago: 0,
        unread: true,
      }),
    ],
  };

  return {accounts, mailboxes, archive, threads, incoming};
}
