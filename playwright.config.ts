import { defineConfig } from '@playwright/test';

const PORT = 4173;
/** The smoke tests get their own build on sample data, so they never touch the network or the real dist/. */
const OUT = 'node_modules/.astris-e2e';
/** The live-data tests run the real WikipediaProvider build against a fake Wikipedia, so they get a live build of their own. */
const LIVE_PORT = 4174;
const LIVE_OUT = 'node_modules/.astris-e2e-live';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'off' },
  projects: [
    { name: 'sample', testIgnore: '**/live/**', use: { baseURL: 'http://localhost:' + PORT } },
    { name: 'live', testMatch: '**/live/**/*.spec.ts', use: { baseURL: 'http://localhost:' + LIVE_PORT } },
  ],
  webServer: [
    {
      command: 'npx vite build --outDir ' + OUT + ' --emptyOutDir && npx vite preview --outDir ' + OUT + ' --port ' + PORT + ' --strictPort',
      env: { VITE_DATA: 'sample' },
      port: PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite build --outDir ' + LIVE_OUT + ' --emptyOutDir && npx vite preview --outDir ' + LIVE_OUT + ' --port ' + LIVE_PORT + ' --strictPort',
      port: LIVE_PORT,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
