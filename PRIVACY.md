# Privacy

Last updated: 16 October 2026.

mailchecker has no backend, analytics, advertising or telemetry. Requests go directly from the browser to the mail provider the user connected.

## Local data

`chrome.storage.local` contains preferences, connected accounts with their access/refresh tokens or JMAP API tokens (mailboxes read through the browser's sign-in store no credentials), and the last check result per account: the Inbox unread count and up to 50 latest Inbox messages (sender, subject, a 300-character preview, date, read/pinned flags, category and webmail link). Worker-owned IndexedDB additionally caches mail actually loaded: message metadata, opened HTML/plain-text bodies, attachment names and view membership for Inbox, folders, conversations and server search. It does not download attachments or remote images automatically. This cache is bounded by an estimated 50 MiB, 5,000 messages, 1,000 views and 30 days without access. Browser quota or eviction can reduce availability. Settings → Mail cache clears it without removing accounts or preferences. This data belongs to the browser profile and is not encrypted by the extension; protect the profile and device accordingly.

Local storage access is set to `TRUSTED_CONTEXTS`. The popup and Settings receive a public state without credentials. Session storage keeps at most 100 recent notification URLs, with a bounded index. Clicking or dismissing a notification removes its URL; older records are evicted, and browser restart clears session storage. Records from older versions are pruned when the index is first loaded.

Removing an account deletes its credentials, check result and IndexedDB cache, and invalidates pending cache writes. It does not revoke provider-side grants; use the Google or Microsoft account security page, or delete the JMAP API token in the mail service. Uninstalling removes all extension data.

## Network requests

- Gmail / Google Workspace: `https://gmail.googleapis.com`; sign-in through `https://accounts.google.com`.
- Outlook / Microsoft 365: `https://graph.microsoft.com`; sign-in and token refresh through `https://login.microsoftonline.com`.
- JMAP: the session URL entered in Settings and its API URL on the same origin, after the user grants that origin.
- Through the browser's sign-in, after the user grants the site in Settings: Gmail `https://mail.google.com` (the unread feed, the print view of an opened message and its actions), Yandex Mail `https://mail.yandex.ru` (lite folders, server search, message pages and its delete form), Mail.ru `https://e.mail.ru` (the webmail API: folders, server search, messages, read marks and moving to the trash) and `https://auth.mail.ru` (issues the webmail session cookie from the Mail.ru sign-in).

API requests send no cookies, refuse redirects and time out after 25 seconds. Requests through the browser's sign-in send the browser's own cookies, and only to the hosts above; they follow the site's redirects and treat a redirect away from it as signed out. Responses are read with size limits.

Message bodies are shown in a sandboxed frame without scripts. Remote images, including tracking pixels, are not loaded until the user chooses to show them for that conversation. Blocking these requests prevents image-based open tracking; the connected mail service still receives the requests needed to load mail and acknowledge read state.

## Permissions

- `storage`, `alarms`, `notifications`: settings and results, periodic checks, new-mail notifications.
- `identity` (optional, requested on the first Google or Microsoft connection): the OAuth sign-in window.
- `cookies` (optional, requested when Gmail is connected through the browser): reads only Gmail's `GMAIL_AT` action cookie on `mail.google.com` to archive, trash, mark read and star from the extension, as Gmail's own web client does. No other cookie is read.
- Host permissions for the Gmail, Graph, Microsoft login and Fastmail APIs; any other JMAP origin and the webmail sites read through the browser's sign-in are optional and requested in Settings.

## Limited use

Information received from Google APIs is used only for the user-facing mail features described here. This use complies with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) and its Limited Use requirements. mailchecker does not sell mail data, use it for advertising or transfer it to a developer-operated server.

## Contact

mailchecker is developed by Anton Ustinoff. For privacy questions, contact [a.a.ustinoff@gmail.com](mailto:a.a.ustinoff@gmail.com). Do not include mailbox passwords, access tokens or private email content in a support request.
