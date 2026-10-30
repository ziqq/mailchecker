# Chrome Web Store listing

Submission completed, **29 October 2026**: Chrome Web Store accepted package **0.0.51** and now reports **Pending review**. The Package page explicitly showed 0.0.51 before submission. The revised 1692-character English description is saved in all 13 listing locales; English, French and German were additionally read back after a full reload. The saved private reviewer instructions contain 463 characters, explain browser language and both search scopes, and include the owner-approved demo link without credentials. Privacy disclosures/certifications and the custom policy URL were read back unchanged. Distribution remains free, Public and All regions. **Publish automatically** was unchecked in the final submission dialog so release publication can wait for the separate Gmail OAuth decision. Google Verification Center independently reports **data access under review**. Neither review is an approval, and the extension is not yet published.

Prepared candidate, **29 October 2026**: the next store upload is **0.0.51**, `dist/mailchecker-0.0.51.zip`, SHA-256 `9ac137e50ff0d2f95b7b87af93081b68dff732d7f3a78f58cda45599397cbef3`. The matching keyed reviewer archive is `dist/mailchecker-0.0.51-unpacked.zip`, SHA-256 `d850ad78a9aaecc7023f9d11d53b0a0d47a2c43c9556f789d18fcd89dcd9b137`. The source snapshot and reviewer instructions distinguish these from the historical 0.0.48 assets below. Use the revised loaded-mail search wording in the description; actual dashboard upload and save are still pending.

Copy-ready English values for the Chrome Web Store Developer Dashboard, tab by tab, following the same structure as Codetree's listing document. Keep these values consistent with the exact uploaded package, [Privacy](../PRIVACY.md) and [release preparation](CHROME_WEB_STORE.md). The upload API does not update listing fields.

These copy-ready values describe candidate **0.0.51**. The following dated 0.0.48 save history is retained for provenance. On 23 October 2026 the English description was saved and verified after reloading in all 13 listing locales. Privacy fields, the final three-image gallery, promo and test instructions were also saved and read back. With explicit owner confirmation, the older first screenshot was removed and all three data-usage certifications were saved and verified after reloading. The dashboard's Submit for review button is enabled; no review request has been sent. Keep manually entered text in English in every listing locale, including Russian.

On **28 October 2026**, the Homepage URL and Privacy policy URL below were updated to the working HTTPS custom domain, saved and read back after reloading the dashboard. Google branding is verified and published; restricted Gmail scope verification remains pending the real demonstration video. The descriptions, disclosures, screenshots and store submission state were not changed by the URL update.

## Package

Submitted store package: `dist/mailchecker-0.0.51.zip`, SHA-256 `9ac137e50ff0d2f95b7b87af93081b68dff732d7f3a78f58cda45599397cbef3`. The existing draft ID is **bkddpiocidbcpklaoooaabfpgknijamg**. Version 0.0.51 was read back before the accepted review submission on 29 October 2026.

The store archive omits the development-only manifest `key`. `dist/mailchecker-0.0.51-unpacked.zip` retains that public key for local/reviewer installation and must not be uploaded to the store. Its SHA-256 is `d850ad78a9aaecc7023f9d11d53b0a0d47a2c43c9556f789d18fcd89dcd9b137`. Matching source and checksums are in the existing public reviewer prerelease; older 0.0.48 files are retained as historical assets.

## Store listing

| Field                                           | Value                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Name                                            | mailchecker                                                                                                                    |
| Description summary, imported from the manifest | A mail client in the toolbar: unified inbox, safe reading and replies for Gmail, Yandex Mail, Mail.ru, Microsoft 365 and JMAP. |
| Category                                        | Communication                                                                                                                  |
| Default language                                | English                                                                                                                        |

The manifest summary names the implemented provider adapters. The detailed description below discloses which connections are actually available in this candidate; Microsoft must not be advertised as a working configured connection.

### Description

