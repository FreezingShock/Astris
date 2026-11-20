import { expect, test, type Page } from '@playwright/test';

async function goTo(page: Page, query: string, title: string): Promise<void> {
  await page.locator('#gq').fill(query);
  await expect(page.locator('#gsugg li').first()).toContainText(query, { ignoreCase: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel h1')).toHaveText(title);
}

/** Three hops in Explore: Architecture, Brutalist architecture, Jazz, Architecture's neighbours as the sample set allows. */
async function wander(page: Page): Promise<void> {
  await page.goto('/play');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await goTo(page, 'brutalist', 'Brutalist architecture');
  await goTo(page, 'jazz', 'Jazz');
}

/** The star count once the bloom has stopped growing it. */
async function settledStars(page: Page): Promise<string> {
  let last = '';
  for (let i = 0; i < 30; i++) {
    const now = (await page.locator('#gstat').textContent())?.match(/(\d+) stars/)?.[1] ?? '';
    if (now && now === last) return now;
    last = now;
    await page.waitForTimeout(500);
  }
  return last;
}

const centres = async (page: Page): Promise<string> => (await page.locator('#gstat').textContent())?.match(/\d+ centres?/)?.[0] ?? '';

test('a refresh rebuilds the whole tree from the journey in the address', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await wander(page);
  await expect(page).toHaveURL(/[?&]j=[a-z0-9]+/);
  await expect(page).toHaveURL(/[?&]a=Jazz/);
  await expect.poll(() => centres(page)).toBe('3 centres');
  const before = await settledStars(page);

  await page.reload();
  await expect(page.locator('#panel h1')).toHaveText('Jazz');
  await expect.poll(() => centres(page), { timeout: 10_000 }).toBe('3 centres');
  expect(await settledStars(page)).toBe(before);
  await expect(page).toHaveURL(/[?&]j=[a-z0-9]+/);
  expect(errors).toEqual([]);

  // Travelling on after a refresh carries the same journey forward.
  const id = new URL(page.url()).searchParams.get('j');
  await goTo(page, 'architecture', 'Architecture');
  expect(new URL(page.url()).searchParams.get('j')).toBe(id);
});

test('the share link carries the path, and a friend opens the same journey', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await wander(page);
  await page.locator('#share').click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/play\?a=Jazz&t=1\.[A-Za-z0-9_-]+\.[0-9a-z]{4}/);

  const friend = await browser.newContext();
  const theirs = await friend.newPage();
  await theirs.goto(link);
  await expect(theirs.locator('#panel h1')).toHaveText('Jazz');
  await expect.poll(() => centres(theirs), { timeout: 10_000 }).toBe('3 centres');
  // The friend's tab now has a journey of its own and the shared token is gone from the address.
  await expect(theirs).toHaveURL(/[?&]j=[a-z0-9]+/);
  expect(theirs.url()).not.toContain('t=1.');
  await friend.close();
});

test('a damaged or foreign link falls back to the article, or to a fresh map, without a fuss', async ({ page }) => {
  await page.goto('/play?a=Jazz&t=1.garbage.0000');
  await expect(page.locator('#panel h1')).toHaveText('Jazz');
  await expect(page.locator('#toast')).toContainText('could not be read');
  await page.goto('/play?j=zzzzzzzz');
  await expect(page.locator('#panel h1')).toHaveText('Architecture');
  await expect(page.locator('#toast')).toContainText('not saved in this browser');
});

test('a plain visit offers to resume, and starting a race leaves the journey alone', async ({ page }) => {
  await wander(page);
  await page.goto('/play');
  const resume = page.locator('#resume');
  await expect(resume).toContainText('Resume journey · 3 stops');
  await resume.click();
  await expect(page.locator('#panel h1')).toHaveText('Jazz');
  await expect.poll(() => centres(page), { timeout: 10_000 }).toBe('3 centres');
  await expect(resume).toHaveCount(0);

  await page.locator('#modes [data-mode="race"]').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]j=/);
});
