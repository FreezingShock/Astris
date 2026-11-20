import { defineConfig } from '@playwright/test';

const PORT = 4173;
/** The smoke tests get their own build on sample data, so they never touch the network or the real dist/. */
const OUT = 'node_modules/.astris-e2e';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:' + PORT, trace: 'off' },
  webServer: {
    command: 'npx vite build --outDir ' + OUT + ' --emptyOutDir && npx vite preview --outDir ' + OUT + ' --port ' + PORT + ' --strictPort',
    env: { VITE_DATA: 'sample' },
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
