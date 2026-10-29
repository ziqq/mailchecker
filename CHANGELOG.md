# Changelog

## 0.0.50

- **FIXED**: the Settings accent palette keeps its full width beside the description and wraps only when it exceeds the available row width

## 0.0.49

- **ADDED**: browser-connected Gmail searches loaded sender, subject and preview metadata from the bounded local cache, with paginated results and an explicit scope notice; server history search stays available through Gmail API
- **ADDED**: loaded-mail search regressions for metadata matching, pagination, account isolation, native IndexedDB persistence, current Inbox precedence and responsive scope notices; Gmail API keeps server search and reports server failures

## 0.0.48

- **FIXED**: the refresh button keeps its position while checking mail; its loading state no longer inherits full-window progress overlay styles

## 0.0.47

- **FIXED**: primary and secondary mailbox connection buttons share the same visible border so their filled and outlined edges align

## 0.0.46

- **FIXED**: overlapping automatic and individual mailbox checks compare notification candidates with the latest serialized baseline, preventing duplicate alerts for the same newly listed mail

## 0.0.45

- **FIXED**: Gmail connection methods use equal-width buttons, with matching stacked controls on narrow Settings layouts

## 0.0.44

- **ADDED**: Google account selection through a separate OpenID client before account-specific native Gmail authorization
- **FIXED**: account selection verifies Google's signature, issuer, audience, state, nonce and expiration instead of clearing every mailbox's native token cache
- **FIXED**: disconnecting a Gmail mailbox removes only its own native cached token along with its local credentials and mail cache

## 0.0.43

- **CHANGED**: Google API sign-in uses Chrome-managed OAuth tokens and the Chrome Web Store identity; stable Google account IDs bind token renewal to the connected mailbox
- **FIXED**: rejected Google tokens are removed individually from Chrome's cache before one account-specific retry

## 0.0.42

- **CHANGED**: English sandbox email fixtures, attachments, custom folders and preview navigation; English Chrome Web Store screenshots and submission documentation
- **FIXED**: sandbox long-message generation is excluded from release bundles instead of running at module import

## 0.0.41

- **ADDED**: move-to-Trash action in message rows and explicit multi-selection for deleting loaded messages across mailboxes, folders and search results
- **ADDED**: bulk deletion progress and per-mailbox errors; failed messages remain selected for retry, and each provider keeps its existing verified Trash action
- **FIXED**: Chrome Web Store ZIPs omit the development-only manifest key while preserving the stable ID in unpacked builds

## 0.0.40

- **ADDED**: provider, worker, store and responsive-browser regression tests for server search pagination, partial failures, retries, cursor isolation and action/query races
- **ADDED**: first Chrome Web Store release preparation with listing drafts, permission/data disclosures and submission requirements

## 0.0.39

- **ADDED**: on-demand server search pages for Gmail API, Microsoft Graph, JMAP, Yandex lite and Mail.ru, with independent mailbox cursors and an explicit Load more control
- **FIXED**: partial search failures identify the affected mailbox and retry its page without losing successful results; stale pages and confirmed read/pin/move actions cannot overwrite the current search

## 0.0.38

- **ADDED**: permanent IndexedDB regressions using the native browser database and an unpacked MV3 extension, covering restart persistence, cache bounds, action/clear races, read acknowledgements, frame retention and storage failures

## 0.0.37

- **ADDED**: bounded worker-owned IndexedDB storage for loaded mail, persistent conversation reopening with background revalidation and a clear-cache control in Settings
- **CHANGED**: cached content stays visible during network failure; confirmed actions update cached flags, and account removal rejects late cache writes

## 0.0.36

- **ADDED**: regression coverage for the remaining twelve audit #8 fixes, including action/search races, folder pagination/counters, bounded MIME/HTML/HTTP processing, image consent and notification cleanup
- **CHANGED**: the accepted cache and server-search plan is documented in Russian

## 0.0.35

