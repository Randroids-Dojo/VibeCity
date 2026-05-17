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

test('legacy /<slug>/sim redirects to /<slug> (REQ-110 slice B)', async ({ page }) => {
  const response = await page.goto('/sim-redirect-spec/sim')
  expect(response?.status()).toBe(200)
  // Final URL is the bare-slug sim view after the redirect.
  expect(page.url()).toMatch(/\/sim-redirect-spec(?:[?#].*)?$/)
})

test('sim view: bare-slug route exposes data-view="sim" discriminator (REQ-110 scaffold)', async ({
  page,
}) => {
  // The canonical sim view at /<slug> stamps the page <main> with
  // data-view="sim" / data-route="sim" so e2e (and the future
  // sim / drive view toggle for REQ-114) has a stable hook to assert
  // identity, independent of which client component renders below.
  await page.goto('/sim-view-marker-spec')
  const main = page.locator('main[data-view="sim"]')
  await expect(main).toBeVisible()
  await expect(main).toHaveAttribute('data-route', 'sim')
})

test('sim view: legacy /<slug>/sim redirect lands on the data-view="sim" page', async ({
  page,
}) => {
  // Confirms the redirect target is the canonical sim view (not a
  // 200-but-wrong-page), pairing the URL check above with a DOM
  // identity check.
  await page.goto('/sim-view-marker-redirect-spec/sim')
  const main = page.locator('main[data-view="sim"]')
  await expect(main).toBeVisible()
})

test('sim view: rotate buttons surface iso camera rotation (REQ-111)', async ({
  page,
}) => {
  await page.goto('/sim-rotate-buttons-spec')
  const ccw = page.getByTestId('editor-rotate-iso-ccw')
  const cw = page.getByTestId('editor-rotate-iso-cw')
  const grid = page.locator('[data-viewport-rotation]')
  await expect(ccw).toBeVisible()
  await expect(cw).toBeVisible()
  await expect(grid).toHaveAttribute('data-viewport-rotation', '0')
  await cw.click()
  await expect(grid).toHaveAttribute('data-viewport-rotation', '90')
  await cw.click()
  await expect(grid).toHaveAttribute('data-viewport-rotation', '180')
  await ccw.click()
  await expect(grid).toHaveAttribute('data-viewport-rotation', '90')
  await ccw.click()
  await ccw.click()
  await expect(grid).toHaveAttribute('data-viewport-rotation', '270')
})

test('sim view: REQ-113 controls panel is visible by default at /<slug> (speed selector, treasury, demand bars, tax sliders)', async ({
  page,
}) => {
  await page.goto('/sim-controls-panel-spec')
  // Speed selector (Pause / 1x / 2x / 4x) per REQ-113.
  await expect(page.getByTestId('editor-sim-speed')).toBeVisible()
  for (const speed of [0, 1, 2, 4]) {
    await expect(page.getByTestId(`editor-sim-speed-${speed}`)).toBeVisible()
  }
  // Treasury readout per REQ-113.
  await expect(page.getByTestId('editor-sim-treasury')).toBeVisible()
  // Demand bars (R / C / I) per REQ-113.
  for (const kind of ['residential', 'commercial', 'industrial']) {
    await expect(page.getByTestId(`editor-sim-demand-${kind}`)).toBeVisible()
  }
  // Job slots and pollution readouts surface the REQ-082 jobs total
  // and the REQ-089 coal pollution signal.
  await expect(page.getByTestId('editor-sim-jobs')).toBeVisible()
  await expect(page.getByTestId('editor-sim-pollution')).toBeVisible()
  // Tax sliders (R / C / I) per REQ-113.
  for (const kind of ['residential', 'commercial', 'industrial']) {
    await expect(page.getByTestId(`editor-sim-tax-${kind}`)).toBeVisible()
    await expect(
      page.getByTestId(`editor-sim-tax-${kind}-up`),
    ).toBeVisible()
    await expect(
      page.getByTestId(`editor-sim-tax-${kind}-down`),
    ).toBeVisible()
  }
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

test('editor: city-age Day counter reads Day 1 at session start (mass-appeal slice 5)', async ({
  page,
}) => {
  await page.goto('/sim-day-counter-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()
  const dayReadout = page.getByTestId('editor-sim-day')
  await expect(dayReadout).toBeVisible()
  await expect(dayReadout).toHaveAttribute('data-sim-day', '1')
  await expect(dayReadout).toHaveText('Day 1')
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

test('editor: coal plant renders a pollution overlay on its four adjacent cells (REQ-089)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-pollution-overlay-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-pollution-overlay-spec/edit')

  // Before placement: no pollution overlays on the empty city.
  await expect(page.getByTestId('editor-pollution-cell')).toHaveCount(0)

  // Place a coal plant at (3, 3). The pollution map populates on the
  // next sim tick (refreshPowerPollution runs inside applyTick), so
  // the test leaves the sim at the default 1x speed and lets the
  // overlay appear naturally rather than racing it.
  await page.getByTestId('editor-palette-category-power').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-power-tool="plant-coal"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="3"][data-cell-col="3"]',
    )
    .click()

  // Four overlay cells appear (4 orthogonal neighbors) once the sim
  // ticks the pollution refresh through.
  await expect(page.getByTestId('editor-pollution-cell')).toHaveCount(4, {
    timeout: 10000,
  })
  for (const [r, c] of [
    [2, 3],
    [4, 3],
    [3, 2],
    [3, 4],
  ]) {
    await expect(
      page.locator(
        `[data-testid="editor-pollution-cell"][data-pollution-row="${r}"][data-pollution-col="${c}"]`,
      ),
    ).toBeVisible()
  }

  // The plant's own cell carries no pollution overlay (emit pattern
  // is orthogonal-adjacent only).
  await expect(
    page.locator(
      '[data-testid="editor-pollution-cell"][data-pollution-row="3"][data-pollution-col="3"]',
    ),
  ).toHaveCount(0)
})

test('editor: zone cell exposes a hover tooltip with kind and density', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-cell-tooltip-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-cell-tooltip-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Empty cell has no tooltip.
  await expect(
    page.locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="2"][data-cell-col="2"] title',
    ),
  ).toHaveCount(0)

  // Paint a residential zone at (2, 2). The cell's <title> now reads
  // the kind + density so a hover reveals the cell's state without
  // dom inspection.
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="2"][data-cell-col="2"]',
    )
    .click()
  const titleSel = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="2"][data-cell-col="2"] title',
  )
  await expect(titleSel).toHaveCount(1)
  await expect(titleSel).toHaveText(/residential density \d/)
  await expect(titleSel).toHaveText(/\(2, 2\)/)

  // Infrastructure tooltip: place a coal plant at (5, 5). The cell's
  // tooltip surfaces the kind so a hover reveals what is there.
  await page.getByTestId('editor-palette-category-power').click()
  await page
    .getByTestId('editor-palette')
    .locator('[data-power-tool="plant-coal"]')
    .click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="5"][data-cell-col="5"]',
    )
    .click()
  const plantTitle = page.locator(
    '[data-testid="editor-snap-grid"] rect[data-cell-row="5"][data-cell-col="5"] title',
  )
  await expect(plantTitle).toHaveCount(1)
  await expect(plantTitle).toHaveText(/coal plant/)
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

