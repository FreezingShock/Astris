import { expect, test } from '@playwright/test';

test('main page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('#page-main-page')).toBeVisible();
  await expect(page.locator('.welcome .big')).toContainText('Welcome to Astris');
  await expect(page.locator('#parText')).toHaveText('Par for this pair is 4 clicks.');
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
