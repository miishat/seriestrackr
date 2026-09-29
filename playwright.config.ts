import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'node_modules/.cache/playwright',
  use: { baseURL: 'http://127.0.0.1:3000', browserName: 'chromium', acceptDownloads: true },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
