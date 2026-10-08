# Safari

mailchecker is built to ship to Safari (macOS and iOS/iPadOS) from the same sources. Safari runs Manifest V3 web extensions, but only inside a native containing app built with Xcode and distributed through the App Store. This document records the API gaps that shape the architecture and the plan to close them.

Support data below is from [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) (`webextensions/`), checked on 2026-10-07. Re-check it and Apple's [browser compatibility guide](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility) before each Safari release.

## API support

| API / key                                | Safari (macOS)          | Safari iOS | Effect on mailchecker                                                        |
| ---------------------------------------- | ----------------------- | ---------- | ---------------------------------------------------------------------------- |
| `identity.launchWebAuthFlow`             | ❌                      | ❌         | No OAuth window: Gmail and Outlook sign-in must run in the containing app.   |
| `notifications`                          | ❌                      | ❌         | No system notifications from the extension: badge only, or the app notifies. |
| `storage.local` / `storage.session`      | 14 / 16.4               | 15 / 16.4  | Works. Minimum supported Safari is 16.4.                                     |
| `StorageArea.setAccessLevel`             | 17.1, session area only | same       | Called for `local` and ignored on failure (`platform.restrictStorage`).      |
| `action.setBadgeText`                    | 15.4                    | same       | Works.                                                                       |
| `action.setBadgeBackgroundColor`         | exists, no effect       | same       | System badge colour.                                                         |
| `action.setBadgeTextColor`               | ❌                      | ❌         | Skipped when missing.                                                        |
| `alarms`                                 | 14                      | 15         | Works; iOS may delay background work.                                        |
| `background.service_worker`              | 15.4                    | same       | Works; non-persistent like Chrome.                                           |
| `optional_host_permissions`              | 15.5                    | same       | Works; Safari also lets users grant sites per visit.                         |
| `windows.create`                         | 14                      | ❌         | Full-screen mode uses a tab (`platform.openApp`).                            |
| `runtime.sendNativeMessage`              | 14                      | 15         | Bridge to the containing app (OAuth, notifications, IMAP).                   |
| manifest `key`, `minimum_chrome_version` | ignored                 | ignored    | Removed by `npm run build:safari`; the extension ID is assigned by Safari.   |

## How the code handles it

- **`src/background/platform.ts`** is the only place that touches browser-specific APIs: storage access level, badge colours, notifications, identity detection and opening the full-tab client. Everything else calls it, so a Safari gap is one function, not scattered checks.
- **Feature detection, not user-agent sniffing.** `hasIdentity()` and `hasNotifications()` decide at run time; `__TARGET__` only names the package.
- **`npm run build:safari`** writes `build-safari/` with a Safari manifest: no `key`, `minimum_chrome_version`, `notifications` or `identity`, plus `browser_specific_settings.safari.strict_min_version: "16.4"`.
- **Without the containing app**, Safari supports JMAP accounts (API token, no OAuth) and shows the badge, list, reader and actions. Gmail/Outlook buttons explain that sign-in runs through the app.
- **Responsive client.** On iPhone the popup is a full-screen sheet: the client detects a coarse pointer on a phone-sized screen and switches to the one-column list ↔ reader layout (`data-narrow`). Hover-only row actions are hidden on touch screens; the reader toolbar provides them.

## Containing app (planned)

The Xcode project is generated from `build-safari/` and extended with Swift code reachable through `browser.runtime.sendNativeMessage`:

1. **OAuth** with `ASWebAuthenticationSession` for Google and Microsoft. The app returns tokens to the extension; refresh tokens live in the Keychain. This needs separate OAuth clients (iOS/macOS app type) with the app's redirect scheme.
2. **Notifications** through `UNUserNotificationCenter`, triggered by the extension's checks.
3. **IMAP** (optional) with Network.framework: Yandex, Mail.ru and any IMAP server, which Chromium extensions cannot reach. The extension would talk to it through the same provider contract.

## Build and publish

```sh
npm ci
npm run build:safari
xcrun safari-web-extension-converter build-safari --app-name "mailchecker" --bundle-identifier <reverse-dns-id>
```

Then open the generated Xcode project, set the team and signing, and run the macOS or iOS target. Safari → Settings → Extensions enables it; unsigned development builds need _Develop → Allow Unsigned Extensions_ on macOS. Publishing requires an Apple Developer Program membership and App Store review for the containing app.

The converter runs only on macOS with Xcode; CI keeps `build-safari/` valid (`npm run check` builds it and verifies the manifest) but does not produce the Xcode project.
