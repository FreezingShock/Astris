import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:' + PORT, trace: 'off' },
  webServer: {
    command: 'npm run preview -- --port ' + PORT + ' --strictPort',
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
