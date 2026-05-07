import { expect, test } from '@playwright/test'

/**
 * REQ-011 + REQ-050: home page lists recently-updated slugs and offers
 * a Create-new-slug input.
 *
 * The Playwright webServer runs `next start` without KV configured, so
 * `recentSlugs()` falls back to an empty list. That covers the empty
 * branch end-to-end without needing a seeded KV instance; the helper's
 * KV-on path is covered by the unit tests in `tests/lib/recentSlugs.test.ts`.
 */
test('home page renders the heading, the Create form, and the empty list', async ({
  page,
}) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)

  const heading = page.getByRole('heading', { level: 1, name: 'VibeCity' })
  await expect(heading).toBeVisible()

  // Create form surface.
  const form = page.getByTestId('home-create-form')
  await expect(form).toBeVisible()
  const input = page.getByTestId('home-create-slug-input')
  await expect(input).toBeVisible()
  const preview = page.getByTestId('home-create-slug-preview')
  await expect(preview).toBeVisible()
  const submit = page.getByTestId('home-create-submit')
  await expect(submit).toBeVisible()
  // With an empty input the submit is disabled.
  await expect(submit).toBeDisabled()

  // Recently-updated section is visible with the empty-state copy.
  const section = page.getByTestId('home-recent-section')
  await expect(section).toBeVisible()
  await expect(section).toHaveAttribute('data-recent-count', '0')
  await expect(page.getByTestId('home-recent-empty')).toBeVisible()
  // F-011: thumbnails only mount inside recent-card list items; with
  // no recent cards there are no thumbnail SVGs.
  await expect(page.getByTestId('home-recent-thumbnail')).toHaveCount(0)

  // Total-count header cue is visible with the zero-count copy. The
  // Playwright webServer runs without KV configured so cityIndexCount()
  // falls back to 0, which renders as "0 cities so far" with the plural
  // noun (English convention treats zero as plural).
  const total = page.getByTestId('home-total-count')
  await expect(total).toBeVisible()
  await expect(total).toHaveAttribute('data-total-count', '0')
  await expect(total).toHaveText('0 cities so far')
})

test('Create form normalizes input and gates the submit on validity', async ({
  page,
}) => {
  await page.goto('/')

  const input = page.getByTestId('home-create-slug-input')
  const preview = page.getByTestId('home-create-slug-preview')
  const submit = page.getByTestId('home-create-submit')

  // Mixed-case input with disallowed characters normalizes to a valid slug.
  await input.fill('Downtown Loop!')
  await expect(preview).toHaveAttribute('data-normalized', 'downtownloop')
  await expect(preview).toHaveAttribute('data-valid', 'true')
  await expect(preview).toContainText('Will open /downtownloop/edit')
  await expect(submit).toBeEnabled()

  // All-disallowed input collapses to empty after normalize and fails the schema.
  await input.fill('!!!')
  await expect(preview).toHaveAttribute('data-normalized', '')
  await expect(preview).toHaveAttribute('data-valid', 'false')
  await expect(submit).toBeDisabled()

  // A leading dash is stripped by normalize so a slug starting with -- is rescuable.
  await input.fill('--leading')
  await expect(preview).toHaveAttribute('data-normalized', 'leading')
  await expect(preview).toHaveAttribute('data-valid', 'true')
  await expect(submit).toBeEnabled()
})

test('Create form submit navigates to /<normalized>/edit', async ({ page }) => {
  await page.goto('/')

  const input = page.getByTestId('home-create-slug-input')
  await input.fill('My-First-City')

  const submit = page.getByTestId('home-create-submit')
  await submit.click()

  await page.waitForURL('**/my-first-city/edit')
  expect(page.url()).toMatch(/\/my-first-city\/edit$/)
})
