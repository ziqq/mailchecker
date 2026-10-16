# Chrome Web Store images

Prepared on 16 October 2026 from the **0.0.41** sandbox in Chromium. All interface text and fictional email data are in English. Screenshots use the bundled Inter fonts at scale 1.

| File                                   | Size     | Content                                                       |
| -------------------------------------- | -------- | ------------------------------------------------------------- |
| [inbox-dark.jpg](inbox-dark.jpg)       | 1280×800 | Unified inbox, notification stacks and blocked remote images  |
| [reader-light.jpg](reader-light.jpg)   | 1280×800 | Three-message conversation and attachments in the light theme |
| [folders-dark.jpg](folders-dark.jpg)   | 1280×800 | System and custom folders for a selected JMAP mailbox         |
| [promo-440x280.png](promo-440x280.png) | 440×280  | Existing icon, brand and mailbox colors                       |
| [icon128.png](icon128.png)             | 128×128  | Copy of `src/icons/icon128.png`                               |

Screenshots use `app.html?theme=dark&palette=neutral&lang=en` and `app.html?theme=light&palette=neutral&lang=en`. The folder screenshot switches to dark mode through the normal theme control. The regular sandbox fixtures now contain English senders, subjects, bodies, attachments and custom folders; the sandbox index opens the English interface through `lang=en`.

For the store captures, a separate temporary copy of those fixtures includes only browser-sign-in Gmail, JMAP, Yandex Mail and Mail.ru. It excludes the future iCloud adapter and unconfigured Microsoft OAuth, and shows Mail.ru with a healthy session. Gmail is marked as a browser connection with replies delegated to webmail. These changes are made before state creation in that isolated build; the repository keeps all six provider fixtures and its error scenarios. No DOM or image retouching is used.

The promo uses the existing project artwork and contains only the English brand name. Screenshots demonstrate the interface, not successful live sign-in or server requests. Compare them against the final release configuration before submission. See [CHROME_WEB_STORE.md](../CHROME_WEB_STORE.md) for listing text, disclosures and outstanding release work.
