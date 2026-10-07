# Mail Checker

Mail Checker is a Manifest V3 mail client for Chromium browsers and Safari: a Spark-like client in the toolbar popup and a full-tab mode for Gmail / Google Workspace, Outlook / Microsoft 365 and JMAP mailboxes on any domain. It has no backend. SolidJS is the only runtime dependency (bundled). A private npm package provides TypeScript/Sass compilation, esbuild bundling of `src/` into `build/` and `build-safari/`, checks and tests; Python packages the bundled runtime files.

## General rules

1. Ask before adding functionality that has not been discussed. Do not introduce unrelated features, dependencies or architecture.
2. Inspect `git status` and the relevant diff first. Never overwrite the maintainer's edits without confirmation.
3. Avoid overengineering. Follow existing modules and keep changes narrow.
4. Keep `CHANGELOG.md` newest first with **DEPRECATED**, **ADDED**, **CHANGED**, **FIXED**; omit unused categories.
5. Use English identifiers, documentation and commits. UI text is Russian. Discuss decisions in the maintainer's language.

## Environment setup

Run `npm ci` and `npm run build`, then load `build/` as an unpacked extension in Chrome/Chromium 116+. Rebuild and reload the extension after changes.

## Project structure

- `src/shared/`: types, preferences, formatting, DOM helpers and icons; side-effect-free modules used by every context.
- `src/background/`: trusted service worker. `index.ts` routes messages; `storage`, `http`, `accounts` and `mailbox` hold storage, bounded requests, credentials, checks and actions; `platform.ts` is the only place for browser-specific APIs.
- `src/background/providers/`: Gmail, Microsoft Graph and JMAP adapters implementing `Provider` from `message.ts`.
- `src/background/oauth/`: public client IDs and Google/Microsoft flows. Never add a client secret.
- `src/client/`: SolidJS client for `popup.html` and `app.html` (store, components, responsive `client.scss`).
- `src/options/`: Settings page, its TypeScript and SCSS.
- `design/`: HTML mockups of the client.
- `src/styles/`: design tokens (two palettes × light/dark) and shared components.
- `scripts/`, `.github/workflows/`: bundling, checks, icons, deterministic packaging and CI.
- `docs/`, `PRIVACY.md`: architecture, OAuth setup and data handling. Read [Architecture](docs/ARCHITECTURE.md) before changing messages or storage.
- Document every module and function with JSDoc (Python: docstrings).

## Key commands

```sh
npm ci
npm run verify
npm audit --audit-level=high
```

## Coding conventions

- Prettier (two spaces, single quotes, semicolons, 120 columns), strict TypeScript, explicit DOM APIs.
- Render server text with `textContent`; no `innerHTML`, `eval` or remote code.
- Keep tokens and API requests in the worker; pages receive public state only.
- Validate untrusted provider data and bound its size. Preserve `credentials: 'omit'`, `redirect: 'error'`, timeouts and response limits.
- Request optional permissions only from a user gesture in Settings.
- Email bodies render only through `shared/sanitize.ts` and `MailFrame` (sandbox without scripts, strict frame CSP); never insert them into extension pages.
- Keep every layout working at popup (780×600), wide tab and phone widths; check Safari limits in [docs/SAFARI.md](docs/SAFARI.md) before using a new browser API.