test('editor: treasury starts at 20000 and decreases as power infrastructure is placed (REQ-095)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-treasury-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-treasury-spec/edit')
  // Pause so the per-tick maintenance does not run while we set up.
  await page.getByTestId('editor-sim-speed-0').click()

  const treasury = page.getByTestId('editor-sim-treasury')
  await expect(treasury).toHaveAttribute('data-sim-treasury', '20000')

  // Place a coal plant (one-time build cost = 4000 deducted on placement).
  await page.getByTestId('editor-palette-category-power').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-power-tool="plant-coal"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()

  // Build cost (REQ-095 slice 2): 20000 - 4000 = 16000.
  await expect(treasury).toHaveAttribute('data-sim-treasury', '16000')

  // Unpause to 4x; per-tick plant maintenance is 0.5. After several
  // ticks the treasury should drop visibly below the 16000 build-cost
  // baseline.
  await page.getByTestId('editor-sim-speed-4').click()
  await expect
    .poll(
      async () => {
        const value = await treasury.getAttribute('data-sim-treasury')
        return Number.parseInt(value ?? '16000', 10)
      },
      { timeout: 4000 },
    )
    .toBeLessThan(16000)
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

test('editor: zone-growth-blocked diagnostic flips when power gate activates', async ({
  page,
}) => {
  // REQ-081 / REQ-090 / REQ-100 diagnostic. A composite
  // `data-zone-growth-blocked` attribute mirrors the three per-cell
  // gates so the editor surfaces WHY a sub-cap zone is or is not
  // advancing. With no power infrastructure, the power gate is
  // inactive and the cell reads `false` (not blocked). Placing a
  // plant + line far from the zone activates the gate without
  // covering the cell, flipping the readout to `true`.
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-growth-blocked-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-growth-blocked-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Paint a residential zone at (0, 5).
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="5"]',
    )
    .click()
  const zoneOverlay = page.locator(
    '[data-testid="editor-zone-overlay"][data-zone-row="0"][data-zone-col="5"]',
  )
  // No power infrastructure yet: gate inactive, cell not blocked.
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-growth-blocked',
    'false',
  )
  await expect(zoneOverlay).toHaveAttribute('data-zone-power-blocked', 'false')

  // Place a coal plant far from (0, 5). The power gate activates,
  // and because (0, 5) is not 4-adjacent to the plant, the cell now
  // reads as power-blocked and growth-blocked.
  await page.getByTestId('editor-palette-category-power').click()
  await page.getByTestId('editor-palette').locator('[data-power-tool="plant-coal"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()

  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-power-blocked',
    'true',
  )
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-growth-blocked',
    'true',
  )
  // Confirm the flip is caused ONLY by the power gate: the water
  // gate is still inactive (no sources, no pipes) and the services
  // gate is still inactive (no service buildings). Both per-gate
  // attributes stay `false` while the composite reads `true`.
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-water-blocked',
    'false',
  )
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-services-blocked',
    'false',
  )
  // Visible payoff: the orange dashed growth-blocked stroke now
  // overrides the base power-status stroke so the player sees WHICH
  // cells are stalled rather than only the data-attribute mirror.
  await expect(zoneOverlay).toHaveAttribute('stroke', '#d68a3a')
  await expect(zoneOverlay).toHaveAttribute('stroke-dasharray', '2 2')
})

