# Reviewer access

Review update, **30 October 2026**: Chrome Web Store approved **0.0.51** and reports **Ready to publish**, until **29 November 2026**; its Package page still confirms no published version. The owner retained 0.0.51 as the first release. Local 0.0.52 and its search-heading regression are committed separately and do not change the review assets. Google OAuth data access remains under review: homepage and branding are complete, with the other five stages in progress. The progress panel has no additional action request; it gives an indicative first email in 3–5 days and an overall review of up to 4–6 weeks. The mailbox itself was not inspected. Publication remains held for the separate OAuth decision. Earlier dated preparation notes below are historical.

Submission completed, **29 October 2026**: Chrome Web Store accepted package **0.0.51** and now reports **Pending review**. The Package page explicitly showed 0.0.51 before submission. The revised 1692-character English description is saved in all 13 listing locales; English, French and German were additionally read back after a full reload. The saved private reviewer instructions contain 463 characters, explain browser language and both search scopes, and include the owner-approved demo link without credentials. Privacy disclosures/certifications and the custom policy URL were read back unchanged. Distribution remains free, Public and All regions. **Publish automatically** was unchecked in the final submission dialog so release publication can wait for the separate Gmail OAuth decision. Google Verification Center independently reports **data access under review**. Neither review is an approval, and the extension is not yet published.

Submission update, **29 October 2026**: Google OAuth data access is **under review**, confirmed after reloading. The owner-approved video is **Unlisted** at <private-unlisted-video-url> and includes the uploaded English SRT. The existing reviewer prerelease now provides **0.0.51** store/unpacked ZIPs, the matching working-tree source ZIP, README-0.0.51.md and SHA256SUMS-0.0.51; all four downloaded files match those checksums. Original 0.0.48 assets/tag remain unchanged, no runtime commit or main push was made, and no stable release workflow ran. The questionnaire acknowledges CASA, but its applicability/assessment level remains for Google's review; no paid assessment was commissioned. Chrome Web Store submission is being completed separately.

Preparation update, **29 October 2026**: matching **0.0.51** store/unpacked archives and a corresponding working-tree source snapshot are being prepared. The registered extension ID is unchanged. Source is based on `bf7433ef32a0b2b24b453116b6fedbff951d0dd9` plus release metadata/documentation changes; it is not a new Git commit. Existing 0.0.48 public assets and their tag will remain intact. The owner approved the recorded video for upload to the specified channel; <private-unlisted-video-url> is saved on YouTube with English narration and imported English captions. Further owner filming is not requested.

Historical preparation snapshot before the 29 October submission: public reviewer package **0.0.48**; local source **0.0.50**. Chrome Web Store review and Google OAuth verification are separate reviews. The custom HTTPS site, DNS ownership and Google branding verification/publication are complete. The store Homepage URL and Privacy policy URL use the custom domain and were read back after saving. The store submission and restricted Gmail scope submission are still outstanding. The Data Access form has Email client and the 937-character justification prepared, but Save remains disabled without a real YouTube demonstration link. This file contains no mailbox passwords, tokens or personal test-account credentials.

Owner clarification on **24 October**: retain search through already loaded mail and explain the public-verification procedure. Candidate 0.0.49 adds loaded sender/subject/preview matching for browser-connected Gmail without removing Gmail API, scopes, clients or grants. It is committed locally as `62d1c4435dadca43c720b17edf2122adc28b245d`; the immutable public review package and store draft remain 0.0.48. The requested branding retry was performed and again rejected ownership. No branding publication or scope-review submission was performed. The existing OAuth logo is absent. Codetree's application sign-in uses GitHub/GitLab; its Google `chromewebstore` grant is for publisher automation, so it does not establish an exemption for mailchecker's `gmail.modify` access. A store promotional video is optional; Google's separate restricted-scope process requests a real consent/use video. See [Google restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) and [unverified-app requirements](https://support.google.com/cloud/answer/7454865?hl=en); the unverified-app user cap is not a general-public-launch exemption.

Google's [domain-verification instructions](https://support.google.com/cloud/answer/13804266?hl=en) require a Domain Property confirmed through DNS, rather than a URL-prefix property. That requirement is now satisfied for `ustinoff.dev` under the OAuth owner's account. GitHub also verified the root domain, Enforce HTTPS is enabled, and Google branding is verified and shown to users with `https://mailchecker.ustinoff.dev/` and its linked privacy policy. Earlier dated records below describe the superseded GitHub Pages URL-prefix attempt.

## Current readiness

