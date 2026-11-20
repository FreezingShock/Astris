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

test('the map grows a constellation and travels', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await expect(page.locator('#gstat')).toContainText('200 stars');
  await expect(page.locator('#panel .src a').first()).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Architecture');
  await expect(page.locator('#panel .src')).toContainText('CC BY-SA 4.0');
  await page.locator('#gq').fill('jaz');
  await expect(page.locator('#gsugg li').first()).toContainText('Jazz');
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel h1')).toHaveText('Jazz');
  await expect(page.locator('#gstat')).toContainText('2 centres');
  expect(errors).toEqual([]);
});

test('a race link starts a race', async ({ page }) => {
  await page.goto('/play?race=Brutalist%20architecture|Jazz');
  await expect(page.locator('#hud')).toContainText('Brutalist architecture → Jazz');
  await expect(page.locator('#hud')).toContainText('par 4');
  await expect(page.locator('#modes [data-mode="race"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the footer credits Wikipedia and names the licence', async ({ page }) => {
  for (const path of ['/']) {
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
  await page.locator('.vlinks a', { hasText: 'Play' }).click();
  await expect(page).toHaveURL(/\/play/);
  await expect(page.locator('#sky')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#page-main-page')).toBeVisible();
});

test('phone layout: the menu folds away and nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#vside')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
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

test('Drift travels on its own until the reader quits', async ({ page }) => {
  await page.goto('/play?a=Jazz');
  await page.locator('#modes [data-mode="drift"]').click();
  await expect(page.locator('#modes [data-mode="drift"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#panel h1')).not.toHaveText('Jazz', { timeout: 15000 });
  await page.locator('#modes [data-mode="explore"]').click();
  await expect(page.locator('#modes [data-mode="explore"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the stats page starts empty and lists a finished run', async ({ page }) => {
  await page.goto('/stats');
  await expect(page.locator('#page-stats')).toBeVisible();
  await expect(page.locator('#statsBody')).toContainText('No runs yet');
  await page.evaluate(() => {
    const run = { day: Math.floor(Date.now() / 86_400_000), mode: 'race', start: 'Jazz', target: 'Bridge', clicks: 3, par: 3, time: 42_000, hints: 0, points: 880, stars: 3 };
    const stats = {
      version: 1,
      runs: 1,
      points: 880,
      stars: 3,
      streak: 1,
      longest: 1,
      lastDay: run.day,
      bestPoints: 880,
      fewestClicks: 3,
      fastest: 42_000,
      threeStar: 1,
      pairs: { 'Jazz|Bridge': 880 },
      recent: [run],
    };
    localStorage.setItem('astris:stats:v1', JSON.stringify(stats));
  });
  await page.reload();
  await expect(page.locator('#statsBody')).toContainText('Jazz → Bridge');
  await expect(page.locator('#statsBody .tile').first()).toContainText('1 day');
  await page.locator('#statsReset').click();
  await expect(page.locator('#statsBody')).toContainText('No runs yet');
});
