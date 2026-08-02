import { defineConfig } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test/e2e/results/test-results.json' }],
    ['html', { outputFolder: 'test/e2e/results/html-report', open: 'never' }],
  ],
  webServer: {
    command: 'bun run serve:fixtures',
    url: 'http://localhost:3000',
    // Reuse a fixture server already listening on 3000 instead of failing the
    // whole run on a port clash. CI still gets a clean server of its own.
    reuseExistingServer: !(process.env.CI === 'true'),
    timeout: 120 * 1000,
  },
  use: {
    headless: false, // Extensions require headed mode
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chrome-extension',
      use: {
        browserName: 'chromium',
      },
    },
  ],
})
