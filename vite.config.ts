import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';

/** The public address, for share cards, the canonical link and the sitemap. Set VITE_SITE_URL, or let Vercel's production domain fill it in. */
const site = (process.env.VITE_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/+$/, '');

/** The browser-bar colours come from the tokens (--page, light and dark) so that no hex colour lives in index.html. */
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const THEME_LIGHT = /--page:\s*(#[0-9a-f]+)/i.exec(tokens)?.[1] ?? '';
const THEME_DARK = /prefers-color-scheme: dark[\s\S]*?--page:\s*(#[0-9a-f]+)/i.exec(tokens)?.[1] ?? '';

function siteFiles(): Plugin {
  return {
    name: 'astris-site-files',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', site).replaceAll('%THEME_LIGHT%', THEME_LIGHT).replaceAll('%THEME_DARK%', THEME_DARK),
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...(site ? ['Sitemap: ' + site + '/sitemap.xml'] : [])].join('\n') + '\n';
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (!site) return;
      const urls = ['/', '/play'].map((p) => '  <url><loc>' + site + p + '</loc></url>').join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n',
      });
    },
  };
}

export default defineConfig({
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', notfound: '404.html' } } },
  plugins: [siteFiles()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
