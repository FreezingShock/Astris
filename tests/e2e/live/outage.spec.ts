import { expect, test, type Page } from '@playwright/test';
import { FakeWiki, world, type Mode } from './fake-wiki';

async function open(page: Page, wiki: FakeWiki, path: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await wiki.install(page);
  await page.goto(path);
  return errors;
}

const cases: [Mode, string, RegExp][] = [
  ['offline', 'blocked', /blocking Wikipedia/],
  ['http500', 'down', /bad moment/],
  ['apierror', 'down', /bad moment/],
  ['html', 'portal', /wifi wants a word/],
];

for (const [mode, kind, title] of cases) {
  test('Wikipedia failing as ' + mode + ' shows the ' + kind + ' screen, and Try again recovers', async ({ page }) => {
    const wiki = world();
    wiki.mode = mode;
    const errors = await open(page, wiki, '/play?a=Hub');
    const screen = page.locator('#outage');
    await expect(screen).toBeVisible();
    await expect(screen).toHaveAttribute('data-kind', kind);
    await expect(screen.locator('h2')).toHaveText(title);
    await expect(screen.locator('svg.art')).toBeVisible();
    wiki.mode = 'ok';
    await screen.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('#panel h1')).toHaveText('Hub');
    await expect(screen).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('a device with no connection shows the offline screen and heals itself when the connection returns', async ({ page, context }) => {
  const wiki = world();
  wiki.links['Kappa'] = ['Hub'];
  const errors = await open(page, wiki, '/play?a=Hub');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  await page.locator('#gq').fill('Kappa');
  await expect(page.locator('#gsugg li').first()).toContainText('Kappa');
  await context.setOffline(true);
  wiki.mode = 'offline';
  await page.keyboard.press('Enter');
  await expect(page.locator('#outage')).toHaveAttribute('data-kind', 'offline');
  await expect(page.locator('#outage .live')).toContainText('Waiting for your connection');
  // The map underneath is kept, so the reader can put the screen away and keep exploring.
  await expect(page.getByRole('button', { name: 'Keep exploring' })).toBeVisible();
  wiki.mode = 'ok';
  await context.setOffline(false);
  await expect(page.locator('#panel h1')).toHaveText('Kappa', { timeout: 10_000 });
  await expect(page.locator('#outage')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a rate limit that does not clear shows the busy screen', async ({ page }) => {
  const wiki = world();
  wiki.mode = 'http429';
  wiki.throttled = 100;
  const errors = await open(page, wiki, '/play?a=Hub');
  await expect(page.locator('#outage')).toHaveAttribute('data-kind', 'busy', { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('a request that never answers shows the too-slow screen', async ({ page }) => {
  const wiki = world();
  wiki.mode = 'hang';
  await page.clock.install();
  const errors = await open(page, wiki, '/play?a=Hub');
  await page.clock.fastForward(16_000);
  await expect(page.locator('#outage')).toHaveAttribute('data-kind', 'timeout');
  expect(errors).toEqual([]);
});

test('a missing article gets its own screen, with the typed title, and keeps the map', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?a=Hub');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  await page.locator('#gq').fill('Nonexistent thing');
  await expect(page.locator('#gsugg li').first()).toContainText('no such article');
  await page.keyboard.press('Enter');
  const screen = page.locator('#outage');
  await expect(screen).toHaveAttribute('data-kind', 'missing');
  await expect(screen.locator('h2')).toContainText('Nonexistent thing');
  await screen.getByRole('button', { name: 'Keep exploring' }).click();
  await expect(screen).toBeHidden();
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  expect(errors).toEqual([]);
});

test('a failed random pick shows a screen instead of doing nothing', async ({ page }) => {
  const wiki = world();
  const errors = await open(page, wiki, '/play?a=Hub');
  await expect(page.locator('#panel h1')).toHaveText('Hub');
  wiki.mode = 'http500';
  await page.locator('#surprise').click();
  await expect(page.locator('#outage')).toHaveAttribute('data-kind', 'down');
  expect(errors).toEqual([]);
});

test('the main page search shows the screen when Wikipedia is blocked', async ({ page }) => {
  const wiki = world();
  wiki.mode = 'offline';
  const errors = await open(page, wiki, '/');
  await page.locator('#vq').fill('Alpha');
  await page.locator('#vsearch').evaluate((f: HTMLFormElement) => f.requestSubmit());
  await expect(page.locator('#outage')).toHaveAttribute('data-kind', 'blocked');
  expect(errors).toEqual([]);
});
