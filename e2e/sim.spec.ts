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

  // Place a coal plant (no maintenance applied while paused).
  await page.getByTestId('editor-palette-category-power').click()
  const palette = page.getByTestId('editor-palette')
  await palette.locator('[data-power-tool="plant-coal"]').click()
  await page
    .locator(
      '[data-testid="editor-snap-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    .click()

  // Treasury still 20000 because no tick has fired (sim is paused).
  await expect(treasury).toHaveAttribute('data-sim-treasury', '20000')

  // Unpause to 4x; one tick at 4x = 62.5ms; plant maintenance is
  // 0.5/tick. After several ticks the treasury should drop visibly.
  await page.getByTestId('editor-sim-speed-4').click()
  // Wait long enough for at least 5 ticks to fire (~315ms at 4x).
  // After 10 ticks the treasury would be 20000 - 5 = 19995 (rounds
  // to 19995); using inequality is more flake-tolerant than equality.
  await expect
    .poll(
      async () => {
        const value = await treasury.getAttribute('data-sim-treasury')
        return Number.parseInt(value ?? '20000', 10)
      },
      { timeout: 4000 },
    )
    .toBeLessThan(20000)
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
