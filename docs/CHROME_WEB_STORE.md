# Подготовка первого релиза в Chrome Web Store

Сборка: **0.0.40**. Это подготовка материалов; загрузка в магазин, отправка на проверку и публикация ещё не выполнены. Проверка требований: 15 октября 2026 года.

## Готовые материалы

- Пакет: `dist/mailchecker-0.0.40.zip`, контрольная сумма: `dist/mailchecker-0.0.40.sha256`. Manifest находится в корне ZIP; исходники, sandbox, ключи и dev-зависимости в пакет не входят.
- Иконка: `src/icons/icon128.png`.
- Изображения карточки: `docs/store/`, реальные экраны sandbox на вымышленных данных. Скриншоты 1280×800, промо 440×280. Они показывают интерфейс, а не подтверждают работу живых почтовых интеграций.
- Описание EN/RU, разрешения, данные и инструкция проверяющему — ниже.
- Политика: [PRIVACY.md](../PRIVACY.md), включая IndexedDB, серверный поиск и Limited Use. Политику ещё нужно разместить по публичному URL.

Размеры и состав материалов сверены с [подготовкой расширения](https://developer.chrome.com/docs/webstore/prepare) и [требованиями к изображениям](https://developer.chrome.com/docs/webstore/images). Описание manifest должно укладываться в 132 символа; скриншоты — 1280×800 или 640×400, малое промо — 440×280.

## Что осталось до отправки

1. Опубликовать политику конфиденциальности и указать её доступный без входа URL. Репозиторий `ziqq/mailchecker` сейчас приватный, поэтому ссылка на его `PRIVACY.md` не подходит посетителям магазина. Подготовка релиза не меняет видимость репозитория.
2. Создать либо найти черновик mailchecker в кабинете Chrome Web Store, сверить фактический ID с unpacked ID `fbojnpjcjilajbfjfhipjkldidjmmolo` и использовать ID магазина в OAuth redirect URI. Наличие `key` в manifest не заменяет проверку назначенного магазином ID.
3. Определить готовность OAuth: в текущем `oauth/config.ts` Google и Microsoft Client ID пустые. Кнопки этих подключений отключены. Для публичного релиза с Gmail API и Microsoft Graph нужны зарегистрированные public client ID, настроенные redirect URI, применимая проверка Google и живые проверки входа/обновления токена. Секрет приложения в расширение не добавляется. Подробности — [OAUTH.md](OAUTH.md).
4. Проверить установленную сборку на реальных подключённых ящиках: поиск вне кеша, пустую выдачу, продолжение, повтор после ошибки, истёкший вход и правильный адрес. Новые адаптеры Яндекса и Mail.ru пока проверены синтетически и по веб-клиентам; работа их HTTP-поиска из установленного расширения ещё не подтверждена. Private webmail endpoints могут измениться.
5. Перенести материалы в карточку, заполнить Privacy practices, контакт поддержки и инструкции доступа. Убедиться в доступности аккаунта разработчика и двухэтапной проверки. [Поля конфиденциальности](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) должны соответствовать коду и опубликованной политике.
6. Для автоматической отправки настроить `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` в GitHub Actions. На момент проверки имена секретов в этом репозитории отсутствуют. Publisher ID в workflow требуется сверить с кабинетом владельца. Значения секретов не помещать в документы или исходники.
7. После приёмки выполнить релиз с неизменяемым тегом. Существующий workflow публикует GitHub Release и, при наличии CWS-секретов, отправляет пакет в магазин. Не запускать его только ради пробной сборки. Сначала готовится карточка; отправка на проверку — отдельный шаг после проверки материалов.

Google относит `gmail.modify` к restricted scopes и требует OAuth verification. Условие дополнительной security assessment зависит, в частности, от хранения/передачи restricted-данных через серверы; у mailchecker нет собственного сервера. Решение по применимым требованиям принимается в процессе проверки Google. Это отдельный процесс от Chrome Web Store review. [Официальные требования Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Карточка EN — черновик для текущей конфигурации

**Name:** mailchecker

**Short description:** Mail in your toolbar: unified inbox, safe reading, folders and notifications. No backend.

**Detailed description:**

mailchecker brings your mailboxes into the browser toolbar. Open a message in the popup, or switch to a full tab when you need more room.

- One inbox for connected accounts, with mailbox colours, unread counts and notifications.
- Conversations, folders, pinned mail and filters for notifications and newsletters.
- HTML mail in an isolated reader. Remote images stay blocked until you choose to show them.
- A local cache opens mail you have already loaded. It does not download your entire history.
- Server search with Load more and separate error/retry states for supported connections.
- Light and dark themes, a compact popup and 13 interface languages.

This build connects Gmail, Yandex Mail and Mail.ru through an existing browser sign-in, and JMAP mailboxes through an API token. Gmail search requires a separate Gmail API connection; browser-sign-in Gmail does not support integrated history search. Google and Microsoft API sign-in require configured OAuth client IDs and are disabled in this build. Available actions depend on the provider; unsupported replies open webmail.

mailchecker has no backend, advertising or analytics. Mail requests go directly to the connected provider. Loaded mail is stored locally in the browser profile; the cache can be cleared in Settings. The extension does not encrypt the browser profile.

## Карточка RU — черновик для текущей конфигурации

**Название:** mailchecker

**Короткое описание:** Почта в панели браузера: общие входящие, безопасное чтение, папки и уведомления. Без своего сервера.

**Подробное описание:**

mailchecker собирает подключённые ящики в панели браузера. Письмо можно прочитать во всплывающем окне или открыть клиент в отдельной вкладке.

- Общие входящие, цвета ящиков, счётчики и уведомления.
- Переписки, папки, закреплённые письма и фильтры уведомлений и рассылок.
- Изолированный просмотр HTML. Внешние картинки загружаются только по вашему действию.
- Локальный кеш уже загруженных писем. Вся история заранее не скачивается.
- Серверный поиск с загрузкой следующих страниц и повтором ошибок отдельных ящиков.
- Светлая и тёмная темы, компактное окно и 13 языков интерфейса.

В этой сборке Gmail, Яндекс Почта и Mail.ru подключаются через существующий вход в браузере, JMAP — по API-токену. Для поиска Gmail требуется отдельное подключение Gmail API: браузерное подключение не поддерживает встроенный поиск истории. Вход через Google API и Microsoft API требует настроенных OAuth Client ID и в этой сборке отключён. Набор действий зависит от провайдера; неподдерживаемый ответ открывается в веб-почте.

У mailchecker нет своего сервера, рекламы и аналитики. Запросы идут напрямую в подключённую почту. Загруженные письма хранятся в профиле браузера, кеш очищается в настройках. Расширение не шифрует профиль браузера.

Перед отправкой карточку нужно сверить с финальным ZIP: если OAuth будет настроен, обновить описание после живой проверки. Не обещать поиск браузерного Gmail, поддержку IMAP/iCloud, все действия для любого провайдера или готовый Safari-релиз.

## Privacy practices — подготовленные ответы

**Single purpose (EN):** Read and manage the user's connected email accounts from the browser toolbar and full-tab mail client.

**Remote code:** No. Scripts, SolidJS, fonts and styles are bundled. Provider JSON/HTML is data; email HTML is sanitized and displayed in a script-free sandbox.

| Разрешение                           | Обоснование для формы EN                                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                            | Store local preferences, connected accounts and the latest mailbox state. Credentials stay in the extension worker.                                                                                                                              |
| `alarms`                             | Schedule periodic checks for new mail at the interval chosen in Settings.                                                                                                                                                                        |
| `notifications`                      | Display new-mail notifications and open the selected message when clicked.                                                                                                                                                                       |
| `identity` (optional)                | Open the provider OAuth sign-in flow when the user connects a configured Google or Microsoft API account.                                                                                                                                        |
| `cookies` (optional)                 | Read only Gmail's GMAIL_AT action cookie on mail.google.com after the user connects browser-sign-in Gmail, to perform requested mail actions.                                                                                                    |
| Gmail/Graph/Microsoft/Fastmail hosts | Send authenticated requests directly to the connected mail provider and refresh Microsoft tokens.                                                                                                                                                |
| `https://*/*` (optional)             | Let the user connect a JMAP server on their own HTTPS domain. The extension requests the specific origin in Settings; it does not request every origin at installation. The same optional declaration covers explicitly connected webmail hosts. |

Декларация данных должна учитывать локальную обработку и кеш, а не только отправку на сервер разработчика. Подготовленные категории: **Personally identifiable information** (адреса, имена корреспондентов), **Authentication information** (OAuth/API-токены и разрешённый Gmail action cookie), **Personal communications** (метаданные, текст писем, названия вложений). Почтовые ссылки используются для открытия писем; расширение не собирает историю посещений, геолокацию, здоровье, финансовые данные для отдельной обработки или действия пользователя вне почтового клиента. Если форма определяет категорию шире, сверить её формулировку с текущим кодом и политикой перед подтверждением.

Подтверждения об отсутствии продажи данных, рекламы и использования вне единой цели соответствуют текущей реализации. Не отмечать декларации автоматически без проверки финального пакета и формы.

## Инструкция проверяющему — EN

1. Install the submitted ZIP as an unpacked extension in a separate test profile, or install the review build. Click the toolbar icon and open Settings.
2. To test JMAP, enter a test mailbox's HTTPS session URL and API token and grant only that origin. Use a dedicated test mailbox, not personal credentials in the review notes.
3. To test browser sign-in, sign in to a dedicated Gmail, Yandex Mail or Mail.ru test account in the same browser profile. Add that exact address in Settings and grant its webmail origin.
4. Open the inbox and a message; inspect the blocked-image control, folders and unread counts. Search for an existing message outside the loaded inbox and click Load more where more results exist. Browser-sign-in Gmail is excluded from integrated search; Gmail API requires a configured OAuth connection.
5. Clear the mail cache in Settings and remove the test mailbox. Account removal clears its local credentials and cached mail, but does not revoke a provider grant.
6. Google and Microsoft API connection buttons are disabled in this package because their public client IDs are not configured. The sandbox is a developer preview and is not part of the submitted package.

Если проверяющему нужны доступы, предоставить отдельные тестовые аккаунты через закрытые поля кабинета. Секреты и реальные письма не добавлять в Git.