- **ADDED**: audit #8 regression tests for Gmail quota/authentication, verified Yandex deletion, JMAP submission acknowledgements and complete Outlook conversations
- **CHANGED**: documented the chosen loaded-mail cache and server-search direction, with a proposed bounded worker-owned IndexedDB cache and provider-specific search rollout
- **FIXED**: concurrent read/pin actions preserve each other; stale search generations cannot overwrite results or loading/error state, and complete API-search failure exposes retry
- **FIXED**: Yandex folder cursors retain rows within server pages; Gmail prioritizes system folders before the catalog limit; selected folder counters refresh with the catalog
- **FIXED**: conversation caches invalidate only affected threads; MIME traversal has explicit depth/work bounds and HTML block scanning respects quoted attributes and tag boundaries
- **FIXED**: worker-wide HTTP concurrency is limited to eight; remote srcset candidates expose image consent; notification URLs are bounded and cleaned up after dismissal/click without breaking checks on notification failure

## 0.0.34

- **FIXED**: explicit Gmail API quota and permission failures no longer renew credentials or request sign-in, including individual batch replies
- **FIXED**: Yandex deletion updates local state only after verified source and Trash pages confirm the move
- **FIXED**: JMAP replies require draft and submission creation acknowledgements before reporting success
- **FIXED**: Outlook conversations follow validated continuations within four pages and refuse incomplete results at the limit; the selected message is checked explicitly

## 0.0.33

- **ADDED**: audit #7 regression coverage for the remaining eleven fixes: folder memberships, concurrent catalogs, search isolation, server counts, stable Yandex ordering, Graph continuations, Gmail batches, bounded folder sorting, body retries and CSS-only image permissions
- **CHANGED**: search notices identify the extension's browser-session limitation; documented API search capabilities and provider differences are clarified

## 0.0.32

- **ADDED**: audit #7 regression tests for CSS processing, HTML parsing, folder mutation races and mounted reader/list persistence across timestamp-only checks
- **FIXED**: Gmail and JMAP archive preserves the current custom-folder row; search controls no longer inherit a hidden folder's restrictions or pagination
- **FIXED**: folder catalogs load independently when switching accounts; parent paths are indexed and computed once before sorting
- **FIXED**: unread headings use server totals, incomplete counts are identified, and full Mail.ru unread pages obtain the Inbox total from folder metadata
- **FIXED**: Yandex's unknown dates preserve stable server/page order instead of displaying fabricated check times
- **FIXED**: Outlook follows validated folder continuations; Gmail reads counters in bounded multipart batches and retains names after individual counter failures
- **FIXED**: transient body failures remain retryable, unsupported browser-session search is disclosed, and CSS-only remote images expose the existing permission control

## 0.0.31

- **CHANGED**: the wide sidebar logo matches the list title's size and vertical alignment; navigation rows align with the search field and category controls
- **FIXED**: dark-mode CSS processing and browser-session HTML block scanning avoid quadratic rescans; colour adaptation preserves image URLs, strings and comments
- **FIXED**: timestamp-only refreshes retain the mounted message list and open mail document
- **FIXED**: in-flight folder pages preserve successful delete, archive, read and pin actions instead of restoring stale rows or flags

## 0.0.30

- **FIXED**: folder menu height ends after the last complete item that fits, including after catalog updates and window resizes

## 0.0.29

- **CHANGED**: the folder menu shares the header's translucent background and blur

## 0.0.28

- **CHANGED**: folder counters use oval badges with a visible background and smaller digits

## 0.0.27

- **ADDED**: on-demand server folder navigation for Gmail API, Outlook, JMAP, Yandex Mail and Mail.ru, including common system folders, separate custom folders labelled with their mailbox address and server-provided counters
- **CHANGED**: folder message pages stay in page memory; background checks and the toolbar badge continue to cover only the Inbox

## 0.0.26

- **ADDED**: workspace VS Code settings, extension recommendations, npm tasks and launch configurations adapted from the maintainer's projects
- **FIXED**: background conversation refresh keeps the open message visible instead of replacing it with a skeleton; selecting another message still loads its own body

## 0.0.25

- **CHANGED**: mailbox colour selection opens from an avatar with a persistent dropdown caret; the extra per-account text buttons are removed

## 0.0.24

- **CHANGED**: Settings exposes mailbox colour through a labelled button instead of an undisclosed avatar action
- **FIXED**: expanding mailbox colours keeps the avatar and account actions fixed in their row at wide and phone widths

## 0.0.23

- **FIXED**: Yandex account-menu ownership uses the accessible login name, so first-letter formatting no longer rejects an already authenticated mailbox

