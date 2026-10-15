# OAuth setup

OAuth code is prepared; live sign-in is not verified. `src/background/oauth/config.ts` contains empty client IDs, and Settings disables Gmail and Outlook until they are supplied. JMAP accounts work without OAuth. Never add a client secret: the extension is a public client.

## Extension ID and redirect URIs

`src/manifest.json` contains a fixed public `key`, which gives unpacked installs the ID `fbojnpjcjilajbfjfhipjkldidjmmolo`. Before configuring the first store release, compare this with the ID assigned in the Chrome Web Store dashboard and register redirect URIs for the actual installed ID. The current unpacked redirect URIs are:

```text
https://fbojnpjcjilajbfjfhipjkldidjmmolo.chromiumapp.org/google
https://fbojnpjcjilajbfjfhipjkldidjmmolo.chromiumapp.org/microsoft
```

The matching private key is not in the repository. Keep `keys/extension-private-key.pem` backed up outside Git; it is needed only to sign CRX files outside the store.

## Google

1. Google Cloud Console → new project → enable **Gmail API**.
2. OAuth consent screen → External; scope `https://www.googleapis.com/auth/gmail.modify`. While in Testing, add up to 100 test users.
3. Credentials → OAuth client ID → **Web application** → Authorized redirect URI: the `/google` URI above.
4. Put the client ID in `oauthConfig.google`.

`gmail.modify` is a restricted scope and public access requires Google OAuth verification. Google additionally requires a security assessment when restricted-scope data is stored on or transmitted through servers; the current extension has no developer-operated server. Confirm the applicable requirements in the OAuth verification process rather than assuming store approval grants API approval. Testing mode is limited to the configured test users. See the [current Gmail scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Microsoft

1. Azure Portal → App registrations → New registration → _Accounts in any organizational directory and personal Microsoft accounts_.
2. Authentication → Add a platform → **Mobile and desktop applications** → the `/microsoft` URI above.
3. API permissions → Microsoft Graph → Delegated: `Mail.ReadWrite`, `Mail.Send` (replies), `User.Read`, `offline_access`, `openid`, `email`.
4. Put the Application (client) ID in `oauthConfig.microsoft`.

Some organizations require admin consent for `Mail.ReadWrite` and `Mail.Send`.

## Verification

Before claiming OAuth readiness, verify sign-in, cancellation, silent Google renewal after an hour, Microsoft refresh after the worker sleeps, re-sign-in from the popup, and removal.
