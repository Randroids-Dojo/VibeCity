import { expect, test } from '@playwright/test'

/**
 * Default autosave PUT interceptor for every editor spec. The editor's
 * autosave path (REQ-025) issues `PUT /api/city/<slug>` whenever the
 * tool reducer accepts a mutation. Without this fallback, any test
 * that does not register its own `page.route` for `/api/city/<slug>`
 * lets the PUT travel to whatever KV the playwright webServer points
 * at, polluting the global `city:index` and the per-slug version
 * history with synthetic test data. That is exactly what produced the
 * "rejection-flash-spec" leak which surfaced as a "Save failed" banner
 * in the live editor before the open-edit pivot landed (Q-008).
 *
 * Per playwright contract, handlers added later are evaluated first.
 * This `beforeEach` runs before each test body, so a test that
 * registers its own `page.route('**\/api/city/**', ...)` inside the
 * test takes precedence; this default only catches the PUTs that no
 * test explicitly handled. Read paths (`GET /api/city/<slug>` and the
 * `?v=<hash>` deep-link variant) are continued because the test
 * webServer still serves the empty city soft-fallback for those.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'e2e-default-intercept',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: 0,
      }),
    })
  })
})

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
  // REQ-110, REQ-111: editor grid mounts in iso mode by default so the
  // sim-as-primary surface reads as a SimCity-style 45deg dimetric
  // canvas rather than a flat top-down editor.
  await expect(grid).toHaveAttribute('data-view-mode', 'iso')

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

test('hover ghost renders piece-connector glyphs at the active rotation', async ({
  page,
}) => {
  const response = await page.goto('/playtest-city/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  const palette = page.getByTestId('editor-palette')
  const left90 = palette.locator('[data-piece-type="left90"]')
  const rotateButton = page.getByTestId('editor-rotate')

  // Pick left90 so glyph rendering has a known piece shape (cardinal
  // ports at N + W on rotation 0).
  await left90.click()
  await rotateButton.click()
  await rotateButton.click() // rotation now 180

  // Hover an empty cell. previewGlyphs should appear under that cell.
  await grid
    .locator('[data-cell-row="2"][data-cell-col="3"]')
    .hover({ force: true })

  const previewGlyphs = grid.locator('[data-testid="editor-preview-glyph"]')
  await expect(previewGlyphs).toHaveCount(2)

  // Hover-leave: glyphs disappear.
  await grid
    .locator('[data-cell-row="-7"][data-cell-col="-7"]')
    .hover({ force: true })
  // Cells far from the focused one still register a hover, so glyphs
  // remain rendered (just at a different cell). The contract is "ghost
  // glyphs follow the hover cell" not "glyphs vanish on any move."
  await expect(previewGlyphs).toHaveCount(2)
})

test('armed-piece preview tile reflects the active piece type and rotation', async ({
  page,
}) => {
  const response = await page.goto('/playtest-city/edit')
  expect(response?.status()).toBe(200)

  const palette = page.getByTestId('editor-palette')
  const preview = page.getByTestId('editor-armed-piece-preview')
  const rotateButton = page.getByTestId('editor-rotate')
  const left90 = palette.locator('[data-piece-type="left90"]')
  const hairpin = palette.locator('[data-piece-type="hairpin"]')

  // Initial state: straight at 0deg.
  await expect(preview).toHaveAttribute('data-armed-piece-type', 'straight')
  await expect(preview).toHaveAttribute('data-rotation', '0')

  // Street-only contract: preview unmounts in non-street categories.
  await page.getByTestId('editor-palette-category-building').click()
  await expect(preview).toHaveCount(0)
  await page.getByTestId('editor-palette-category-street').click()
  await expect(preview).toHaveCount(1)

  // Pick left90: tile updates to the new piece.
  await left90.click()
  await expect(preview).toHaveAttribute('data-armed-piece-type', 'left90')
  await expect(preview).toHaveAttribute('data-rotation', '0')

  // Cycle rotation via the Rotate button: tile updates.
  await rotateButton.click()
  await expect(preview).toHaveAttribute('data-rotation', '90')

  // Cycle rotation via piece retap (slice 1): tile keeps in lockstep.
  await left90.click()
  await expect(preview).toHaveAttribute('data-rotation', '180')

  // Switch to hairpin: tile renders the multi-cell shape (rotation
  // preserved per slice 1's contract).
  await hairpin.click()
  await expect(preview).toHaveAttribute('data-armed-piece-type', 'hairpin')
  await expect(preview).toHaveAttribute('data-rotation', '180')
})

test('clicking any piece-palette button while in erase mode auto-exits erase', async ({
  page,
}) => {
  const response = await page.goto('/playtest-city/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  const palette = page.getByTestId('editor-palette')
  const eraseButton = page.getByTestId('editor-erase')
  const straight = palette.locator('[data-piece-type="straight"]')
  const left90 = palette.locator('[data-piece-type="left90"]')

  // Toggle erase on, confirm.
  await eraseButton.click()
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'true')
  await expect(grid).toHaveAttribute('data-cursor-mode', 'erase')

  // Clicking a different piece tool exits erase and arms the new piece.
  await left90.click()
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'false')
  await expect(grid).toHaveAttribute('data-cursor-mode', 'place')
  await expect(left90).toHaveAttribute('aria-pressed', 'true')

  // Toggle erase on again, click the SAME piece tool that is already
  // armed; erase still exits (rotation cycles per slice 1, but the mode
  // is what we are asserting here).
  await eraseButton.click()
  await expect(grid).toHaveAttribute('data-cursor-mode', 'erase')
  await left90.click()
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'false')
  await expect(grid).toHaveAttribute('data-cursor-mode', 'place')

  // Switching palette categories does NOT exit erase: deliberate erase
  // across layers (street -> buildings -> back) is a real flow other
  // tests rely on. Erase exits only on piece-button clicks.
  await eraseButton.click()
  await expect(grid).toHaveAttribute('data-cursor-mode', 'erase')
  await page.getByTestId('editor-palette-category-building').click()
  await expect(grid).toHaveAttribute('data-cursor-mode', 'erase')

  // Clicking a building piece in the new category exits erase (same
  // rule as street pieces).
  const smallHouse = palette.locator('[data-building-type="small-house"]')
  await smallHouse.click()
  await expect(eraseButton).toHaveAttribute('aria-pressed', 'false')
  await expect(smallHouse).toHaveAttribute('aria-pressed', 'true')
  await expect(grid).toHaveAttribute('data-cursor-mode', 'place')
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
  await expect(driveCta).toHaveAttribute('href', '/drive-cta-spec/drive')
  await expect(driveCta).toHaveAttribute('data-slug', 'drive-cta-spec')
  await expect(driveCta).toHaveText('Drive')

  // Clicking the Drive CTA navigates to /<slug>/drive (REQ-110 slice B).
  await driveCta.click()
  await page.waitForURL('**/drive-cta-spec/drive')
  expect(page.url()).toMatch(/\/drive-cta-spec\/drive$/)
})

