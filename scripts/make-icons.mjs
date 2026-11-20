// Renders the favicon PNGs, the .ico, the apple-touch-icon and the share image from public/favicon.svg.
/* global document */
// Run with: node scripts/make-icons.mjs   (needs the Playwright Chromium that `npm run test:e2e` already uses)
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('public/favicon.svg', 'utf8');
const font = readFileSync('src/assets/fonts/source-serif-4.woff2').toString('base64');
const browser = await chromium.launch();

async function png(path, width, height, html) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(path, await page.screenshot({ omitBackground: true }));
  await page.close();
}

const star = (size, pad) =>
  `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;padding:${pad}px;box-sizing:border-box">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`;

// Transparent, star only. The glyph is bigger in the small sizes so that it still reads in a tab.
for (const [name, size, pad] of [
  ['favicon-16', 16, 0],
  ['favicon-32', 32, 0],
  ['favicon-48', 48, 1],
  ['apple-touch-icon', 180, 16],
  ['icon-192', 192, 16],
  ['icon-512', 512, 40],
]) {
  await png(`public/${name}.png`, size, size, star(size, pad));
}

// favicon.ico: three PNGs in one container.
const sizes = [16, 32, 48];
const imgs = sizes.map((s) => readFileSync(`public/favicon-${s}.png`));
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = imgs.map((img, i) => {
  const e = Buffer.alloc(16);
  e[0] = sizes[i];
  e[1] = sizes[i];
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
writeFileSync('public/favicon.ico', Buffer.concat([head, ...dir, ...imgs]));

// Share image, 1200 x 630: the night sky, the star, the wordmark and the line.
await png(
  'public/og-image.png',
  1200,
  630,
  `<style>
  @font-face{font-family:S;src:url(data:font/woff2;base64,${font});font-weight:200 900}
  body{margin:0;width:1200px;height:630px;background:radial-gradient(ellipse at 72% 38%,rgba(110,163,255,.28),transparent 55%),radial-gradient(ellipse at 30% 90%,rgba(164,139,245,.22),transparent 50%),radial-gradient(ellipse at 90% 100%,rgba(240,138,169,.16),transparent 45%),#07080c;color:#eceaf2;font-family:S,Georgia,serif;position:relative;overflow:hidden}
  .star{position:absolute;right:130px;top:95px;width:400px;height:400px;filter:drop-shadow(0 0 60px rgba(110,163,255,.8))}
  h1{position:absolute;left:90px;top:200px;margin:0;font-size:150px;font-weight:600;letter-spacing:-.01em;line-height:1}
  p{position:absolute;left:94px;top:372px;margin:0;font-size:36px;line-height:1.35;width:560px;color:#9a9db0;font-weight:400}
  </style><body><div class="star">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div><h1>Astris</h1><p>The map of everything Wikipedia connects.</p></body>`,
);
await browser.close();
