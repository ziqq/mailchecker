<!--
https://github.com/ziqq/mailchecker
Copyright (C) 2026 Anton Ustinoff
https://github.com/ziqq/mailchecker/blob/main/LICENSE

Agent handoff: repeat the existing REG.RU, GitHub Pages and HTTPS setup for Codetree.
-->

# Agent handoff: Codetree on GitHub Pages with a custom subdomain

## Goal and scope

Publish Codetree's static homepage and privacy policy at `https://codetree.ustinoff.dev/`, following the working mailchecker setup. No VPS, paid hosting or separately purchased certificate is needed. The domain's registration and renewal remain the owner's responsibility.

Prepare and verify the site, DNS mapping and HTTPS. Keep existing mailchecker hosting and verification intact. Follow the owner's authorization for commits, pushes and external changes; this handoff does not authorize changes to extension code, repository visibility or OAuth grants.

| Setting                   | Target                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- |
| GitHub owner              | `ziqq`                                                                             |
| Project repository        | `ziqq/Codetree`; confirm its actual remote before editing                          |
| Root domain and registrar | `ustinoff.dev`, REG.RU                                                             |
| Proposed website          | `codetree.ustinoff.dev`                                                            |
| DNS target                | `ziqq.github.io.`                                                                  |
| Publishing source         | Reuse an existing site deployment; otherwise prepare a site-only `gh-pages` branch |

## 1. Inspect the existing setup

