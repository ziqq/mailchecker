<!--
https://github.com/ziqq/mailchecker
Copyright (C) 2026 Anton Ustinoff
https://github.com/ziqq/mailchecker/blob/main/LICENSE

Recording instructions and English narration for the real Google OAuth review.
-->

# OAuth verification video

Completion update, **30 October 2026**: the owner approved the final export, which was uploaded Unlisted on 29 October with English narration and imported English captions. Its private URL was saved in both review forms and is intentionally absent from this public document. Google OAuth data access is under review; Chrome Web Store approved 0.0.51, which remains unpublished by owner choice pending the OAuth decision. No additional filming is requested. The earlier recording kit and preparation checkpoints below are historical, not outstanding upload instructions.

Prepared on **28 October 2026**. This is a recording kit, not a completed verification video. At preparation, the [review package](https://github.com/ziqq/mailchecker/releases/tag/oauth-review-0.0.48) and Chrome Web Store draft were version 0.0.48; local source was 0.0.49. Show and report the version actually installed in the recording.

Recording update, **29 October 2026**: the owner supplied four real recordings. `2.2.mov` (49.89 seconds) shows account selection, identity/email consent, the unverified-app warning, English Gmail consent and a successful connection. `3.mov` (103.33 seconds) shows reading, search, opening a result, read-state controls, Archive and Trash actions. `4.mov` (34.39 seconds) shows adding the second Gmail account through an existing grant and switching between both accounts and the unified Inbox. `5.mov` (14.13 seconds) shows removing only the second connection while the first remains usable. These are real owner mailboxes, not staged sandbox fixtures. Original MOV files are unchanged. No reply, actual system-folder view, pin/unpin action or cache clearing is visible in the supplied footage. Nothing has been uploaded or submitted to Google from these recordings.

Assistant evidence capture, **29 October 2026**: the live English homepage, data-handling section, privacy policy and Limited Use section were captured through browser controls. Google Cloud's actual Clients table and Chrome Extension client card were also captured. The card visibly confirms the full public Chrome client ID, the matching store Item ID and verified app ownership. Only public identifiers were retained; the Web client's secret settings were not opened. The public 0.0.48 reviewer release was captured separately as package evidence, not as proof of the installed version. These supporting sections use live-page stills; they are not continuous recordings or evidence of Gmail operations. The real consent footage remains the owner's recording. The native consent URL still uses its original opaque parameter; configuration evidence supplements that footage without changing the URL.

The updated local draft is `dist/oauth-video-20261029/review-v2/mailchecker-oauth-review-v2-en.mp4`: **3:56.5**, H.264 at 1920×1202 and 30 fps, English synthetic narration and a matching English subtitle track. It supersedes the earlier 1:43.8 partial draft. Opaque masks cover only the three unrelated account-picker identities, including names, addresses and avatars. Both owner identities remain visible: `a.a.ustinoff@gmail.com` and `anthonyustinoff@gmail.com`. No real connections were changed by editing. The extension-operation section is cropped to the actual popup for readability; its source ranges are 0–20 and 39–103.3 seconds of `3.mov`. The short Smart Inbox category detour is omitted. Both account connection and removal retain their actual results.

The sidecar SRT, `EDIT_NOTES.json` and `NEXT_SHOTS_RU.txt` record narration timing, source hashes, masks, edits, evidence limits and remaining footage. All 27 voice cues fit their slots, and a full export decode passed. Original files remain untouched. This is a local draft with real owner message subjects and bodies still visible; owner privacy review is required before an unlisted upload. It is not a completed verification or a Google approval.

| Export time   | Evidence                                                        |
| ------------- | --------------------------------------------------------------- |
| 0:00–0:40     | Homepage and privacy-policy supporting stills                   |
| 0:40–1:10.8   | Real account selection, consent and successful first connection |
| 1:10.8–2:35.1 | Real reading, search and mailbox actions                        |
| 2:35.1–3:09.4 | Second account, both connections, separate and unified Inbox    |
| 3:09.4–3:23.5 | Independent removal; first account remains connected            |
| 3:23.5–3:45.5 | Public Google client configuration and matching extension ID    |
| 3:45.5–3:56.5 | Public reviewer package                                         |

Remaining preparation, clarified with the owner on **29 October 2026**: no additional reply, folder/pin or cache-clear recording is currently requested. These were optional demonstrations, not separately named mandatory shots in Google's guide. The existing real footage already shows consent, reading, search and mailbox-state changes. The capture order and sample narration below remain a broader reference plan, not a new filming request.

1. Resolve or accurately explain the native Chrome client's opaque consent URL and attach the existing public configuration evidence. Do not assume that a separate Cloud frame guarantees acceptance of the address-bar requirement.
2. Align the final reviewer ZIP, matching source, instructions and store package with one release version. Local source is 0.0.50; the last recorded public reviewer package and store draft are 0.0.48.
3. Complete the owner's privacy review of the local video, upload the approved export to a YouTube channel as Unlisted and verify reviewer access to that link.
4. Save the prepared Email client / scope justification / video link in Google Cloud and submit both existing clients for restricted-scope review.
5. Finalize the Chrome Web Store reviewer instructions and submit the extension separately after resolving public Gmail access.

The search recording does not establish that a result was outside the initially loaded Inbox. Archive is clicked but remains in the search results, which is compatible with search including archived mail; the destination itself is not shown. This is a documented coverage limit, not a new owner filming request. The Chrome Gmail consent URL uses Google's original opaque `part` parameter. The full public client ID is shown separately in Google Cloud; this does not establish that Google's stricter address-bar requirement has been satisfied, and a reviewer may request clarification. No OAuth requests or displayed URLs were rewritten for the video.

## Required evidence

Google's [restricted-scope verification guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) asks for the real sign-in and consent flow in English, the app name and OAuth client ID in the consent address bar, the functionality using restricted scopes, and access through each client. Upload the reviewed recording to YouTube with **Unlisted** visibility; a sandbox walkthrough cannot replace the real grant and Gmail operations.

Public identifiers to check against the actual authorization requests:

| Item                   | Value                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| Google Cloud project   | `mailchecker-511814`                                                        |
| App name               | `mailchecker`                                                               |
| Extension ID           | `bkddpiocidbcpklaoooaabfpgknijamg`                                          |
| Identity-selection ID  | `1014715555178-t9nscel1rpel7vtf4hvd2objqar5cnnf.apps.googleusercontent.com` |
| Gmail Chrome client ID | `1014715555178-fvb8f96qqh5aq10qpdg6hnv4isgkj3ph.apps.googleusercontent.com` |
| Restricted scope       | `https://www.googleapis.com/auth/gmail.modify`                              |
| Homepage               | `https://mailchecker.ustinoff.dev/`                                         |
| Privacy policy         | `https://mailchecker.ustinoff.dev/privacy.html`                             |

These IDs are public. Never display an access token, ID token, token-bearing callback URL, password, passkey or recovery code.

## Before recording

1. Use the dedicated browser window. Close unrelated tabs in that window and hide notifications. Record only that window's relevant area, including the authorization address bar.
2. Check the installed extension ID and version. Use an English browser UI for the extension: the installed extension uses `chrome.i18n`, not the sandbox's `?lang=en` parameter. It has no independent language selector in Settings. Do not restart the owner's other working browser sessions just to change language.
3. Check that Google's actual authorization screens are in English. Do not alter the OAuth request's state, nonce, scopes, callback or client ID to prepare the recording.
4. Prepare owner-controlled demonstration messages before opening the Inbox. Agree on the two account addresses, test-reply recipient and message content before sending anything. The fixture suggestions in [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md#demonstration-mail) have not been created or sent.
5. If an existing grant skips consent, do not claim the grant was filmed. Arrange a fresh demonstration grant with the owner; do not silently revoke a working account or weaken its security settings. The owner completes passwords, passkeys and any device challenge off-record. A new Gmail grant requires the owner's consent at that step.
6. Keep raw footage local until the owner has reviewed any visible account addresses and message content. An unlisted YouTube video can be viewed by anyone with its link.

## Capture order

The timings below are an editing target, not timestamps for an existing recording. Allow longer wherever Google's real screens need it. Pause between steps rather than rushing permission text.

| Target | Capture                                                                                                                                         | Narration |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0:00   | Homepage, privacy-policy link, then installed extension name, ID and version.                                                                   | 1         |
| 0:20   | Settings → Gmail → Through Google. Show the real identity-selection flow and its public client ID in the authorization address bar.             | 2         |
| 0:45   | The real Gmail consent: app name, Chrome client ID and requested permissions. The owner approves access.                                        | 3         |
| 1:15   | Open an agreed staged conversation and its body. Browse a folder and show its message count.                                                    | 4         |
| 1:40   | Search for `mailchecker-oauth-demo-20261028` in a staged message outside the initially loaded Inbox. Load another page if staged results allow. | 5         |
| 2:05   | On disposable staged messages: mark unread/read, star/unstar, archive, then move a different message to Trash.                                  | 6         |
| 2:45   | Reply in an existing staged conversation to the agreed owner-controlled recipient. Show the reply in the conversation or Sent folder.           | 7         |
| 3:10   | Connect the second owner-controlled account through the real flow. Show both connections and switch between them.                               | 8         |
| 3:45   | Settings → Mail cache. Show the clear-cache and per-account disconnect controls. Execute them only on agreed demo data.                         | 9         |

Show actual states before and after each mailbox change. Do not present a montage, a mock screen or a title card as evidence of a successful provider operation. A second account is evidence of mailchecker's multi-account behavior; it does not substitute for showing both OAuth clients.

## English narration

The numbered blocks correspond to the capture order. They can be spoken or used as English captions. The prepared local speech track is synthetic narration, not recorded Gmail footage. Match each block to what the footage actually demonstrates before publishing.

### 1. Introduction

```text
This is mailchecker, a browser extension for reading and managing email. This demonstration shows the installed version, its real Google authorization flow, and the Gmail features enabled by the requested permissions. The homepage links to the privacy policy.
```

### 2. Account selection

```text
I open Settings and choose Through Google. The first OAuth client selects my Google identity using Open I D and email. It does not request access to Gmail. The authorization address bar shows the account-selection client I D.
```

### 3. Gmail consent

```text
The Chrome Extension client then requests Gmail access for the selected account. The consent screen identifies mailchecker and describes the requested permission. The matching public client I D is shown separately in the Google Cloud configuration. The account owner approves this access.
```

### 4. Reading

```text
I open a demonstration conversation and read its message body. I can also browse mailbox folders and their counts. The extension worker requests this data directly from Google. mailchecker does not operate a server that receives the mailbox data.
```

### 5. Server search

```text
I search for a staged message outside the initially loaded Inbox. For this Google A P I connection, Gmail searches the mailbox history on the server. When another results page is available, Load more retrieves the next page.
```

### 6. Mailbox changes

```text
On demonstration messages, I change the read state, add and remove a star, archive a message, and move another message to Trash. Read-only access cannot perform these changes. Moving a message to Trash does not permanently delete it.
```

### 7. Reply

```text
I send an agreed plain-text reply in an existing demonstration conversation to an owner-controlled recipient. Sending happens only after my explicit reply action. The resulting conversation shows the reply.
```

### 8. Two accounts

```text
I connect a second account through the same identity selection and Gmail consent process. Both accounts remain connected. Switching mailboxes shows their separate messages. Each account keeps its own authorization.
```

### 9. Local data controls

```text
Settings includes controls to clear locally cached mail and disconnect each account. Disconnecting removes that account's local data without disconnecting the other account. It does not revoke Google's grant; the owner can revoke that separately in Google Account settings. mailchecker does not request permission to permanently delete mail.
```

## YouTube metadata

**Title:** `mailchecker — Google OAuth and Gmail API verification`

**Description:**

```text
Real Google OAuth and Gmail API demonstration for mailchecker.

Project: mailchecker-511814
Application type: Email client
Chrome extension ID: bkddpiocidbcpklaoooaabfpgknijamg

The recording demonstrates identity selection, Gmail consent, reading messages, server-side mailbox search, mailbox changes, an owner-initiated reply, multiple accounts and local data controls.

Homepage: https://mailchecker.ustinoff.dev/
Privacy policy: https://mailchecker.ustinoff.dev/privacy.html
Reviewer package: https://github.com/ziqq/mailchecker/releases/tag/oauth-review-0.0.48
```

Use that description only after the recording actually demonstrates the listed features. Set visibility to **Unlisted**, check the link from a signed-out browser and enter it in Google Cloud → Data Access → YouTube link. Providing the link and submitting for review are separate from Google's approval.

## Before uploading

- Watch the entire export, including the OAuth transitions and the first/last frames.
- Keep app name, permission text and public client IDs readable. Remove token-bearing callbacks and unrelated personal information without altering the observed permission or provider result.
- Check that every narration claim matches the visible real operation; trim or rerecord missing evidence.
- Confirm the owner has approved any account addresses, staged content and recipient information visible in the upload. No personal mailbox credentials are a reviewer deliverable.
- Check English narration/captions, readable resolution, audible speech and an accessible unlisted link. Use actual export timestamps if adding chapters.
