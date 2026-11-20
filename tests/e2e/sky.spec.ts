import { expect, test } from '@playwright/test';

test('travelling collects stars into the sky atlas, and they stay after a reload', async ({ page }) => {
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await page.locator('#skyBtn').click();
  await expect(page.locator('#atlas')).toBeVisible();
  await expect(page.locator('#atlas .at-sum')).toContainText('1 star collected');
  await expect(page.locator('#atlas .at-regions li').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#atlas')).toBeHidden();
  await page.locator('#surprise').click();
  await expect(page.locator('#toast')).toBeHidden({ timeout: 6000 });
  await page.reload();
  await page.locator('#skyBtn').click();
  await expect(page.locator('#atlas .at-sum')).toContainText(/[2-9] stars collected/);
});

test('an unlit region offers an article that lights it', async ({ page }) => {
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await page.locator('#skyBtn').click();
  await page.locator('#atlas .at-link', { hasText: 'Jazz' }).click();
  await expect(page.locator('#atlas')).toBeHidden();
  await expect(page.locator('#panel h1')).toHaveText('Jazz');
  await page.locator('#skyBtn').click();
  await expect(page.locator('#atlas .at-sum')).toContainText('2 stars collected');
});