| Item              | Verified state                                                                               | Remaining action                                                |
| ----------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Chrome Web Store  | 0.0.51 approved; **Ready to publish** until 29 November 2026; no published version           | Retain 0.0.51; publish after the separate OAuth decision        |
| Google project    | `mailchecker-511814`; branding verified/published; data access **under review**              | Await Google's decision or specific follow-up                   |
| Scopes            | `openid`, `userinfo.email`, `gmail.modify`; saved Email client justification and video       | Keep declarations aligned with both existing clients            |
| Homepage/privacy  | Custom HTTPS domain and ownership verified                                                   | Preserve DNS verification and policy accuracy                   |
| Demonstration     | Owner-approved real video uploaded Unlisted with English narration and manually imported SRT | No further owner recording is requested                         |
| Reviewer accounts | Reviewers authorize their own eligible accounts; private username/password fields are empty  | No personal credentials are shared                              |
| Reviewer packages | Public 0.0.51 runtime/source/README/checksums downloaded and verified                        | Use 0.0.51 assets, not the older tag's automatic source archive |

The private video URL is retained in the ignored local preparation manifest and the two review forms. It was removed from the public release body, README and source ZIP; runtime archive hashes did not change.

The `openid` declaration was missing from Data Access even though the existing account selector already requested it. It was added on 23 October without changing the extension, Gmail permissions, clients or current test users.

## Build for Google reviewers

Google's OAuth reviewers need a working client, not just a link to the unpublished store draft. The existing local review build is:

- File: `dist/mailchecker-0.0.51-unpacked.zip`.
- SHA-256: `d850ad78a9aaecc7023f9d11d53b0a0d47a2c43c9556f789d18fcd89dcd9b137`.
- Extension ID: `bkddpiocidbcpklaoooaabfpgknijamg`.

This archive retains the **public** manifest key needed to reproduce the registered extension ID. It contains no private signing key, configured mailbox or browser-profile data. The Chrome Web Store archive `mailchecker-0.0.48.zip` omits this key and is not an equivalent unpacked OAuth test.

With explicit owner approval, the [OAuth review candidate 0.0.48](https://github.com/ziqq/mailchecker/releases/tag/oauth-review-0.0.48) was published on 23 October. It contains the keyed ZIP, source archive from exact commit `a638df6bc319664e4c920496d7e44f30283fc16c`, `README.md` and `SHA256SUMS`. Anonymous downloads of both archives match the local SHA-256 values. The remote review tag points to that exact commit. Remote `main` remains `5227ea5f4c61bb8155e31f08b51e93e368b39bdb`.

The tag `oauth-review-0.0.48` does not match the `v*` release-workflow trigger, which can submit to Chrome Web Store when publisher secrets exist. No stable release or store submission was started. The local upload set remains at `/private/tmp/mailchecker-oauth-review-0.0.48/`.

Provide these installation steps with the approved download URL:

1. Extract the unpacked archive to a local directory.
2. In Chrome, open `chrome://extensions`, enable Developer mode and choose Load unpacked.
3. Select the extracted directory and check version 0.0.51 and the extension ID above.
4. Use an English browser UI, then open mailchecker Settings and Gmail → Through Google. The installed extension follows `chrome.i18n`; Settings has no independent language selector.
5. Select an authorized review account and complete Google's consent. The account picker and Gmail grant use the two clients documented in [OAUTH.md](OAUTH.md#proposed-account-selection-correction).

Loading the archive does not provide Gmail access. Google still requires an eligible account, its normal sign-in and a separate consent grant. Do not share a Chrome profile, cookies, exported OAuth tokens or the maintainer's personal mailbox credentials.

## Account access routes

The audience is now **External / In production**, so the Testing allowlist is no longer the access route. Reviewers authorize their own eligible Google accounts through the real account picker and separate Gmail consent. Google still reports that verification is required and shows **2 users / 100 user cap**. An unverified-app warning or other account restrictions can apply; a successful external reviewer grant has not been observed.

After public OAuth verification, reviewers can authorize their own eligible Google accounts through the ordinary flow. Shared Google credentials are then unnecessary for that route. Chrome Web Store's private credential fields are an optional way to provide access when full functionality is otherwise restricted; they are not a general requirement for every extension. See [Google's app-state guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) and [Chrome Web Store test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions).

The access plan uses reviewer-owned accounts; the owner declined to share personal accounts. No shared credentials will be prepared. Keep personal accounts out of reviewer access and leave the dashboard's credential fields empty. Do not disable account protections to work around a Google sign-in challenge. If Google requests a specific access arrangement during verification, resolve that request with the review team rather than claiming that Production status is a verification result.

## Demonstration mail

The real verification recording is still outstanding; the owner has no dedicated demo mailboxes. Do not block reviewer access on handing over personal accounts. A multi-account demonstration can be recorded by the owner, or using separately arranged isolated accounts, while hiding personal messages and credentials. Account creation and password entry are owner actions. The following are proposed fixtures, not mail already created:

