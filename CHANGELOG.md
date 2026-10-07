# Changelog

## 0.1.0

- **ADDED**: unread counter on the toolbar badge, popup with unread Inbox messages, account filter, mark-read, trash and open-in-webmail actions
- **ADDED**: Gmail / Google Workspace (Gmail API, OAuth implicit flow with silent renewal), Outlook / Microsoft 365 (Microsoft Graph, PKCE with refresh tokens) and JMAP (API token) providers
- **ADDED**: system notifications for messages that are new since the previous successful check
- **ADDED**: Settings with mailbox management, check interval, list size, notifications, theme (auto/light/dark) and palette (orange accent or neutral)
- **ADDED**: trusted message broker with sender checks, bounded HTTP responses, `credentials: 'omit'`, `redirect: 'error'` and timeouts
- **ADDED**: TypeScript + SCSS sources bundled by esbuild, ESLint, Prettier, `tsc` type checks, Node.js regression tests, reproducible ZIP packaging and CI