test('Drive CTA appends ?spawn= when viewport focuses a placed piece (REQ-110)', async ({
  page,
}) => {
  // Stub autosave so the editor opens without KV.
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'spawn-link-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/spawn-link-spec/edit')
  expect(response?.status()).toBe(200)

  const driveCta = page.getByTestId('editor-drive-cta')
  // Empty city, default viewport focuses (0, 0) which has no piece, so
  // the override is dropped and the CTA href has no query string.
  await expect(driveCta).toHaveAttribute('href', '/spawn-link-spec/drive')
  await expect(driveCta).toHaveAttribute('data-spawn-query', '')

  // Place a piece at the origin. The viewport still focuses (0, 0),
  // which is now a footprint cell, so the CTA href picks up the
  // override and the data-spawn-query attribute mirrors it.
  const grid = page.getByTestId('editor-snap-grid')
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(driveCta).toHaveAttribute('data-spawn-query', '?spawn=0,0')
  await expect(driveCta).toHaveAttribute(
    'href',
    '/spawn-link-spec/drive?spawn=0,0',
  )
})

test('editor pans to ?focus=row,col on initial load (REQ-110)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'focus-url-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  // No focus param: viewport stays at the default (panX = panY = 0,
  // zoom = 1) so cell (0, 0) sits at the visible center.
  const bare = await page.goto('/focus-url-spec')
  expect(bare?.status()).toBe(200)
  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toHaveAttribute('data-viewport-zoom', '1')
  await expect(grid).toHaveAttribute('data-viewport-pan-x', '0')
  await expect(grid).toHaveAttribute('data-viewport-pan-y', '0')
  await expect(grid).toHaveAttribute('data-viewport-default', 'true')

  // The bare load also keeps the focus-cell indicator hidden so the
  // default-framing case stays clean.
  await expect(
    page.getByTestId('editor-viewport-focus'),
  ).toHaveCount(0)

  // `?focus=0,3` pans east by 3 cells (3 * 32 = 96 grid pixels) and
  // leaves panY at 0. The viewport is no longer default.
  const focused = await page.goto('/focus-url-spec?focus=0,3')
  expect(focused?.status()).toBe(200)
  await expect(grid).toHaveAttribute('data-viewport-pan-x', '96')
  await expect(grid).toHaveAttribute('data-viewport-pan-y', '0')
  await expect(grid).toHaveAttribute('data-viewport-default', 'false')
  // The focus-cell indicator mounts in the toolbar and mirrors the
  // current viewportFocusCell, so the player sees where the camera
  // is centered without inspecting the URL.
  const focusLabel = page.getByTestId('editor-viewport-focus')
  await expect(focusLabel).toHaveAttribute('data-focus-row', '0')
  await expect(focusLabel).toHaveAttribute('data-focus-col', '3')
  await expect(focusLabel).toHaveText('Centered on (0, 3)')

  // Malformed focus values fall through silently (no 404, no
  // exception); the viewport stays at the default.
  const bad = await page.goto('/focus-url-spec?focus=not-a-cell')
  expect(bad?.status()).toBe(200)
  await expect(grid).toHaveAttribute('data-viewport-default', 'true')
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
  // REQ-110 vocabulary: the visible label of the `street` tab reads
  // "Transit" to match the GDD's taxonomy. The internal enum value
  // stays `street` to avoid a cross-file rename.
  await expect(streetTab).toHaveText('Transit')

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

test('palette exposes the REQ-061 arc45 and REQ-062 diagonal pieces and places them', async ({
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
        slug: 'corner-palette-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/corner-palette-spec/edit')
  expect(response?.status()).toBe(200)

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toBeVisible()

  // Both corner-connector entries are visible at the trailing edge of
  // the street palette.
  const arc45 = palette.locator('[data-piece-type="arc45"]')
  const diagonal = palette.locator('[data-piece-type="diagonal"]')
  await expect(arc45).toBeVisible()
  await expect(arc45).toHaveText('Arc 45')
  await expect(diagonal).toBeVisible()
  await expect(diagonal).toHaveText('Diagonal')

  // Default selection is still Straight (REQ-017); neither corner piece
  // is pressed on first render.
  await expect(arc45).toHaveAttribute('aria-pressed', 'false')
  await expect(diagonal).toHaveAttribute('aria-pressed', 'false')

  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')

  // Pick Arc 45, place at the origin.
  await arc45.click()
  await expect(arc45).toHaveAttribute('aria-pressed', 'true')
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '1')
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-occupied-kind', 'piece')

  // Switch to Diagonal, place at an adjacent cell.
  await diagonal.click()
  await expect(diagonal).toHaveAttribute('aria-pressed', 'true')
  await expect(arc45).toHaveAttribute('aria-pressed', 'false')
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(grid).toHaveAttribute('data-occupied-count', '2')

  // Clicking an occupied cell with diagonal selected stays a no-op
  // (REQ-027 reducer-level overlap rejection).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
})

