# OAuth setup

Status checked on **22 October 2026**: the maintainer completed the second Gmail consent and supplied a live Settings screenshot showing **both accounts connected and checked at 16:29**: `a.a.ustinoff@gmail.com` (128 unread) and `anthonyustinoff@gmail.com` (20 unread). The page reports the second connection as successful, without replacing the first account or showing an account error. The maintainer then reloaded the extension and confirmed that **both mailboxes still work**. This accepts the implemented account selector, simultaneous mailbox checks and persistence across extension reload. Live token renewal and independent disconnect remain separate from automated regressions. Microsoft remains unconfigured, Google remains in Testing and the store draft has not been submitted. Never add an application secret to the extension.

Following this acceptance, the permanent worker harness was updated for native Google tokens and signed account selection. Regressions cover two separate mailbox identities, concurrent 401 renewal, renewal rejection, cancellation, malformed callbacks, restart persistence, independent disconnect, public-state isolation and the overlapping-check notification race. The dedicated identity tests use real RS256 signatures and synthetic Google keys to check signature, claims and key-server boundaries. `npm run verify` passed **241 tests**, formatting, ESLint, TypeScript, repository checks and Chromium packaging; `npm run test:sandbox` passed **94 scenarios**; the Safari build passed and `npm audit --audit-level=high` reported no vulnerabilities. Mutation checks confirmed that disabling signature verification breaks the tampering test and restoring the previous notification implementation breaks both completion-order regressions. These automated scenarios use synthetic accounts and do not establish real token expiry or provider-side revocation behavior.

The dated trial notes below record earlier checkpoints; their pending results are superseded only by the evidence stated above.

Update, 20 October: the maintainer reported Settings origin `bkddpiocidbcpklaoooaabfpgknijamg` with installed version **0.0.40**, and clarified that Through Google is clickable but does nothing. The 0.0.44 worker and both archives were independently checked for the configured public client IDs; its public state enables Google with or without an already granted optional identity permission. A screenshot alone had been incorrectly interpreted as a disabled button. Candidate **0.0.45** retains the configured account-selection flow and makes the two Gmail connection buttons equal in size. The next live step is loading the folder from the keyed `dist/mailchecker-0.0.45-unpacked.zip`, confirming version 0.0.45 on the extension card, then opening Through Google. Two-account acceptance remains pending.

See the Russian [release access checklist](RELEASE_ACCESS.md) for the maintainer actions and current publication status.

Update, 21 October: candidate **0.0.46** retains the configured account-selection flow and fixes an independent notification-check race. The maintainer confirmed that two mailchecker copies were enabled and has disabled the older copy. In the live Google console, both registered OAuth clients, the External / Testing audience, both test users and the `gmail.modify` / `userinfo.email` scopes were rechecked. The historical unpacked source directory `/private/tmp/mailchecker-oauth-043` now contains the byte-verified 0.0.46 build with the stable store ID; this does not establish that Chrome has reloaded it. The pending live step is confirming 0.0.46 in the remaining extension, opening Through Google and connecting the second account before checking both mailboxes together.

Live failure, 21 October: the maintainer confirmed 0.0.46 and supplied a Google 403 `access_denied` screen. Its request uses the registered Chrome client and Gmail scopes, but names a third Google account outside the two configured test users. The maintainer subsequently confirmed deliberately selecting that third account. The account picker therefore appeared and the native request named the selected account; this failure is explained by the Testing audience rather than evidence of account substitution. The next live attempt targets the already configured second test user, `anthonyustinoff@gmail.com`; the test audience and OAuth implementation stay as configured. Candidate **0.0.47** changes only the visible Settings-button border; it does not claim to resolve this OAuth refusal. The next attempt with `anthonyustinoff@gmail.com` reached Google's identity-verification screen, which offered only a passkey in the supplied screenshot. The maintainer reported not having that key. No credentials or Google security settings were changed. The maintainer chose to keep `anthonyustinoff@gmail.com` and recover account access personally. The blank Add users form was closed without saving; the console still lists only the original two test users. Live second-account authorization and concurrent mailbox checks remain pending that identity verification.

## Extension ID

