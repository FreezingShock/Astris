import { expect, test } from '@playwright/test';
import { FakeWiki, world } from './fake-wiki';

async function open(page: import('@playwright/test').Page, wiki: FakeWiki, path: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await wiki.install(page);
  await page.goto(path);
  return errors;
}

test('a redirect opens the article it points to, once', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?a=USA');
  await expect(page.locator('#panel h1')).toHaveText('United States');
  await expect(page.locator('#gstat')).toContainText('2 stars');
  expect(errors).toEqual([]);
});

test('a disambiguation page is a normal centre and its meanings are stars', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?a=Mercury');
  await expect(page.locator('#panel h1')).toHaveText('Mercury');
  await expect(page.locator('#gstat')).toContainText('3 stars');
  expect(errors).toEqual([]);
});

test('a dead end shows an empty sky, keeps the panel and lets the reader leave', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?a=Dead%20end');
  await expect(page.locator('#panel h1')).toHaveText('Dead end');
  await expect(page.locator('#gstat')).toContainText('0 stars');
  await page.locator('#gq').fill('Hub');
  await expect(page.locator('#gsugg li').first()).toContainText('Hub');
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  await page.locator('#surprise').click();
  await expect(page.locator('#panel h1')).not.toHaveText('Hub');
  expect(errors).toEqual([]);
});

test('a missing article says so and keeps the current map', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?a=Hub');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  await page.locator('#gq').fill('Nonexistent thing');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('No article called');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  expect(errors).toEqual([]);
});

for (const mode of ['http500', 'apierror', 'html', 'offline'] as const) {
  test('a failing Wikipedia (' + mode + ') is reported as unreachable, not as a missing article, and the next try works', async ({ page }) => {
    const wiki = world();
    const errors = await open(page, wiki, '/play?a=Hub');
    await expect(page.locator('#panel h1')).toHaveText('Hub');
    wiki.mode = mode;
    await page.locator('#gq').fill('Alpha');
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast')).toContainText('Could not reach Wikipedia');
    await expect(page.locator('#panel h1')).toHaveText('Hub');
    wiki.mode = 'ok';
    await page.locator('#gq').fill('Alpha');
    await page.keyboard.press('Enter');
    await expect(page.locator('#panel h1')).toHaveText('Alpha');
    expect(errors).toEqual([]);
  });
}

test('a 429 shows the slowing-down note and then succeeds', async ({ page }) => {
  const wiki = world();
  wiki.mode = 'http429';
  wiki.throttled = 1;
  const errors = await open(page, wiki, '/play?a=Hub');
  await expect(page.locator('#toast')).toContainText('Slowing down for Wikipedia');
  await expect(page.locator('#panel h1')).toHaveText('Hub', { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('Surprise me reports a failed random pick instead of doing nothing', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?a=Hub');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  wiki.mode = 'http500';
  await page.locator('#surprise').click();
  await expect(page.locator('#toast')).toContainText(/Could not reach Wikipedia|Could not/);
  expect(errors).toEqual([]);
});

test('Drift survives a failed step and keeps drifting', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?a=Dead%20end');
  await expect(page.locator('#panel h1')).toHaveText('Dead end');
  await page.waitForTimeout(500);
  wiki.mode = 'http500';
  await page.locator('#modes [data-mode="drift"]').click();
  // The first step runs after about a second, finds a dead end, and fails to pick a random article.
  await page.waitForTimeout(2000);
  wiki.mode = 'ok';
  const before = wiki.calls.length;
  // A dead drift never asks again; a living one keeps asking every few seconds.
  await expect.poll(() => wiki.calls.length, { timeout: 15_000 }).toBeGreaterThan(before);
  await expect(page.locator('#panel h1')).not.toHaveText('Dead end', { timeout: 15_000 });
  await expect(page.locator('#modes [data-mode="drift"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('a race to a redirect title is won by reaching the real article', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?race=Gamma|USA');
  await expect(page.locator('#hud')).toContainText('United States');
  await page.locator('#gq').fill('Hub');
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  await page.locator('#gq').fill('United States');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud')).toContainText('Arrived at United States');
  expect(errors).toEqual([]);
});

test('a race whose target does not exist does not hang the HUD', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?race=Hub|No%20such%20article');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  await expect(page.locator('#hud')).toContainText('par');
  expect(errors).toEqual([]);
});

test('Connect two between unlinked islands ends with a clear note', async ({ page }) => {
  const wiki = world();
  wiki.links['Island'] = [];
  const errors = await open(page, wiki, '/play?connect=1');
  await page.locator("#hud input[name='from']").fill('Hub');
  await page.locator("#hud input[name='to']").fill('Island');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud')).toContainText(/couldn.t|no chain|not find|unreachable/i, { timeout: 20_000 });
  expect(errors).toEqual([]);
});
