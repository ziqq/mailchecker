# Public GitHub Pages site

Release update, **30 October 2026**: the real demonstration video and Google OAuth request were submitted on 29 October. Data access remains under review; branding and homepage checks are complete. Chrome Web Store approved 0.0.51, retained by the owner for the first release and not yet published. The website/DNS deployment below is unchanged. References to an outstanding video or submission in the dated 28 October notes describe that earlier checkpoint.

Custom-domain status, **28 October 2026**: `https://mailchecker.ustinoff.dev/` is live. Site-only commit `59c37a65bf5c6c361cb6a49732673048a31a7f3e` is published in `gh-pages`; GitHub Pages reports `built`, a certificate approved until 26 January 2027 and **Enforce HTTPS** enabled. All four EN/RU homepage/privacy pages return HTTPS 200 with the expected language and canonical URL; HTTP redirects to HTTPS with 301. Google Search Console confirmed root **Domain Property** ownership through DNS, GitHub verified ownership protection, and Google passed and published branding on the custom domain. Restricted Gmail scope verification is still pending the real demonstration video; branding approval does not approve `gmail.modify`.

The configured address is `https://mailchecker.ustinoff.dev/`, published from the separate `gh-pages` branch. The previous address was `https://ziqq.github.io/mailchecker/`; custom-domain configuration redirects that address. The old URL-prefix verification on 23 October was insufficient for OAuth; the new root Domain Property supplies DNS-level ownership. Earlier site commits include `01f5aa8` (initial pages), `c37cf09` (locale selection and localized previews) and `fdc1d92` (consistent 1280×800 Russian preview).

## DNS activation in REG.RU

The owner completed the following setup in the domain's **DNS servers and zone management**: replace Beget delegation with the free `ns1.reg.ru` and `ns2.reg.ru` name servers, then add the records below. The owner stated that no server or hosting is in use. No other existing root or `www` records were changed by the agent. Do not change the correctly saved records again just because a recursive resolver still has the earlier delegation cached.

The following records are saved in the `ustinoff.dev` zone. Host names are relative to this zone; `@` means the root. TXT values do not include extra quotation marks in the editor.

| Type    | Host                           | Value                                                                  | Purpose                                                                                       |
| ------- | ------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `CNAME` | `mailchecker`                  | `ziqq.github.io.`                                                      | GitHub Pages routing; exclude the repository path.                                            |
| `TXT`   | `@`                            | `google-site-verification=asao9ZU_52X7_tZxWsmIuVkYltVVqOvvg0j78TCxKws` | Search Console Domain Property for `ustinoff.dev`, requested under the OAuth owner's account. |
| `TXT`   | `_github-pages-challenge-ziqq` | `f81f17f501f9afa737a52343789464`                                       | GitHub Pages ownership protection for `ziqq` and immediate subdomains.                        |

Both verification challenges were read from the corresponding provider UI on 28 October 2026; these are public DNS values, not OAuth credentials. Preserve both TXT records after verification. A separate A/AAAA record, wildcard record, paid host or purchased SSL certificate is unnecessary for this subdomain.

Both ownership checks are complete: the Search Console resource `sc-domain:ustinoff.dev` is verified under the OAuth owner's Google account, and [GitHub account Pages settings](https://github.com/settings/pages) lists `ustinoff.dev` as **Verified**. Preserve the TXT records. **Enforce HTTPS** is enabled and all four public pages pass normal TLS validation. Google branding is verified and published with the new homepage, `/privacy.html` and authorized root `ustinoff.dev`; the existing clients, callback and Gmail scopes are unchanged. The remaining restricted-scope review requires a real English demonstration video and has not been submitted.

References: [GitHub custom subdomains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-a-subdomain), [GitHub domain verification](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages), [Google DNS domain verification](https://support.google.com/cloud/answer/13804266?hl=en), [REG.RU DNS configuration](https://help.reg.ru/support/dns-servery-i-nastroyka-zony/nastroyka-resursnykh-zapisey-dns/nastroyka-resursnykh-zapisey-dns-dlya-domena).

## Site contents

This directory contains English and Russian homepages and privacy policies. A small local script selects the first supported browser language and binds the native language selector. An explicit `?lang=en` or `?lang=ru` takes priority, followed by the manual preference `mailchecker.site.language` in this site's local storage. Direct Russian URLs keep their language when there is no saved choice. Manual changes preserve the current page and work through an explicit URL even if storage is unavailable. No account sign-in, analytics or remote fonts are used; the site cannot access mailboxes.

Each homepage uses `picture` with `prefers-color-scheme`: dark Inbox in dark mode, light reader in light mode, in the page's language. English captures reuse the existing store assets. Russian captures use a separate temporary sandbox copy of the same client, with translated fictional messages and only the four available provider fixtures. The repository's English fixtures and store images are unchanged. No DOM or image retouching is used.

Publish these exact files to the root of a dedicated `gh-pages` branch:

| Source                                 | Published path               |
| -------------------------------------- | ---------------------------- |
| `docs/site/CNAME`                      | `CNAME`                      |
| `docs/site/index.html`                 | `index.html`                 |
| `docs/site/privacy.html`               | `privacy.html`               |
| `docs/site/styles.css`                 | `styles.css`                 |
| `docs/site/site.js`                    | `site.js`                    |
| `docs/site/images/inbox-dark-ru.jpg`   | `store/inbox-dark-ru.jpg`    |
| `docs/site/images/reader-light-ru.jpg` | `store/reader-light-ru.jpg`  |
| `docs/site/ru/index.html`              | `ru/index.html`              |
| `docs/site/ru/privacy.html`            | `ru/privacy.html`            |
| `docs/store/inbox-dark.jpg`            | `store/inbox-dark.jpg`       |
| `docs/store/reader-light.jpg`          | `store/reader-light.jpg`     |
| `src/fonts/inter-latin.woff2`          | `fonts/inter-latin.woff2`    |
| `src/fonts/inter-cyrillic.woff2`       | `fonts/inter-cyrillic.woff2` |
| `src/fonts/OFL.txt`                    | `fonts/OFL.txt`              |

Select that branch's root in GitHub Pages. Do not publish the runtime, local review archive, private keys or browser data as part of the site. GitHub Pages publication does not require pushing the unpublished local runtime commits to `main`.

The homepage contains the public Search Console HTML verification tag supplied on 23 October 2026 for the exact URL-prefix property. Keep it after verification. Its presence alone is not proof of ownership or Google OAuth approval.

The main body of `privacy.html` mirrors [PRIVACY.md](../../PRIVACY.md), dated 22 October 2026; `ru/privacy.html` translates that policy. A separate note discloses the website's manual language preference. Keep both policy bodies and links in sync with the source. On 23 October Google OAuth entered Production; the notice now describes the pending verification, unverified-app warning and possible access limits. The store release remains unpublished. Change these statements only after verifying the corresponding provider/store state. Inter is copied from the existing bundled Latin/Cyrillic fonts with its SIL OFL license.

For local preview, copy the files using the mapping above into a temporary directory and serve that directory with `python3 -m http.server --bind 127.0.0.1 8086`. Check both pages and their links at wide and phone widths before publishing. GitHub supplies the custom domain's HTTPS certificate after DNS is configured. The site requires no paid hosting, build service or new dependency.

See [reviewer access](../REVIEWER_ACCESS.md) for the remaining Google branding, ownership and demonstration steps.
