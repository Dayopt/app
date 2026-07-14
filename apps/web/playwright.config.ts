import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  reporter: process.env.CI
    ? [
        ['html'],
        ['json', { outputFile: 'test-results/e2e-results.json' }],
        ['junit', { outputFile: 'test-results/e2e-results.xml' }],
      ]
    : [['html']],
  use: {
    baseURL: 'http://localhost:3001',
    actionTimeout: 10 * 1000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm build && pnpm start:e2e' : 'pnpm dev:e2e',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: (process.env.CI ? 240 : 120) * 1000,
  },
});
