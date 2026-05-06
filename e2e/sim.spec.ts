import { expect, test } from '@playwright/test'

/**
 * REQ-080 unification + REQ-110 step 2: the editor IS the sim editor.
 *
 * The standalone `/<slug>/sim` route is preserved as a redirect to
 * `/<slug>/edit` for any external bookmarks; the canonical surface
 * for placing pieces, buildings, AND zones is the editor. These
 * tests cover the redirect and the editor's new sim capabilities
 * (speed buttons, zone tab, zone painting).
 */

test.beforeEach(async ({ page }) => {
  // Default-route the events POST so the sim engine's autonomous
  // flush does not pollute the playwright KV. Mirrors the editor
  // spec's autosave PUT default-interceptor pattern from F-010.
  await page.route('**/api/city/**/events', async (route, req) => {
    if (req.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-spec',
          appended: 0,
          nextCursor: 0,
        }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-spec',
          cursor: 0,
          events: [],
          nextCursor: 0,
          snapshot: null,
          snapshotCursor: 0,
        }),
      })
    }
  })
})

test('legacy /<slug>/sim redirects to /<slug>/edit', async ({ page }) => {
  const response = await page.goto('/sim-redirect-spec/sim')
  expect(response?.status()).toBe(200)
  // Final URL is the editor route after the redirect.
  expect(page.url()).toContain('/sim-redirect-spec/edit')
})

test('editor toolbar exposes the sim speed controls (Pause / 1x / 2x / 4x)', async ({
  page,
}) => {
  await page.goto('/sim-speed-spec/edit')
  const root = page.getByTestId('editor-sim-speed')
  await expect(root).toBeVisible()
  await expect(root).toHaveAttribute('data-sim-speed', '1')
  for (const speed of [0, 1, 2, 4]) {
    const btn = page.getByTestId(`editor-sim-speed-${speed}`)
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('data-sim-speed-button', String(speed))
  }
  // 1x is the default active speed.
  await expect(page.getByTestId('editor-sim-speed-1')).toHaveAttribute(
    'data-sim-speed-active',
    'true',
  )
})

test('editor: clicking Pause stops the tick', async ({ page }) => {
  await page.goto('/sim-pause-edit-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()
  await expect(page.getByTestId('editor-sim-speed-0')).toHaveAttribute(
    'data-sim-speed-active',
    'true',
  )
  await page.waitForTimeout(500)
  const tick = await page
    .getByTestId('editor-sim-readout')
    .getAttribute('data-sim-tick')
  expect(Number.parseInt(tick ?? '0', 10)).toBe(0)
})

test('editor: 1x speed advances the tick counter', async ({ page }) => {
  await page.goto('/sim-run-edit-spec/edit')
  await page.waitForTimeout(1500)
  const tick = await page
    .getByTestId('editor-sim-readout')
    .getAttribute('data-sim-tick')
  const value = Number.parseInt(tick ?? '0', 10)
  expect(value).toBeGreaterThanOrEqual(4)
  expect(value).toBeLessThan(20)
})

test('editor: switching to Zones tab exposes the zone palette + paints a zone', async ({
  page,
}) => {
  // Default-intercept the autosave PUT so a stray piece placement
  // attempt does not pollute the playwright KV (mirrors F-010).
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-zone-edit-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-zone-edit-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Switch to Zones tab.
  const zoneTab = page.getByTestId('editor-palette-category-zone')
  await expect(zoneTab).toBeVisible()
  await zoneTab.click()
  await expect(zoneTab).toHaveAttribute('aria-selected', 'true')

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toHaveAttribute('data-palette-category', 'zone')

  // Three zone buttons + the Erase tool button (which lives in the
  // toolbar's general controls block, not the palette swap).
  for (const kind of ['residential', 'commercial', 'industrial']) {
    await expect(palette.locator(`[data-zone-type="${kind}"]`)).toBeVisible()
  }

  // Residential is the default.
  await expect(palette.locator('[data-zone-type="residential"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Click the origin cell. The cell flips to zoned.
  const cell = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
  )
  await cell.click()
  await expect(cell).toHaveAttribute('data-cell-zoned', 'true')
  await expect(cell).toHaveAttribute('data-cell-zone-kind', 'residential')
  await expect(cell).toHaveAttribute('data-cell-zone-density', '0')
})

test('editor: Power tab exposes plant + line tools and paints a line', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-power-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-power-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Switch to Power tab.
  const powerTab = page.getByTestId('editor-palette-category-power')
  await expect(powerTab).toBeVisible()
  await powerTab.click()
  await expect(powerTab).toHaveAttribute('aria-selected', 'true')

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toHaveAttribute('data-palette-category', 'power')

  // All three power tools render.
  for (const tool of ['plant-coal', 'plant-solar', 'line']) {
    await expect(palette.locator(`[data-power-tool="${tool}"]`)).toBeVisible()
  }
  // Line is the default selected tool.
  await expect(palette.locator('[data-power-tool="line"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Click the origin cell to paint a line.
  const cell = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
  )
  await cell.click()
  // The power-line overlay rect appears for that cell.
  const lineOverlay = page.locator(
    '[data-testid="editor-power-line"][data-power-line-row="0"][data-power-line-col="0"]',
  )
  await expect(lineOverlay).toBeVisible()
})

test('editor: switch to coal plant and paint, then erase a power line', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-power-mix-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-power-mix-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-power').click()

  // Select coal plant.
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-power-tool="plant-coal"]').click()
  await expect(palette.locator('[data-power-tool="plant-coal"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Click cell (1, 1) to place a coal plant.
  const plantCell = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="1"][data-cell-col="1"]',
  )
  await plantCell.click()
  const plantOverlay = page.locator(
    '[data-testid="editor-power-plant"][data-power-plant-row="1"][data-power-plant-col="1"]',
  )
  await expect(plantOverlay).toBeVisible()
  await expect(plantOverlay).toHaveAttribute('data-power-plant-kind', 'coal')

  // Switch to line, paint a line at (2, 2).
  await palette.locator('[data-power-tool="line"]').click()
  const lineCell = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="2"][data-cell-col="2"]',
  )
  await lineCell.click()
  const lineOverlay = page.locator(
    '[data-testid="editor-power-line"][data-power-line-row="2"][data-power-line-col="2"]',
  )
  await expect(lineOverlay).toBeVisible()

  // Erase mode + click the line cell removes it.
  await page.keyboard.press('e')
  await expect(palette).toHaveAttribute('data-tool-mode', 'erase')
  await lineCell.click()
  await expect(lineOverlay).toHaveCount(0)
})