test('editor: zone coverage count climbs as services are placed nearby (REQ-101)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-services-coverage-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-services-coverage-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Paint a residential zone at origin.
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  const zoneOverlay = page.locator(
    '[data-testid="editor-zone-overlay"][data-zone-row="0"][data-zone-col="0"]',
  )
  // No services placed; coverage count = 0.
  await expect(zoneOverlay).toHaveAttribute('data-zone-coverage-count', '0')

  // Place a police station at (1, 0). Manhattan distance 1, well within
  // police radius 6 -> coverage count flips to 1.
  await page.getByTestId('editor-palette-category-services').click()
  // Police is the default selected service.
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="1"][data-cell-col="0"]',
    )
    .click()
  await expect(zoneOverlay).toHaveAttribute('data-zone-coverage-count', '1')

  // Add a hospital at (2, 0). Manhattan distance 2, hospital radius 8.
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-service-tool="hospital"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="2"][data-cell-col="0"]',
    )
    .click()
  await expect(zoneOverlay).toHaveAttribute('data-zone-coverage-count', '2')
})

test('editor: Services tab exposes 5 tools and paints a hospital (REQ-100)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-services-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-services-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Switch to Services.
  const servicesTab = page.getByTestId('editor-palette-category-services')
  await expect(servicesTab).toBeVisible()
  await servicesTab.click()
  await expect(servicesTab).toHaveAttribute('aria-selected', 'true')

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toHaveAttribute('data-palette-category', 'services')

  // All 5 service tools render.
  for (const kind of [
    'police-station',
    'fire-station',
    'hospital',
    'school',
    'garbage-depot',
  ]) {
    await expect(palette.locator(`[data-service-tool="${kind}"]`)).toBeVisible()
  }
  // Police is the default selected tool.
  await expect(
    palette.locator('[data-service-tool="police-station"]'),
  ).toHaveAttribute('aria-pressed', 'true')

  // Switch to hospital, paint at (1, 1).
  await palette.locator('[data-service-tool="hospital"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="1"][data-cell-col="1"]',
    )
    .click()
  const hospitalOverlay = page.locator(
    '[data-testid="editor-service-building"][data-service-row="1"][data-service-col="1"]',
  )
  await expect(hospitalOverlay).toBeVisible()
  await expect(hospitalOverlay).toHaveAttribute('data-service-kind', 'hospital')
})

