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
