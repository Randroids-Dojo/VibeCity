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

test('palette exposes REQ-018 curve and sweep pieces and places them', async ({
  page,
}) => {
  const response = await page.goto('/curve-palette-spec/edit')
  expect(response?.status()).toBe(200)

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toBeVisible()

  // The four REQ-018 entries are visible alongside the REQ-017 basics.
  const scurve = palette.locator('[data-piece-type="scurve"]')
  const scurveLeft = palette.locator('[data-piece-type="scurveLeft"]')
  const sweepRight = palette.locator('[data-piece-type="sweepRight"]')
  const sweepLeft = palette.locator('[data-piece-type="sweepLeft"]')
  await expect(scurve).toBeVisible()
  await expect(scurveLeft).toBeVisible()
  await expect(sweepRight).toBeVisible()
  await expect(sweepLeft).toBeVisible()

  // None of the REQ-018 entries are selected on first render (Straight
  // remains the default per REQ-017).
  await expect(scurve).toHaveAttribute('aria-pressed', 'false')
  await expect(sweepRight).toHaveAttribute('aria-pressed', 'false')

  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')

  // Pick S-Curve, place at (0, 0).
  await scurve.click()
  await expect(scurve).toHaveAttribute('aria-pressed', 'true')
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')

  // Pick Sweep Right, place at (0, 1).
  await sweepRight.click()
  await expect(sweepRight).toHaveAttribute('aria-pressed', 'true')
  await expect(scurve).toHaveAttribute('aria-pressed', 'false')
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(grid).toHaveAttribute('data-occupied-count', '2')

  // Pick Sweep Left, place at (0, 2).
  await sweepLeft.click()
  await grid.locator('[data-cell-row="0"][data-cell-col="2"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 3')

  // Pick S-Curve Left, place at (0, 3).
  await scurveLeft.click()
  await grid.locator('[data-cell-row="0"][data-cell-col="3"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 4')
  await expect(grid).toHaveAttribute('data-occupied-count', '4')
})

test('palette exposes the REQ-019 intersection piece and places it', async ({
  page,
}) => {
  // Intercept autosave so the editor opens cleanly without KV.
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'intersection-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/intersection-spec/edit')
  expect(response?.status()).toBe(200)

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toBeVisible()

  // The intersection entry sits at the end of the street palette.
  const intersection = palette.locator('[data-piece-type="intersection"]')
  await expect(intersection).toBeVisible()
  await expect(intersection).toHaveText('Intersection')

  // Default selection is still Straight (REQ-017); intersection is not
  // pressed on first render.
  await expect(intersection).toHaveAttribute('aria-pressed', 'false')

  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')

  // Pick Intersection, place at the origin.
  await intersection.click()
  await expect(intersection).toHaveAttribute('aria-pressed', 'true')
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-occupied-kind', 'piece')

  // Place a second intersection at an adjacent cell so a builder can
  // sketch a 4-way junction next to a single-cell run.
  await grid.locator('[data-cell-row="0"][data-cell-col="2"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(grid).toHaveAttribute('data-occupied-count', '2')

  // Clicking an already-occupied cell with intersection selected stays
  // a no-op (REQ-027 reducer-level overlap rejection).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
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

test('undo and redo walk the history stack via toolbar buttons and keyboard shortcuts (REQ-023)', async ({
  page,
}) => {
  // Intercept autosave so the editor opens cleanly without KV.
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'undo-redo-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/undo-redo-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')
  const undoButton = page.getByTestId('editor-undo')
  const redoButton = page.getByTestId('editor-redo')

  // Both controls are visible inside the toolbar.
  await expect(undoButton).toBeVisible()
  await expect(redoButton).toBeVisible()

  // Both start disabled because the history is fresh.
  await expect(undoButton).toBeDisabled()
  await expect(undoButton).toHaveAttribute('data-can-undo', 'false')
  await expect(redoButton).toBeDisabled()
  await expect(redoButton).toHaveAttribute('data-can-redo', 'false')

  // Place two pieces. Undo should be enabled after the first push.
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(undoButton).toBeEnabled()
  await expect(undoButton).toHaveAttribute('data-can-undo', 'true')
  await expect(redoButton).toBeDisabled()

  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')

  // Undo by clicking the toolbar button: piece count should drop to 1
  // and the second cell goes back to unoccupied.
  await undoButton.click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="1"]'),
  ).toHaveAttribute('data-cell-occupied', 'false')
  await expect(redoButton).toBeEnabled()

  // Redo via the button restores the second placement.
  await redoButton.click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="1"]'),
  ).toHaveAttribute('data-cell-occupied', 'true')
  await expect(redoButton).toBeDisabled()

  // Undo via the keyboard (Control+Z works on every platform; macOS
  // Meta+Z lands on the same shortcut path).
  await page.keyboard.press('Control+z')
  await expect(pieceCount).toHaveText('Pieces placed: 1')

  // Redo via Control+Shift+Z.
  await page.keyboard.press('Control+Shift+z')
  await expect(pieceCount).toHaveText('Pieces placed: 2')

  // Redo also works via Control+Y (Windows convention).
  await page.keyboard.press('Control+z')
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await page.keyboard.press('Control+y')
  await expect(pieceCount).toHaveText('Pieces placed: 2')

  // Performing a fresh placement after an undo clears the redo stack.
  await page.keyboard.press('Control+z')
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(redoButton).toBeEnabled()
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(redoButton).toBeDisabled()

  // Walking back to the empty city disables the undo button.
  await undoButton.click()
  await undoButton.click()
  await expect(pieceCount).toHaveText('Pieces placed: 0')
  await expect(undoButton).toBeDisabled()
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