test('editor: Water tab exposes 4 tools and paints a water tower + pipe (REQ-090)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-water-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-water-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Switch to Water.
  const waterTab = page.getByTestId('editor-palette-category-water')
  await expect(waterTab).toBeVisible()
  await waterTab.click()
  await expect(waterTab).toHaveAttribute('aria-selected', 'true')

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toHaveAttribute('data-palette-category', 'water')

  // All 4 water tools render.
  for (const tool of [
    'source-water-tower',
    'source-pump-station',
    'pipe-water',
    'pipe-sewage',
  ]) {
    await expect(palette.locator(`[data-water-tool="${tool}"]`)).toBeVisible()
  }
  // Water pipe is the default.
  await expect(palette.locator('[data-water-tool="pipe-water"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Switch to water tower, paint at (0, 0).
  await palette.locator('[data-water-tool="source-water-tower"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  const sourceOverlay = page.locator(
    '[data-testid="editor-water-source"][data-water-source-row="0"][data-water-source-col="0"]',
  )
  await expect(sourceOverlay).toBeVisible()
  await expect(sourceOverlay).toHaveAttribute(
    'data-water-source-kind',
    'water-tower',
  )

  // Switch to water pipe, paint at (0, 1).
  await palette.locator('[data-water-tool="pipe-water"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="1"]',
    )
    .click()
  const pipeOverlay = page.locator(
    '[data-testid="editor-water-pipe"][data-water-pipe-row="0"][data-water-pipe-col="1"]',
  )
  await expect(pipeOverlay).toBeVisible()
  await expect(pipeOverlay).toHaveAttribute('data-water-pipe-kind', 'water')

  // Switch to sewage pipe, paint at (1, 0).
  await palette.locator('[data-water-tool="pipe-sewage"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="1"][data-cell-col="0"]',
    )
    .click()
  const sewageOverlay = page.locator(
    '[data-testid="editor-water-pipe"][data-water-pipe-row="1"][data-water-pipe-col="0"]',
  )
  await expect(sewageOverlay).toBeVisible()
  await expect(sewageOverlay).toHaveAttribute('data-water-pipe-kind', 'sewage')
})

test('editor: Water palette includes a sewage-treatment tool that paints a plant overlay (REQ-092)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-sewage-plant-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-sewage-plant-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  await page.getByTestId('editor-palette-category-water').click()
  const palette = page.getByTestId('editor-palette')
  await expect(
    palette.locator('[data-water-tool="source-sewage-treatment"]'),
  ).toBeVisible()

  await palette.locator('[data-water-tool="source-sewage-treatment"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="2"][data-cell-col="3"]',
    )
    .click()

  const plantOverlay = page.locator(
    '[data-testid="editor-sewage-treatment-plant"][data-sewage-plant-row="2"][data-sewage-plant-col="3"]',
  )
  await expect(plantOverlay).toBeVisible()
})

test('editor: Disasters tab spawns a fire and renders an overlay (REQ-105)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-disasters-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-disasters-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  const tab = page.getByTestId('editor-palette-category-disaster')
  await expect(tab).toBeVisible()
  await tab.click()

  const palette = page.getByTestId('editor-palette')
  await expect(palette).toHaveAttribute('data-palette-category', 'disaster')

  for (const tool of ['fire', 'flood', 'tornado', 'earthquake', 'monster']) {
    await expect(
      palette.locator(`[data-disaster-tool="${tool}"]`),
    ).toBeVisible()
  }
  await expect(
    palette.locator('[data-disaster-tool="fire"]'),
  ).toHaveAttribute('aria-pressed', 'true')

  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="1"][data-cell-col="2"]',
    )
    .click()

  const overlay = page.locator(
    '[data-testid="editor-disaster-overlay"][data-disaster-row="1"][data-disaster-col="2"]',
  )
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveAttribute('data-disaster-kind', 'fire')
})