test('editor: day/night mood toggle flips active state and triggers autosave (REQ-088 follow-on)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-mood-toggle-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-mood-toggle-spec/edit')

  // Day is the default active mood.
  const dayBtn = page.getByTestId('editor-mood-day')
  const nightBtn = page.getByTestId('editor-mood-night')
  await expect(dayBtn).toHaveAttribute('data-mood-active', 'true')
  await expect(nightBtn).toHaveAttribute('data-mood-active', 'false')

  // Click Night, autosave indicator flips to pending then to saved.
  await nightBtn.click()
  await expect(nightBtn).toHaveAttribute('data-mood-active', 'true')
  await expect(dayBtn).toHaveAttribute('data-mood-active', 'false')
  // Autosave status indicator settles to a saved state after the
  // debounce + PUT round-trip lands; the toggle event triggered an
  // autosave because city.mood changed reference.
  const status = page.getByTestId('editor-autosave-status')
  await expect(status).toHaveAttribute('data-autosave-status', 'saved', {
    timeout: 5000,
  })

  // Click Day, status flips back to pending then saved.
  await dayBtn.click()
  await expect(dayBtn).toHaveAttribute('data-mood-active', 'true')
  await expect(nightBtn).toHaveAttribute('data-mood-active', 'false')
  await expect(status).toHaveAttribute('data-autosave-status', 'saved', {
    timeout: 5000,
  })
})

test('editor: residential zone growth bumps population readout (REQ-075)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-population-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-population-spec/edit')

  // Default sim speed = 1x, growth tick fires every 20 ticks (~5s).
  // To accelerate the test, swap to 4x so the first growth tick lands
  // in ~1.25s.
  await page.getByTestId('editor-sim-speed-4').click()

  // Switch to Zones, paint a residential cell at the origin.
  await page.getByTestId('editor-palette-category-zone').click()
  const cell = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
  )
  await cell.click()

  // Population starts at 0 because density 0 = 0 residents.
  const popReadout = page.getByTestId('editor-sim-population')
  await expect(popReadout).toHaveAttribute('data-sim-population', '0')

  // Wait for the first growth tick at 4x speed (250ms / 4 = 62.5ms per
  // tick, 20 ticks = 1.25s). Use 4s timeout to absorb CI flake.
  await expect(popReadout).toHaveAttribute('data-sim-population', '4', {
    timeout: 4000,
  })
})

test('editor: place plant + line + adjacent zone -> zone shows powered status (REQ-087)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-power-status-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-power-status-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Place a residential zone at (0, 2) first (no power yet -> unpowered).
  await page.getByTestId('editor-palette-category-zone').click()
  const zoneCell = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="2"]',
  )
  await zoneCell.click()
  // Read the overlay; status should be unpowered.
  const zoneOverlay = page.locator(
    '[data-testid="editor-zone-overlay"][data-zone-row="0"][data-zone-col="2"]',
  )
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-power-status',
    'unpowered',
  )

  // Switch to power, place a coal plant at (0, 0) and a line at (0, 1).
  await page.getByTestId('editor-palette-category-power').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-power-tool="plant-coal"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  await palette.locator('[data-power-tool="line"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="1"]',
    )
    .click()

  // The zone overlay's power status should now read 'powered' since
  // the zone at (0, 2) is 4-adjacent to the line at (0, 1) which is
  // connected to the plant at (0, 0).
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-power-status',
    'powered',
  )
})

test('editor: zone tab switches kind and erase tool removes a zone', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-zone-erase-edit-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-zone-erase-edit-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-zone').click()

  // Switch to commercial.
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-zone-type="commercial"]').click()
  await expect(palette.locator('[data-zone-type="commercial"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Paint cell (1, 1).
  const cell = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="1"][data-cell-col="1"]',
  )
  await cell.click()
  await expect(cell).toHaveAttribute('data-cell-zone-kind', 'commercial')

  // Switch to erase mode (the editor's existing erase tool flips the
  // click contract). Press E shortcut.
  await page.keyboard.press('e')
  await expect(page.getByTestId('editor-palette')).toHaveAttribute(
    'data-tool-mode',
    'erase',
  )
  await cell.click()
  await expect(cell).toHaveAttribute('data-cell-zoned', 'false')
})
