# Chrome Web Store images

Release update, **30 October 2026**: the saved gallery is part of the approved **0.0.51** store package, retained by the owner for the first release. It contains dark Inbox, light reader, dark folders and the small promo. The extension is ready to publish but remains unpublished pending Google OAuth. The dated 0.0.48 asset-preparation notes below describe the original capture checkpoint; no new screenshots were taken for the local 0.0.52 search-heading fix.

Prepared on 16 October 2026 from the sandbox in Chromium. All interface text and fictional email data are in English. Screenshots use the bundled Inter fonts at scale 1. These are the prepared English assets for the current **0.0.48** candidate, not new captures of that build or evidence of an upload to the store.

| File                                   | Size     | Content                                                       |
| -------------------------------------- | -------- | ------------------------------------------------------------- |
| [inbox-dark.jpg](inbox-dark.jpg)       | 1280×800 | Unified inbox, notification stacks and blocked remote images  |
| [reader-light.jpg](reader-light.jpg)   | 1280×800 | Three-message conversation and attachments in the light theme |
| [folders-dark.jpg](folders-dark.jpg)   | 1280×800 | System and custom folders for a selected JMAP mailbox         |
| [promo-440x280.png](promo-440x280.png) | 440×280  | Existing icon, brand and mailbox colors                       |
| [icon128.png](icon128.png)             | 128×128  | Copy of `src/icons/icon128.png`                               |

Screenshots use `app.html?theme=dark&palette=neutral&lang=en` and `app.html?theme=light&palette=neutral&lang=en`. The folder screenshot switches to dark mode through the normal theme control. The regular sandbox fixtures now contain English senders, subjects, bodies, attachments and custom folders; the sandbox index opens the English interface through `lang=en`.

For the store captures, a separate temporary copy of those fixtures includes only browser-sign-in Gmail, JMAP, Yandex Mail and Mail.ru. It excludes the future iCloud adapter and unconfigured Microsoft OAuth, and shows Mail.ru with a healthy session. Gmail is marked as a browser connection with replies delegated to webmail. These changes are made before state creation in that isolated build; the repository keeps all six provider fixtures and its error scenarios. No DOM or image retouching is used.

The promo uses the existing project artwork and contains only the English brand name. Screenshots demonstrate the interface, not successful live sign-in or server requests. Current Gmail API account selection and the refresh-button fix are not demonstrated by these captures. The maintainer separately confirmed two real Google API accounts working together and after an extension reload on 22 October.

The confirmed store draft package is **0.0.48**, verified in a newly opened Package tab on 23 October. The icon, three screenshots and small promo tile are saved and verified after reloading. The older first screenshot was removed with explicit owner confirmation. The final gallery order is dark Inbox, **light reader**, then dark folders. Compare all images with the final release configuration before submission. Copy-ready dashboard fields are in [STORE_LISTING.md](../STORE_LISTING.md). See [CHROME_WEB_STORE.md](../CHROME_WEB_STORE.md) for the 0.0.48 disclosures and outstanding release work.
