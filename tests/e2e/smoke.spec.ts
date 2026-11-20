import { expect, test } from '@playwright/test';

test('main page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Today's race follows the date, so hold the clock on a day whose pair is known.
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#page-main-page')).toBeVisible();
  await expect(page.locator('.welcome .big')).toContainText('Welcome to Astris');
  await expect(page.locator('#parText')).toHaveText('Par for this pair is 3 clicks.');
  await expect(page.locator('#topicKey .dot')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('design system page', async ({ page }) => {
  await page.goto('/design-system');
  await expect(page.locator('#page-design-system h1')).toHaveText('Astris design system');
  await expect(page.locator('#tab-design-system')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#page-main-page')).toBeHidden();
});

test('the map grows a constellation and travels', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await expect(page.locator('#gstat')).toContainText('120 stars');
  await expect(page.locator('#panel .src a').first()).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Architecture');
  await expect(page.locator('#panel .src')).toContainText('CC BY-SA 4.0');
  await page.locator('#gq').fill('jaz');
  await expect(page.locator('#gsugg li').first()).toContainText('Jazz');
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel h1')).toHaveText('Jazz');
  await expect(page.locator('#gstat')).toContainText('1 memory');
  expect(errors).toEqual([]);
});

test('a race link starts a race', async ({ page }) => {
  await page.goto('/play?race=Brutalist%20architecture|Jazz');
  await expect(page.locator('#hud')).toContainText('Brutalist architecture → Jazz');
  await expect(page.locator('#hud')).toContainText('par 4');
  await expect(page.locator('#modes [data-mode="race"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the footer credits Wikipedia and names the licence', async ({ page }) => {
  for (const path of ['/', '/design-system']) {
    await page.goto(path);
    const foot = page.locator('.vfoot');
    await expect(foot).toContainText('built on Wikipedia');
    await expect(foot).toContainText('not affiliated with or endorsed by the Wikimedia Foundation');
    await expect(foot.locator('a[rel="license"]')).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  }
});

test('site links are real links and travel without a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.vlinks a').first()).toHaveAttribute('href', '/play');
  await page.locator('.vlinks a', { hasText: 'Design system' }).click();
  await expect(page).toHaveURL(/\/design-system$/);
  await expect(page.locator('#page-design-system')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#page-main-page')).toBeVisible();
});

test('phone layout: the menu folds away and nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/design-system']) {
    await page.goto(path);
    await expect(page.locator('#vside')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const dots = await page.locator('.spacecard').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(dots).toBeLessThanOrEqual(0);
  }
  await page.locator('#menuBtn').click();
  await expect(page.locator('#vside')).toBeVisible();
  await expect(page.locator('#menuBtn')).toHaveAttribute('aria-expanded', 'true');
});

test('a shared article link opens that article', async ({ page }) => {
  await page.goto('/play?a=Jazz');
  await expect(page.locator('#panel h1')).toHaveText('Jazz');
});

test('Connect two is live on the main page and opens in the map', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#vside')).not.toContainText('Connect two (planned)');
  await page.locator('.vmain a[data-connect]').click();
  await expect(page).toHaveURL(/\/play/);
  await expect(page.locator('#modes [data-mode="connect"]')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/play?connect=1');
  await expect(page.locator('#modes [data-mode="connect"]')).toHaveAttribute('aria-pressed', 'true');
});
