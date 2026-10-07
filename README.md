# Mail Checker

A Chrome extension in the spirit of Checker Plus for Gmail, for mailboxes on **any domain**: an unread counter on the toolbar, a popup with unread messages and system notifications for Gmail / Google Workspace, Outlook / Microsoft 365 and JMAP servers such as Fastmail. It runs entirely in the browser: no backend and no companion app.

| Provider        | Mailboxes                                                           | Connection        |
| --------------- | ------------------------------------------------------------------- | ----------------- |
| Gmail API       | gmail.com and any domain on Google Workspace                        | Google sign-in    |
| Microsoft Graph | Outlook.com, Hotmail, any domain on Microsoft 365 / Exchange Online | Microsoft sign-in |
| JMAP            | Fastmail (including custom domains), Stalwart, Cyrus and others     | API token         |

IMAP-only services (Yandex, Mail.ru and similar) are not supported: an extension cannot open IMAP connections, and these services have no HTTP mail API.

## Features

- Total unread count on the badge, `!` when a mailbox needs attention.
- Popup: big unread summary, account filter, per-mailbox cards, mark read, move to trash, open in webmail.
- Notifications for new messages since the previous check.
- Settings: mailboxes, check interval, list size, notifications, theme (auto/light/dark) and palette: orange accent or neutral graphite.

## Development

Requires Node.js 20.19+ (24 recommended) and Python 3.

```sh
npm ci
npm run build      # build/ → chrome://extensions → Load unpacked
npm run check      # format, lint, typecheck, tests, repository checks
npm run package    # dist/mail-checker-<version>.zip
```

Gmail and Outlook need OAuth client IDs: see [OAuth setup](docs/OAUTH.md). See [Architecture](docs/ARCHITECTURE.md) and [Privacy](PRIVACY.md).
