# Privacy

Mail Checker has no backend, analytics, advertising or telemetry. Requests go directly from the browser to the mail provider the user connected.

## Local data

`chrome.storage.local` contains preferences, connected accounts with their access/refresh tokens or JMAP API tokens, and the last check result per account: the Inbox unread count and up to 50 latest Inbox messages (sender, subject, a 300-character preview, date, read/pinned flags, category and webmail link). Opened message bodies, attachment names and search results are kept only in the open page's memory and are never written to storage. This data belongs to the browser profile and is not encrypted by the extension; protect the profile and device accordingly.

Local storage access is set to `TRUSTED_CONTEXTS`. The popup and Settings receive a public state without credentials. Session storage keeps the webmail URL of each shown notification until it is clicked or the browser restarts.

Removing an account deletes its credentials and check result. It does not revoke provider-side grants; use the Google or Microsoft account security page, or delete the JMAP API token in the mail service. Uninstalling removes all extension data.

## Network requests

- Gmail / Google Workspace: `https://gmail.googleapis.com`; sign-in through `https://accounts.google.com`.
- Outlook / Microsoft 365: `https://graph.microsoft.com`; sign-in and token refresh through `https://login.microsoftonline.com`.
- JMAP: the session URL entered in Settings and its API URL on the same origin, after the user grants that origin.

Requests send no cookies, refuse redirects and time out after 25 seconds. Responses are read with size limits.

Message bodies are shown in a sandboxed frame without scripts. Remote images, including tracking pixels, are not loaded until the user chooses to show them for that conversation, so senders do not learn that a message was opened.

## Permissions

- `storage`, `alarms`, `notifications`: settings and results, periodic checks, new-mail notifications.
- `identity` (optional, requested on the first Google or Microsoft connection): the OAuth sign-in window.
- Host permissions for the Gmail, Graph, Microsoft login and Fastmail APIs; any other JMAP origin is optional and requested in Settings.
