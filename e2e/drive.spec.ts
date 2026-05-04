import { expect, test } from '@playwright/test'

/**
 * REQ-006 + REQ-044 + REQ-045 + REQ-046 + REQ-053: drive view
 * scaffold.
 *
 * Verifies the drive route at `/<slug>` mounts the three.js canvas,
 * renders the Edit CTA back to `/<slug>/edit`, and shows the
 * empty-state prompt for a slug with no saved city. The Playwright
 * webServer runs `next start` without KV configured, so `loadCity`
 * falls back to the empty city for any slug; we use that fallback to
 * cover the empty-state branch without needing a seeded KV instance.
 */
test('drive route mounts the canvas with the slug label and Edit CTA', async ({
  page,
}) => {
  const response = await page.goto('/drive-scaffold-spec')
  expect(response?.status()).toBe(200)

  const root = page.getByTestId('drive-scene-root')
  await expect(root).toBeVisible()
  await expect(root).toHaveAttribute('data-slug', 'drive-scaffold-spec')

  const canvas = page.getByTestId('drive-scene-canvas')
  await expect(canvas).toBeVisible()

  // The slug label is visible in the top-left overlay.
  await expect(page.getByTestId('drive-scene-slug')).toHaveText(
    'drive-scaffold-spec',
  )

  // Edit CTA points back at the editor route.
  const editCta = page.getByTestId('drive-edit-cta')
  await expect(editCta).toBeVisible()
  await expect(editCta).toHaveAttribute('href', '/drive-scaffold-spec/edit')
  await expect(editCta).toHaveAttribute('data-slug', 'drive-scaffold-spec')
  await expect(editCta).toHaveText('Edit')

  // REQ-036: spawn anchor data attributes are present on the root. The
  // playwright webServer runs without KV, so loadCity falls back to the
  // empty city; the anchor reads as the grid origin.
  await expect(root).toHaveAttribute('data-spawn-row', '0')
  await expect(root).toHaveAttribute('data-spawn-col', '0')

  // REQ-047: placeholder car renders only when at least one piece is
  // placed. The webServer is unconfigured KV, so the city is empty and
  // the vehicle flag is false; the unit tests cover the populated case.
  await expect(root).toHaveAttribute('data-vehicle', 'false')

  // REQ-034: keyboard controls install only when a car is mounted; an
  // empty city keeps the listeners dormant so an author cannot
  // accidentally trigger driving with no vehicle on screen.
  await expect(root).toHaveAttribute('data-controls-active', 'false')

  // REQ-033: chase camera engages only when a car is mounted; an empty
  // city stays in the orbit framing so the empty-state prompt reads
  // against a neutral backdrop centered on the grid origin.
  await expect(root).toHaveAttribute('data-camera-mode', 'orbit')
})

test('drive route shows the empty-state prompt for a fresh slug (REQ-053)', async ({
  page,
}) => {
  const response = await page.goto('/drive-empty-spec')
  expect(response?.status()).toBe(200)

  const root = page.getByTestId('drive-scene-root')
  await expect(root).toHaveAttribute('data-empty', 'true')
  await expect(root).toHaveAttribute('data-piece-count', '0')
  await expect(root).toHaveAttribute('data-building-count', '0')
  // REQ-036: spawn anchor falls back to grid origin when no pieces.
  await expect(root).toHaveAttribute('data-spawn-row', '0')
  await expect(root).toHaveAttribute('data-spawn-col', '0')
  // REQ-047: placeholder car is omitted on the empty grid.
  await expect(root).toHaveAttribute('data-vehicle', 'false')
  // REQ-034: keyboard controls stay dormant on the empty grid.
  await expect(root).toHaveAttribute('data-controls-active', 'false')
  // REQ-033: chase camera stays out of the empty grid; the orbit aim
  // keeps the empty-state prompt centered against a neutral backdrop.
  await expect(root).toHaveAttribute('data-camera-mode', 'orbit')

  const prompt = page.getByTestId('drive-empty-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('Place a road first')

  // The Open editor link is the empty-state CTA back into the editor.
  const cta = page.getByTestId('drive-empty-create-cta')
  await expect(cta).toBeVisible()
  await expect(cta).toHaveAttribute('href', '/drive-empty-spec/edit')

  // Clicking the Open editor link routes to the editor.
  await cta.click()
  await page.waitForURL('**/drive-empty-spec/edit')
  expect(page.url()).toMatch(/\/drive-empty-spec\/edit$/)
})
