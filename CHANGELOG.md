# Changelog

## 0.0.8

- **ADDED**: «Ответить» (`R`) in the reader: a plain-text editor for Gmail and Outlook through sign-in, JMAP and Mail.ru; Gmail and Yandex Mail through the browser open the message in the webmail. Outlook asks for the `Mail.Send` permission on the next sign-in
- **CHANGED**: mailboxes are checked every 30 seconds by default and when the popup opens if the last check is older than that
- **CHANGED**: success messages (a sent reply) use the neutral toast; errors stay red

## 0.0.7

- **ADDED**: a colour per mailbox: click the avatar in Settings → Ящики to pick it
- **CHANGED**: the mailbox of a message is a ring in its colour around the avatar instead of a dot
- **CHANGED**: archive and trash blur the window under a progress card until the webmail answers
- **CHANGED**: a larger envelope in the toolbar icon; the version moved to the bottom of Settings
- **FIXED**: Gmail actions through the browser: the page key is also read from the full Gmail page (`GLOBALS`) when the light client has none

## 0.0.6

- **ADDED**: Gmail through the browser archives, trashes, marks read and stars from the extension, as Gmail's web client does; the optional `cookies` permission is asked when Gmail is connected through the browser (connect it again to grant it)
- **CHANGED**: Settings: the OAuth block is collapsed as «Вход через Google и Microsoft», says it is only for builds with a Client ID and copies the redirect address
- **FIXED**: Settings at phone width scrolled sideways: the add-mailbox buttons move under the text

## 0.0.5

- **ADDED**: full text for mailboxes read through the browser's sign-in: Gmail's print view, the Yandex lite message page, the Mail.ru webmail API
- **ADDED**: Mail.ru marks read and unread and moves to the trash; Yandex Mail deletes with the lite toolbar form and marks read when a message is opened
- **FIXED**: two Yandex rows could share one ID and be selected together; rows take the ID of their toolbar checkbox
- **FIXED**: «ResizeObserver loop completed with undelivered notifications» while a message body was sized

## 0.0.4

- **CHANGED**: «Все» lists pinned messages and then every other message newest first; the «Люди» category and its section are gone, «Уведомления» and «Рассылки» stay
- **CHANGED**: toolbar icon: a white rounded envelope on the near-black square
- **FIXED**: Mail.ru answered `nosdc` while signed in: the webmail session cookie is now issued by `auth.mail.ru/sdc` from the Mail.ru sign-in (add the mailbox again to grant the site)

## 0.0.3

- **FIXED**: Mail.ru stayed «Войдите» while signed in: requests now go to the webmail host `e.mail.ru`, which receives the sign-in cookies (add the mailbox again to grant the site)

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
