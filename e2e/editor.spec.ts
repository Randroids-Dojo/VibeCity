import { expect, test } from '@playwright/test'

/**
 * REQ-017 + REQ-020 + REQ-021: street piece palette, click-to-place,
 * and rotation cycling.
 *
 * Drives the editor at `/playtest-city/edit`, asserts the palette
 * exposes the v1 cardinal-only types, switches the selection,
 * places pieces by clicking grid cells, and checks the visible
 * piece count plus the occupied-count attribute on the SVG. Also
 * walks the rotate tool through a full cycle via the button and
 * the `R` keyboard shortcut to confirm the next placement records
 * the active rotation.
 *
 * REQ-022 erase tool and REQ-025 autosave are exercised by their
 * own tests in this file.
 */
test('editor palette places pieces with click-to-place', async ({ page }) => {
  const response = await page.goto('/playtest-city/edit')
  expect(response?.status()).toBe(200)

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toBeVisible()

  const straight = palette.locator('[data-piece-type="straight"]')
  const left90 = palette.locator('[data-piece-type="left90"]')
  const right90 = palette.locator('[data-piece-type="right90"]')
  await expect(straight).toBeVisible()
  await expect(left90).toBeVisible()
  await expect(right90).toBeVisible()

  // Straight is the default selection.
  await expect(straight).toHaveAttribute('aria-pressed', 'true')
  await expect(left90).toHaveAttribute('aria-pressed', 'false')

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()
  await expect(grid).toHaveAttribute('data-occupied-count', '0')

  const pieceCount = page.getByTestId('editor-piece-count')
  await expect(pieceCount).toHaveText('Pieces placed: 0')

  // Place a straight piece at the origin (0, 0).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-occupied', 'true')

  // Switch palette to left90, place at (0, 1).
  await left90.click()
  await expect(left90).toHaveAttribute('aria-pressed', 'true')
  await expect(straight).toHaveAttribute('aria-pressed', 'false')
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(grid).toHaveAttribute('data-occupied-count', '2')

  // Switch palette to right90, place at (1, 0).
  await right90.click()
  await expect(right90).toHaveAttribute('aria-pressed', 'true')
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 3')
  await expect(grid).toHaveAttribute('data-occupied-count', '3')

  // Clicking an already-occupied cell does not place a duplicate (REQ-027).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 3')
  await expect(grid).toHaveAttribute('data-occupied-count', '3')
})

test('rotate tool cycles 0 to 90 to 180 to 270 to 0 via button and R key', async ({
  page,
}) => {
  const response = await page.goto('/playtest-city/edit')
  expect(response?.status()).toBe(200)

  const rotateButton = page.getByTestId('editor-rotate')
  await expect(rotateButton).toBeVisible()
  await expect(rotateButton).toHaveAttribute('data-rotation', '0')
  await expect(rotateButton).toHaveText(/0 deg/)

  // Click cycles 0 -> 90 -> 180 -> 270 -> 0.
  await rotateButton.click()
  await expect(rotateButton).toHaveAttribute('data-rotation', '90')
  await rotateButton.click()
  await expect(rotateButton).toHaveAttribute('data-rotation', '180')
  await rotateButton.click()
  await expect(rotateButton).toHaveAttribute('data-rotation', '270')
  await rotateButton.click()
  await expect(rotateButton).toHaveAttribute('data-rotation', '0')

  // R key cycles too. Press lowercase r once.
  await page.keyboard.press('r')
  await expect(rotateButton).toHaveAttribute('data-rotation', '90')
  // Uppercase R also works (no shift modifier required).
  await page.keyboard.press('R')
  await expect(rotateButton).toHaveAttribute('data-rotation', '180')

  // Place a piece and confirm the SVG reflects the placement at the
  // active rotation. The piece-count readout is the visible signal we
  // can assert on since the SVG render does not yet expose rotation.
  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')
  await expect(pieceCount).toHaveText('Pieces placed: 0')
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')

  // Modifier-held R does NOT rotate (would otherwise hijack browser
  // refresh on Cmd+R / Ctrl+R).
  const rotationBefore = await rotateButton.getAttribute('data-rotation')
  await page.keyboard.press('Control+r')
  await expect(rotateButton).toHaveAttribute(
    'data-rotation',
    rotationBefore ?? '180',
  )
})

