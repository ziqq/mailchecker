/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * The client on sandbox fixtures: every layout renders without errors or
 * horizontal scroll, and reading, actions, search and sign-in work.
 */
import {expect, test} from '@playwright/test';

/** Layouts: page, viewport and touch emulation (the iOS popup is detected by screen size and a coarse pointer). */
const LAYOUTS = [
  {name: 'popup 780×600', path: 'popup.html', viewport: {width: 780, height: 600}},
  {name: 'wide tab', path: 'app.html', viewport: {width: 1440, height: 900}},
  {name: 'phone popup', path: 'popup.html', viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true},
  {name: 'phone tab', path: 'app.html', viewport: {width: 390, height: 844}},
];

/** Chromium's report that the script-free mail frame refused a script (Playwright probes every frame). */
const SANDBOXED_FRAME = /^Blocked script execution in 'about:(blank|srcdoc)' because the document's frame is sandboxed/;

/** Collects page errors and console errors. */
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !SANDBOXED_FRAME.test(message.text())) errors.push(message.text());
  });
  return errors;
}

/** Fails when the page scrolls horizontally. */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const layout of LAYOUTS) {
  test.describe(layout.name, () => {
    test.use({viewport: layout.viewport, isMobile: layout.isMobile, hasTouch: layout.hasTouch});

    test('renders the inbox and opens a conversation', async ({page}) => {
      const errors = watchErrors(page);
      await page.goto(layout.path);
      await expect(page.locator('.row').first()).toBeVisible();
      await expectNoHorizontalScroll(page);

      await page.locator('.row[data-id="g1"]').click();
      const reader = page.getByRole('region', {name: 'Письмо'});
      await expect(reader.getByText('Re: Поездка в Казань — билеты и гостиница').first()).toBeVisible();
      await expect(reader.locator('iframe.mail-frame').last()).toBeVisible();
      await expectNoHorizontalScroll(page);

      const back = page.getByRole('button', {name: 'К списку'});
      if (await back.isVisible()) {
        await back.click();
        await expect(page.locator('.row[data-id="g1"]')).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  });
}

test.describe('wide tab', () => {
  test.use({viewport: {width: 1440, height: 900}});

  test('lists every provider', async ({page}) => {
    await page.goto('app.html');
    const boxes = page.getByRole('navigation', {name: 'Ящики'});
    for (const email of [
      'anton@gmail.com',
      'anton@fastmail.com',
      'anton@yandex.ru',
      'anton@mail.ru',
      'anton@icloud.com',
    ])
      await expect(boxes.getByText(email)).toBeVisible();
  });

  test('archives with the keyboard', async ({page}) => {
    await page.goto('app.html');
    await page.locator('.row[data-id="g1"]').click();
    await expect(page.locator('.row[aria-selected="true"]')).toHaveAttribute('data-id', 'g1');
    await page.keyboard.press('e');
    await expect(page.locator('.row[data-id="g1"]')).toHaveCount(0);
    await expect(page.locator('.row[aria-selected="true"]')).toHaveCount(1);
  });

  test('searches archived mail across accounts', async ({page}) => {
    await page.goto('app.html');
    await page.keyboard.press('/');
    await page.keyboard.type('Казань');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Результаты поиска')).toBeVisible();
    await expect(page.locator('.row')).toHaveCount(2);
  });

  test('blocks remote images until allowed', async ({page}) => {
    await page.goto('app.html');
    await page.locator('.row[data-id="g5"]').click();
    await expect(page.getByText(/Заблокировано: 1 картинка и 1 трекер/)).toBeVisible();
  });

  test('signs in again after an expired session', async ({page}) => {
    await page.goto('app.html');
    const notice = page.getByRole('alert').filter({hasText: 'Сеанс истёк'});
    await expect(notice).toBeVisible();
    await notice.getByRole('button', {name: 'Войти'}).click();
    await expect(notice).toHaveCount(0);
  });

  test('takes the theme and palette from the query', async ({page}) => {
    await page.goto('app.html?theme=dark&palette=neutral');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'neutral');
  });

  test('takes the accent colour from the query', async ({page}) => {
    await page.goto('app.html?palette=pink');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'accent');
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'pink');
    const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary'));
    expect(primary).toBe('#eb6ca4');
  });
});

