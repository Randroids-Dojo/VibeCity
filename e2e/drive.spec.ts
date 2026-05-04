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

  // REQ-039: pause state defaults to running on every page load. Esc
  // toggles the menu, but with no car mounted the listener is dormant
  // and the overlay must not render even after pressing Esc.
  await expect(root).toHaveAttribute('data-pause-state', 'running')

  // REQ-030: building collision penalty flag defaults to false. With no
  // car mounted the per-frame integration loop is dormant so the flag
  // never flips. Unit tests cover the populated case.
  await expect(root).toHaveAttribute('data-on-building', 'false')

  // REQ-054: off-street penalty flag defaults to false. With no car
  // mounted the per-frame integration loop is dormant so the flag
  // never flips. Unit tests cover the populated case.
  await expect(root).toHaveAttribute('data-off-street', 'false')

  // REQ-066: drive HUD overlays render only when a car is mounted. The
  // playwright webServer is unconfigured KV so the city is empty and
  // the HUD is hidden. The fallback data attributes still ride on the
  // root so the contract is observable.
  await expect(root).toHaveAttribute('data-hud-visible', 'false')
  await expect(root).toHaveAttribute('data-hud-speed', '0')
  await expect(root).toHaveAttribute('data-hud-direction', 'idle')
  await expect(page.getByTestId('drive-hud-speed')).toHaveCount(0)
  await expect(page.getByTestId('drive-hud-controls')).toHaveCount(0)

  // REQ-067: respawn key listener installs only when a car is mounted.
  // An empty grid keeps the listener dormant; the unit tests cover the
  // pure helper and the populated runtime is exercised via the HUD
  // controls hint when a car mounts (see the `R: respawn` line below).
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
  // REQ-039: pause state defaults to running; the listener is gated to
  // the car-mounted branch so an empty grid cannot toggle the menu.
  await expect(root).toHaveAttribute('data-pause-state', 'running')
  // REQ-030: building collision flag stays false on the empty grid;
  // there is no car to land on a building cell.
  await expect(root).toHaveAttribute('data-on-building', 'false')
  // REQ-054: off-street flag stays false on the empty grid; the
  // listener gate that mounts the car also gates the per-frame check
  // so the flag never flips on an empty grid.
  await expect(root).toHaveAttribute('data-off-street', 'false')
  // REQ-066: drive HUD stays hidden on the empty grid; the listener
  // gate that mounts the car also gates the HUD overlays so an author
  // cannot see a speed readout for a car that is not on screen.
  await expect(root).toHaveAttribute('data-hud-visible', 'false')
  await expect(page.getByTestId('drive-hud-speed')).toHaveCount(0)
  await expect(page.getByTestId('drive-hud-controls')).toHaveCount(0)
  // REQ-067: pressing R on the empty grid does not mount a car or fire
  // the respawn handler; the listener is gated on the car being mounted
  // so a stray R in the empty-state branch is a no-op.
  await page.keyboard.press('KeyR')
  await expect(root).toHaveAttribute('data-vehicle', 'false')

  const prompt = page.getByTestId('drive-empty-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('Place a road first')

  // The Open editor link is the empty-state CTA back into the editor.
  const cta = page.getByTestId('drive-empty-create-cta')
  await expect(cta).toBeVisible()
  await expect(cta).toHaveAttribute('href', '/drive-empty-spec/edit')

  // The pause overlay must not render on the empty grid even if Esc is
  // pressed (the listener is gated on the car being mounted).
  await page.keyboard.press('Escape')
  await expect(root).toHaveAttribute('data-pause-state', 'running')
  await expect(page.getByTestId('drive-pause-menu')).toHaveCount(0)

  // Clicking the Open editor link routes to the editor.
  await cta.click()
  await page.waitForURL('**/drive-empty-spec/edit')
  expect(page.url()).toMatch(/\/drive-empty-spec\/edit$/)
})