1. Read Codetree's `AGENTS.md`, inspect `git status`, the relevant diff and `git remote -v`. Preserve unrelated edits.
2. Locate its existing homepage, privacy policy, store links and Pages configuration. Reuse them rather than adding a second deployment system.
3. Confirm the website repository and its visibility. GitHub Free needs a public repository for Pages; Pro supports Pages from private repositories. If the owner wants private application code on Free, propose a separate public site repository and obtain approval before creating it. The published site still needs to be public. [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
4. Check the active DNS provider:

   ```sh
   dig +short NS ustinoff.dev
   ```

   On 29 October 2026 this returned `ns1.reg.ru.` and `ns2.reg.ru.`. Do not change the name servers: this domain already serves mailchecker. If the live result differs, inspect the active provider before proposing any delegation change.

Reference checked on that date: mailchecker uses `gh-pages:/`, the CNAME `mailchecker.ustinoff.dev → ziqq.github.io.`, an approved GitHub certificate and `https_enforced: true`. These are reference facts, not evidence that Codetree is configured.

## 2. Reuse domain ownership verification

Open [GitHub account Settings → Pages](https://github.com/settings/pages). Confirm that `ustinoff.dev` is verified for **ziqq**. This is an account setting, separate from a repository's Pages settings.

A verified root domain protects its immediate subdomains, including `codetree.ustinoff.dev`, for repositories owned by the same account. If it is already verified, keep its existing TXT record; do not generate a replacement. [GitHub domain verification](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages).

If verification is missing, use **Add a domain → ustinoff.dev** and obtain the actual TXT challenge from GitHub:

| Type  | REG.RU Subdomain               | Value                                            |
| ----- | ------------------------------ | ------------------------------------------------ |
| `TXT` | `_github-pages-challenge-ziqq` | Exact value displayed by GitHub; never invent it |

Check propagation with `dig +short TXT _github-pages-challenge-ziqq.ustinoff.dev`, then click **Verify**. Retain the TXT after verification. Preserve the existing Google `google-site-verification=…` TXT at `@` as well.

## 3. Prepare and bind the website in GitHub

1. Prepare only the public website assets, adapting Codetree's existing content and privacy policy. Use Codetree's actual behavior; do not copy mailchecker's Gmail claims or email screenshots.
2. For branch publishing, put `index.html`, the policy and their assets at the selected publishing root. Keep a root-level `CNAME` file containing exactly:

   ```text
   codetree.ustinoff.dev
   ```

3. Check relative asset paths, policy links and canonical URLs for the custom domain. They must not depend on a `/Codetree/` URL prefix. Preview desktop and phone layouts.
4. After authorized publication, select **Repository Settings → Pages → Build and deployment → Deploy from a branch**, then the intended branch and folder. With a new site-only `gh-pages` branch, select `gh-pages` and `/ (root)`. Reuse an existing Actions deployment when present. [Publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
5. In **Custom domain**, save `codetree.ustinoff.dev` **before** pointing DNS to GitHub. GitHub's save can create the `CNAME` commit for branch publishing; retain it in future deployments. Actions publishing uses the Pages setting instead and does not require that file. [Custom domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-a-subdomain).

## 4. Add one routing record in REG.RU

Open **Domains → ustinoff.dev → DNS servers and zone management → Add record → CNAME**. This applies while the active name servers remain `ns1.reg.ru` and `ns2.reg.ru`. [REG.RU instructions](https://help.reg.ru/support/dns-servery-i-nastroyka-zony/nastroyka-resursnykh-zapisey-dns/nastroyka-resursnykh-zapisey-v-lichnom-kabinete).

| Type    | Subdomain  | Canonical name    |
| ------- | ---------- | ----------------- |
| `CNAME` | `codetree` | `ziqq.github.io.` |

Keep the default TTL. The destination is a hostname: no `https://`, repository name or path. In the `ustinoff.dev` zone, the short host `codetree` means `codetree.ustinoff.dev`. This is DNS routing, not an HTTP redirect.

Do not add A/AAAA records for this same subdomain or route it through `mailchecker.ustinoff.dev`. If records already exist at **codetree**, inspect their purpose before replacing them. Preserve records for `@`, `www`, `mailchecker`, mail services and both verification TXT records. Do not add a wildcard.

The GitHub TXT and Google TXT verify ownership; neither routes website traffic. If their existing verification is valid, the CNAME above is the only new DNS record needed for this site.

## 5. Verify DNS, then enable HTTPS

Check the authoritative zone and a public resolver independently:

```sh
dig @ns1.reg.ru codetree.ustinoff.dev CNAME +noall +answer
dig @1.1.1.1 codetree.ustinoff.dev CNAME +noall +answer
```

Both should eventually show `codetree.ustinoff.dev. … CNAME ziqq.github.io.`. If only the authoritative answer is correct, wait for cached answers to expire instead of changing valid records repeatedly. GitHub documents propagation and HTTPS availability delays of up to 24 hours. [DNS propagation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

GitHub checks DNS and automatically requests a Let's Encrypt certificate. Once normal HTTPS works and the control is available, enable **Repository Settings → Pages → Enforce HTTPS**. This redirects HTTP requests to HTTPS. Never bypass a certificate warning or use `curl -k` to claim success. Check that images, fonts, scripts and styles do not load through HTTP. [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

If provisioning stalls, distinguish incorrect DNS, an unfinished deployment and a pending certificate. Inspect conflicting records at the target hostname and any existing restrictive CAA policy. Do not repeatedly remove/re-add the custom domain or change unrelated DNS records without evidence.

## 6. Acceptance and final report

Run these checks with ordinary TLS validation:

```sh
curl -I https://codetree.ustinoff.dev/
curl -I http://codetree.ustinoff.dev/
```

Expect a successful HTTPS homepage and an HTTP redirect whose `Location` uses HTTPS. Check the actual privacy-policy URL separately; do not assume its filename. Open the site in a browser at desktop and phone widths, follow the policy/support links and inspect asset loading. Recheck `https://mailchecker.ustinoff.dev/` after the DNS change.

Report the publishing repository/branch/commit, exact DNS delta, authoritative/public DNS answers, certificate state, HTTPS enforcement, homepage/policy results, tested viewport widths and anything still pending. Do not describe files prepared locally as a live deployment.

Once the site is verified, prepare the new Codetree homepage/privacy URLs for Chrome Web Store. Update external product metadata only within the owner's approved scope.

Google OAuth is a separate task. If Codetree actually needs a verified Google application domain, check access to the existing Search Console **Domain Property** `ustinoff.dev` under the relevant Google project owner. Do not add Gmail scopes, reuse mailchecker clients or alter GitHub/GitLab OAuth callbacks as part of DNS setup. A working HTTPS site alone is not OAuth approval. [Google domain verification](https://support.google.com/cloud/answer/13804266?hl=en).
