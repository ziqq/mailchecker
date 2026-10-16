# Chrome Web Store release preparation

Build **0.0.41** is uploaded to the [Chrome Web Store draft](https://chrome.google.com/webstore/devconsole/f3cf73d3-37ce-4ab4-88a4-5cb1fce26075/bkddpiocidbcpklaoooaabfpgknijamg/edit/package?hl=en). The Package tab confirmed version 0.0.41, 13 languages, draft status and no published version. Review submission and publication have not been performed. Last checked: 16 October 2026.

Local patch **0.0.42** contains the English sandbox data and moves fixture initialization inside `createFixtures`, so the long mock email is fully excluded from release bundles. It passed `npm run verify` (212 tests) and ZIP verification; SHA-256 is `2af12dc873bf5577f492827b969ecfac65f012cf2f93c0fc53a88c99ab1afd56`. It has not been uploaded. The exact uploaded 0.0.41 archive was restored and matches the recorded checksum. After the maintainer accepted the English fixtures, the obsolete fixture expectations were updated and the complete browser suite passed all 94 tests. A new English-preview regression covers interface locale, subject, body, attachment name and custom folders. The strengthened release check rejects the previous module-level fixture initialization in both Chromium and Safari client/options bundles.

## Prepared materials

- Package: `dist/mailchecker-0.0.41.zip`, SHA-256 `99c41f6a5589eddfb9807bd40a149559cbabd5ac90945bc69bd727b6e9efe9e2`. Its 31 entries contain the runtime and public policy, without source, sandbox or development dependencies. The packager omits the development-only manifest `key`; unpacked builds retain it.
- Icon: `src/icons/icon128.png`.
- Store images: [store/](store/README.md), captured again with English interface text and English fictional mail. Three screenshots are 1280×800; the promo is 440×280. They demonstrate the interface, not successful live mail integrations.
- Public policy: [PRIVACY.md](https://github.com/ziqq/mailchecker/blob/main/PRIVACY.md). Anonymous HTTP 200 and an exact byte match with the ZIP policy were verified. Only this document was pushed, in [commit b7e8549](https://github.com/ziqq/mailchecker/commit/b7e8549b5d8f250ba2edf5ffc173eccb613bea20); the other local commits remain unpushed. GitHub still has the 0.0.13 runtime.

Chrome requires a manifest description of at most 132 characters, screenshots of 1280×800 or 640×400 and a small promo of 440×280. See the official [preparation guide](https://developer.chrome.com/docs/webstore/prepare) and [image requirements](https://developer.chrome.com/docs/webstore/images).

## Verified draft and OAuth state

The draft item ID is `bkddpiocidbcpklaoooaabfpgknijamg`; publisher ID is `f3cf73d3-37ce-4ab4-88a4-5cb1fce26075`. The public store key is recorded and cryptographically checked in [OAUTH.md](OAUTH.md#verified-store-identity). The current unpacked ID is still `fbojnpjcjilajbfjfhipjkldidjmmolo`. Its development key has not been replaced. Changing it requires a new patch build and a check of existing account/cache behavior.

The first store upload rejected the manifest `key`. After correcting the packager, the upload succeeded; CRC, exact runtime bytes and deterministic repackaging were checked. The latest full `npm run verify` passed all 212 tests, formatting, ESLint, TypeScript, repository checks, build and packaging. This does not establish live OAuth behavior.

The English detailed description below, homepage and support URL were saved in the draft. The Communication category was selected; the same English description was entered for the Russian listing locale and Save draft was clicked. The icon and the previous first global screenshot were uploaded. **The newly captured English screenshots have not yet replaced that old upload.** Remaining screenshots, promo and Privacy practices still require completion. Chrome restricts scripted access to its extension gallery, so these fields need native browser interaction.

Google Cloud setup now uses the separate **mailchecker** project `mailchecker-511814` (number `1014715555178`), created by the maintainer. This supersedes the earlier choice of the shared `github` project. Codetree settings were not changed. The maintainer completed the initial User Data Policy acceptance; Google confirmed creation of the consent configuration. A Chrome Extension client named `mailchecker Chrome Web Store` was created for the store item ID, with app ownership verified. Its public client ID is recorded in [OAUTH.md](OAUTH.md#selected-google-cloud-project).

Branding links point to the GitHub repository and public policy. The declared scope is only `https://www.googleapis.com/auth/gmail.modify`. Gmail API shows **API Enabled**. Audience is **External / Testing**, with two verified test users: `a.a.ustinoff@gmail.com` and `anthonyustinoff@gmail.com`. No mailbox consent or live token test has been performed. The existing implicit-flow runtime has not been replaced or wired to this Chrome Extension client. Microsoft registration is still pending: Entra Settings → All directories shows No directories found for the current account. An available tenant with app-registration permission is required.

## Remaining release work

1. Implement and accept the correct Google token flow, preserving multiple Gmail accounts and address checks. A Chrome Extension client must not be inserted into the legacy implicit implementation. Verify acquisition, cancellation, expiration, 401 recovery and worker restart. Test actual supported Chromium browsers; Chrome Identity availability must not be assumed everywhere.
2. Register Microsoft Entra public-client access with the final extension ID, SPA redirect and delegated Graph permissions, as documented in [OAUTH.md](OAUTH.md). Never create or embed a client secret in the extension.
3. Resolve applicable Google verification requirements before public OAuth access. `gmail.modify` is a restricted scope. GitHub links accepted in the Testing configuration do not prove ownership of `github.com` or successful brand verification. Google OAuth verification is separate from Chrome Web Store review. See [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
4. Replace the old screenshot with the English capture, upload the other prepared images and complete Privacy practices and reviewer instructions. Recheck every saved field after refresh. All manually entered descriptions, disclosures and reviewer text must be English in every listing locale. Summaries imported from the current ZIP remain localized by its manifest messages.
5. Verify the installed build against dedicated live test mailboxes: history search outside the cache, empty results, pagination, retry after failure, expired sign-in and the correct account. Yandex and Mail.ru search adapters have synthetic and web-client evidence; their HTTP searches from the installed extension still need live verification. Private webmail endpoints can change.
6. For CI upload, configure `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` and `CWS_REFRESH_TOKEN` in GitHub Actions for this publisher. Secret values must not appear in documentation, source or chat. Existing GitHub secrets cannot be read back.
7. Bump the patch version for the next handed-over extension build, update the listing to match the final ZIP and run the required checks. A release workflow can create a GitHub Release and submit to the store when secrets exist; do not invoke it as a trial build. Review submission and publication require a separate final step.

Do not promise integrated search for browser-sign-in Gmail, IMAP/iCloud support, every action for every provider or a completed Safari release. Update the description only after the final configuration is verified.

## Listing draft for the uploaded configuration

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

This build connects Gmail, Yandex Mail and Mail.ru through an existing browser sign-in, and JMAP mailboxes through an API token. Gmail search requires a separate Gmail API connection; browser-sign-in Gmail does not support integrated history search. Google and Microsoft API sign-in require configured OAuth client IDs and are disabled in this build. Available actions depend on the provider; unsupported replies open webmail.

mailchecker has no backend, advertising or analytics. Mail requests go directly to the connected provider. Loaded mail is stored locally in the browser profile; the cache can be cleared in Settings. The extension does not encrypt the browser profile.

**Homepage:** https://github.com/ziqq/mailchecker

**Support:** https://github.com/ziqq/mailchecker/issues

**Privacy policy:** https://github.com/ziqq/mailchecker/blob/main/PRIVACY.md

## Privacy practices

**Single purpose:** Read and manage the user's connected email accounts from the browser toolbar and full-tab mail client.

**Remote code:** No. Scripts, SolidJS, fonts and styles are bundled. Provider JSON/HTML is data; email HTML is sanitized and displayed in a script-free sandbox.

| Permission                           | Justification for the form                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                            | Store local preferences, connected accounts and the latest mailbox state. Credentials stay in the extension worker.                                                                                                                              |
| `alarms`                             | Schedule periodic checks for new mail at the interval chosen in Settings.                                                                                                                                                                        |
| `notifications`                      | Display new-mail notifications and open the selected message when clicked.                                                                                                                                                                       |
| `identity` (optional)                | Open the provider OAuth sign-in flow when the user connects a configured Google or Microsoft API account.                                                                                                                                        |
| `cookies` (optional)                 | Read only Gmail's GMAIL_AT action cookie on mail.google.com after the user connects browser-sign-in Gmail, to perform requested mail actions.                                                                                                    |
| Gmail/Graph/Microsoft/Fastmail hosts | Send authenticated requests directly to the connected mail provider and refresh Microsoft tokens.                                                                                                                                                |
| `https://*/*` (optional)             | Let the user connect a JMAP server on their own HTTPS domain. The extension requests the specific origin in Settings; it does not request every origin at installation. The same optional declaration covers explicitly connected webmail hosts. |

Data disclosure must account for local processing and caching, not only transmission to a developer server. Prepared categories are **Personally identifiable information** (addresses and correspondent names), **Authentication information** (OAuth/API tokens and the permitted Gmail action cookie), and **Personal communications** (message metadata, bodies and attachment names). Mail links open messages; the extension does not collect browsing history, location, health information, financial information for separate processing or activity outside the mail client. Compare the exact form definitions with the final code and public policy before certification.

The current implementation does not sell data, use advertising or process information outside its single purpose. Verify the final package and form before accepting any binding declarations. See the official [Privacy practices guide](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

## Reviewer instructions

1. Install the submitted ZIP as an unpacked extension in a separate test profile, or install the review build. Click the toolbar icon and open Settings.
2. To test JMAP, enter a test mailbox's HTTPS session URL and API token and grant only that origin. Use a dedicated test mailbox, not personal credentials in the review notes.
3. To test browser sign-in, sign in to a dedicated Gmail, Yandex Mail or Mail.ru test account in the same browser profile. Add that exact address in Settings and grant its webmail origin.
4. Open the inbox and a message; inspect the blocked-image control, folders and unread counts. Search for an existing message outside the loaded inbox and click Load more where more results exist. Browser-sign-in Gmail is excluded from integrated search; Gmail API requires a configured OAuth connection.
5. Clear the mail cache in Settings and remove the test mailbox. Account removal clears its local credentials and cached mail, but does not revoke a provider grant.
6. Google and Microsoft API connection buttons are disabled in this package because their public client IDs are not configured. The sandbox is a developer preview and is not part of the submitted package.

If reviewer credentials are required, provide dedicated test accounts through the dashboard's private reviewer fields. Never add secrets or real mail to Git.
