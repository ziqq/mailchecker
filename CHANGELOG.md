# Changelog

## 0.2.0

- **ADDED**: a full mail client in the toolbar popup (780×600) and a full-tab mode (⤢), built with SolidJS
- **ADDED**: unified Inbox across accounts with an account switcher, Smart Inbox categories (people, notifications, newsletters), pinned messages and stacks of repeated notifications (`×N`)
- **ADDED**: conversation reader with collapsed earlier messages, attachment list, and safe HTML rendering: sanitized bodies in a script-free sandboxed frame with its own CSP, remote images and tracking pixels blocked until allowed
- **ADDED**: archive, trash, read/unread and pin (Gmail star, Outlook flag, JMAP `$flagged`) synced with the provider; opening a message marks it read
- **ADDED**: search across all accounts and keyboard shortcuts (`J`/`K`, `E`, `#`, `U`, `S`, `/`, `Esc`)
- **ADDED**: responsive layouts: three columns in wide tabs, list and reader in the popup, one column with back navigation on narrow screens and iPhone
- **ADDED**: Safari target (`npm run build:safari`), `background/platform.ts` for browser differences and `docs/SAFARI.md`
- **ADDED**: palette in Settings: black and white graphite (the default) or nine accent colours; the unread badge takes the accent; button text is dark or white, whichever has the higher APCA contrast
- **ADDED**: mailboxes through the browser's own sign-in, with nothing to register: Gmail (unread feed), Yandex Mail (lite web Inbox) and Mail.ru (checker API); Inbox, unread count and notifications, messages open in the webmail. Gmail keeps Google sign-in (OAuth) as the full option; Yandex Mail and Mail.ru ask for the address in a dialog
- **ADDED**: mini popup (400×600, one column) chosen in Settings → Оформление → Окно
- **CHANGED**: stored Inbox lists include read messages (default 30 per account); notifications still cover new unread mail only
- **CHANGED**: `MARK_READ`/`TRASH` requests replaced by `ACT`
- **FIXED**: Gmail and Outlook sign-in was unavailable and the redirect URIs blank until the optional `identity` permission was granted

## 0.1.0

- **ADDED**: unread counter on the toolbar badge, popup with unread Inbox messages, account filter, mark-read, trash and open-in-webmail actions
- **ADDED**: Gmail / Google Workspace (Gmail API, OAuth implicit flow with silent renewal), Outlook / Microsoft 365 (Microsoft Graph, PKCE with refresh tokens) and JMAP (API token) providers
- **ADDED**: system notifications for messages that are new since the previous successful check
- **ADDED**: Settings with mailbox management, check interval, list size, notifications, theme (auto/light/dark) and palette (orange accent or neutral)
- **ADDED**: trusted message broker with sender checks, bounded HTTP responses, `credentials: 'omit'`, `redirect: 'error'` and timeouts
- **ADDED**: TypeScript + SCSS sources bundled by esbuild, ESLint, Prettier, `tsc` type checks, Node.js regression tests, reproducible ZIP packaging and CI
