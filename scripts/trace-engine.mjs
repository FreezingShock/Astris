// Records a performance trace of the engine: 120 stars and three memories by default.
//
//   npm run trace                      the spec's budget case
//   npm run trace -- --cpu 4           with the processor slowed four times, to stand in for a slower laptop
//   npm run trace -- --stars 200 --memories 3 --seconds 10 --width 1440 --height 900 --dpr 2
//   npm run trace -- --check           exit with an error when the frame rate is under budget
//
// Writes trace/engine-trace.json (open it in the Performance panel of Chrome's developer tools)
// and trace/engine-trace.md (the summary to paste into a pull request).
/* global document, getComputedStyle -- the functions passed to the page run in the browser */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const BUDGET_FPS = 60;
/** A measured rate this close to the budget passes, since frames are timed to the nearest millisecond or so. */
const TOLERANCE_FPS = 1.5;
const OUT = 'trace';

function args() {
  const out = { stars: 120, memories: 3, seconds: 5, width: 1440, height: 900, dpr: 2, cpu: 1, check: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = String(argv[i]).replace(/^--/, '');
    if (key === 'check') out.check = true;
    else if (key in out) out[key] = Number(argv[++i]);
    else throw new Error('Unknown option ' + argv[i]);
  }
  return out;
}

const row = (name, t) =>
  `| ${name} | ${t.frames} | ${t.fps.toFixed(1)} | ${t.meanMs.toFixed(2)} | ${t.p95Ms.toFixed(2)} | ${t.worstMs.toFixed(2)} | ${(t.slowShare * 100).toFixed(1)}% |`;

const opt = args();
const server = await createServer({ logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const address = server.httpServer?.address();
const url = 'http://127.0.0.1:' + (typeof address === 'object' && address ? address.port : 5173);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const context = await browser.newContext({ viewport: { width: opt.width, height: opt.height }, deviceScaleFactor: opt.dpr });
  const page = await context.newPage();
  // any page that loads the design tokens will do; the main page's small map is the only one running
  await page.goto(url + '/');
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--night').trim() !== '');
  if (opt.cpu > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: opt.cpu });
  }
  await mkdir(OUT, { recursive: true });
  await browser.startTracing(page, { path: OUT + '/engine-trace.json', screenshots: false });
  const result = await page.evaluate(async ({ stars, memories, seconds }) => {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:var(--night)';
    document.body.append(canvas);
    const trace = await import('/src/engine/trace.ts');
    return trace.runTrace(canvas, { stars, memories, settledMs: seconds * 1000 });
  }, opt);
  await browser.stopTracing();

  const ok = (t) => t.fps >= BUDGET_FPS - TOLERANCE_FPS;
  const failed = !ok(result.travel) || !ok(result.settled);
  const summary = [
    '### Engine performance trace',
    '',
    `${result.stars} stars per constellation, ${result.memories} memories, ${result.starsDrawn} stars drawn in the last frame.`,
    `View ${opt.width} × ${opt.height} at pixel ratio ${opt.dpr}, processor slowed ${opt.cpu}×, headless Chromium ${browser.version()}.`,
    '',
    '| Phase | Frames | Frames per second | Mean ms | 95th percentile ms | Worst ms | Slow frames |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    row('Travel', result.travel),
    row('Settled', result.settled),
    '',
    `Budget: ${BUDGET_FPS} frames per second. ${failed ? 'Under budget.' : 'Within budget.'}`,
    '',
  ].join('\n');
  await writeFile(OUT + '/engine-trace.md', summary);
  console.log(summary);
  console.log('Wrote ' + OUT + '/engine-trace.json and ' + OUT + '/engine-trace.md');
  if (failed && opt.check) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
