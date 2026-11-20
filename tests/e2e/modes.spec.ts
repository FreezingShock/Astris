import { expect, test } from '@playwright/test';

test('a race can be finished, run again and replaced with a new one', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/play?race=Brutalist%20architecture|Jazz');
  const hud = page.locator('#hud');
  await expect(hud).toContainText('par 4');
  await page.locator('#gq').fill('jazz');
  await expect(page.locator('#gsugg li').first()).toContainText('Jazz');
  await page.keyboard.press('Enter');
  await expect(hud).toContainText('Arrived at Jazz');
  await expect(hud).toContainText('1 click');
  await expect(hud).toHaveClass(/win/);

  await hud.locator('#retry').click();
  await expect(hud).toContainText('Brutalist architecture → Jazz');
  await expect(hud.locator('#rc')).toHaveText('0 clicks');
  await expect(hud).toContainText('par 4');
  await expect(page.locator('#panel h1')).toHaveText('Brutalist architecture');

  await hud.locator('#again').click();
  await expect(hud).toContainText(/par [34]/);
  await expect(hud.locator('#rc')).toHaveText('0 clicks');

  await hud.locator('#quit').click();
  await expect(hud).toBeHidden();
  await expect(page.locator('#modes [data-mode="explore"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('the daily race starts from its tab, finishes and remembers the best result', async ({ page }) => {
  await page.goto('/play');
  await page.locator('#modes [data-mode="daily"]').click();
  const hud = page.locator('#hud');
  await expect(hud).toContainText('Daily constellation');
  await expect(page.locator('#modes [data-mode="daily"]')).toHaveAttribute('aria-pressed', 'true');
  const target = (await hud.locator('.line em').textContent()) ?? '';
  expect(target.length).toBeGreaterThan(0);
  await expect(page.locator('#panel h1')).not.toHaveText('Architecture');

  await page.locator('#gq').fill(target);
  await expect(page.locator('#gsugg li').first()).toContainText(target);
  await page.keyboard.press('Enter');
  await expect(hud).toContainText('Arrived at ' + target);
  await expect(hud).toContainText('your best today 1 click');

  await hud.locator('#retry').click();
  await expect(hud.locator('#rc')).toHaveText('0 clicks');
  await expect(hud).toContainText('Daily constellation');
  await hud.locator('#quit').click();
  await expect(hud).toBeHidden();
});