test('editor: R/C/I demand readouts show signed deltas (REQ-082)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-demand-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-demand-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Empty city: all three readouts at 0.
  for (const kind of ['residential', 'commercial', 'industrial']) {
    await expect(
      page.getByTestId(`editor-sim-demand-${kind}`),
    ).toHaveAttribute('data-sim-demand', '0')
  }

  // Place an industrial zone (4 jobs at density 1, but density grows
  // from 0). Pre-growth density 0 = 0 jobs.
  await page.getByTestId('editor-palette-category-zone').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-zone-type="industrial"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()

  // Tick 20 to grow to density 1 (4 industrial jobs).
  await page.getByTestId('editor-sim-speed-4').click()
  await expect
    .poll(
      async () => {
        const value = await page
          .getByTestId('editor-sim-demand-residential')
          .getAttribute('data-sim-demand')
        return Number.parseInt(value ?? '0', 10)
      },
      { timeout: 6000 },
    )
    .toBeGreaterThan(0)
})

test('editor: residential tax HUD slider adjusts the per-tick income (REQ-095)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-tax-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-tax-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  const residentialReadout = page.getByTestId('editor-sim-tax-residential')
  await expect(residentialReadout).toHaveAttribute('data-sim-tax-rate', '0.07')

  // Bump residential tax rate up by 1pp.
  await page.getByTestId('editor-sim-tax-residential-up').click()
  await expect(residentialReadout).toHaveAttribute('data-sim-tax-rate', '0.08')

  // Bump back down 2pp; clamped at 0.06.
  await page.getByTestId('editor-sim-tax-residential-down').click()
  await page.getByTestId('editor-sim-tax-residential-down').click()
  await expect(residentialReadout).toHaveAttribute('data-sim-tax-rate', '0.06')
})

test('editor: bankruptcy reset-budget button restores treasury to 20000 (REQ-095)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-reset-budget-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-reset-budget-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Six coal plants drives treasury to -4000 immediately.
  await page.getByTestId('editor-palette-category-power').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-power-tool="plant-coal"]').click()
  for (let row = 0; row < 6; row++) {
    await page
      .locator(
        `[data-testid="editor-snap-grid"] rect[data-cell-row="${row}"][data-cell-col="0"]`,
      )
      .click()
  }

  // Tick once to set the bankruptcy counter so the warning span +
  // reset buttons mount.
  await page.getByTestId('editor-sim-speed-4').click()
  const warning = page.getByTestId('editor-sim-bankruptcy-warning')
  await expect(warning).toBeVisible({ timeout: 4000 })

  await page.getByTestId('editor-sim-speed-0').click()

  await page.getByTestId('editor-sim-reset-budget').click()
  const treasury = page.getByTestId('editor-sim-treasury')
  await expect(treasury).toHaveAttribute('data-sim-treasury', '20000')
  // Warning span unmounts because counter is back at 0.
  await expect(warning).not.toBeVisible()
})

test('editor: bankruptcy warning fires once treasury drops below 0 (REQ-095)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-bankruptcy-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-bankruptcy-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Place six coal plants ($24,000 of build cost vs $20,000 starter
  // treasury). Treasury goes to -4000 immediately.
  await page.getByTestId('editor-palette-category-power').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-power-tool="plant-coal"]').click()
  for (let row = 0; row < 6; row++) {
    await page
      .locator(
        `[data-testid="editor-snap-grid"] rect[data-cell-row="${row}"][data-cell-col="0"]`,
      )
      .click()
  }

  const treasury = page.getByTestId('editor-sim-treasury')
  await expect(treasury).toHaveAttribute('data-sim-treasury', '-4000')

  // Resume at 4x; the first tick that fires while treasury is negative
  // increments the bankruptcy counter and the warning surfaces.
  await page.getByTestId('editor-sim-speed-4').click()
  const warning = page.getByTestId('editor-sim-bankruptcy-warning')
  await expect(warning).toBeVisible({ timeout: 4000 })
})