test('palette exposes REQ-058 megaSweepRight / megaSweepLeft and resolves the 2x2 footprint', async ({
  page,
}) => {
  const response = await page.goto('/mega-sweep-spec/edit')
  expect(response?.status()).toBe(200)

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toBeVisible()

  const megaSweepRight = palette.locator('[data-piece-type="megaSweepRight"]')
  const megaSweepLeft = palette.locator('[data-piece-type="megaSweepLeft"]')
  await expect(megaSweepRight).toBeVisible()
  await expect(megaSweepRight).toHaveText('Mega Sweep Right')
  await expect(megaSweepLeft).toBeVisible()
  await expect(megaSweepLeft).toHaveText('Mega Sweep Left')

  // Default selection is still Straight (REQ-017); neither mega sweep
  // is pressed on first render.
  await expect(megaSweepRight).toHaveAttribute('aria-pressed', 'false')
  await expect(megaSweepLeft).toHaveAttribute('aria-pressed', 'false')

  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')

  // Pick Mega Sweep Right, place anchored at (1, 1). The canonical 2x2
  // footprint covers (0, 0), (0, 1), (1, 0), (1, 1) so the SVG should
  // mark all four cells occupied even though the click only landed on
  // the anchor.
  await megaSweepRight.click()
  await expect(megaSweepRight).toHaveAttribute('aria-pressed', 'true')
  await grid.locator('[data-cell-row="1"][data-cell-col="1"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '4')
  for (const [row, col] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ] as const) {
    await expect(
      grid.locator(`[data-cell-row="${row}"][data-cell-col="${col}"]`),
    ).toHaveAttribute('data-cell-occupied', 'true')
  }

  // A second mega sweep that would overlap any footprint cell is
  // rejected by the reducer; piece count and occupied count stay flat.
  await grid.locator('[data-cell-row="1"][data-cell-col="2"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '4')

  // Switch to Mega Sweep Left, place anchored at (5, 5). The canonical
  // 2x2 footprint covers (4, 5), (4, 6), (5, 5), (5, 6).
  await megaSweepLeft.click()
  await expect(megaSweepLeft).toHaveAttribute('aria-pressed', 'true')
  await expect(megaSweepRight).toHaveAttribute('aria-pressed', 'false')
  await grid.locator('[data-cell-row="5"][data-cell-col="5"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 2')
  await expect(grid).toHaveAttribute('data-occupied-count', '8')
  for (const [row, col] of [
    [4, 5],
    [4, 6],
    [5, 5],
    [5, 6],
  ] as const) {
    await expect(
      grid.locator(`[data-cell-row="${row}"][data-cell-col="${col}"]`),
    ).toHaveAttribute('data-cell-occupied', 'true')
  }

  // Erase mode toggled, click any footprint cell of the first mega
  // sweep (not the anchor) and the entire 2x2 piece comes out
  // atomically.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '4')
})

test('palette exposes REQ-060 hairpin and resolves the 2x3 footprint', async ({
  page,
}) => {
  const response = await page.goto('/hairpin-spec/edit')
  expect(response?.status()).toBe(200)

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toBeVisible()

  const hairpin = palette.locator('[data-piece-type="hairpin"]')
  await expect(hairpin).toBeVisible()
  await expect(hairpin).toHaveText('Hairpin')

  // Default selection is still Straight (REQ-017); the hairpin is not
  // pressed on first render.
  await expect(hairpin).toHaveAttribute('aria-pressed', 'false')

  const grid = page.getByTestId('editor-snap-grid')
  const pieceCount = page.getByTestId('editor-piece-count')

  // Pick Hairpin, place anchored at (1, 1). The canonical 2x3 footprint
  // covers (0, 1), (0, 2), (1, 1), (1, 2), (2, 1), (2, 2) so the SVG
  // should mark all six cells occupied even though the click only
  // landed on the anchor.
  await hairpin.click()
  await expect(hairpin).toHaveAttribute('aria-pressed', 'true')
  await grid.locator('[data-cell-row="1"][data-cell-col="1"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '6')
  for (const [row, col] of [
    [0, 1],
    [0, 2],
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2],
  ] as const) {
    await expect(
      grid.locator(`[data-cell-row="${row}"][data-cell-col="${col}"]`),
    ).toHaveAttribute('data-cell-occupied', 'true')
  }

  // A second hairpin that would overlap any footprint cell is rejected
  // by the reducer; piece count and occupied count stay flat.
  await grid.locator('[data-cell-row="1"][data-cell-col="2"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 1')
  await expect(grid).toHaveAttribute('data-occupied-count', '6')

  // Erase mode toggled, click any footprint cell of the hairpin (not
  // the anchor) and the entire 2x3 piece comes out atomically.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="2"][data-cell-col="2"]').click()
  await expect(pieceCount).toHaveText('Pieces placed: 0')
  await expect(grid).toHaveAttribute('data-occupied-count', '0')
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

test('hover preview ghost flips kind across place / erase and category', async ({
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
        slug: 'preview-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/preview-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()
  await expect(grid).toHaveAttribute('data-preview-kind', 'none')

  const ghost = page.getByTestId('editor-preview-ghost')
  await expect(ghost).toHaveCount(0)

  // Hover an empty cell in the default street + place mode. The ghost
  // appears in place-valid (street brown) state.
  const empty = grid.locator('[data-cell-row="0"][data-cell-col="0"]')
  await empty.hover()
  await expect(grid).toHaveAttribute('data-preview-kind', 'place-valid')
  await expect(grid).toHaveAttribute('data-preview-row', '0')
  await expect(grid).toHaveAttribute('data-preview-col', '0')
  await expect(ghost).toHaveCount(1)
  await expect(ghost).toHaveAttribute('data-preview-kind', 'place-valid')
  await expect(empty).toHaveAttribute('data-cell-previewed', 'true')

  // Place a piece, then hover it again. Now the same cell reads
  // place-invalid because the reducer would reject the next click.
  await empty.click()
  await empty.hover()
  await expect(grid).toHaveAttribute('data-preview-kind', 'place-invalid')
  await expect(ghost).toHaveAttribute('data-preview-kind', 'place-invalid')

  // Toggle erase mode. The pointer leaves the grid to click the
  // toolbar button so the hover state clears; re-hover the same cell
  // and it now reads erase-target because the cell holds the placed
  // piece.
  await page.getByTestId('editor-erase').click()
  await empty.hover()
  await expect(grid).toHaveAttribute('data-preview-kind', 'erase-target')
  await expect(ghost).toHaveAttribute('data-preview-kind', 'erase-target')

  // Hover an empty cell while still in erase mode: erase-empty (no-op).
  const otherEmpty = grid.locator('[data-cell-row="2"][data-cell-col="2"]')
  await otherEmpty.hover()
  await expect(grid).toHaveAttribute('data-preview-kind', 'erase-empty')
  await expect(ghost).toHaveAttribute('data-preview-kind', 'erase-empty')

  // Switch back to place mode and over to the building category. An
  // empty cell stays place-valid (the building reducer would accept).
  await page.getByTestId('editor-erase').click()
  await page.getByTestId('editor-palette-category-building').click()
  await otherEmpty.hover()
  await expect(grid).toHaveAttribute('data-preview-kind', 'place-valid')
  await expect(ghost).toHaveAttribute('data-preview-kind', 'place-valid')

  // The previously-placed piece cell now reads place-invalid in
  // building mode because place rejects on any occupied cell across
  // both layers (matches the placeBuilding reducer rule).
  await empty.hover()
  await expect(grid).toHaveAttribute('data-preview-kind', 'place-invalid')
  await expect(ghost).toHaveAttribute('data-preview-kind', 'place-invalid')

  // Mouse out of the grid: the ghost disappears.
  await page.mouse.move(0, 0)
  await expect(grid).toHaveAttribute('data-preview-kind', 'none')
  await expect(ghost).toHaveCount(0)
})

test('multi-cell footprint preview ghost reveals full piece reach (REQ-059)', async ({
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
        slug: 'multi-cell-preview-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/multi-cell-preview-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()
  const ghost = page.getByTestId('editor-preview-ghost')

  // Default piece is straight (single cell). Hover to confirm a single
  // ghost cell renders.
  const anchor = grid.locator('[data-cell-row="2"][data-cell-col="2"]')
  await anchor.hover()
  await expect(ghost).toHaveCount(1)
  await expect(grid).toHaveAttribute('data-preview-cell-count', '1')

  // Pick the multi-cell mega sweep right piece. Hover the same cell.
  // The ghost expands to four cells covering the canonical 2x2
  // footprint at rotation 0: (1,1), (1,2), (2,1), (2,2).
  await page.locator('[data-piece-type="megaSweepRight"]').click()
  await anchor.hover()
  await expect(ghost).toHaveCount(4)
  await expect(grid).toHaveAttribute('data-preview-cell-count', '4')

  const ghostKinds = await ghost.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-preview-kind')),
  )
  expect(ghostKinds.every((kind) => kind === 'place-valid')).toBe(true)

  // The anchor cell carries data-preview-anchor='true' and matches the
  // SVG-level data-preview-row / data-preview-col mirrors.
  const anchorGhost = ghost.filter({ hasText: '' }).first()
  await expect(anchorGhost).toHaveAttribute('data-preview-anchor', 'true')
  await expect(grid).toHaveAttribute('data-preview-row', '2')
  await expect(grid).toHaveAttribute('data-preview-col', '2')

  // Place the mega sweep, then hover the same anchor cell again. Now
  // every ghost cell flips to place-invalid because the candidate
  // footprint would collide with the placed piece.
  await anchor.click()
  await anchor.hover()
  await expect(ghost).toHaveCount(4)
  const collidingKinds = await ghost.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-preview-kind')),
  )
  expect(collidingKinds.every((kind) => kind === 'place-invalid')).toBe(true)

  // Switch to erase mode. Hover any cell of the placed mega sweep
  // footprint and every cell of the matched piece lights up as
  // erase-target so the author sees the full piece the click would
  // remove. Hover an off-anchor cell of the footprint to confirm the
  // expanded preview path.
  await page.getByTestId('editor-erase').click()
  const offAnchor = grid.locator('[data-cell-row="1"][data-cell-col="1"]')
  await offAnchor.hover()
  await expect(ghost).toHaveCount(4)
  await expect(grid).toHaveAttribute('data-preview-cell-count', '4')
  const eraseKinds = await ghost.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-preview-kind')),
  )
  expect(eraseKinds.every((kind) => kind === 'erase-target')).toBe(true)
})

test('pan / zoom viewport (REQ-024) responds to wheel and reset button', async ({
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
        slug: 'viewport-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/viewport-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Default viewport: zoom 1, pan 0, viewport-default flag true.
  await expect(grid).toHaveAttribute('data-viewport-zoom', '1')
  await expect(grid).toHaveAttribute('data-viewport-pan-x', '0')
  await expect(grid).toHaveAttribute('data-viewport-pan-y', '0')
  await expect(grid).toHaveAttribute('data-viewport-default', 'true')

  // Reset button is disabled when the viewport is at the default state.
  const resetButton = page.getByTestId('editor-reset-viewport')
  await expect(resetButton).toBeVisible()
  await expect(resetButton).toBeDisabled()
  await expect(resetButton).toHaveAttribute('data-viewport-default', 'true')

  // Wheel up over the grid zooms in.
  const box = await grid.boundingBox()
  if (!box) throw new Error('grid bounding box missing')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -200)
  await expect(grid).not.toHaveAttribute('data-viewport-zoom', '1')
  await expect(grid).toHaveAttribute('data-viewport-default', 'false')
  await expect(resetButton).toBeEnabled()

  // Reset View restores the default viewport.
  await resetButton.click()
  await expect(grid).toHaveAttribute('data-viewport-zoom', '1')
  await expect(grid).toHaveAttribute('data-viewport-pan-x', '0')
  await expect(grid).toHaveAttribute('data-viewport-pan-y', '0')
  await expect(grid).toHaveAttribute('data-viewport-default', 'true')
  await expect(resetButton).toBeDisabled()
})

test('connector glyphs render at piece edges and reflect compass directions (REQ-019, REQ-063)', async ({
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
        slug: 'connector-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/connector-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Empty city: zero connector glyphs.
  await expect(grid).toHaveAttribute('data-connector-count', '0')
  await expect(page.getByTestId('editor-connector-glyph')).toHaveCount(0)

  // Place a straight piece at the origin: two cardinal connectors (S, N).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-connector-count', '2')
  await expect(page.getByTestId('editor-connector-glyph')).toHaveCount(2)
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="0"][data-connector-dir="S"]',
    ),
  ).toHaveCount(1)
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="0"][data-connector-dir="N"]',
    ),
  ).toHaveCount(1)

  // Switch to intersection: four cardinal connectors (N, E, S, W).
  await page.locator('[data-piece-type="intersection"]').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="2"]').click()
  await expect(grid).toHaveAttribute('data-connector-count', '6')
  await expect(page.getByTestId('editor-connector-glyph')).toHaveCount(6)
  for (const dir of ['N', 'E', 'S', 'W']) {
    await expect(
      grid.locator(
        `[data-testid="editor-connector-glyph"][data-connector-piece="1"][data-connector-dir="${dir}"]`,
      ),
    ).toHaveCount(1)
  }

  // Switch to diagonal: two corner connectors (SW, NE).
  await page.locator('[data-piece-type="diagonal"]').click()
  await grid.locator('[data-cell-row="2"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-connector-count', '8')
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="2"][data-connector-kind="corner"]',
    ),
  ).toHaveCount(2)
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="2"][data-connector-dir="SW"]',
    ),
  ).toHaveCount(1)
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="2"][data-connector-dir="NE"]',
    ),
  ).toHaveCount(1)

  // Erasing the straight piece removes its two glyphs and leaves the
  // intersection (4) and diagonal (2) glyphs visible.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-connector-count', '6')
  await expect(page.getByTestId('editor-connector-glyph')).toHaveCount(6)
})

