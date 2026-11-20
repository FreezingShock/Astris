import { expect, test } from '@playwright/test';

test('the discovery count survives a new map and a reload', async ({ page }) => {
  const count = async (): Promise<number> => {
    const text = (await page.locator('#gstat').textContent()) ?? '';
    return Number((/([\d,]+) articles?/.exec(text)?.[1] ?? '0').replace(/,/g, ''));
  };
  await page.goto('/play');
  await expect(page.locator('#gstat')).toContainText('subjects discovered');
  const first = await count();
  expect(first).toBeGreaterThan(100);
  await page.locator('#modes [data-mode="race"]').click();
  await expect(page.locator('#hud')).toContainText('par');
  await expect.poll(count).toBeGreaterThan(first);
  const second = await count();
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await expect.poll(count).toBeGreaterThanOrEqual(second);
});

test('arrow keys choose a star, Enter travels and Backspace goes back', async ({ page }) => {
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  const live = page.locator('#play [aria-live="polite"].sr-only');
  await expect(async () => {
    await page.keyboard.press('ArrowRight');
    await expect(live).toContainText('Press Enter to travel there.', { timeout: 500 });
  }).toPass();
  const chosen = ((await live.textContent()) ?? '').split(',')[0] ?? '';
  expect(chosen).not.toBe('');
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel h1')).toHaveText(chosen);
  await page.keyboard.press('Backspace');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
});

test('typing in the search box does not move the star cursor', async ({ page }) => {
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await page.keyboard.press('/');
  await expect(page.locator('#gq')).toBeFocused();
  await page.keyboard.type('ja');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#gq')).toHaveValue('j');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
});

test('the address bar follows the map and the Share button copies a link that restores it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await expect(page).toHaveURL(/\/play\?a=Architecture$/);
  await page.locator('#gq').fill('jaz');
  await expect(page.locator('#gsugg li').first()).toContainText('Jazz');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/play\?a=Jazz$/);
  await page.locator('#share').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('Link copied. It opens Jazz on the map.');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/play\?a=Jazz$/);
  const second = await context.newPage();
  await second.goto(link);
  await expect(second.locator('#panel h1')).toHaveText('Jazz');
  await expect(second.locator('#modes [data-mode="explore"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a race shares as a race and leaving it shares the article again', async ({ page, context }) => {
  await page.goto('/play?race=Brutalist%20architecture|Jazz');
  await expect(page.locator('#hud')).toContainText('Brutalist architecture → Jazz');
  await expect(page).toHaveURL(/\/play\?race=Brutalist%20architecture\|Jazz$/);
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.locator('#hud')).toContainText('Brutalist architecture → Jazz');
  await expect(second.locator('#modes [data-mode="race"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#modes [data-mode="explore"]').click();
  await expect(page).toHaveURL(/\/play\?a=Brutalist%20architecture$/);
});