test('editor: city happiness HUD drops below 100 when populated cells go unmanaged (REQ-092)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-happiness-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-happiness-spec/edit')

  const happiness = page.getByTestId('editor-sim-happiness')
  await expect(happiness).toBeVisible()
  await expect(happiness).toHaveAttribute('data-sim-happiness', '100')

  // Pause for deterministic placement, then paint a residential zone.
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()

  // Resume at 4x so the first growth tick fires fast.
  await page.getByTestId('editor-sim-speed-4').click()
  // Wait for happiness to drop below 100 (residents accumulate waste
  // because no treatment plant exists).
  await expect
    .poll(
      async () =>
        Number(
          (await happiness.getAttribute('data-sim-happiness')) ?? '100',
        ),
      { timeout: 10000 },
    )
    .toBeLessThan(100)
})

test('editor: growth-stalled indicator appears once happiness drops to GROWTH_HAPPINESS_THRESHOLD (REQ-081)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-stall-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-stall-spec/edit')

  // Indicator absent on a fresh city (happiness=100, well above 50).
  await expect(page.getByTestId('editor-sim-growth-stalled')).toHaveCount(0)

  // Pause, paint a residential cell, then run at 4x. Waste + missing
  // services drag happiness down past 50 within a few seconds.
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  await page.getByTestId('editor-sim-speed-4').click()

  await expect(page.getByTestId('editor-sim-growth-stalled')).toBeVisible({
    timeout: 12000,
  })
})

test('editor: fire-risk readout surfaces uncovered industrial cells and clears when a fire-station is placed (REQ-105 + REQ-100 follow-on)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-fire-risk-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-fire-risk-spec/edit')

  // Indicator absent when there is no industrial zone.
  await expect(page.getByTestId('editor-sim-fire-risk')).toHaveCount(0)

  // Pause + paint an industrial zone at (0, 0).
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-zone').click()
  await page.locator('[data-zone-type="industrial"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()

  // Run at 4x so the first growth tick fires fast (industrial
  // density 0 -> 1 means it counts as uncovered industrial).
  await page.getByTestId('editor-sim-speed-4').click()

  const fireRisk = page.getByTestId('editor-sim-fire-risk')
  await expect(fireRisk).toBeVisible({ timeout: 8000 })
  await expect(fireRisk).toHaveAttribute('data-sim-fire-risk', '1')

  // Pause, place a fire-station within coverage radius.
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-services').click()
  await page.locator('[data-service-tool="fire-station"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="1"]',
    )
    .click()

  // Indicator should disappear (the only industrial cell is now
  // covered).
  await expect(page.getByTestId('editor-sim-fire-risk')).toHaveCount(0)
})

test('editor: abandoned-cells HUD readout surfaces freshly-declined residential cells (REQ-079 visualization)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-abandoned-hud-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-abandoned-hud-spec/edit')

  // Indicator absent on a fresh city.
  await expect(page.getByTestId('editor-sim-abandoned')).toHaveCount(0)

  // Pause, paint a residential cell, drive residential tax up to
  // 50% so post-growth happiness lands deep in the miserable band
  // (100 - 0 waste - 20 coverage - 80 tax = 0). The first growth
  // tick brings the cell to density 1 + residents=4, and the
  // following growth tick reads the now-miserable happiness and
  // declines the cell back to density 0; the population entry
  // persists at residents=0 so the abandoned-cells readout mounts.
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  // Drive tax up by 43 clicks (0.07 -> 0.50 at 0.01/click).
  const taxUp = page.getByTestId('editor-sim-tax-residential-up')
  for (let i = 0; i < 43; i++) await taxUp.click()
  await expect(page.getByTestId('editor-sim-tax-residential')).toHaveAttribute(
    'data-sim-tax-rate',
    '0.5',
  )
  await page.getByTestId('editor-sim-speed-4').click()

  await expect(page.getByTestId('editor-sim-abandoned')).toBeVisible({
    timeout: 12000,
  })
  await expect(page.getByTestId('editor-sim-abandoned')).toHaveAttribute(
    'data-sim-abandoned',
    '1',
  )
})