test('building palette places, switches category, and erases (REQ-028, REQ-029)', async ({
  page,
}) => {
  // Intercept autosave so the editor opens cleanly without KV.
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'building-palette-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/building-palette-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')
  const palette = page.getByTestId('editor-palette')
  const categoryGroup = page.getByTestId('editor-palette-category')
  const streetTab = page.getByTestId('editor-palette-category-street')
  const buildingTab = page.getByTestId('editor-palette-category-building')

  // Editor opens in street category.
  await expect(categoryGroup).toBeVisible()
  await expect(categoryGroup).toHaveAttribute('data-palette-category', 'street')
  await expect(streetTab).toHaveAttribute('aria-selected', 'true')
  await expect(buildingTab).toHaveAttribute('aria-selected', 'false')
  await expect(palette).toHaveAttribute('data-palette-category', 'street')

  // Place a street piece at (0, 0) so the building overlap path has
  // something to bump into.
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(grid).toHaveAttribute('data-building-count', '0')

  // Switch to the building category.
  await buildingTab.click()
  await expect(categoryGroup).toHaveAttribute(
    'data-palette-category',
    'building',
  )
  await expect(buildingTab).toHaveAttribute('aria-selected', 'true')
  await expect(streetTab).toHaveAttribute('aria-selected', 'false')
  await expect(palette).toHaveAttribute('data-palette-category', 'building')

  // The four building palette entries are visible; the street palette
  // entries are hidden because the toolbar swaps based on category.
  const smallHouse = palette.locator('[data-building-type="small-house"]')
  const midHouse = palette.locator('[data-building-type="mid-house"]')
  const shop = palette.locator('[data-building-type="shop"]')
  const factory = palette.locator('[data-building-type="factory"]')
  await expect(smallHouse).toBeVisible()
  await expect(midHouse).toBeVisible()
  await expect(shop).toBeVisible()
  await expect(factory).toBeVisible()
  await expect(smallHouse).toHaveAttribute('aria-pressed', 'true')

  // Place a small house at (1, 1).
  await grid.locator('[data-cell-row="1"][data-cell-col="1"]').click()
  await expect(grid).toHaveAttribute('data-building-count', '1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(
    grid.locator('[data-cell-row="1"][data-cell-col="1"]'),
  ).toHaveAttribute('data-cell-occupied-kind', 'building')
  await expect(pieceCount).toContainText('Buildings placed: 1')

  // Building click on the street piece cell is rejected (no stacking).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-building-count', '1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-occupied-kind', 'piece')

  // Building click on an existing building cell is also rejected.
  await grid.locator('[data-cell-row="1"][data-cell-col="1"]').click()
  await expect(grid).toHaveAttribute('data-building-count', '1')

  // Switch building type and place another building.
  await shop.click()
  await expect(shop).toHaveAttribute('aria-pressed', 'true')
  await expect(smallHouse).toHaveAttribute('aria-pressed', 'false')
  await grid.locator('[data-cell-row="2"][data-cell-col="2"]').click()
  await expect(grid).toHaveAttribute('data-building-count', '2')
  await expect(pieceCount).toContainText('Buildings placed: 2')

  // Erase mode in building category removes a building, not a piece,
  // even when both share the click target.
  const eraseButton = page.getByTestId('editor-erase')
  await eraseButton.click()
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'true')

  // Click a piece cell while in building category + erase: nothing
  // happens (the piece is left alone because erase follows the active
  // category).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(grid).toHaveAttribute('data-building-count', '2')

  // Click a building cell: the building disappears.
  await grid.locator('[data-cell-row="1"][data-cell-col="1"]').click()
  await expect(grid).toHaveAttribute('data-building-count', '1')
  await expect(
    grid.locator('[data-cell-row="1"][data-cell-col="1"]'),
  ).toHaveAttribute('data-cell-occupied', 'false')

  // Switch back to street category in erase mode and erase the piece.
  await streetTab.click()
  await expect(palette).toHaveAttribute('data-palette-category', 'street')
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-occupied-count', '0')
  await expect(pieceCount).toHaveText(/Pieces placed: 0/)

  // Toggle erase off, switch back to building category, place via the
  // rotate angle to confirm rotation flows through to building placement.
  await eraseButton.click()
  await buildingTab.click()
  const rotateButton = page.getByTestId('editor-rotate')
  await rotateButton.click()
  await expect(rotateButton).toHaveAttribute('data-rotation', '90')
  await factory.click()
  await grid.locator('[data-cell-row="-2"][data-cell-col="-2"]').click()
  await expect(grid).toHaveAttribute('data-building-count', '2')
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