```text
mailchecker brings your mailboxes into the browser toolbar. Open a message in the popup, or switch to a full tab when you need more room.

- One inbox for connected accounts, with mailbox colours, unread counts and notifications.
- Move individual messages or a selected group of loaded messages to Trash; failed actions remain selected for retry.
- Conversations, folders, pinned mail and filters for notifications and newsletters.
- HTML mail in an isolated reader. Remote images stay blocked until you choose to show them.
- A local cache opens mail you have already loaded. It does not download your entire history.
- Server search with Load more and separate error/retry states for supported connections.
- Light and dark themes, a compact popup and 13 interface languages.

Connect Gmail, Yandex Mail and Mail.ru through an existing browser sign-in, or a JMAP mailbox through its API token. Gmail can also connect through Google with an account picker and separate access for each mailbox. Google verification is pending; Google may show an unverified-app warning and limit access. Gmail history search requires this Google API connection. Browser-sign-in Gmail searches the sender, subject and preview of mail already loaded in this browser; it does not search the entire Gmail history. Outlook / Microsoft 365 connection is not yet available in this build. Available actions depend on the provider; unsupported replies open webmail.

mailchecker has no backend, advertising or analytics. Mail requests go directly to the connected provider. Loaded mail is stored locally in the browser profile; the cache can be cleared in Settings. The extension does not encrypt the browser profile.
```

### Graphics

Use the English interface captures and fictional email data from [store/](store/README.md). Include both dark and light themes; **do not omit the light conversation screenshot**. The prepared order is:

| Field            | File                                                                                                       | Size     |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| Store icon       | [store/icon128.png](store/icon128.png)                                                                     | 128×128  |
| Screenshot 1     | [store/inbox-dark.jpg](store/inbox-dark.jpg): unified inbox, notification stacks and blocked remote images | 1280×800 |
| Screenshot 2     | [store/reader-light.jpg](store/reader-light.jpg): light conversation reader and attachments                | 1280×800 |
| Screenshot 3     | [store/folders-dark.jpg](store/folders-dark.jpg): system and custom folders                                | 1280×800 |
| Small promo tile | [store/promo-440x280.png](store/promo-440x280.png)                                                         | 440×280  |

The three screenshots and promo were saved and verified after reloading on 23 October. The older first screenshot was removed with explicit owner confirmation; the gallery now follows the table above. These screenshots demonstrate the interface, not live provider or OAuth verification. No marquee image or promotional video is currently prepared.

### Additional fields

| Field          | Value                                      |
| -------------- | ------------------------------------------ |
| Official URL   | None; not selected in the dashboard        |
| Homepage URL   | https://mailchecker.ustinoff.dev/          |
| Support URL    | https://github.com/ziqq/mailchecker/issues |
| Mature content | No                                         |

## Privacy

Upload the current package first when possible so the dashboard reflects all manifest permissions. These values were read back for submitted candidate 0.0.51. Google OAuth verification remains a separate review.

### Single purpose

```text
Read and manage the user's connected email accounts from the browser toolbar and full-tab mail client.
```

### Permission justification

`storage`:

```text
Store local preferences, connected accounts, credentials and the latest mailbox state. A bounded local IndexedDB cache opens mail the user has already loaded. Credentials are handled only by the extension service worker and are excluded from page state.
```

`alarms`:

```text
Schedule periodic checks for new mail at the interval chosen by the user in Settings.
```

`notifications`:

```text
Display notifications for newly received messages in connected mailboxes and open the selected message when a notification is clicked.
```

`identity` (optional):

```text
Open Google account selection and consent, obtain account-specific Gmail API tokens through Chrome Identity and renew a connected account token when needed. The same optional permission supports Microsoft OAuth when configured. It is requested only when the user connects an API account.
```

`cookies` (optional):

```text
After the user connects browser-sign-in Gmail, read only Gmail's GMAIL_AT cookie on mail.google.com to perform requested archive, Trash, read-state and star actions. No other cookie is read. This optional permission is requested from the connection action in Settings.
```

Host permissions:

```text
Send mail requests directly to connected providers: Gmail, Google identity verification, Microsoft Graph and Fastmail. Microsoft login supports its OAuth flow when configured. The optional HTTPS declaration lets users connect a JMAP server on their own domain and browser-sign-in Gmail, Yandex Mail or Mail.ru. Settings requests only the specific origins needed for a connection; it does not request all HTTPS sites at installation. The extension does not collect browsing history.
```

