# mailchecker

mailchecker is a Manifest V3 mail client for Chromium browsers and Safari: a Spark-like client in the toolbar popup and a full-tab mode for Gmail / Google Workspace, Outlook / Microsoft 365 and JMAP mailboxes on any domain. It has no backend. SolidJS is the only runtime dependency (bundled). A private npm package provides TypeScript/Sass compilation, esbuild bundling of `src/` into `build/` and `build-safari/`, checks and tests; Python packages the bundled runtime files.

Author: Anton Ustinoff. License: [GPL v3](LICENSE) (`GPL-3.0-only`). Every source file starts with the project, copyright and license header; add it to new files.

## Tech stack

| Layer          | Technology                                                       |
| -------------- | ---------------------------------------------------------------- |
| Platform       | Manifest V3 extension: Chromium 116+, Safari 16.4+               |
| UI             | SolidJS (bundled, the only runtime dependency)                   |
| Language       | TypeScript (strict), JSX compiled ahead of time                  |
| Styles         | SCSS (Sass), design tokens in `src/styles/`                      |
| Build          | esbuild → one classic script per context; Python packaging (ZIP) |
| Checks         | Prettier, ESLint, `tsc`, `node --test`, `scripts/check.mjs`      |
| Storage        | `chrome.storage.local` (worker only)                             |
| Mail protocols | Gmail API, Microsoft Graph, JMAP                                 |

## General rules

1. Ask before adding functionality that has not been discussed. Do not introduce unrelated features, dependencies or architecture.
2. Inspect `git status` and the relevant diff first. Never overwrite the maintainer's edits without confirmation.
3. Avoid overengineering. Follow existing modules and keep changes narrow.
4. Keep `CHANGELOG.md` newest first with **DEPRECATED**, **ADDED**, **CHANGED**, **FIXED**; omit unused categories.
5. Use English identifiers, documentation and commits. UI text is Russian. Discuss decisions in the maintainer's language.

## Agent workflow

1. Commit only when asked. Keep work in the tree while iterating; fold one feature into one commit.
2. Never duplicate code. Before adding a helper, component, style or constant, search for an existing one and reuse or extend it. The final review must check the change for duplication.
3. After a context compaction, reread this file in full before continuing.
4. Report what was verified: automated checks that ran, what was checked by hand in a browser (and at which widths), and what was not checked and why. Passing checks alone do not prove a UI change works.

## Environment setup

Run `npm ci` and `npm run build`, then load `build/` as an unpacked extension in Chrome/Chromium 116+. Rebuild and reload the extension after changes.

## Project structure

- `src/shared/`: types, preferences, formatting, DOM helpers and icons; side-effect-free modules used by every context.
- `src/background/`: trusted service worker. `index.ts` routes messages; `storage`, `http`, `accounts` and `mailbox` hold storage, bounded requests, credentials, checks and actions; `platform.ts` is the only place for browser-specific APIs.
- `src/background/providers/`: Gmail, Microsoft Graph and JMAP adapters implementing `Provider` from `message.ts`.
- `src/background/oauth/`: public client IDs and Google/Microsoft flows. Never add a client secret.
- `src/client/`: SolidJS client for `popup.html` and `app.html` (store, components, responsive `client.scss`).
- `src/options/`: Settings page, its TypeScript and SCSS.
- `src/sandbox/`: fixtures and an in-memory worker for the sandbox build only.
- `e2e/`: Playwright suite run against the sandbox.
- `design/`: HTML mockups of the client.
- `src/styles/`: design tokens (two palettes × light/dark) and shared components.
- `scripts/`, `.github/workflows/`: bundling, checks, icons, deterministic packaging and CI.
- `docs/`, `PRIVACY.md`: architecture, OAuth setup and data handling. Read [Architecture](docs/ARCHITECTURE.md) before changing messages or storage.
- Document every module and function with JSDoc (Python: docstrings).

## Important files

| File                                  | Purpose                                                       |
| ------------------------------------- | ------------------------------------------------------------- |
| `src/manifest.json`                   | Manifest; the version must match `package.json` and CHANGELOG |
| `src/shared/types.ts`                 | Shared types, including `Request`, `PublicState` and `Reply`  |
| `src/background/index.ts`             | Message broker: sender checks and per-page allowed requests   |
| `src/background/mailbox.ts`           | Checks, actions, threads, search, badge and notifications     |
| `src/background/http.ts`              | Bounded `fetch` with timeouts and response limits             |
| `src/background/platform.ts`          | Browser-specific APIs (Chromium vs Safari)                    |
| `src/background/providers/message.ts` | `Provider` interface and message normalization                |
| `src/client/store.ts`                 | Client state: selection, filters, search, conversation cache  |
| `src/shared/inbox.ts`                 | Unified Inbox model: merge, stacks, Smart Inbox sections      |
| `src/shared/sanitize.ts`              | Email HTML sanitizer and frame document                       |
| `scripts/build.mjs`                   | Bundling and per-target manifest adaptation                   |
| `scripts/check.mjs`                   | Repository invariants: versions, CSP, no `innerHTML`/`eval`   |

