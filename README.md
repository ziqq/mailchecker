# mailchecker

A Spark-like mail client that lives in the browser toolbar, for mailboxes on **any domain**: Gmail / Google Workspace, Outlook / Microsoft 365 and JMAP servers such as Fastmail. It runs entirely in the browser: no backend and no companion app (Safari adds a native containing app; see below).

| Provider        | Mailboxes                                                           | Connection        |
| --------------- | ------------------------------------------------------------------- | ----------------- |
| Gmail API       | gmail.com and any domain on Google Workspace                        | Google sign-in    |
| Microsoft Graph | Outlook.com, Hotmail, any domain on Microsoft 365 / Exchange Online | Microsoft sign-in |
| JMAP            | Fastmail (including custom domains), Stalwart, Cyrus and others     | API token         |

IMAP-only services (Yandex, Mail.ru, iCloud and similar) are not supported yet: an extension cannot open IMAP connections, and these services have no HTTP mail API. They are planned through the Safari containing app (see [Safari](docs/SAFARI.md)); the sandbox already shows them.

## Features

- **Opens like Checker Plus:** click the toolbar icon for a full client (780×600): list, reader and actions without leaving the page. ⤢ opens the same client full screen in a tab.
- **Unified Inbox** across all accounts, with an account switcher and per-account colours.
- **Smart Inbox:** people, notifications and newsletters; pinned messages first; repeated notifications (CI failures, alerts) stacked into one `×N` item.
- **Safe reading:** conversations with collapsed history, sanitized HTML in a script-free sandbox, remote images and trackers blocked until you allow them.
- **Actions** synced with the provider: archive, trash, read/unread, pin; search across all accounts; keyboard shortcuts.
- **Responsive:** three columns in a wide tab, two in the popup, one with back navigation on narrow screens and iPhone.
- **Badge and notifications** for new mail; theme (auto/light/dark) and accent colour (nine Telegram iOS accents, orange by default, or neutral graphite).
- **Chromium and Safari** from one codebase — see [Safari](docs/SAFARI.md).

## Development

Requires Node.js 20.19+ (24 recommended) and Python 3.

```sh
npm ci
npm run build      # build/ → chrome://extensions → Load unpacked
npm run check      # format, lint, typecheck, tests, repository checks
npm run build:safari  # build-safari/ → xcrun safari-web-extension-converter
npm run package    # dist/mailchecker-<version>.zip
npm run sandbox    # client on mock mailboxes at http://127.0.0.1:8080/, no extension needed
npm run test:sandbox  # Playwright checks of the client in the sandbox
```

Gmail and Outlook need OAuth client IDs: see [OAuth setup](docs/OAUTH.md). See [Architecture](docs/ARCHITECTURE.md), [Safari](docs/SAFARI.md) and [Privacy](PRIVACY.md). Mockups are in `design/`.

## License

mailchecker is free software under the [GNU General Public License v3.0](LICENSE) (`GPL-3.0-only`). Copyright (C) 2026 Anton Ustinoff.