| Fixture                                                                       | Purpose                                                                                |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A conversation with two messages in the primary account                       | Open the thread and send a prearranged reply to the owner-controlled secondary account |
| An unread message and a starred message                                       | Demonstrate read-state, star and archive changes                                       |
| A disposable message                                                          | Demonstrate moving to Trash without permanent deletion                                 |
| A message outside the initially loaded Inbox with a distinctive search phrase | Demonstrate server-side history search                                                 |
| At least 21 matching staged messages in one account                           | Demonstrate Load more beyond the 20-message server-search page                         |
| Different subjects in the secondary account                                   | Demonstrate separate account identity and the combined inbox                           |

No messages have been sent or created as part of this preparation. Agree on recipients and message content before sending staged mail. Use only disposable staged messages for mailbox changes and disconnect checks.

Record the actual extension and Google consent screens in English using [the existing video script](OAUTH.md#english-demonstration-video-plan). Show both public client IDs, the app name and use of the restricted Gmail scope. Keep credentials and the selector's token-bearing callback URL out of the recording. The sandbox demonstrates layout and cannot replace the real Google OAuth flow in the verification video.

## Homepage route

Google requires an accessible homepage explaining the app and its data use, with a matching linked privacy policy on a verified site. Branding is now verified and published with `https://mailchecker.ustinoff.dev/` and `https://mailchecker.ustinoff.dev/privacy.html`. Both root DNS ownership and HTTPS are verified. See [Google's homepage requirements](https://support.google.com/cloud/answer/13807376?hl=en). The following 23 October notes record the earlier default-domain deployment.

The owner selected GitHub Pages at `https://ziqq.github.io/mailchecker/`. On 23 October the separate `gh-pages` branch was published; GitHub reports a successful HTTPS build, and Search Console confirmed ownership of that exact URL-prefix property through the homepage's HTML tag. Keep the tag after verification. The source and deployment mapping are in [site/](site/README.md).

Google Branding was updated to homepage `https://ziqq.github.io/mailchecker/`, privacy policy `https://ziqq.github.io/mailchecker/privacy.html` and authorized domains `ziqq.github.io` and `chromiumapp.org`. An initial save returned a generic Google error; the subsequent save reported success, and the values were read back after reloading. This is saved Testing configuration, not brand or restricted-scope approval. The Chrome callback and both client IDs remain unchanged.

The site supports English and Russian, a native language selector, browser-language detection and a local manual preference. Its screenshots follow both the page language and the browser's light/dark theme. The English policy's main body still matches `PRIVACY.md`; a separate website note explains the language preference. See [GitHub Pages site types](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [Search Console ownership verification](https://support.google.com/webmasters/answer/9008080?hl=en).

The selector spacing correction was published separately in `gh-pages` commit `9e4b4d7`. Both language labels were checked at 1280 px and 390 px without horizontal overflow; the public site loads the corrected padding. The owner then confirmed the **Push to production?** dialog on 23 October. **In production** was read back after reloading. The site notice was updated for pending verification rather than the former Testing allowlist.

The first automated **Verify branding** attempt reported that the homepage was not registered to the owner and explicitly requested waiting **24 hours after verifying ownership** before retrying. Search Console had already confirmed the exact URL-prefix property. No incorrect-issue appeal or immediate retry was submitted. The Verification Center keeps **Prepare for verification** disabled until branding is verified and published; the restricted Gmail review has not started.

The Chrome Web Store draft's Homepage URL and Privacy policy URL now also use the published English site and policy. Both values were read back after reloading the dashboard. The approved certifications, description and screenshots were not changed by this URL update.

## Submission order

1. Completed: publish the GitHub Pages site and confirm its URL-prefix ownership in Search Console.
2. Completed: save the homepage/privacy URLs and site domain in Branding; retain the registered Chrome callback and both client IDs. Brand verification remains separate.
3. Completed: publish the approved review download. Complete the real English video with staged mail and check its unlisted URL without an owner-only sign-in; personal mailbox credentials are not a reviewer deliverable.
4. Completed: switch OAuth to Production with owner confirmation. Wait for the ownership-propagation interval requested by Google, retry branding verification and publish approved branding, then prepare the restricted data-access submission. A publishing-status change is not an approval result.
5. Provide the requested application-type, scope justification, data-handling explanation and video using [OAUTH.md](OAUTH.md#public-verification). Submit both existing clients as one mailchecker application.
6. Arrange the chosen reviewer account route, update the private access fields and replace the temporary access limitation in [STORE_LISTING.md](STORE_LISTING.md) only after it is resolved.
7. Check Google's actual review outcome before treating Gmail OAuth as publicly verified. Chrome Web Store submission remains a separate final action.

Restricted Gmail data is handled locally and goes directly to Google in the current architecture. Explain that data flow accurately; it does not by itself establish exemption from Google's review or any assessment Google determines applicable. No billing, paid assessment or new Google project has been requested.