## Key commands

```sh
npm ci
npm run verify
npm run test:sandbox
npm audit --audit-level=high
```

## Sandbox

`npm run sandbox` serves the client on mock mailboxes at `http://127.0.0.1:8080/` (`--port` to change): no extension, accounts or network. Use it to check any client change by eye at popup (780×600), wide tab and phone widths; `index.html` shows the popup and a phone side by side, and `?theme=dark&palette=neutral` sets preferences. Actions live in memory until a reload.

- Fixtures live in `src/sandbox/fixtures.ts`. When a UI state is missing (a new flag, an error, a provider), add a fixture for it rather than testing on a real mailbox.
- `src/sandbox/worker.ts` answers the client's `Request`s. A new client request needs a case there, or the sandbox shows «В песочнице это действие недоступно».
- Fixtures must be created inside functions: release builds set `__SANDBOX__` to `false` and rely on tree-shaking; `scripts/check.mjs` fails if they ship.
- `npm run test:sandbox` (Playwright, Chromium, ~10 s) checks every layout for errors and horizontal scroll plus the main flows. Run it after client or style changes and extend `e2e/sandbox.spec.mjs` for new flows.

## Coding conventions

- Prettier (two spaces, single quotes, semicolons, 120 columns), strict TypeScript, explicit DOM APIs.
- Non-obvious Prettier rules: no spaces inside braces (`{a: 1}`, `import {x} from`) and no parentheses around a single arrow parameter (`x => x`).
- Render server text with `textContent`; no `innerHTML`, `eval` or remote code.
- Keep tokens and API requests in the worker; pages receive public state only.
- Validate untrusted provider data and bound its size. Preserve `credentials: 'omit'`, `redirect: 'error'`, timeouts and response limits.
- Request optional permissions only from a user gesture in Settings.
- Email bodies render only through `shared/sanitize.ts` and `MailFrame` (sandbox without scripts, strict frame CSP); never insert them into extension pages.
- Keep every layout working at popup (780×600), wide tab and phone widths; check Safari limits in [docs/SAFARI.md](docs/SAFARI.md) before using a new browser API.

## Strict rules

All network requests go through `background/http.ts`, only in the worker:

```ts
// ❌ wrong: unbounded request that sends cookies and follows redirects
const data = await (await fetch(url)).json();

// ✅ right: bounded, `credentials: 'omit'`, `redirect: 'error'`, timeout
const data = await requestJSON<Session>(url, {token});
```

Browser-specific APIs are wrapped in `background/platform.ts`:

```ts
// ❌ wrong: breaks Safari, which has no `notifications`
chrome.notifications.create(id, options);

// ✅ right: feature-detected in one place
if (hasNotifications()) chrome.notifications.create(id, options);
```

Email bodies render only through `sanitize.ts` and `MailFrame`:

```tsx
// ❌ wrong: provider HTML in an extension page
element.innerHTML = message.html;

// ✅ right: sanitized, in a sandboxed frame without scripts
<MailFrame html={message.html} text={message.text} allowRemote={false} dark={dark()} />;
```

Pages never talk to providers or storage directly; they send a typed `Request` to the worker:

```ts
// ❌ wrong: a token or provider call in a page
await fetch('https://gmail.googleapis.com/...', {headers: {Authorization: token}});

// ✅ right: the worker validates the sender and does the work
const state = await request<PublicState>({type: 'ACT', account, message, action: 'archive'});
```

## Key patterns

### Client store

`client/store.ts` is one `createRoot` with signals and memos, shared by the popup and the full-tab app. Components read `store.*` accessors and call its async actions (`load`, `refresh`, `act`, `search`, `thread`); actions catch errors and show them with `store.fail`. Derived lists come from pure functions in `shared/inbox.ts`, which have regression tests.

### Adding a request

1. Add the variant to `Request` in `shared/types.ts`.
2. Allow it for the pages that may send it in `allowed` in `background/index.ts` and handle it in `handle`, validating every field (`String(...)`, enums, bounds).
3. Put the logic in `accounts.ts` or `mailbox.ts`; return public data only (never `Credentials`).
4. Call it from a page with `request<T>({type: ...})` from `shared/dom.ts`.
5. Update [Architecture](docs/ARCHITECTURE.md) and add a regression test in `tests/background.test.mjs`.
