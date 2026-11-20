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
  await page.reload();
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
