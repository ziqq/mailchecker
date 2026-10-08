/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
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
});