for (const layout of LAYOUTS) {
  test.describe(layout.name, () => {
    test.use({viewport: layout.viewport, isMobile: layout.isMobile, hasTouch: layout.hasTouch});

    test('fits every category and the mailbox switcher label', async ({page}) => {
      await page.goto(layout.path);
      await expect(page.locator('.row').first()).toBeVisible();

      const segments = page.getByRole('tablist', {name: 'Категории'});
      const box = await segments.boundingBox();
      const last = await segments.getByRole('tab').last().boundingBox();
      expect(last.x + last.width).toBeLessThanOrEqual(box.x + box.width);

      const label = page.locator('.switcher-label');
      if (await label.isVisible()) {
        await expect(label).toHaveText('Все ящики');
        const clipped = await label.evaluate(element => element.scrollWidth - element.clientWidth);
        expect(clipped).toBeLessThanOrEqual(0);
      }
    });
  });
}

test.describe('mini popup', () => {
  test.use({viewport: {width: 400, height: 600}});

  test('renders one column and opens a conversation', async ({page}) => {
    const errors = watchErrors(page);
    await page.goto('popup.html?popup=mini');
    await expect(page.locator('html')).toHaveAttribute('data-size', 'mini');
    await expect(page.locator('.row').first()).toBeVisible();
    expect(await page.evaluate(() => document.body.getBoundingClientRect().width)).toBe(400);
    await expectNoHorizontalScroll(page);

    await page.locator('.row[data-id="g1"]').click();
    await expect(page.locator('.row[data-id="g1"]')).toBeHidden();
    await page.getByRole('button', {name: 'К списку'}).click();
    await expect(page.locator('.row[data-id="g1"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

/** Opens a fixture row from the list, going back first in one-column layouts. */
async function openRow(page, id) {
  const back = page.getByRole('button', {name: 'К списку'});
  if (await back.isVisible()) await back.click();
  await page.locator(`.row[data-id="${id}"]`).click();
  await expect(page.locator('iframe.mail-frame').last()).toBeVisible();
}

/** Measures content dimensions after several frames, including shrinkage and resize-delivery cycles. */
async function frameSamples(page) {
  return page
    .locator('iframe.mail-frame')
    .last()
    .evaluate(async frame => {
      const heights = [];
      for (let i = 0; i < 12; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        heights.push(frame.getBoundingClientRect().height);
      }
      const doc = frame.contentDocument;
      return {
        heights,
        overflow: doc.documentElement.scrollWidth - doc.documentElement.clientWidth,
        contentHeight: Math.ceil(Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height)),
      };
    });
}

/** Captures native resize ErrorEvents in both page and mail-frame windows, including events DevTools may omit. */
async function watchFrameErrors(page) {
  await page.addInitScript(() => {
    const errors = [];
    const record = event => {
      errors.push(event.message);
      document.documentElement.dataset.frameErrors = JSON.stringify(errors);
    };
    window.addEventListener('error', record);
    document.addEventListener(
      'load',
      event => {
        const frame = event.target;
        if (frame instanceof HTMLIFrameElement && frame.classList.contains('mail-frame'))
          frame.contentWindow.addEventListener('error', record);
      },
      true,
    );
  });
}

for (const layout of [
  ...LAYOUTS,
  {name: 'mini popup', path: 'popup.html?popup=mini', viewport: {width: 400, height: 600}},
]) {
  test.describe(`${layout.name} audit regressions`, () => {
    test.use({viewport: layout.viewport, isMobile: layout.isMobile, hasTouch: layout.hasTouch});

    test('empty searches show a message instead of a blank list', async ({page}) => {
      await page.goto(layout.path);
      await page.locator('#search').fill('no-such-message-20261013');
      await page.locator('#search').press('Enter');
      await expect(page.getByRole('heading', {name: 'Ничего не нашлось.'})).toBeVisible();
      await expect(page.getByText('Попробуйте другой запрос.')).toBeVisible();
      await expectNoHorizontalScroll(page);
    });

    test('HTML newsletters fit inside the frame with remote images blocked', async ({page}) => {
      await page.goto(layout.path);
      await openRow(page, 'g5');
      const measurements = await frameSamples(page);
      expect(measurements.overflow).toBeLessThanOrEqual(0);
      expect(measurements.heights.at(-1)).toBe(measurements.contentHeight);
      await expectNoHorizontalScroll(page);
    });

    test('switching long text and HTML mail keeps frame height stable without resize errors', async ({page}) => {
      const errors = watchErrors(page);
      await watchFrameErrors(page);
      await page.goto(layout.path);
      await openRow(page, 'f1');
      const long = await frameSamples(page);
      await openRow(page, 'g5');
      const short = await frameSamples(page);
      expect(short.heights.at(-1)).toBeLessThan(long.heights.at(-1));
      expect(new Set(short.heights.slice(-6)).size).toBe(1);
      await openRow(page, 'f1');
      await frameSamples(page);
      await openRow(page, 'g5');
      await frameSamples(page);
      expect(errors).toEqual([]);
      expect(await page.locator('html').getAttribute('data-frame-errors')).toBeNull();
    });

    test('percentage-height email body settles without frame growth or resize errors', async ({page}) => {
      await watchFrameErrors(page);
      await page.goto(`${layout.path}${layout.path.includes('?') ? '&' : '?'}mail=percentage`);
      await openRow(page, 'g5');
      const first = await frameSamples(page);
      const second = await frameSamples(page);
      expect(new Set(second.heights.slice(-6)).size).toBe(1);
      expect(second.heights.at(-1)).toBe(first.heights.at(-1));
      expect(second.heights.at(-1)).toBe(second.contentHeight);
      expect(await page.locator('html').getAttribute('data-frame-errors')).toBeNull();
    });

    test('read mail remains in the list after CHECK with reader actions available', async ({page}) => {
      await page.goto(layout.path);
      await openRow(page, 'g1');
      const reader = page.getByRole('region', {name: 'Письмо'});
      await expect(reader.getByRole('button', {name: 'Удалить', exact: true})).toBeVisible();
      await page.getByRole('button', {name: 'Проверить сейчас', exact: true}).click();
      await expect(reader.getByRole('button', {name: 'В архив', exact: true})).toBeVisible();
      const back = page.getByRole('button', {name: 'К списку'});
      if (await back.isVisible()) await back.click();
      const row = page.locator('.row[data-id="g1"]');
      await expect(row).toBeVisible();
      await expect(row).toHaveClass(/\bread\b/);
      await expect(row.locator('.unread-dot')).toHaveCount(0);
    });

    test('timestamp-only checks preserve mounted rows and the open mail document', async ({page}) => {
      await page.goto(`${layout.path}${layout.path.includes('?') ? '&' : '?'}refresh=timestamp&theme=dark`);
      await openRow(page, 'g5');
      await frameSamples(page);
      await page.evaluate(() => {
        window.refreshBefore = {
          row: document.querySelector('.row[data-id="g5"]'),
          document: document.querySelector('.mail-frame').contentDocument,
        };
      });
      const refresh = page.getByRole('button', {name: 'Проверить сейчас', exact: true});
      await refresh.click();
      await expect(refresh).toBeEnabled();
      const same = await page.evaluate(() => ({
        row: window.refreshBefore.row === document.querySelector('.row[data-id="g5"]'),
        document: window.refreshBefore.document === document.querySelector('.mail-frame').contentDocument,
      }));
      expect(same).toEqual({row: true, document: true});
      await expect(page.locator('.reader .skeleton')).toHaveCount(0);
    });

    test('ringed avatar and unread dot are centred in the row and gutter', async ({page}) => {
      await page.goto(layout.path);
      const row = page.locator('.row[data-id="w1"]');
      await expect(row).toBeVisible();
      // The opening CHECK replaces rows; measure after it finishes, rather than a detached avatar.
      await expect(page.getByRole('button', {name: 'Проверить сейчас', exact: true}).first()).toBeEnabled();
      const values = await row.evaluate(element => {
        const avatar = element.querySelector('.avatar'),
          dot = element.querySelector('.unread-dot');
        const r = element.getBoundingClientRect(),
          a = avatar.getBoundingClientRect(),
          d = dot.getBoundingClientRect();
        const style = getComputedStyle(avatar);
        const ringLeft = a.left - parseFloat(style.outlineWidth) - parseFloat(style.outlineOffset);
        return {
          gutter: (r.left + ringLeft) / 2,
          dotX: d.left + d.width / 2,
          rowY: r.top + r.height / 2,
          avatarY: a.top + a.height / 2,
          dotY: d.top + d.height / 2,
        };
      });
      expect(Math.abs(values.dotX - values.gutter)).toBeLessThan(0.02);
      expect(Math.abs(values.avatarY - values.rowY)).toBeLessThan(0.02);
      expect(Math.abs(values.dotY - values.rowY)).toBeLessThan(0.02);
    });
  });
}

test.describe('wide audit regressions', () => {
  test.use({viewport: {width: 1440, height: 900}});

  test('sidebar logo and navigation align with the list heading and search controls', async ({page}) => {
    await page.goto('app.html');
    await expect(page.locator('.row').first()).toBeVisible();
    const measurements = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const logo = box('.sidebar .logo'),
        title = box('.list-title h1');
      return {
        logoSize: getComputedStyle(document.querySelector('.sidebar .logo')).fontSize,
        titleSize: getComputedStyle(document.querySelector('.list-title h1')).fontSize,
        titleOffset: Math.abs(logo.y + logo.height / 2 - title.y - title.height / 2),
        searchOffset: Math.abs(box('.search').y - box('.sidebar > .nav a:first-child').y),
        categoryOffset: Math.abs(box('.segmented').y - box('.sidebar > .nav a:nth-child(2)').y),
      };
    });
    expect(measurements.logoSize).toBe(measurements.titleSize);
    for (const key of ['titleOffset', 'searchOffset', 'categoryOffset']) expect(measurements[key]).toBeLessThan(0.02);
  });

  test('changing the theme still updates an open mail document', async ({page}) => {
    await page.goto('app.html?theme=dark');
    await openRow(page, 'g5');
    await frameSamples(page);
    await page.evaluate(() => {
      window.themeBefore = document.querySelector('.mail-frame').contentDocument;
    });
    await page.getByRole('button', {name: 'Сменить тему', exact: true}).click();
    await expect
      .poll(() => page.evaluate(() => window.themeBefore === document.querySelector('.mail-frame').contentDocument))
      .toBe(false);
  });

  test('empty category keeps the selected reader actions', async ({page}) => {
    await page.goto('app.html');
    await page.getByRole('link', {name: 'anton@fastmail.com 1'}).click();
    await openRow(page, 'f1');
    await page.getByRole('tab', {name: 'Рассылки'}).click();
    await expect(page.getByRole('heading', {name: 'Всё разобрано.'})).toBeVisible();
    await expect(
      page.getByRole('region', {name: 'Письмо'}).getByRole('button', {name: 'Удалить', exact: true}),
    ).toBeVisible();
  });

  test('resizing the columns keeps the header fixed and mail within the reader', async ({page}) => {
    await page.goto('popup.html');
    await openRow(page, 'g5');
    const logo = page.locator('.logo').first();
    const before = await logo.boundingBox();
    const divider = page.getByRole('separator');
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await logo.boundingBox()).toEqual(before);
    expect((await frameSamples(page)).overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('settings regressions', () => {
  test.use({viewport: {width: 1440, height: 900}});
  test.beforeEach(async ({page}) => {
    await installOptionsAPI(page);
  });

  test('version footer has a compact bottom inset', async ({page}) => {
    await page.goto('options.html');
    await expect(page.locator('#accounts .account').first()).toBeVisible();
    const gap = await page
      .locator('#version')
      .evaluate(
        element => document.documentElement.scrollHeight - (element.getBoundingClientRect().bottom + window.scrollY),
      );
    expect(gap).toBeLessThanOrEqual(32);
    expect(gap).toBeGreaterThanOrEqual(16);
  });

  test('Yandex sign-in in Settings opens webmail and does not falsely report signed-in', async ({page}) => {
    await captureWebmail(page);
    await page.goto('options.html?reauth=yandex');
    const account = page.locator('#accounts .account').filter({hasText: 'anton@yandex.ru'});
    await account.getByRole('button', {name: 'Войти заново'}).click();
    await expect(page.locator('html')).toHaveAttribute('data-opened-webmail', 'https://mail.yandex.ru/');
    await expect(page.locator('#status')).toHaveText('Войдите в «Яндекс Почта» в этом браузере и повторите.');
    await expect(account.getByRole('button', {name: 'Войти заново'})).toBeVisible();
  });
});

/** Provides the browser APIs used by Settings while requests use the sandbox worker. */
async function installOptionsAPI(page) {
  await page.addInitScript(() => {
    window.chrome = {
      runtime: {getManifest: () => ({version: 'test'})},
      storage: {onChanged: {addListener() {}}},
    };
  });
}

/** Records webmail navigation while keeping tests offline and on synthetic mailboxes. */
async function captureWebmail(page) {
  await page.addInitScript(() => {
    window.open = url => {
      document.documentElement.dataset.openedWebmail = url;
      return null;
    };
  });
}

test('Yandex sign-in in the popup opens webmail without repeating the error', async ({page}) => {
  await captureWebmail(page);
  await page.goto('popup.html?reauth=yandex');
  const notice = page.getByRole('alert').filter({hasText: 'anton@yandex.ru'});
  await notice.getByRole('button', {name: 'Войти'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-opened-webmail', 'https://mail.yandex.ru/');
  await expect(page.locator('.toast.error')).toHaveCount(0);
});

test.describe('browser sign-in recovery', () => {
  test.use({viewport: {width: 1440, height: 900}});

  test('Settings sign-in clears a stale error for an already authenticated browser session', async ({page}) => {
    await installOptionsAPI(page);
    await captureWebmail(page);
    await page.goto('options.html?reauth=yandex&session=valid');
    const account = page.locator('#accounts .account').filter({hasText: 'anton@yandex.ru'});
    await account.getByRole('button', {name: 'Войти заново'}).click();
    await expect(account.getByRole('button', {name: 'Войти заново'})).toHaveCount(0);
    await expect(account.locator('.error')).toHaveCount(0);
    await expect(page.locator('#status')).toHaveText('Вход выполнен: anton@yandex.ru');
    await expect(page.locator('html')).not.toHaveAttribute('data-opened-webmail');
  });

  for (const path of ['options.html', 'app.html']) {
    test(path + ' removes the error after returning from a completed webmail sign-in', async ({page}) => {
      await installOptionsAPI(page);
      await captureWebmail(page);
      await page.goto(path + '?reauth=yandex&session=after-return');
      const settings = path === 'options.html';
      const area = settings
        ? page.locator('#accounts .account').filter({hasText: 'anton@yandex.ru'})
        : page.getByRole('alert').filter({hasText: 'anton@yandex.ru'});
      await area.getByRole('button', {name: settings ? 'Войти заново' : 'Войти', exact: true}).click();
      await expect(page.locator('html')).toHaveAttribute('data-opened-webmail', 'https://mail.yandex.ru/');
      if (settings)
        await expect(page.locator('#status')).toHaveText('Войдите в «Яндекс Почта» в этом браузере и повторите.');
      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      if (settings) {
        await expect(area.getByRole('button', {name: 'Войти заново'})).toHaveCount(0);
        await expect(area.locator('.error')).toHaveCount(0);
        await expect(page.locator('#status')).toHaveText('Вход выполнен: anton@yandex.ru');
      } else await expect(area).toHaveCount(0);
    });
  }
});

for (const layout of [
  ...LAYOUTS,
  {name: 'mini popup', path: 'popup.html?popup=mini', viewport: {width: 400, height: 600}},
]) {
  test.describe(`${layout.name} folder audit regressions`, () => {
    test.use({viewport: layout.viewport, isMobile: layout.isMobile, hasTouch: layout.hasTouch});

    test('CSS-only images expose Show and stay blocked until permission is given', async ({page}) => {
      const separator = layout.path.includes('?') ? '&' : '?';
      await page.goto(`${layout.path}${separator}mail=css-images&theme=dark`);
      const loadedImages = [];
      const refusedImages = [];
      page.on('response', response => {
        if (/icon128\.png\?/.test(response.url())) loadedImages.push(response.url());
      });
      page.on('requestfailed', request => {
        if (/icon128\.png\?/.test(request.url())) refusedImages.push(request.failure()?.errorText || '');
      });
      await openRow(page, 'g5');
      await expect(page.getByText('Заблокировано: 4 картинки', {exact: true})).toBeVisible();
      await frameSamples(page);
      expect(loadedImages).toEqual([]);
      expect(refusedImages.length).toBeGreaterThan(0);
      expect(refusedImages.every(error => /csp/i.test(error))).toBe(true);
      const frame = page.locator('iframe.mail-frame').last();
      const blocked = await frame.evaluate(element => ({
        sandbox: element.getAttribute('sandbox'),
        csp: element.contentDocument.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
      }));
      expect(blocked.sandbox).not.toContain('allow-scripts');
      expect(blocked.csp).toContain('img-src data:;');
      await page.getByRole('button', {name: 'Показать', exact: true}).click();
      await expect(page.getByRole('button', {name: 'Показать', exact: true})).toHaveCount(0);
      await expect.poll(() => loadedImages.some(url => url.includes('?style'))).toBe(true);
      const allowed = await frame.evaluate(element => ({
        sandbox: element.getAttribute('sandbox'),
        csp: element.contentDocument.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
      }));
      expect(allowed.sandbox).toBe(blocked.sandbox);
      expect(allowed.csp).toContain("default-src 'none'");
      expect(allowed.csp).toContain('img-src data: https: http:;');
      await expectNoHorizontalScroll(page);
    });

    test('unsupported browser-session search explains exclusion without claiming no matches', async ({page}) => {
      const separator = layout.path.includes('?') ? '&' : '?';
      await page.goto(`${layout.path}${separator}search=webmail`);
      await page.getByRole('searchbox').fill('absent query');
      await page.getByRole('searchbox').press('Enter');
      await expect(page.getByRole('heading', {name: 'Поиск в веб-почте.', exact: true})).toBeVisible();
      const notice = page.getByRole('status');
      await expect(notice).toContainText('В расширении пока нет поиска');
      await expect(notice).toContainText('anton@yandex.ru');
      await expect(notice).toContainText('anton@mail.ru');
      await expect(page.getByRole('heading', {name: 'Ничего не нашлось.', exact: true})).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    });
  });
}

test.describe('wide folder audit regressions', () => {
  test.use({viewport: {width: 1440, height: 900}});

  test('Gmail archive keeps a custom-folder row before and after refresh', async ({page}) => {
    await page.goto('app.html');
    await page.getByRole('link', {name: /^anton@gmail.com /}).click();
    await page.getByRole('button', {name: 'Папки: Входящие', exact: true}).click();
    await page.getByRole('menuitemradio', {name: 'Проекты 55 писем', exact: true}).click();
    const row = page.locator('.row[data-id="gmail-project-0"]');
    await row.click();
    await page.getByRole('region', {name: 'Письмо'}).getByRole('button', {name: 'В архив', exact: true}).click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    await expect(row).toBeVisible();
    const refresh = page.getByRole('button', {name: 'Проверить сейчас', exact: true});
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(page.getByRole('button', {name: 'Загрузить ещё', exact: true})).toBeVisible();
    await expect(row).toBeVisible();
  });

  test('search does not inherit folder pagination or Trash action restrictions', async ({page}) => {
    await page.goto('app.html');
    await page.getByRole('link', {name: /^anton@gmail.com /}).click();
    await page.getByRole('button', {name: 'Папки: Входящие', exact: true}).click();
    await page.getByRole('menuitemradio', {name: 'Проекты 55 писем', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Загрузить ещё', exact: true})).toBeVisible();
    const search = page.getByRole('searchbox');
    await search.fill('Казань');
    await search.press('Enter');
    await expect(page.getByText('Результаты поиска', {exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Загрузить ещё', exact: true})).toHaveCount(0);
    await search.fill('');
    await search.press('Enter');
    await page.getByRole('button', {name: 'Папки: Проекты', exact: true}).click();
    await page.getByRole('menuitemradio', {name: 'Корзина 1 письмо', exact: true}).click();
    await search.fill('Казань');
    await search.press('Enter');
    await expect(page.getByText('Результаты поиска', {exact: true})).toBeVisible();
    await page.locator('.row[data-id="g1"]').click();
    const reader = page.getByRole('region', {name: 'Письмо'});
    await expect(reader.getByRole('button', {name: 'В архив', exact: true})).toBeEnabled();
    await expect(reader.getByRole('button', {name: 'Удалить', exact: true})).toBeEnabled();
  });
});

for (const [name, path, width, height] of [
  ['popup', 'popup.html', 780, 600],
  ['mini', 'popup.html?popup=mini', 400, 600],
  ['wide', 'app.html', 1440, 900],
  ['phone', 'app.html', 390, 844],
]) {
  test.describe(name, () => {
    test.use({viewport: {width, height}});
    test('data src with a remote srcset exposes consent and keeps its script-free frame', async ({page}) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const separator = path.includes('?') ? '&' : '?';
      await page.goto(path + separator + 'mail=srcset&theme=dark');
      await page.locator('.row[data-id="g5"]').click();
      await expect(page.getByText('Заблокировано: 1 картинка', {exact: true})).toBeVisible();
      const frame = page.locator('iframe.mail-frame').last();
      const before = await frame.evaluate(e => ({
        srcset: e.contentDocument?.querySelector('img')?.getAttribute('srcset') || '',
        sandbox: e.getAttribute('sandbox'),
        csp: e.contentDocument.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
      }));
      expect(before.srcset).toBe('');
      expect(before.sandbox).not.toContain('allow-scripts');
      expect(before.csp).toContain('img-src data:;');
      await page.getByRole('button', {name: 'Показать', exact: true}).click();
      await expect
        .poll(() => frame.evaluate(e => e.contentDocument?.querySelector('img')?.getAttribute('srcset') || ''))
        .toContain('?candidate');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        0,
      );
      expect(errors).toEqual([]);
    });
    test('a failed search exposes retry rather than a false empty result', async ({page}) => {
      const separator = path.includes('?') ? '&' : '?';
      await page.goto(path + separator + 'search=error');
      await page.getByRole('searchbox').fill('needle');
      await page.getByRole('searchbox').press('Enter');
      const alert = page.locator('.list-body > .notice[role="alert"]').filter({hasText: 'недоступен'});
      await expect(alert).toBeVisible();
      await expect(alert.getByRole('button')).toBeEnabled();
      await expect(page.getByText('Ничего не найдено', {exact: false})).toHaveCount(0);
      await page.getByRole('searchbox').fill('');
      await page.getByRole('searchbox').press('Enter');
      await expect(alert).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        0,
      );
    });
  });
}

for (const layout of [
  ...LAYOUTS,
  {name: 'mini popup', path: 'popup.html?popup=mini', viewport: {width: 400, height: 600}},
]) {
  test.describe(`paged search ${layout.name}`, () => {
    test.use({viewport: layout.viewport, isMobile: layout.isMobile, hasTouch: layout.hasTouch});

    test('keeps successful accounts, retries a failure and loads every unique server result', async ({page}) => {
      const errors = watchErrors(page);
      const separator = layout.path.includes('?') ? '&' : '?';
      await page.goto(`${layout.path}${separator}search=paged&searchError=work`);
      await expect(page.locator('.row[data-id="g1"]')).toBeVisible();
      const search = page.getByRole('searchbox');
      await search.fill('Server pagination');
      await search.press('Enter');
      await expect(page.locator('.row')).toHaveCount(80);
      const failure = page.getByRole('alert');
      await expect(failure).toContainText('a.ustinoff@company.onmicrosoft.com');
      await expect(page.getByRole('heading', {name: 'Ничего не нашлось.', exact: true})).toHaveCount(0);
      await failure.getByRole('button').click();
      await expect(page.locator('.row')).toHaveCount(100);
      await expect(failure).toHaveCount(0);
      const more = page.locator('button.folder-more');
      await more.click();
      await expect(page.locator('.row')).toHaveCount(200);
      await more.click();
      await expect(page.locator('.row')).toHaveCount(225);
      await expect(more).toHaveCount(0);
      const ids = await page.locator('.row').evaluateAll(rows => rows.map(row => row.dataset.id));
      expect(new Set(ids).size).toBe(225);
      for (const account of ['gmail', 'work', 'fastmail', 'yandex', 'mailru'])
        expect(ids.filter(id => id.startsWith(`search-${account}-`))).toHaveLength(45);
      await expectNoHorizontalScroll(page);
      await search.fill('no-such-server-message');
      await search.press('Enter');
      await expect(page.locator('.row')).toHaveCount(0);
      await expect(page.getByRole('heading', {name: 'Ничего не нашлось.', exact: true})).toBeVisible();
      await expect(more).toHaveCount(0);
      await search.fill('');
      await search.press('Enter');
      await expect(page.locator('.row[data-id="g1"]')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
