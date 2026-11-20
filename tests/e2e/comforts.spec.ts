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