### Remote code

Select **No, I am not using remote code**. If a justification is requested:

```text
No remote code is executed. JavaScript, SolidJS, styles and fonts are bundled in the extension. Provider JSON and email HTML are data; HTML is sanitized and displayed in a script-free sandboxed frame. No eval, remote scripts or downloaded WebAssembly are used.
```

### Data usage

Select these three categories to disclose the data the mail client handles, including local processing and caching:

- **Personally identifiable information**: mailbox addresses, correspondent names and stable Google account identifiers.
- **Authentication information**: OAuth/API tokens, transient account-selection identity tokens and the permitted Gmail action cookie. Identity tokens are validated in the worker and are not retained.
- **Personal communications**: message metadata, conversation bodies and attachment names.

Other categories remain unchecked: the client does not separately collect health, financial, location, browsing-history, activity-monitoring or general website-content data. Email content is disclosed under Personal communications. Mail and credentials go directly to the connected provider; there is no developer backend, advertising or analytics.

The owner explicitly authorized the dashboard's three certifications on 23 October: data is not sold or transferred outside approved use cases, is not used for unrelated purposes, and is not used to determine creditworthiness or for lending. All three were saved for candidate 0.0.48 and verified after reloading. Reassess these statements against any later package or policy changes; this document alone does not accept new declarations.

### Privacy policy URL

```text
https://mailchecker.ustinoff.dev/privacy.html
```

## Distribution

Draft settings read from the dashboard on 23 October:

| Field      | Value                 |
| ---------- | --------------------- |
| Payments   | Free                  |
| Visibility | Public                |
| Regions    | All available regions |

Do not submit a public release until its provider availability, reviewer access and applicable Google verification requirements have been resolved. Chrome Web Store review and Google OAuth review are separate processes.

## Test instructions

The dashboard's Additional instructions field accepts at most **500 characters**. The saved text is 463 characters; replace the private-video placeholder when using this template:

```text
Use an English Chrome profile. Settings: connect your own Gmail via Through Google, browser-signed-in Gmail/Yandex/Mail.ru, or a JMAP test mailbox. OAuth review is pending; a Google warning/user cap may apply. Test reading, folders, search/Load more, read/unread and Trash on disposable mail. Gmail API searches history; browser Gmail searches loaded metadata. Microsoft is disabled. Add two Gmail accounts, then disconnect one. Demo: <private-unlisted-video-url>
```

If reviewer credentials are required, provide dedicated test accounts only through the dashboard's private reviewer fields. Never put passwords, tokens or personal mailboxes in this file. Google OAuth is registered to extension ID `bkddpiocidbcpklaoooaabfpgknijamg`; loading the store ZIP unpacked without its store identity is not an equivalent OAuth test. Test both approved Google accounts separately and in the combined inbox. Disconnecting a mailbox must preserve the other account; removal evicts the native Google token from Chrome's cache but does not revoke the provider-side grant.

Google OAuth entered Production with owner confirmation on 23 October. Restricted-scope verification is pending; Google's unverified-app warning and user cap can apply. The review route uses reviewer-owned eligible accounts, not shared personal credentials. Real sign-in by an external reviewer has not been observed. The sandbox's fictional messages are not part of the store package.

The prepared keyed build, installation instructions, dedicated demo-mail fixtures and alternative reviewer account routes are documented in [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md). No reviewer password or Google token belongs in either document.

## Publishing

The existing draft is [mailchecker in the Developer Dashboard](https://chrome.google.com/webstore/devconsole/f3cf73d3-37ce-4ab4-88a4-5cb1fce26075/bkddpiocidbcpklaoooaabfpgknijamg/edit?hl=ru). Save and reopen each edited section to verify its actual persisted values before requesting review.

The release workflow can create a GitHub Release and submit the package when CWS credentials are configured. Do not trigger it as a draft-upload test. Follow the remaining steps and evidence in [release preparation](CHROME_WEB_STORE.md); Google scope justifications and the demonstration-video plan are in [OAuth setup](OAUTH.md#public-verification).
