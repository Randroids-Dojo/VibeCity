import { expect, test } from '@playwright/test'

/**
 * REQ-003 smoke test. Verifies the home page renders the project pitch and
 * responds with a 200. This is the canary that proves the Playwright runner
 * is wired against a real Next.js production build.
 */
test('home page renders the VibeCity pitch heading', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)

  const heading = page.getByRole('heading', { level: 1, name: 'VibeCity' })
  await expect(heading).toBeVisible()

  await expect(page.getByText('city builder')).toBeVisible()
})
