import { expect, test } from '@playwright/test';

test('a first visit gets a short tutorial that follows what the reader does and is not shown again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/play');
  const tour = page.locator('#tour');
  await expect(tour).toBeVisible();
  await expect(tour).toContainText('Click a star');

  await page.locator('#gq').fill('jazz');
  await page.keyboard.press('Enter');
  await expect(tour).toContainText('Look around');
  await page.locator('#sky').hover();
  await page.mouse.wheel(0, -120);
  await expect(tour).toContainText('Search anything');
  await page.locator('#gq').focus();
  await expect(tour).toContainText('Try a race');

  await tour.locator('[data-tour="race"]').click();
  await expect(tour).toBeHidden();
  await expect(page.locator('#hud')).toContainText(/finding par|par \d/);

  await page.reload();
  await expect(page.locator('#tour')).toBeHidden();
  await page.locator('#tourbtn').click();
  await expect(page.locator('#tour')).toContainText('Click a star');
  await page.locator('#tour [data-tour="skip"]').click();
  await expect(page.locator('#tour')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a shared link skips the tutorial', async ({ page }) => {
  await page.goto('/play?a=Jazz');
  await expect(page.locator('#panel h1')).toHaveText('Jazz');
  await expect(page.locator('#tour')).toBeHidden();
});

test('the sound button is off at first, remembers being turned on, and a win draws a burst', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('astris:tour', 'done'));
  await page.goto('/play?race=Brutalist%20architecture|Jazz');
  const snd = page.locator('#snd');
  await expect(snd).toHaveAttribute('aria-pressed', 'false');
  await snd.click();
  await expect(snd).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('astris:sound'))).toBe('on');

  await page.locator('#gq').fill('jazz');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud')).toHaveClass(/win/);
  await expect(page.locator('#fx')).toHaveCount(1);
  await page.waitForTimeout(250);
  const lit = await page.locator('#fx').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data ?? [];
    for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) return true;
    return false;
  });
  expect(lit).toBe(true);
});

test('with reduced motion a win throws no burst', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('astris:tour', 'done'));
  await page.goto('/play?race=Brutalist%20architecture|Jazz');
  await page.locator('#gq').fill('jazz');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud')).toHaveClass(/win/);
  await page.waitForTimeout(250);
  const lit = await page.locator('#fx').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')?.getImageData(0, 0, c.width || 1, c.height || 1).data ?? [];
    return d.some((v) => v > 0);
  });
  expect(lit).toBe(false);
});