## 0.0.22

- **FIXED**: browser-session sign-in verifies the current session before opening webmail, clearing stale authentication errors immediately when already signed in
- **FIXED**: Settings and the full-tab client check once after returning from webmail; reopening the popup rechecks a browser session awaiting sign-in
- **FIXED**: Yandex recognises the active account-menu entry with quoted or unquoted classes and does not depend on the profile-link URL

## 0.0.21

- **ADDED**: regression coverage for audit #6: mailbox identity, provider acknowledgements, concurrent actions, conversation caches, read persistence, empty lists and responsive mail-frame sizing
- **CHANGED**: toolbar icon fills its square canvas with a blue tile and a bold white envelope
- **FIXED**: Yandex recognises the lite account menu and equivalent dot/dash mailbox aliases instead of rejecting a valid session
- **FIXED**: browser-session sign-in buttons open the webmail instead of repeating the failed background check
- **FIXED**: Settings leaves a compact 24 px bottom inset below the version

## 0.0.20

- **CHANGED**: read mail from unread-only Gmail and Mail.ru feeds stays in the bounded Inbox cache until archived or deleted
- **FIXED**: Gmail and Yandex browser sessions verify the connected mailbox before reading bodies or applying actions
- **FIXED**: an old Inbox check cannot restore mail changed by a concurrent action
- **FIXED**: conversations refresh when Inbox contents change or a reply is sent; unread search hits are marked read and reconciled in the client
- **FIXED**: Yandex's mark-read action opens the verified message page instead of only changing the local flag
- **FIXED**: empty searches and categories show their existing empty-state message
- **FIXED**: HTML mail tables and blocked images fit the reader; iframe sizing uses intrinsic body height and the observed document's animation frame to avoid ResizeObserver feedback
- **FIXED**: unread dots are centred in the gap between the row edge and the avatar's account ring

## 0.0.19

- **FIXED**: Gmail and Outlook verify the authenticated mailbox before replacing credentials during sign-in or silent renewal
- **FIXED**: JMAP archive preserves other mailbox memberships; rejected or unacknowledged message actions leave local mail unchanged

## 0.0.18

- **FIXED**: message-list avatars and unread dots share the vertical centre of each row, including notification stacks and nested messages

## 0.0.17

- **FIXED**: the reader keeps its action buttons after a read message leaves an unread-only Inbox feed or the visible list; delete and archive still target the open message

## 0.0.16

- **FIXED**: the blocked-images notice and the mail body use the same horizontal inset, aligning the notice controls with the body content

## 0.0.15

- **CHANGED**: toolbar icon: a larger blue envelope with a white flap and a transparent background, readable on light and dark browser toolbars with the unread badge

## 0.0.14

- **ADDED**: a draggable boundary between the message list and reader, with a bounded range and keyboard resizing; the top bar stays in place

## 0.0.13

- **FIXED**: dark HTML mail drew grey bands; every grey or near-white background is now the page colour, so the message is one dark surface
- **FIXED**: Gmail's full text repeated the sender, date, Reply-To, To and Cc above the body; only the body of the print view is shown

## 0.0.12

- **FIXED**: grey backgrounds of dark HTML mail differed from band to band; white paper is now the page and every other grey background (header bands, panels, blocked images) one colour, `#2b2b2b`

## 0.0.11

- **FIXED**: dark grey bands in HTML mail (headers meant to stand out on white) nearly merged with the dark page; they are lifted to `#2b2b2b` so they still read as bands

## 0.0.10

- **ADDED**: the interface in 13 languages through `chrome.i18n` (English, Russian, Ukrainian, German, French, Spanish, Italian, Portuguese (Brazil), Polish, Turkish, Chinese (Simplified), Japanese, Korean): pages, worker errors, notifications and the store description; the browser's language picks one, dates and sizes follow it
- **CHANGED**: dark HTML mail adapts each colour instead of inverting the page: light backgrounds become dark and dark text light, while dark headers and images stay as the sender made them
- **CHANGED**: `scripts/check.mjs` checks every locale against English and every key used in code

## 0.0.9

- **FIXED**: HTML mail stayed on white paper in the dark theme; it is now inverted to the dark surface with images and media inverted back, so fixed sender colours stay readable

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