test('connector match status flips matched / open as adjacent pieces line up (REQ-019, REQ-063)', async ({
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
        slug: 'connector-match-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/connector-match-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Empty city: zero matched.
  await expect(grid).toHaveAttribute('data-connector-matched', '0')

  // Place one straight: both ends are open (no neighbors).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-connector-count', '2')
  await expect(grid).toHaveAttribute('data-connector-matched', '0')
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="0"][data-connector-status="open"]',
    ),
  ).toHaveCount(2)

  // Place a second straight directly south. The shared edge flips to
  // matched on both pieces; the outer edges remain open.
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-connector-count', '4')
  await expect(grid).toHaveAttribute('data-connector-matched', '2')
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="0"][data-connector-dir="S"][data-connector-status="matched"]',
    ),
  ).toHaveCount(1)
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="1"][data-connector-dir="N"][data-connector-status="matched"]',
    ),
  ).toHaveCount(1)
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="0"][data-connector-dir="N"][data-connector-status="open"]',
    ),
  ).toHaveCount(1)
  await expect(
    grid.locator(
      '[data-testid="editor-connector-glyph"][data-connector-piece="1"][data-connector-dir="S"][data-connector-status="open"]',
    ),
  ).toHaveCount(1)

  // The toolbar piece-count readout mirrors the matched / total
  // counter so a builder reads the link state without inspecting the
  // glyph data attributes.
  const pieceCount = page.getByTestId('editor-piece-count')
  await expect(pieceCount).toHaveAttribute('data-connector-count', '4')
  await expect(pieceCount).toHaveAttribute('data-connector-matched', '2')
  const matchReadout = page.getByTestId('editor-connector-match-readout')
  await expect(matchReadout).toBeVisible()
  await expect(matchReadout).toHaveText('Connectors matched: 2 of 4')

  // Erase the second straight: matched count drops back to zero.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-connector-count', '2')
  await expect(grid).toHaveAttribute('data-connector-matched', '0')
})

