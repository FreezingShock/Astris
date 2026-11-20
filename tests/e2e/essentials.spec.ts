import { expect, test } from '@playwright/test';

test('the 404 page is themed and leads back to the map', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.locator('h1')).toHaveText('This star is not on the map');
  await expect(page.getByRole('link', { name: 'Open the map' })).toHaveAttribute('href', '/play');
});

test('the main page carries its icons, manifest and share card', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image\.png$/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  for (const path of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/site.webmanifest', '/robots.txt']) {
    expect((await request.get(path)).ok(), path).toBe(true);
  }
});
