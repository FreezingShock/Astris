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

const MOBILE = { width: 390, height: 844 };

for (const [name, size] of [
  ['desktop', { width: 1280, height: 800 }],
  ['phone', MOBILE],
] as const) {
  test.describe(`the atlas yields to the rest of the map on ${name}`, () => {
    test.use({ viewport: size });

    const openAtlas = async (page: import('@playwright/test').Page): Promise<void> => {
      await page.goto('/play');
      await expect(page.locator('#panel h1')).toHaveText('Architecture', { useInnerText: false });
      await page.keyboard.press('Escape'); // a first-visit tutorial may be showing
      await page.locator('#skyBtn').click();
      await expect(page.locator('#atlas')).toBeVisible();
    };

    test('Random article closes it and travels', async ({ page }) => {
      await openAtlas(page);
      await page.locator('#surprise').click();
      await expect(page.locator('#atlas')).toBeHidden();
    });

    test('a mode button closes it', async ({ page }) => {
      await openAtlas(page);
      await page.locator('#modes [data-mode="race"]').click();
      await expect(page.locator('#atlas')).toBeHidden();
      await expect(page.locator('#hud')).toBeVisible();
    });

    test('focusing search closes it', async ({ page }) => {
      await openAtlas(page);
      await page.locator('#gq').click();
      await expect(page.locator('#atlas')).toBeHidden();
    });

    test('Escape, the Close button and a second press of My sky close it', async ({ page }) => {
      await openAtlas(page);
      await page.keyboard.press('Escape');
      await expect(page.locator('#atlas')).toBeHidden();
      await page.locator('#skyBtn').click();
      await page.locator('#atClose').click();
      await expect(page.locator('#atlas')).toBeHidden();
      await page.locator('#skyBtn').click();
      await page.locator('#skyBtn').click();
      await expect(page.locator('#atlas')).toBeHidden();
    });

    test('going to the main page closes it, and it stays shut on return', async ({ page }) => {
      await openAtlas(page);
      await page.locator('#play .gbar .logo').click();
      await page.goto('/play');
      await expect(page.locator('#atlas')).toBeHidden();
    });
  });
}