test('editor: onboarding hint appears on a fresh city and dismisses after the first zone is placed (mass-appeal slice 4)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-onboarding-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-onboarding-spec/edit')

  // Hint visible on a fresh empty city.
  await expect(page.getByTestId('editor-onboarding-hint')).toBeVisible()

  // Pause + paint a residential zone.
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()

  // Hint dismisses once the city has at least one zone.
  await expect(page.getByTestId('editor-onboarding-hint')).toHaveCount(0)
})

test('editor: population milestone toast fires when residents cross a threshold (mass-appeal slice)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-milestone-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-milestone-spec/edit')

  // Toast absent on a fresh city.
  await expect(page.getByTestId('editor-sim-milestone')).toHaveCount(0)

  // Pause + paint a residential. Run at 4x; the first growth tick
  // brings totalPopulation from 0 to 4, which crosses the smallest
  // milestone and fires the toast.
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  await page.getByTestId('editor-sim-speed-4').click()

  await expect(page.getByTestId('editor-sim-milestone')).toBeVisible({
    timeout: 8000,
  })
  await expect(page.getByTestId('editor-sim-milestone')).toHaveAttribute(
    'data-sim-milestone',
    '4',
  )
})

test('editor: industrial cell carries data-zone-fire-risk="true" when uncovered, "false" once a fire-station is in range (REQ-105 + REQ-100 follow-on)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-fire-risk-overlay-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-fire-risk-overlay-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  await page.getByTestId('editor-palette-category-zone').click()
  await page.locator('[data-zone-type="industrial"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  await page.getByTestId('editor-sim-speed-4').click()

  // Wait for the first growth tick (density 0 -> 1, the cell becomes
  // fire-risk-eligible) and assert the overlay flag flips to true.
  const overlay = page.locator(
    '[data-testid="editor-zone-overlay"][data-zone-row="0"][data-zone-col="0"]',
  )
  await expect(overlay).toHaveAttribute('data-zone-fire-risk', 'true', {
    timeout: 8000,
  })

  // Place a fire-station within radius and assert the flag flips.
  await page.getByTestId('editor-sim-speed-0').click()
  await page.getByTestId('editor-palette-category-services').click()
  await page.locator('[data-service-tool="fire-station"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="1"]',
    )
    .click()
  await expect(overlay).toHaveAttribute('data-zone-fire-risk', 'false')
})

test('editor: zone sewage status flips to drained when wired to a treatment plant (REQ-092)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-sewage-status-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-sewage-status-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Paint residential at (0, 2).
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="2"]',
    )
    .click()
  const zoneOverlay = page.locator(
    '[data-testid="editor-zone-overlay"][data-zone-row="0"][data-zone-col="2"]',
  )
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-sewage-status',
    'unmanaged',
  )

  // Place a sewage treatment plant at (0, 0) and a sewage pipe at (0, 1).
  await page.getByTestId('editor-palette-category-water').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-water-tool="source-sewage-treatment"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  await palette.locator('[data-water-tool="pipe-sewage"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="1"]',
    )
    .click()

  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-sewage-status',
    'drained',
  )
})

test('editor: zone water status flips to served when wired to a water source (REQ-093)', async ({
  page,
}) => {
  await page.route('**/api/city/**', async (route, req) => {
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-water-status-spec',
          versionHash: '0'.repeat(64),
          updatedAt: 0,
        }),
      })
    } else {
      await route.fallback()
    }
  })

  await page.goto('/sim-water-status-spec/edit')
  await page.getByTestId('editor-sim-speed-0').click()

  // Paint residential at (0, 2).
  await page.getByTestId('editor-palette-category-zone').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="2"]',
    )
    .click()
  const zoneOverlay = page.locator(
    '[data-testid="editor-zone-overlay"][data-zone-row="0"][data-zone-col="2"]',
  )
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-water-status',
    'unserved',
  )

  // Place a water tower at (0, 0) and a water pipe at (0, 1).
  await page.getByTestId('editor-palette-category-water').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-water-tool="source-water-tower"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()
  await palette.locator('[data-water-tool="pipe-water"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="1"]',
    )
    .click()

  // Zone at (0, 2) is 4-adjacent to the pipe at (0, 1) connected to
  // the tower at (0, 0); status flips to served.
  await expect(zoneOverlay).toHaveAttribute(
    'data-zone-water-status',
    'served',
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
