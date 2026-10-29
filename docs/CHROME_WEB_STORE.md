# Chrome Web Store release preparation

The current local candidate is **0.0.48**. The latest verified [Chrome Web Store draft](https://chrome.google.com/webstore/devconsole/f3cf73d3-37ce-4ab4-88a4-5cb1fce26075/bkddpiocidbcpklaoooaabfpgknijamg/edit/package?hl=en) still contains **0.0.41**: on 16 October 2026 the Package tab showed that version, 13 languages, draft status and no published version. Upload of 0.0.48, review submission and publication are not yet confirmed.

On **22 October 2026**, `npm run verify` passed **241 tests**, formatting, ESLint, TypeScript, repository checks, Chromium build and packaging. `npm run test:sandbox` passed **94 scenarios**, including popup (780×600), mini popup (400×600), wide tab (1440×900), phone (390×844) and MV3 cache checks. The Safari build passed; the same-day dependency audit reported no vulnerabilities. These are local checks, not store approval or live verification of every provider.

The maintainer connected both real Gmail test accounts and confirmed that both still work after reloading the extension. The screenshot and confirmation establish account selection, simultaneous checks and persistence after reload; they do not establish live token-expiry recovery or independent disconnect. Permanent regressions cover those additional cases with synthetic accounts and signed identity tokens. The 0.0.48 refresh-button fix also passed temporary browser measurements at all four layout sizes. See [OAUTH.md](OAUTH.md) for the OAuth implementation and acceptance record.

## Prepared materials

- Store package: `dist/mailchecker-0.0.48.zip`, SHA-256 `c90740a1548a43e12117676cbd1c0280e85bb7ee6078f19051ea1990ae93ab06`. Its 31 entries contain the runtime and public policy, without source, sandbox or development dependencies. The packager omits the development-only manifest `key`.
- Local update package: `dist/mailchecker-0.0.48-unpacked.zip`, SHA-256 `594f6ccbb0688bfa7c0d803b33e64bac2412e1354970cd8f2aab6d84c6e09b02`. This package retains the public key so an unpacked installation uses the registered store ID. Do not upload it to the store. The maintainer has not yet confirmed installing 0.0.48.
- Icon: `src/icons/icon128.png`.
- Store images: [store/](store/README.md), captured again with English interface text and English fictional mail. Three screenshots are 1280×800; the promo is 440×280. They demonstrate the interface, not successful live mail integrations.
- Public policy: [PRIVACY.md](https://github.com/ziqq/mailchecker/blob/main/PRIVACY.md). The updated native Google identity and account-selection disclosure was published separately in [commit 5227ea5](https://github.com/ziqq/mailchecker/commit/5227ea5f4c61bb8155e31f08b51e93e368b39bdb) on 22 October. Its anonymous raw download matches the local policy and both final ZIPs byte for byte. Only the policy was published; the current runtime commits remain local.

Chrome requires a manifest description of at most 132 characters, screenshots of 1280×800 or 640×400 and a small promo of 440×280. See the official [preparation guide](https://developer.chrome.com/docs/webstore/prepare) and [image requirements](https://developer.chrome.com/docs/webstore/images).

## Verified draft and OAuth state

The draft item ID is `bkddpiocidbcpklaoooaabfpgknijamg`; publisher ID is `f3cf73d3-37ce-4ab4-88a4-5cb1fce26075`. The public store key is recorded and cryptographically checked in [OAUTH.md](OAUTH.md#verified-store-identity). Current keyed unpacked builds use that same ID. Their origin is separate from the earlier `fbojnpjcjilajbfjfhipjkldidjmmolo` installation; accounts and caches are not migrated across origins. The maintainer disabled the older installation after finding that two enabled copies produced duplicate notifications.

The first store upload rejected the manifest `key`. After correcting the packager, the 0.0.41 upload succeeded. Current store packaging continues to omit that key; the 0.0.48 archives passed CRC and exact-runtime-byte verification.

An earlier English detailed description, homepage and support URL were saved in the draft. The Communication category was selected; English text was also entered for the Russian listing locale. The icon and the previous first global screenshot were uploaded. **The updated 0.0.48 description below and newly captured English screenshots have not yet been confirmed saved in the dashboard.** Remaining screenshots, promo, Privacy practices and reviewer instructions require completion and read-back after saving.

Google Cloud setup now uses the separate **mailchecker** project `mailchecker-511814` (number `1014715555178`), created by the maintainer. This supersedes the earlier choice of the shared `github` project. Codetree settings were not changed. The maintainer completed the initial User Data Policy acceptance; Google confirmed creation of the consent configuration. A Chrome Extension client named `mailchecker Chrome Web Store` was created for the store item ID, with app ownership verified. Its public client ID is recorded in [OAUTH.md](OAUTH.md#selected-google-cloud-project).

Google API sign-in is configured in 0.0.48. A separate Web client selects a Google identity with `openid email`; the worker validates its signed identity token, then Chrome Identity obtains account-specific `gmail.modify` and `userinfo.email` access with the registered Chrome Extension client. Neither client uses an embedded secret. The maintainer's live evidence on 22 October confirms both `a.a.ustinoff@gmail.com` and `anthonyustinoff@gmail.com` connected and checked at 16:29, followed by a successful extension reload for both accounts.

Gmail API and the two test-user entries were verified on 21 October. The Branding page was rechecked on 22 October and still explicitly shows **Testing**, with the GitHub homepage and policy links and the authorized domains `github.com` and `chromiumapp.org`. Branding links point to the GitHub repository and public policy. Public Google brand and restricted-scope verification remain unresolved: accepting GitHub links in Testing does not establish domain ownership. Microsoft registration is also pending: the inspected Entra account showed **No directories found**, and `microsoft` remains unconfigured in the build. An available tenant with app-registration permission is required. Browser tooling cannot directly inspect extension pages; the live Gmail result above is maintainer-reported evidence.

## Remaining release work

1. Upload the verified 0.0.48 store package to the existing draft, replace the old screenshot with the English capture and upload the remaining images. Save the current English description, Privacy practices and reviewer instructions; read each field back after refresh. All manually entered text must be English in every listing locale. Summaries imported from the ZIP remain localized by its manifest messages.
2. Keep the published policy and listing accurate if the final OAuth configuration changes. The 22 October policy update is published and matches candidate 0.0.48.
3. Resolve applicable Google verification requirements before public OAuth access. `gmail.modify` is a restricted scope. GitHub links accepted in Testing do not prove ownership of `github.com` or successful brand verification. Google OAuth verification is separate from Chrome Web Store review. Prepare the required homepage, privacy links, scope justification and reviewer access; do not treat the two test-user grants as public approval. See [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
4. Register Microsoft Entra public-client access with the final extension ID, SPA redirect and delegated Graph permissions, as documented in [OAUTH.md](OAUTH.md), when a tenant is available. Never create or embed a client secret in the extension. Until configured and verified, keep Outlook unavailable and exclude it from advertised working connections.
5. Verify the installed final build against dedicated live test mailboxes: history search outside the cache, empty results, pagination, retry after failure, expired sign-in and correct-account routing. Gmail connection and reload acceptance are complete; live token renewal and independent disconnect remain unchecked. Yandex and Mail.ru search adapters have synthetic and web-client evidence; their HTTP searches from the installed extension still need live verification. Private webmail endpoints can change. Test actual supported Chromium browsers without assuming Chrome Identity exists everywhere.
6. For CI upload, configure `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` and `CWS_REFRESH_TOKEN` in GitHub Actions for this publisher. Secret values must not appear in documentation, source or chat. Existing GitHub secrets cannot be read back.
7. Bump the patch version if another runtime build is handed over, update the listing to match the final ZIP and run checks appropriate to any new changes. The current 0.0.48 checks have passed. A release workflow can create a GitHub Release and submit to the store when secrets exist; do not invoke it as a trial build. Review submission and publication are the final release steps after the remaining blockers are resolved.

Do not promise integrated search for browser-sign-in Gmail, IMAP/iCloud support, every action for every provider or a completed Safari release. Update the description only after the final configuration is verified.

## Listing draft for candidate 0.0.48

This text describes the current candidate, including the Google Testing limitation. Replace that limitation only after public OAuth access is verified; save the final text against the exact uploaded package.

**Name:** mailchecker

**Short description:** Mail in your toolbar: unified inbox, safe reading, folders and notifications. No backend.

**Detailed description:**

mailchecker brings your mailboxes into the browser toolbar. Open a message in the popup, or switch to a full tab when you need more room.

- One inbox for connected accounts, with mailbox colours, unread counts and notifications.
- Move individual messages or a selected group of loaded messages to Trash; failed actions remain selected for retry.
- Conversations, folders, pinned mail and filters for notifications and newsletters.
- HTML mail in an isolated reader. Remote images stay blocked until you choose to show them.
- A local cache opens mail you have already loaded. It does not download your entire history.
- Server search with Load more and separate error/retry states for supported connections.
- Light and dark themes, a compact popup and 13 interface languages.

Connect Gmail, Yandex Mail and Mail.ru through an existing browser sign-in, or a JMAP mailbox through its API token. Gmail can also connect through Google with an account picker and separate access for each mailbox. Google API access is currently limited to approved test users while Google verification is pending. Gmail history search requires this Google API connection; browser-sign-in Gmail does not support integrated history search. Outlook / Microsoft 365 connection is not yet available in this build. Available actions depend on the provider; unsupported replies open webmail.

mailchecker has no backend, advertising or analytics. Mail requests go directly to the connected provider. Loaded mail is stored locally in the browser profile; the cache can be cleared in Settings. The extension does not encrypt the browser profile.

**Homepage:** https://github.com/ziqq/mailchecker

**Support:** https://github.com/ziqq/mailchecker/issues

**Privacy policy:** https://github.com/ziqq/mailchecker/blob/main/PRIVACY.md

## Privacy practices

**Single purpose:** Read and manage the user's connected email accounts from the browser toolbar and full-tab mail client.

**Remote code:** No. Scripts, SolidJS, fonts and styles are bundled. Provider JSON/HTML is data; email HTML is sanitized and displayed in a script-free sandbox.

| Permission                                  | Justification for the form                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                                   | Store local preferences, connected accounts and the latest mailbox state. Credentials stay in the extension worker.                                                                                                                              |
| `alarms`                                    | Schedule periodic checks for new mail at the interval chosen in Settings.                                                                                                                                                                        |
| `notifications`                             | Display new-mail notifications and open the selected message when clicked.                                                                                                                                                                       |
| `identity` (optional)                       | Open Google account selection and consent, obtain account-specific Gmail API tokens through Chrome Identity and renew a connected account's token when needed. The same permission supports Microsoft OAuth when configured.                     |
| `cookies` (optional)                        | Read only Gmail's GMAIL_AT action cookie on mail.google.com after the user connects browser-sign-in Gmail, to perform requested mail actions.                                                                                                    |
| Gmail/Google/Graph/Microsoft/Fastmail hosts | Send requests directly to a connected mail provider. Google endpoints also verify the selected account's identity and its signed identity token. Microsoft hosts support OAuth and token refresh when Microsoft is configured.                   |
| `https://*/*` (optional)                    | Let the user connect a JMAP server on their own HTTPS domain. The extension requests the specific origin in Settings; it does not request every origin at installation. The same optional declaration covers explicitly connected webmail hosts. |

Data disclosure must account for local processing and caching, not only transmission to a developer server. Prepared categories are **Personally identifiable information** (mailbox addresses, correspondent names and stable Google account identifiers), **Authentication information** (OAuth/API tokens, transient identity tokens and the permitted Gmail action cookie), and **Personal communications** (message metadata, bodies and attachment names). Identity tokens used to select a Google account are verified in the worker and are not retained; mailbox credentials remain in worker-owned local storage. Mail links open messages; the extension does not collect browsing history, location, health information, financial information for separate processing or activity outside the mail client. Compare the exact form definitions with the final code and public policy before certification.

The current implementation does not sell data, use advertising or process information outside its single purpose. Verify the final package and form before accepting any binding declarations. See the official [Privacy practices guide](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

## Reviewer instructions

1. Install the Chrome Web Store review build, click the toolbar icon and open Settings. Google OAuth is registered to extension ID `bkddpiocidbcpklaoooaabfpgknijamg`; loading the store ZIP unpacked without its store identity is not an equivalent OAuth test.
2. To test JMAP, enter a test mailbox's HTTPS session URL and API token and grant only that origin. Use a dedicated test mailbox, not personal credentials in the review notes.
3. To test browser sign-in, sign in to a dedicated Gmail, Yandex Mail or Mail.ru test account in the same browser profile. Add that exact address in Settings and grant its webmail origin.
4. For Google API access, choose Through Google, select a dedicated approved Google test account and complete Google's consent. Repeat with a second approved test account to inspect the combined inbox and each account separately. Google OAuth remains in Testing; a reviewer account must be approved through the dashboard's private access arrangement before this flow can be tested. Personal maintainer accounts must not be used as review credentials.
5. Open the inbox and a message; inspect the blocked-image control, folders and unread counts. Search for an existing message outside the loaded inbox and click Load more where more results exist. Browser-sign-in Gmail is excluded from integrated search; use a Google API connection for Gmail history search.
6. Clear the mail cache in Settings, then disconnect one dedicated test mailbox. Removal clears only that account's local credentials, check result and cached mail, and evicts its native Google token from Chrome's cache when applicable. Other connected mailboxes remain available. Removal does not revoke the provider-side grant.
7. Microsoft connection is disabled because its client ID is not configured. The sandbox and its fictional messages are a developer preview and are not included in the submitted package.

If reviewer credentials are required, provide dedicated test accounts through the dashboard's private reviewer fields. Never add secrets or real mail to Git.
