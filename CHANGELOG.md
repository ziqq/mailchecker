# Changelog

## 0.0.2

- **CHANGED**: the list title is the size of the logo; the mailbox switcher lines up with the right edge of the list, the actions sit over the reader
- **FIXED**: opening a message of a mailbox read through the browser's sign-in reloaded the whole webmail Inbox; Yandex Mail blocked such bursts of requests
- **FIXED**: a webmail that limits requests (403/429) was reported as signed out; it now reads as a temporary limit

## 0.0.1

- **ADDED**: a full mail client in the toolbar popup (780×600), a mini popup (400×600, one column, Settings → Оформление → Окно) and a full-tab mode (⤢), built with SolidJS
- **ADDED**: Gmail / Google Workspace (Gmail API with Google sign-in), Outlook / Microsoft 365 (Microsoft Graph, PKCE) and JMAP (API token)
- **ADDED**: mailboxes through the browser's own sign-in, with nothing to register: Gmail (unread feed), Yandex Mail (lite web Inbox) and Mail.ru (checker API); Inbox, unread count and notifications, messages open in the webmail. Yandex Mail and Mail.ru ask for the address in a dialog
- **ADDED**: unread counter on the toolbar badge and system notifications for new unread mail
- **ADDED**: unified Inbox across accounts with an account switcher, Smart Inbox categories (people, notifications, newsletters), pinned messages and stacks of repeated notifications (`×N`)
- **ADDED**: conversation reader with collapsed earlier messages, attachment list, and safe HTML rendering: sanitized bodies in a script-free sandboxed frame with its own CSP, remote images and tracking pixels blocked until allowed
- **ADDED**: archive, trash, read/unread and pin (Gmail star, Outlook flag, JMAP `$flagged`) synced with the provider; opening a message marks it read
- **ADDED**: search across all accounts and keyboard shortcuts (`J`/`K`, `E`, `#`, `U`, `S`, `/`, `Esc`)
- **ADDED**: responsive layouts: three columns in wide tabs, list and reader in the popup, one column with back navigation on narrow screens and iPhone
- **ADDED**: Settings with mailboxes, check interval, list size, notifications, theme (auto/light/dark) and palette: black and white graphite (the default) or nine accent colours; the unread badge takes the accent; button text is dark or white, whichever has the higher APCA contrast
- **ADDED**: Safari target (`npm run build:safari`), `background/platform.ts` for browser differences and `docs/SAFARI.md`
- **ADDED**: trusted message broker with sender checks, bounded HTTP responses, `credentials: 'omit'`, `redirect: 'error'` and timeouts
- **ADDED**: TypeScript + SCSS sources bundled by esbuild, ESLint, Prettier, `tsc` type checks, Node.js and Playwright tests, reproducible ZIP packaging, CI and tagged GitHub releases