Starting with trial 0.0.43, the public `key` in `src/manifest.json` gives unpacked installs the store ID `bkddpiocidbcpklaoooaabfpgknijamg`. Earlier builds used `fbojnpjcjilajbfjfhipjkldidjmmolo`. The two origins have separate local storage and IndexedDB; the trial does not migrate or remove the earlier installation's data. The Chrome Web Store assigns its own item identity: upload a draft, read its ID and public key from the Package tab, and compare them with the unpacked install before registering clients. If they differ, use the store public key for the development build and rebuild with a new patch version. The private signing key is never needed for this comparison and must not be uploaded.

[Chrome's extension ID setup](https://developer.chrome.com/docs/extensions/reference/manifest/key) describes the comparison. The store rejected the first ZIP's `key` field, so packaging now omits that development-only field without changing the unpacked manifest.

### Verified store identity

On 16 October 2026, the [Package tab](https://chrome.google.com/webstore/devconsole/f3cf73d3-37ce-4ab4-88a4-5cb1fce26075/bkddpiocidbcpklaoooaabfpgknijamg/edit/package?hl=ru) confirmed version **0.0.41**, draft status and no published version. Its item ID is **`bkddpiocidbcpklaoooaabfpgknijamg`**. The following public key was read from the store dialog; it is not a private signing key or an OAuth credential:

```text
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAse7uvE5ftM6M7or+6QS+eXy7Jb14754mjAFu0ko8AW5BqxhQk2uGWA7puBSWe58xe7VClsk7YDu5HCTnVW15BKP9OSXT2ndpCT4jLpjdyRNTDo+JmVY00a3TJwBcP1y7caUbdhNN2EYylP3ugn/FYaWOYLSi/i2CQH15W6Arlq0WiFm2LLXqUQv/mzMp3inp3LC86SYRElU9RA2kU46wEvayTPimaJEarwZCnOvZv+KLes/jBCeCmhR94NJHx8tRPH7FN/KsmRyXHfyNRY6dm58swhwCXoU2pzwODHfWuUI6PF4LOXDKWoBDZMntq/Bg9Mkfgrg4imGvifAZfXub7wIDAQAB
```

The DER/SPKI key parsed successfully. Its SHA-256 is `1a33f8e28312fab0eee0015f6ad890c68850f765bc2026ddd66c05df8f5f8d67`; mapping its first 16 bytes to Chrome's ID alphabet produces the exact store item ID. Builds starting with 0.0.43 use this key in `src/manifest.json`; the resulting unpacked ID was checked from the key hash. The maintainer subsequently reported the matching Settings origin. The packager continues to omit the public development key from store ZIPs.

## Selected Google Cloud project

On 16 October 2026, the maintainer created and selected the separate **mailchecker** project, ID `mailchecker-511814`, project number `1014715555178`. Its identity was verified in the Cloud dashboard. This supersedes the earlier choice of **github** (`protean-chassis-467612-p8`). The shared project's OAuth app name, **Codetree**, branding URLs and existing `Codetree Release` client have not been changed. Configure mailchecker only in the new project.

The maintainer completed the initial User Data Policy acceptance and consent-screen creation. The console confirmed **OAuth configuration created!** A **Chrome Extension** client named `mailchecker Chrome Web Store` was then created for item ID `bkddpiocidbcpklaoooaabfpgknijamg`; the console confirmed extension ownership before creation. Its public client ID is:

```text
1014715555178-fvb8f96qqh5aq10qpdg6hnv4isgkj3ph.apps.googleusercontent.com
```

This registration does not grant mailbox access. The public ID is wired in the native-token implementation, including its `oauth2` manifest section. Live sign-in and checks of both real test mailboxes were confirmed on 22 October as described above.

The console confirmed **Branding changes saved!** for homepage `https://github.com/ziqq/mailchecker`, policy `https://github.com/ziqq/mailchecker/blob/main/PRIVACY.md` and authorized domain `github.com`. This is Testing configuration acceptance, not proof of domain ownership or completed public brand verification. Data Access contains `https://www.googleapis.com/auth/gmail.modify` and the non-sensitive `https://www.googleapis.com/auth/userinfo.email`, with **Data access changes saved!** confirmed. The latter obtains the stable Google account ID for account-specific native token renewal; profile/name/contact scopes are not requested. Gmail API shows **API Enabled**. Audience is **External / Testing** with two saved test users: `a.a.ustinoff@gmail.com` and `anthonyustinoff@gmail.com`. Both rows and the two-test-user count were verified in the console. Adding these users does not establish successful multiple-account sign-in or mailbox consent.

The Microsoft Entra portal was opened for the current account. Its home view failed to load. Settings → Directories + subscriptions → All directories then explicitly showed **No directories found**. No Microsoft application was registered. The owner needs an available Entra tenant and permission to register applications; signing in with a personal Microsoft account alone has not provided that prerequisite in this portal session. See Microsoft's [app registration prerequisites](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app#prerequisites).

## Google: native-token trial

The maintainer requested completion of OAuth and simultaneous operation of both real Gmail mailboxes. Trial 0.0.43 replaces the legacy Google implicit flow with Chrome's documented `identity.getAuthToken`, using the existing registered **Chrome Extension** client and matching store key. Microsoft retains its separate code/PKCE flow. No backend, client secret, remote script or Gmail-page bridge is added.

A new interactive connection in trial 0.0.43 clears Chrome Identity's cached default account preference, then opens native consent. The maintainer's live check established that this does **not** force an account picker after the first grant. Do not repeat cache clearing as a solution for adding the second account. The implementation never calls Google's token-revocation endpoint. `getAccounts` is Dev-channel-only and is not used. Reauthentication of a known mailbox instead passes its stored Google account ID explicitly.

The worker checks both granted scopes and reads the token's identity from the bounded, cookie-free `https://www.googleapis.com/oauth2/v2/userinfo` endpoint. `googleAccountID` stays in worker-owned credentials. Gmail's existing authenticated mailbox-address check still runs before credentials replace an account. A wrong Google ID or mailbox address fails without replacing that mailbox's credentials.

Chrome manages native-token expiration. The extension retains the returned access token until an authenticated request rejects it; a 401 removes only that token from Chrome's cache and retries once for the same stored Google ID. Concurrent renewals remain deduplicated per mailbox. Legacy Google credentials without a native account ID require interactive reconnection rather than silently using the profile default. Removal of an account still does not revoke provider grants.

References: [Chrome OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity), [Google OAuth discovery document](https://www.googleapis.com/discovery/v1/apis/oauth2/v2/rest). A direct code/PKCE authorization request using this Chrome client and the old `/google` callback returned `redirect_uri_mismatch` before consent; that web callback is not used by the native implementation.

Verification of trial 0.0.43: TypeScript, ESLint/formatting, Chromium/Safari builds, repository bundle checks and ZIP verification passed. A temporary execution of the real worker with synthetic Chrome/provider responses passed two-account storage/checks, account-specific 401 recovery, wrong-account rejection and credential/public-state isolation. These responses did not establish that Google's account picker supports adding the second live account. The complete sandbox/MV3 browser suite passed **94 tests**. The then-current unit suite reported **190 passed / 22 failed** because its harness still supplied legacy implicit-flow APIs and redirect expectations. See the 0.0.44 status below for the latest run.

The browser tool rejected navigation to `chrome://extensions` and explicitly prohibited alternative-surface workarounds. The ready trial at `/private/tmp/mailchecker-oauth-043` must be loaded by the maintainer. Do not declare OAuth complete until both real Gmail addresses can be connected concurrently, checked and reopened after extension/worker restart. Also verify cancellation, expired/rejected token recovery and supported Chromium browsers without assuming Chrome Identity exists everywhere. Safari builds omit the Google `oauth2` manifest section and keep OAuth unavailable without a containing-app integration.

The maintainer explicitly authorized the first `a.a.ustinoff@gmail.com` Gmail grant. Continue was clicked and the Google window closed. The browser tool cannot observe extension Settings because its protocol is not HTTP/HTTPS. The maintainer subsequently confirmed: the first mailbox connected, but another Through Google action did not open an account picker. This is maintainer-reported live evidence, not an automated observation of mailbox contents or checks. `anthonyustinoff@gmail.com` is not confirmed connected; no second Gmail grant has been approved yet.

### Proposed account-selection correction

The maintainer accepted the interactive preview and authorized implementation on 19 October. The following flow is implemented locally in candidate 0.0.44. Automatic review first required explicit action-time confirmation for Web-client creation; the maintainer supplied it. The first creation attempt did not persist, as verified from the reloaded client list. The subsequent keyboard submission completed with **OAuth client created**, followed by a verified Web application row named **mailchecker account selection** in the correct project. Its public client ID, now used by `googleSelection`, is:

```text
1014715555178-t9nscel1rpel7vtf4hvd2objqar5cnnf.apps.googleusercontent.com
```

Only this public ID is used. The generated client secret was not copied into files, used by the runtime or included in the build.

1. Register a separate **Web application** client in the same `mailchecker-511814` project, with the exact callback `https://bkddpiocidbcpklaoooaabfpgknijamg.chromiumapp.org/google`. Only its public client ID is used; no client secret is read or shipped.
2. On a new connection, open Google OpenID Connect through `launchWebAuthFlow`, with `prompt=select_account`, `scope=openid email`, `response_type=id_token`, and fresh `state` and `nonce`. This step selects identity and does not request Gmail access.
3. In the worker, validate the exact callback, state, ID-token signature against Google's fixed JWKS endpoint, issuer, audience, expiry and nonce. Use only the validated `sub` as the account ID for the existing native `getAuthToken` Gmail request, then check its returned identity and mailbox address as before. Do not accept an unverified decoded token or a token-supplied key URL.
4. The unsuccessful cache-clearing strategy is removed. Validate the complete combination in the new patch trial: choose the second real account, connect it without replacing the first, check both mailboxes and repeat after worker restart. The documented selection and targeting parameters do not establish that this combined flow works in the live Chrome profile.

Google documents [`prompt=select_account` and ID-token validation](https://developers.google.com/identity/openid-connect/openid-connect); its [discovery document](https://accounts.google.com/.well-known/openid-configuration) advertises `id_token` responses. This is a front-channel identity flow: Google's documentation recommends its Identity Services library for implicit flows because of their security complexity. Remote scripts are prohibited in this extension, so the worker performs the listed validation itself. Gmail access and renewal continue through Chrome Identity. No backend, dependency or additional browser permission was added.

The existing Remove control in Settings disconnects only its own mailbox: worker credentials, check result and IndexedDB cache are removed, then only that mailbox's native token is evicted from Chrome's cache. Other mailboxes and Google's provider-side grants remain intact. The tooltip now identifies the mailbox rather than saying only Delete.

Candidate 0.0.44 passed TypeScript, ESLint, formatting, Chromium/Safari builds and repository checks. A temporary execution of the real bundled worker verified real RS256 signing/verification against synthetic JWKS, two separate accounts, checks for both accounts, account-specific 401 renewal, wrong native identity rejection, restored connections after worker restart, independent disconnect and eleven rejected/cancelled callback/token variants before native consent. This is synthetic evidence, not real Google consent. The unchanged repository unit harness reports **191 passed / 21 failed**: it does not provide native `getAuthToken` or the selection-client configuration. Permanent tests remain unchanged until acceptance of the implementation. After restoring the missing official Playwright Chromium, all **94 browser scenarios passed** (46.6 seconds).

The configured unpacked 0.0.44 was prepared at the earlier installed-source path `/private/tmp/mailchecker-oauth-043`; the directory name is historical, its manifest version is 0.0.44. Its public-key hash gives the same store ID, preserving the existing extension origin. Both public client IDs are present in the expected manifest/worker contexts. The maintainer was asked to reload the existing extension and open Through Google, without approving the second mailbox grant yet. ZIP `dist/mailchecker-0.0.44.zip` passed the exact-byte verifier; SHA-256 is `478b0438a2e00001d2834330ecce788f94155318b19cf166fd54f7401e463bc7`. This package has not been uploaded to the store.

### Public verification

`gmail.modify` is a restricted scope and requires the applicable Google data-access verification before general public access. Google describes an additional security assessment when restricted-scope data is stored on or transmitted through servers. The absence of a developer backend must be described accurately in the review; it is not a blanket exemption from verification. See [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted-scope review](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

A public GitHub policy link is the chosen Chrome Web Store approach. Google branding separately requires an accessible app homepage and a linked policy on the same verified domain. A GitHub blob URL has not been established as satisfying that ownership requirement. Do not mark Google verification complete merely because Chrome Web Store accepts the link. See [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

On 22 October, the live Branding page still showed the Testing configuration and the authorized domains `github.com` and `chromiumapp.org`. Their presence in this list is not proof of domain ownership or public verification. The application homepage/privacy domain remains unresolved, and no verification demo video has been recorded or uploaded. The English material below is prepared for review; it does not record a submission or approval.

#### Prepared application-purpose text

mailchecker is an email client in the Chrome toolbar and a full browser tab. Users connect their own mailboxes, read conversations, browse folders, search their mail history, receive new-mail notifications, mark messages read or unread, star or unstar messages, archive messages, move selected messages to Trash and send plain-text replies to existing conversations. Each connected Gmail account has its own authorization and mailbox identity. mailchecker has no backend, advertising or analytics.

#### Prepared Gmail scope justification

We request `https://www.googleapis.com/auth/gmail.modify` for the Gmail features of this email client. The extension retrieves message lists and conversation bodies, searches mail on Gmail's server, reads folder counts and displays the results to the user. It changes `UNREAD`, `STARRED` and `INBOX` labels in response to read/unread, star/unstar and archive actions, and moves messages to Trash with Gmail's trash endpoint. When the user submits the reply editor, it sends a plain-text reply in the original thread through `users.messages.send`.

`gmail.readonly` cannot perform the read-state, star, archive or Trash actions. Adding `gmail.send` to read-only access would allow replies but would still not permit those mailbox-state changes. Metadata-only access cannot display conversation bodies. `gmail.modify` supports these combined features without the broader `https://mail.google.com/` permission for immediate permanent deletion. The extension does not request that broader scope or implement permanent deletion. The current sending feature is a reply to an existing message; it is not a general new-message, forwarding or draft-management interface.

This justification matches `providers/gmail.ts`: `users.messages.list`, `users.messages.get`, `users.threads.get`, label/profile reads, `users.messages.modify`, `users.messages.trash` and `users.messages.send`. Scope capabilities are described in Google's [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes).

#### Prepared identity-scope and client explanation

Both OAuth clients belong to the same mailchecker project and application:

- The Web client **mailchecker account selection** requests only the non-sensitive identity scopes `openid email`. Its account-selection window lets the user choose which Google account to connect. The worker validates the returned ID token's signature, issuer, audience, state, nonce and expiration, then uses its subject to target that account. This client does not request Gmail access, and the identity token is not stored.
- The Chrome Extension client **mailchecker Chrome Web Store** requests `gmail.modify` and the non-sensitive identity scope `https://www.googleapis.com/auth/userinfo.email` through Chrome Identity. The worker uses the latter to read the stable account ID and check that the native access token belongs to the selected identity. It also checks the Gmail mailbox address before saving the connection. This prevents using one account's token for another account and permits renewal of the correct connected mailbox.

Only the Chrome Extension client's token is used for Gmail API requests. The stable Google account ID remains with credentials in worker-owned local storage; it is not exposed to the popup or Settings. Neither client requests contacts, calendar data or the profile/name scope. No client secret is embedded in the extension.

#### Prepared data-handling explanation

Google authorization and Gmail requests run in the extension's service worker and go directly from the user's browser to Google. mailchecker does not transmit Google mail or credentials to a developer-operated server, analytics service or advertising service. Received data is used only for the email-client features described above.

The browser profile stores account credentials, preferences and the latest Inbox state. A bounded IndexedDB cache stores messages and conversation bodies the user has actually loaded, together with attachment names and list membership; it does not download the entire mailbox or attachment files. The user can clear the mail cache in Settings without removing accounts. Disconnecting an account removes its local credentials, state and cached mail and evicts that account's cached native token; it does not revoke Google's provider-side grant. The user can revoke that grant in Google Account settings.

Message HTML is sanitized and displayed in a sandboxed, script-free frame. Remote images remain blocked until the user chooses to display them; displaying them can contact the image host. The extension does not encrypt browser-profile storage. See [PRIVACY.md](../PRIVACY.md) for retention limits and the full network and data-use disclosure. This describes the implemented data flow; Google determines any applicable assessment requirements during review.

#### English demonstration-video plan

Status: **not recorded, not uploaded**. Use the final build with its registered extension ID, English UI and dedicated test accounts containing only staged mail. Do not record personal inboxes, passwords, passkeys or token values. Test replies and Trash actions below must use prearranged messages and recipients controlled by the maintainer.

Google's [restricted-scope review guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) requests an English demonstration of the actual sign-in/consent flow, the app name and OAuth client ID in the consent address bar, usage of the requested restricted scopes, and access through every OAuth client. It asks for an unlisted YouTube video link. The following recording plan covers this implementation; keep the actual permission screens readable and pause before leaving each one.

| Scene             | Screen and suggested English narration                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Introduction      | Show mailchecker and its version. “mailchecker lets me read and manage my own email in the browser. These accounts contain demonstration mail.”                                                                                                                                    |
| Account selection | In Settings choose **Through Google**. Show the Google account picker and the selection client's public ID in the address bar. “This first client selects my Google identity. It requests identity information, not access to my email.”                                           |
| Gmail consent     | Show the subsequent native Google consent with the mailchecker name, Chrome Extension client ID and requested permissions visible. Complete the actual grant using the dedicated account. “This client requests Gmail access for the account I selected.”                          |
| Read and search   | Open a staged conversation, browse a folder and search for a staged message outside the initially loaded Inbox. Use **Load more** when the prepared result set has another page. “Gmail supplies the message body, folder data and history-search results directly to my browser.” |
| Mailbox changes   | On staged messages, show read/unread, star/unstar, archive and move to Trash. “These are the mailbox changes that read-only and send-only permissions cannot perform. Moving to Trash does not permanently delete a message.”                                                      |
| Reply             | Open a staged conversation with a maintainer-controlled recipient and submit the agreed plain-text reply; show it in the conversation or Sent folder. “Sending is initiated by my reply action in an existing conversation.”                                                       |
| Second account    | Repeat account selection and native consent for the second dedicated account. Show both connections and switch between their mailboxes. “Each account keeps its own authorization. The first account remains connected.”                                                           |
| Local controls    | Show **Mail cache** in Settings, clear it, then disconnect one dedicated account while leaving the other connected. “I can clear locally cached mail or disconnect an account. To revoke Google's grant, I use my Google Account settings.”                                        |

Before providing the link, verify that the recording shows both registered public client IDs, matches the final requested scopes and app name, and contains no private mail or credentials. Confirm that the unlisted URL is accessible to the reviewer. Resolve and verify the homepage/privacy domain, publish approved branding and complete the Verification Center's remaining fields before treating this material as a public-verification submission.

## Microsoft: existing authorization code + PKCE

The current worker uses `/common/oauth2/v2.0/authorize`, a SHA-256 PKCE challenge, the exact callback/state, direct token exchange and refresh-token rotation. It supports personal Microsoft accounts and organizational accounts, subject to tenant consent policies.

Registration for this browser transport:

1. Microsoft Entra admin center → App registrations → New registration → name **mailchecker** → **Accounts in any organizational directory and personal Microsoft accounts**.
2. Authentication → Add a platform → **Single-page application (SPA)**. Add the exact callback from Settings, using the verified installed/store ID. Current unpacked callback: `https://bkddpiocidbcpklaoooaabfpgknijamg.chromiumapp.org/microsoft`.
3. Leave implicit access/ID-token grants off: this client uses authorization code + PKCE. Do not add a client secret or enable unrelated password/device grants.
4. Microsoft Graph → delegated permissions: `User.Read`, `Mail.ReadWrite`, `Mail.Send`. The authorization request also asks for `offline_access`, `openid`, `email`.
5. Supply the public **Application (client) ID** GUID for `oauthConfig.microsoft`. Tenant ID is not required by the current multi-tenant `/common` flow.
6. Verify a real first sign-in, cancellation, read/send actions, worker restart, refresh and renewed consent. Organizations may restrict user consent.

An isolated unpacked MV3 diagnostic using the actual HTTP helper and dummy authorization data observed the browser's final `Origin: chrome-extension://fbojnpjcjilajbfjfhipjkldidjmmolo` header on the token request. This is why the old Mobile and desktop platform recommendation is replaced with SPA. The diagnostic did not use user credentials and does not establish a successful Entra token exchange. Microsoft's [auth-code documentation](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#redirect-uris-for-single-page-apps-spas) explains the Origin/SPA requirement. SPA refresh tokens have a 24-hour lifetime; renewed interactive authorization can be required after that window.

## Store automation is separate

`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` authorize GitHub Actions to upload store packages. They do not authorize reading Gmail. These credentials stay in Actions secrets and never go into `oauth/config.ts`, the manifest, public documentation or the extension ZIP.

Codetree already has those secret names and a `CWS_EXTENSION_ID`; mailchecker currently has none. The three publisher OAuth credentials may be reused for another item owned by the same authorized publisher, subject to the actual grant and API access; mailchecker needs its own item ID. GitHub cannot reveal the stored secret values for copying. The maintainer must supply the original values to mailchecker's Actions settings, or recreate the upload grant. No secret values were read during preparation.
