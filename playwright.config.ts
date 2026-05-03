import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

/**
 * Playwright config for VibeCity E2E smoke tests (REQ-003).
 *
 * Defaults:
 * - Tests live under `e2e/` (kept separate from `tests/` so vitest does not
 *   pick them up).
 * - The webServer entry runs `npm run build && npm run start` against a
 *   non-default port (3100) so a dev server on 3000 can stay running while
 *   tests are executed locally.
 * - Single chromium project for v1 smoke; adding firefox / webkit is a
 *   follow-up when the route surface grows.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