test('erase tool removes pieces and toggles via button and E key', async ({
  page,
}) => {
  const response = await page.goto('/playtest-city/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')
  const eraseButton = page.getByTestId('editor-erase')
  const palette = page.getByTestId('editor-palette')

  // Editor opens in place mode (REQ-022 default).
  await expect(eraseButton).toBeVisible()
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'false')
  await expect(eraseButton).toHaveAttribute('data-tool-mode', 'place')
  await expect(palette).toHaveAttribute('data-tool-mode', 'place')
  await expect(grid).toHaveAttribute('data-cursor-mode', 'place')

  // Place two pieces in place mode.
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(grid).toHaveAttribute('data-occupied-count', '2')

  // Toggle to erase mode via the button.
  await eraseButton.click()
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'true')
  await expect(eraseButton).toHaveAttribute('data-tool-mode', 'erase')
  await expect(palette).toHaveAttribute('data-tool-mode', 'erase')
  await expect(grid).toHaveAttribute('data-cursor-mode', 'erase')

  // Click an empty cell in erase mode: nothing happens.
  await grid.locator('[data-cell-row="5"][data-cell-col="5"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(grid).toHaveAttribute('data-occupied-count', '2')

  // Click an occupied cell: piece disappears.
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-occupied', 'false')
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="1"]'),
  ).toHaveAttribute('data-cell-occupied', 'true')

  // Toggle back to place mode via the E key (uppercase too).
  await page.keyboard.press('e')
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'false')
  await expect(grid).toHaveAttribute('data-cursor-mode', 'place')
  await page.keyboard.press('E')
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'true')
  await expect(grid).toHaveAttribute('data-cursor-mode', 'erase')

  // Erase the remaining piece via the keyboard shortcut path: still in
  // erase mode, click the surviving cell.
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 0')
  await expect(grid).toHaveAttribute('data-occupied-count', '0')

  // Modifier-held E does NOT toggle erase (no browser hijack today, but
  // matches the rotate-shortcut policy so future browser shortcuts on
  // Cmd+E or Ctrl+E do not regress).
  await page.keyboard.press('e')
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Control+e')
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'false')
})

test('autosave PUTs after every accepted mutation (REQ-025)', async ({
  page,
}) => {
  // The Playwright webServer runs `next start` without KV configured,
  // so the real route returns 503. Intercepting the PUT lets the test
  // verify the autosave path issues the request and the status
  // indicator transitions through saving -> saved without depending on
  // a live KV instance. The intercepted handler returns the contract
  // shape the route would emit on success.
  const requestedSlugs: string[] = []
  const requestedBodies: string[] = []
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    requestedSlugs.push(new URL(route.request().url()).pathname)
    requestedBodies.push(route.request().postData() ?? '')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'autosave-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/autosave-spec/edit')
  expect(response?.status()).toBe(200)

  const status = page.getByTestId('editor-autosave-status')
  await expect(status).toHaveAttribute('data-autosave-status', 'idle')
  await expect(status).toHaveText('Saved')

  const grid = page.getByTestId('editor-snap-grid')
  // Place a piece. The status should briefly read "Editing" while the
  // debounce window is open, then "Saved" once the PUT settles. We
  // assert the eventual state directly because the debounce window is
  // short enough that the intermediate frame is racy.
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(status).toHaveAttribute('data-autosave-status', 'saved', {
    timeout: 5000,
  })
  await expect(status).toHaveText('Saved')

  // The intercepted route saw at least one PUT against the right slug
  // with the placed-piece payload.
  expect(requestedSlugs.length).toBeGreaterThanOrEqual(1)
  expect(requestedSlugs[requestedSlugs.length - 1]).toBe(
    '/api/city/autosave-spec',
  )
  const lastBody = requestedBodies[requestedBodies.length - 1]
  expect(lastBody).toContain('"type":"straight"')
  expect(lastBody).toContain('"row":0')
  expect(lastBody).toContain('"col":0')

  // A second placement issues another PUT once the streak settles.
  const before = requestedSlugs.length
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(status).toHaveAttribute('data-autosave-status', 'saved', {
    timeout: 5000,
  })
  expect(requestedSlugs.length).toBeGreaterThan(before)
})

test('toolbar Drive CTA links to /<slug> and navigates on click (REQ-026)', async ({
  page,
}) => {
  // Intercept autosave PUTs so the editor opens cleanly without
  // requiring KV configured against the Playwright webServer.
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'drive-cta-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/drive-cta-spec/edit')
  expect(response?.status()).toBe(200)

  const palette = page.getByTestId('editor-palette')
  const driveCta = page.getByTestId('editor-drive-cta')

  // The Drive CTA lives inside the editor toolbar (REQ-026), not as a
  // separate page-level link.
  await expect(driveCta).toBeVisible()
  await expect(palette.getByTestId('editor-drive-cta')).toBeVisible()

  // The CTA points at the slug's drive view at /<slug>.
  await expect(driveCta).toHaveAttribute('href', '/drive-cta-spec')
  await expect(driveCta).toHaveAttribute('data-slug', 'drive-cta-spec')
  await expect(driveCta).toHaveText('Drive')

  // Clicking the Drive CTA navigates to /<slug>.
  await driveCta.click()
  await page.waitForURL('**/drive-cta-spec')
  expect(page.url()).toMatch(/\/drive-cta-spec$/)
})

test('autosave surfaces save failures via the status indicator (REQ-025)', async ({
  page,
}) => {
  // Force the autosave PUT to fail so the indicator can flip to error.
  // The route handler stays untouched; only the network response is
  // intercepted.
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'storage unavailable' }),
    })
  })

  const response = await page.goto('/autosave-spec/edit')
  expect(response?.status()).toBe(200)

  const status = page.getByTestId('editor-autosave-status')
  await expect(status).toHaveAttribute('data-autosave-status', 'idle')

  const grid = page.getByTestId('editor-snap-grid')
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(status).toHaveAttribute('data-autosave-status', 'error', {
    timeout: 5000,
  })
  await expect(status).toHaveText('Save failed')
})