test('track path readout reflects main-segment piece count and closed-loop status (REQ-019, REQ-064)', async ({
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
        slug: 'track-path-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/track-path-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Empty city: the readout does not mount.
  await expect(page.getByTestId('editor-track-path-readout')).toHaveCount(0)

  // Place a single straight: 1-piece open main path.
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  const readout = page.getByTestId('editor-track-path-readout')
  await expect(readout).toBeVisible()
  await expect(readout).toHaveAttribute('data-main-segment-length', '1')
  await expect(readout).toHaveAttribute('data-total-pieces', '1')
  await expect(readout).toHaveAttribute('data-main-segment-closes-loop', 'false')
  await expect(readout).toHaveAttribute('data-segment-count', '1')
  await expect(readout).toHaveText(
    'Pieces in main path: 1 of 1 / Main path: open chain',
  )

  // Place a second straight directly south: the main segment grows to 2.
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await expect(readout).toHaveAttribute('data-main-segment-length', '2')
  await expect(readout).toHaveAttribute('data-total-pieces', '2')
  await expect(readout).toHaveAttribute('data-main-segment-closes-loop', 'false')
  await expect(readout).toHaveAttribute('data-segment-count', '1')

  // Place a disconnected straight at (5, 0): a new component spawns,
  // total pieces grows but the main segment stays at 2.
  await grid.locator('[data-cell-row="5"][data-cell-col="0"]').click()
  await expect(readout).toHaveAttribute('data-main-segment-length', '2')
  await expect(readout).toHaveAttribute('data-total-pieces', '3')
  await expect(readout).toHaveAttribute('data-segment-count', '2')
  await expect(readout).toHaveText(
    'Pieces in main path: 2 of 3 / Main path: open chain',
  )

  // Erase the disconnected piece: total drops back to 2 and segments
  // collapse back to 1.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="5"][data-cell-col="0"]').click()
  await expect(readout).toHaveAttribute('data-total-pieces', '2')
  await expect(readout).toHaveAttribute('data-segment-count', '1')

  // Erase both remaining pieces: the readout unmounts when the city
  // has zero pieces.
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(page.getByTestId('editor-track-path-readout')).toHaveCount(0)
})

test('unmatched-ports readout reflects open connector port count (REQ-019, REQ-064)', async ({
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
        slug: 'unmatched-ports-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/unmatched-ports-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Empty city: the readout does not mount because there are no ports.
  await expect(
    page.getByTestId('editor-unmatched-ports-readout'),
  ).toHaveCount(0)

  // Place a single straight: 2 unmatched ports (north and south of the
  // straight have no neighbor pieces).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  const readout = page.getByTestId('editor-unmatched-ports-readout')
  await expect(readout).toBeVisible()
  await expect(readout).toHaveAttribute('data-unmatched-port-count', '2')
  await expect(readout).toHaveText('Open ends: 2')

  // Place a second straight directly south so the south port of (0,0)
  // matches the north port of (1,0). Two of the four ports across the
  // chain are now matched, leaving 2 unmatched (the chain's two ends).
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await expect(readout).toHaveAttribute('data-unmatched-port-count', '2')
  await expect(readout).toHaveText('Open ends: 2')

  // Place a disconnected straight at (5, 0): two new unmatched ports
  // are introduced because the new piece does not connect to anything.
  await grid.locator('[data-cell-row="5"][data-cell-col="0"]').click()
  await expect(readout).toHaveAttribute('data-unmatched-port-count', '4')
  await expect(readout).toHaveText('Open ends: 4')

  // Erase the disconnected piece: the count drops back to 2.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="5"][data-cell-col="0"]').click()
  await expect(readout).toHaveAttribute('data-unmatched-port-count', '2')

  // Erase both remaining pieces: the readout unmounts when no ports
  // remain.
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(
    page.getByTestId('editor-unmatched-ports-readout'),
  ).toHaveCount(0)
})

test('per-cell open-end highlight surfaces every cell with an unmatched port (REQ-019, REQ-064)', async ({
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
        slug: 'open-end-highlight-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/open-end-highlight-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Empty city: no cell has an open port and no overlay rect mounts.
  await expect(grid).toHaveAttribute('data-open-end-cell-count', '0')
  await expect(page.getByTestId('editor-open-end-cell')).toHaveCount(0)
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-has-open-port', 'false')

  // Place a single straight at (0, 0): both N and S ports are open and
  // anchor on the same cell so exactly one overlay mounts.
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-open-end-cell-count', '1')
  await expect(page.getByTestId('editor-open-end-cell')).toHaveCount(1)
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-has-open-port', 'true')
  await expect(
    grid.locator('[data-open-end-row="0"][data-open-end-col="0"]'),
  ).toBeVisible()

  // Place a second straight directly south. The shared edge matches so
  // only the chain ends remain open: one on (0, 0) and one on (1, 0).
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-open-end-cell-count', '2')
  await expect(page.getByTestId('editor-open-end-cell')).toHaveCount(2)
  await expect(
    grid.locator('[data-cell-row="0"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-has-open-port', 'true')
  await expect(
    grid.locator('[data-cell-row="1"][data-cell-col="0"]'),
  ).toHaveAttribute('data-cell-has-open-port', 'true')

  // Erase both pieces: every cell drops back to false and zero overlays.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-open-end-cell-count', '0')
  await expect(page.getByTestId('editor-open-end-cell')).toHaveCount(0)
})

test('rejection flash overlays a click that the place / erase reducer rejected (REQ-027)', async ({
  page,
}) => {
  const response = await page.goto('/rejection-flash-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // No flash on a fresh page: the data-rejection-kind attribute reads
  // 'none' and the SMIL overlay node does not exist.
  await expect(grid).toHaveAttribute('data-rejection-kind', 'none')
  await expect(page.getByTestId('editor-rejection-flash')).toHaveCount(0)

  // Place a straight piece at (0, 0) so the next click on the same
  // cell will be rejected by the placePiece reducer.
  const originCell = grid.locator(
    '[data-cell-row="0"][data-cell-col="0"]',
  )
  await originCell.click()
  await expect(originCell).toHaveAttribute('data-cell-occupied', 'true')

  // Click the now-occupied cell. The reducer rejects so the rejection
  // flash overlay mounts with kind=place-occupied and the click cell.
  await originCell.click()
  const flash = page.getByTestId('editor-rejection-flash')
  await expect(flash).toHaveCount(1)
  await expect(flash).toHaveAttribute('data-rejection-kind', 'place-occupied')
  await expect(flash).toHaveAttribute('data-rejection-row', '0')
  await expect(flash).toHaveAttribute('data-rejection-col', '0')
  await expect(grid).toHaveAttribute('data-rejection-kind', 'place-occupied')
  const firstFlashId = await flash.getAttribute('data-rejection-id')
  expect(firstFlashId).not.toBeNull()
  expect(Number.parseInt(firstFlashId ?? '0', 10)).toBeGreaterThan(0)

  // Click the same cell again before the flash clears. The keyed
  // rejection id must change so React remounts the overlay and the
  // SMIL animation restarts cleanly.
  await originCell.click()
  await expect(flash).toHaveAttribute('data-rejection-kind', 'place-occupied')
  const secondFlashId = await flash.getAttribute('data-rejection-id')
  expect(secondFlashId).not.toBe(firstFlashId)

  // Toggle to erase mode and click an empty cell: erase-empty rejection
  // surfaces the same overlay with the matching kind. This walks the
  // erase tool's no-op contract that REQ-027 names alongside the place
  // tool's overlap rejection.
  await page.getByTestId('editor-erase').click()
  const emptyCell = grid.locator('[data-cell-row="3"][data-cell-col="3"]')
  await expect(emptyCell).toHaveAttribute('data-cell-occupied', 'false')
  await emptyCell.click()
  await expect(flash).toHaveAttribute('data-rejection-kind', 'erase-empty')
  await expect(flash).toHaveAttribute('data-rejection-row', '3')
  await expect(flash).toHaveAttribute('data-rejection-col', '3')
  await expect(grid).toHaveAttribute('data-rejection-kind', 'erase-empty')

  // The flash auto-clears after the SMIL animation finishes. Wait
  // longer than REJECTION_FLASH_DURATION_MS (350ms) and confirm the
  // overlay node unmounts so the data-rejection-kind drops back to
  // 'none'.
  await page.waitForTimeout(500)
  await expect(grid).toHaveAttribute('data-rejection-kind', 'none')
  await expect(flash).toHaveCount(0)
})

test('build / drive transition curtain is wired but dormant by default (REQ-055)', async ({
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
        slug: 'curtain-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/curtain-spec/edit')
  expect(response?.status()).toBe(200)

  // The Drive CTA mounts the curtain as a hidden descendant; with no
  // navigation in flight, useLinkStatus().pending is false so the
  // curtain renders nothing. The testid asserts the dormant contract.
  const driveCta = page.getByTestId('editor-drive-cta')
  await expect(driveCta).toBeVisible()
  await expect(
    page.getByTestId('scene-transition-curtain-drive'),
  ).toHaveCount(0)
})

test('per-port direction arrows mark which side of every open-end cell still needs a neighbor (REQ-019, REQ-064)', async ({
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
        slug: 'open-end-arrow-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/open-end-arrow-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Empty city: no unmatched ports, no arrows.
  await expect(grid).toHaveAttribute('data-open-end-arrow-count', '0')
  await expect(page.getByTestId('editor-open-end-arrow')).toHaveCount(0)

  // Place a single straight at (0, 0): both N and S ports are open
  // so the arrow count flips to 2 and one arrow points N, the other S.
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-open-end-arrow-count', '2')
  await expect(page.getByTestId('editor-open-end-arrow')).toHaveCount(2)
  await expect(
    grid.locator(
      '[data-open-end-arrow-row="0"][data-open-end-arrow-col="0"][data-open-end-arrow-dir="N"]',
    ),
  ).toHaveCount(1)
  await expect(
    grid.locator(
      '[data-open-end-arrow-row="0"][data-open-end-arrow-col="0"][data-open-end-arrow-dir="S"]',
    ),
  ).toHaveCount(1)

  // Place a second straight directly south. The shared edge matches so
  // the inner ports drop out, leaving only the chain's outer N (on row
  // 0) and outer S (on row 1) ports open.
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-open-end-arrow-count', '2')
  await expect(page.getByTestId('editor-open-end-arrow')).toHaveCount(2)
  await expect(
    grid.locator(
      '[data-open-end-arrow-row="0"][data-open-end-arrow-col="0"][data-open-end-arrow-dir="N"]',
    ),
  ).toHaveCount(1)
  await expect(
    grid.locator(
      '[data-open-end-arrow-row="1"][data-open-end-arrow-col="0"][data-open-end-arrow-dir="S"]',
    ),
  ).toHaveCount(1)
  // The previously-open S arrow on row 0 disappeared because its port
  // now matches the row 1 piece's N port.
  await expect(
    grid.locator(
      '[data-open-end-arrow-row="0"][data-open-end-arrow-col="0"][data-open-end-arrow-dir="S"]',
    ),
  ).toHaveCount(0)

  // Erase both pieces: every arrow drops back to zero.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="1"][data-cell-col="0"]').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-open-end-arrow-count', '0')
  await expect(page.getByTestId('editor-open-end-arrow')).toHaveCount(0)
})

test('spawn-anchor marker reveals where the car will spawn and which way it faces (REQ-019, REQ-036)', async ({
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
        slug: 'spawn-marker-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/spawn-marker-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Empty city: no spawn marker because the drive scene never mounts
  // the car on an empty grid.
  await expect(grid).toHaveAttribute('data-spawn-marker', 'absent')
  await expect(page.getByTestId('editor-spawn-marker')).toHaveCount(0)
  await expect(page.getByTestId('editor-spawn-marker-ring')).toHaveCount(0)
  await expect(page.getByTestId('editor-spawn-marker-arrow')).toHaveCount(0)

  // Place one straight at (0, 0) at the default rotation. The marker
  // pins the spawn-anchor cell and faces N (rotation 0).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await expect(grid).toHaveAttribute('data-spawn-marker', 'present')
  await expect(grid).toHaveAttribute('data-spawn-marker-row', '0')
  await expect(grid).toHaveAttribute('data-spawn-marker-col', '0')
  await expect(grid).toHaveAttribute('data-spawn-marker-direction', 'N')
  await expect(grid).toHaveAttribute('data-spawn-marker-rotation', '0')
  await expect(page.getByTestId('editor-spawn-marker')).toHaveCount(1)
  await expect(page.getByTestId('editor-spawn-marker-arrow')).toHaveAttribute(
    'data-spawn-marker-direction',
    'N',
  )

  // Place a second piece at (0, 1). The marker stays pinned to the
  // first placed piece because the drive-scene spawn anchor reads
  // pieces[0], not the most recently placed piece.
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(grid).toHaveAttribute('data-spawn-marker-row', '0')
  await expect(grid).toHaveAttribute('data-spawn-marker-col', '0')
  await expect(grid).toHaveAttribute('data-spawn-marker-direction', 'N')

  // Erase both pieces: the marker drops to absent.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(grid).toHaveAttribute('data-spawn-marker', 'absent')
  await expect(page.getByTestId('editor-spawn-marker')).toHaveCount(0)

  // Switch back to place mode (the erase button toggles), rotate to 90
  // (E), place a piece. The marker now reads E.
  const eraseButton = page.getByTestId('editor-erase')
  await eraseButton.click()
  await expect(eraseButton).toHaveAttribute('data-tool-mode', 'place')
  const rotateButton = page.getByTestId('editor-rotate')
  await rotateButton.click()
  await expect(rotateButton).toHaveAttribute('data-rotation', '90')
  await grid.locator('[data-cell-row="2"][data-cell-col="-1"]').click()
  await expect(grid).toHaveAttribute('data-spawn-marker-row', '2')
  await expect(grid).toHaveAttribute('data-spawn-marker-col', '-1')
  await expect(grid).toHaveAttribute('data-spawn-marker-direction', 'E')
  await expect(grid).toHaveAttribute('data-spawn-marker-rotation', '90')
})

test('spawn-anchor toolbar readout reads where the car will spawn (REQ-019, REQ-036)', async ({
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
        slug: 'spawn-anchor-readout-spec',
        versionHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        updatedAt: Date.now(),
      }),
    })
  })

  const response = await page.goto('/spawn-anchor-readout-spec/edit')
  expect(response?.status()).toBe(200)

  const grid = page.getByTestId('editor-snap-grid')
  await expect(grid).toBeVisible()

  // Empty city: no readout because the drive scene never mounts the car
  // on an empty grid.
  await expect(page.getByTestId('editor-spawn-anchor-readout')).toHaveCount(0)

  // Place one straight at (0, 0) at default rotation 0 (North).
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  const readout = page.getByTestId('editor-spawn-anchor-readout')
  await expect(readout).toHaveCount(1)
  await expect(readout).toHaveText('Spawn: (0, 0) facing North')
  await expect(readout).toHaveAttribute('data-spawn-anchor-row', '0')
  await expect(readout).toHaveAttribute('data-spawn-anchor-col', '0')
  await expect(readout).toHaveAttribute('data-spawn-anchor-direction', 'N')

  // Place a second piece at (0, 1): readout stays pinned to pieces[0].
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(readout).toHaveText('Spawn: (0, 0) facing North')

  // Erase both pieces: the readout unmounts.
  await page.getByTestId('editor-erase').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="0"]').click()
  await grid.locator('[data-cell-row="0"][data-cell-col="1"]').click()
  await expect(page.getByTestId('editor-spawn-anchor-readout')).toHaveCount(0)

  // Switch to place mode, rotate to 90 (East), place at a non-origin
  // cell with negative col.
  const eraseButton = page.getByTestId('editor-erase')
  await eraseButton.click()
  await expect(eraseButton).toHaveAttribute('data-tool-mode', 'place')
  const rotateButton = page.getByTestId('editor-rotate')
  await rotateButton.click()
  await expect(rotateButton).toHaveAttribute('data-rotation', '90')
  await grid.locator('[data-cell-row="2"][data-cell-col="-1"]').click()
  await expect(readout).toHaveText('Spawn: (2, -1) facing East')
  await expect(readout).toHaveAttribute('data-spawn-anchor-row', '2')
  await expect(readout).toHaveAttribute('data-spawn-anchor-col', '-1')
  await expect(readout).toHaveAttribute('data-spawn-anchor-direction', 'E')
})

test('editor route sets the per-slug document title (REQ-007)', async ({
  page,
}) => {
  const response = await page.goto('/title-spec-city/edit')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Edit title-spec-city | VibeCity')
})

test('editor toolbar copy-build-URL button copies the canonical edit URL (REQ-007, REQ-026)', async ({
  browser,
  baseURL,
}) => {
  // Grant clipboard read / write permissions on a fresh context so the
  // playwright headless browser does not refuse the
  // navigator.clipboard.writeText call. Mirrors the drive HUD share-copy
  // spec pattern; the secure-context check passes against the dev
  // server's localhost origin once the permission is granted on the
  // page origin.
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  try {
    const page = await context.newPage()
    const response = await page.goto('/copy-build-spec/edit')
    expect(response?.status()).toBe(200)

    const palette = page.getByTestId('editor-palette')
    await expect(palette).toHaveAttribute('data-copy-build-status', 'idle')

    const button = page.getByTestId('editor-copy-build-url')
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('data-copy-status', 'idle')
    await expect(button).toHaveText('Copy build URL')
    await expect(button).toHaveAttribute(
      'aria-label',
      'Copy build URL for copy-build-spec',
    )

    await button.click()

    await expect(button).toHaveText('Copied!')
    await expect(button).toHaveAttribute('data-copy-status', 'copied')
    await expect(palette).toHaveAttribute('data-copy-build-status', 'copied')
    await expect(button).toHaveAttribute(
      'aria-label',
      'Copied build URL for copy-build-spec',
    )

    // REQ-110 slice B: the canonical editor URL is now the bare slug
    // (the editor lives at `/<slug>`; drive moved to `/<slug>/drive`).
    // We read the clipboard back via the page's navigator.clipboard so
    // the assertion exercises the same surface the click handler wrote.
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    )
    const expectedOrigin =
      baseURL ?? page.url().replace(/\/copy-build-spec.*/, '')
    expect(clipboardText).toBe(
      `${expectedOrigin.replace(/\/$/, '')}/copy-build-spec`,
    )

    // After SHARE_COPY_RESET_DELAY_MS (1600 ms) the button resets to idle
    // on both the button label and the toolbar mirror attribute.
    await expect(button).toHaveText('Copy build URL', { timeout: 4000 })
    await expect(button).toHaveAttribute('data-copy-status', 'idle')
    await expect(palette).toHaveAttribute('data-copy-build-status', 'idle')
  } finally {
    await context.close()
  }
})
