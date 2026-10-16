# OAuth setup

Status checked on 16 October 2026. `src/background/oauth/config.ts` contains empty client IDs, so Settings disables Google and Microsoft API sign-in. Browser-session connections and JMAP are separate. Live Google/Microsoft sign-in is not verified. Never add an application secret to the extension.

See the Russian [release access checklist](RELEASE_ACCESS.md) for the maintainer actions and current publication status.

## Extension ID

The public `key` in `src/manifest.json` gives unpacked installs the ID `fbojnpjcjilajbfjfhipjkldidjmmolo`. The Chrome Web Store assigns its own item identity: upload a draft, read its ID and public key from the Package tab, and compare them with the unpacked install before registering clients. If they differ, use the store public key for the development build and rebuild with a new patch version. The private signing key is never needed for this comparison and must not be uploaded.

[Chrome's extension ID setup](https://developer.chrome.com/docs/extensions/reference/manifest/key) describes the comparison. The store rejected the first ZIP's `key` field, so packaging now omits that development-only field without changing the unpacked manifest.

### Verified store identity

On 16 October 2026, the [Package tab](https://chrome.google.com/webstore/devconsole/f3cf73d3-37ce-4ab4-88a4-5cb1fce26075/bkddpiocidbcpklaoooaabfpgknijamg/edit/package?hl=ru) confirmed version **0.0.41**, draft status and no published version. Its item ID is **`bkddpiocidbcpklaoooaabfpgknijamg`**. The following public key was read from the store dialog; it is not a private signing key or an OAuth credential:

```text
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAse7uvE5ftM6M7or+6QS+eXy7Jb14754mjAFu0ko8AW5BqxhQk2uGWA7puBSWe58xe7VClsk7YDu5HCTnVW15BKP9OSXT2ndpCT4jLpjdyRNTDo+JmVY00a3TJwBcP1y7caUbdhNN2EYylP3ugn/FYaWOYLSi/i2CQH15W6Arlq0WiFm2LLXqUQv/mzMp3inp3LC86SYRElU9RA2kU46wEvayTPimaJEarwZCnOvZv+KLes/jBCeCmhR94NJHx8tRPH7FN/KsmRyXHfyNRY6dm58swhwCXoU2pzwODHfWuUI6PF4LOXDKWoBDZMntq/Bg9Mkfgrg4imGvifAZfXub7wIDAQAB
```

The DER/SPKI key parsed successfully. Its SHA-256 is `1a33f8e28312fab0eee0015f6ad890c68850f765bc2026ddd66c05df8f5f8d67`; mapping its first 16 bytes to Chrome's ID alphabet produces the exact store item ID. The current unpacked ID differs, so replacing its development key and verifying local account/cache behavior remain a separate next patch. `src/manifest.json` has not been changed to this key yet.

## Selected Google Cloud project

On 16 October 2026, the maintainer created and selected the separate **mailchecker** project, ID `mailchecker-511814`, project number `1014715555178`. Its identity was verified in the Cloud dashboard. This supersedes the earlier choice of **github** (`protean-chassis-467612-p8`). The shared project's OAuth app name, **Codetree**, branding URLs and existing `Codetree Release` client have not been changed. Configure mailchecker only in the new project.

The maintainer completed the initial User Data Policy acceptance and consent-screen creation. The console confirmed **OAuth configuration created!** A **Chrome Extension** client named `mailchecker Chrome Web Store` was then created for item ID `bkddpiocidbcpklaoooaabfpgknijamg`; the console confirmed extension ownership before creation. Its public client ID is:

```text
1014715555178-fvb8f96qqh5aq10qpdg6hnv4isgkj3ph.apps.googleusercontent.com
```

This registration does not grant mailbox access. It has not been added to the current implicit-flow runtime; implementing the correct Chrome token flow and verifying multiple accounts remain required.

The console confirmed **Branding changes saved!** for homepage `https://github.com/ziqq/mailchecker`, policy `https://github.com/ziqq/mailchecker/blob/main/PRIVACY.md` and authorized domain `github.com`. This is Testing configuration acceptance, not proof of domain ownership or completed public brand verification. Data Access contains only `https://www.googleapis.com/auth/gmail.modify` and confirmed **Data access changes saved!** Gmail API shows **API Enabled**. Audience is **External / Testing** with two saved test users: `a.a.ustinoff@gmail.com` and `anthonyustinoff@gmail.com`. Both rows and the two-test-user count were verified in the console. Adding these users does not establish successful multiple-account sign-in or mailbox consent.

The Microsoft Entra portal was opened for the current account. Its home view failed to load. Settings → Directories + subscriptions → All directories then explicitly showed **No directories found**. No Microsoft application was registered. The owner needs an available Entra tenant and permission to register applications; signing in with a personal Microsoft account alone has not provided that prerequisite in this portal session. See Microsoft's [app registration prerequisites](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app#prerequisites).

## Google: current implementation and proposed release path

The current code in `oauth/flow.ts` calls `launchWebAuthFlow` with `response_type=token`. It is a legacy implicit flow, with silent `prompt=none` renewal while a Google session is available. It has no refresh token. The previous Web application registration instructions described that implementation; they are not a recommendation for a new public release.

Google's [implicit-flow documentation](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow) now explicitly discourages this flow. For the Chrome Web Store release, the proposed implementation is Chrome's documented `identity.getAuthToken` path, using an OAuth client of type **Chrome Extension** and the `oauth2` manifest section. That change is not implemented or accepted yet. Do not put a Chrome Extension client ID into the existing implicit flow and assume it will work.

After the implementation choice is accepted:

1. Create/select a mailchecker Google Cloud project and enable Gmail API.
2. Configure Google Auth Platform branding, the support/developer email and an External audience. Keep test access limited to named test users while integration is being verified.
3. Declare `https://www.googleapis.com/auth/gmail.modify`. It is used for reading/search, read/star/label/trash actions and sending replies. The extension does not need permanent deletion or the broader `https://mail.google.com/` scope.
4. For the proposed Chrome implementation, create a **Chrome Extension** OAuth client bound to the verified store item ID. Supply its public `*.apps.googleusercontent.com` client ID. A Web application client is a different client type.
5. Implement and verify token acquisition, cache invalidation after 401, renewal and removal. Multiple Gmail accounts and existing account identity checks must remain correct. Test profiles without Chrome Sync and the supported Chromium browsers; the Chrome API path must not be assumed to work in every Chromium browser.

The legacy flow's development callback is `https://fbojnpjcjilajbfjfhipjkldidjmmolo.chromiumapp.org/google`. The proposed native Chrome token path is configured by extension ID instead; it does not register that web callback.

The [Chrome OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth) and [identity API](https://developer.chrome.com/docs/extensions/reference/api/identity) define the client/manifest/token-cache contract. Their documentation does not by itself prove multiple-account behavior for this client; retain that acceptance case.

The maintainer requested a plain-language explanation before approving this migration. It changes the implementation behind Settings → Through Google; it has not changed the current runtime. `getAuthToken` accepts an account ID and manages token expiration, but `getAccounts` is dev-channel-only. Do not rely on that method in a public stable-channel build or assume that native tokens preserve the existing account-picker flow without integration proof.

### Public verification

`gmail.modify` is a restricted scope and requires the applicable Google data-access verification before general public access. Google describes an additional security assessment when restricted-scope data is stored on or transmitted through servers. The absence of a developer backend must be described accurately in the review; it is not a blanket exemption from verification. See [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted-scope review](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

A public GitHub policy link is the chosen Chrome Web Store approach. Google branding separately requires an accessible app homepage and a linked policy on the same verified domain. A GitHub blob URL has not been established as satisfying that ownership requirement. Do not mark Google verification complete merely because Chrome Web Store accepts the link. See [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## Microsoft: existing authorization code + PKCE

The current worker uses `/common/oauth2/v2.0/authorize`, a SHA-256 PKCE challenge, the exact callback/state, direct token exchange and refresh-token rotation. It supports personal Microsoft accounts and organizational accounts, subject to tenant consent policies.

Registration for this browser transport:

1. Microsoft Entra admin center → App registrations → New registration → name **mailchecker** → **Accounts in any organizational directory and personal Microsoft accounts**.
2. Authentication → Add a platform → **Single-page application (SPA)**. Add the exact callback from Settings, using the verified installed/store ID. Current unpacked callback: `https://fbojnpjcjilajbfjfhipjkldidjmmolo.chromiumapp.org/microsoft`.
3. Leave implicit access/ID-token grants off: this client uses authorization code + PKCE. Do not add a client secret or enable unrelated password/device grants.
4. Microsoft Graph → delegated permissions: `User.Read`, `Mail.ReadWrite`, `Mail.Send`. The authorization request also asks for `offline_access`, `openid`, `email`.
5. Supply the public **Application (client) ID** GUID for `oauthConfig.microsoft`. Tenant ID is not required by the current multi-tenant `/common` flow.
6. Verify a real first sign-in, cancellation, read/send actions, worker restart, refresh and renewed consent. Organizations may restrict user consent.

An isolated unpacked MV3 diagnostic using the actual HTTP helper and dummy authorization data observed the browser's final `Origin: chrome-extension://fbojnpjcjilajbfjfhipjkldidjmmolo` header on the token request. This is why the old Mobile and desktop platform recommendation is replaced with SPA. The diagnostic did not use user credentials and does not establish a successful Entra token exchange. Microsoft's [auth-code documentation](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#redirect-uris-for-single-page-apps-spas) explains the Origin/SPA requirement. SPA refresh tokens have a 24-hour lifetime; renewed interactive authorization can be required after that window.

## Store automation is separate

`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` authorize GitHub Actions to upload store packages. They do not authorize reading Gmail. These credentials stay in Actions secrets and never go into `oauth/config.ts`, the manifest, public documentation or the extension ZIP.

Codetree already has those secret names and a `CWS_EXTENSION_ID`; mailchecker currently has none. The three publisher OAuth credentials may be reused for another item owned by the same authorized publisher, subject to the actual grant and API access; mailchecker needs its own item ID. GitHub cannot reveal the stored secret values for copying. The maintainer must supply the original values to mailchecker's Actions settings, or recreate the upload grant. No secret values were read during preparation.
