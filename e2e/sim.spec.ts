import { expect, test } from '@playwright/test'

/**
 * REQ-110 + REQ-070..074 substrate slice 5 of 5: sim view scaffold.
 *
 * Verifies the new route at `/<slug>/sim` mounts the SimViewClient,
 * renders the speed-control buttons and the tick / sim-time readout,
 * and exposes a Drive CTA back to `/<slug>`. The Playwright
 * webServer runs `next start` without KV configured, so the events
 * route returns the empty fallback and the hook starts from
 * EMPTY_ENGINE_RUNTIME; the speed buttons + tick advance still work
 * because the local sim runs without server reconciliation.
 */
test.describe('REQ-110 sim view scaffold', () => {
  test('mounts the sim view at /<slug>/sim with speed buttons and Drive CTA', async ({
    page,
  }) => {
    // Default-route the events POST so the hook's autonomous flush
    // does not pollute the playwright KV (mirrors the editor spec
    // pattern from F-010).
    await page.route('**/api/city/**/events', async (route, req) => {
      if (req.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            slug: 'sim-scaffold-spec',
            appended: 0,
            nextCursor: 0,
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            slug: 'sim-scaffold-spec',
            cursor: 0,
            events: [],
            nextCursor: 0,
            snapshot: null,
            snapshotCursor: 0,
          }),
        })
      }
    })

    const response = await page.goto('/sim-scaffold-spec/sim')
    expect(response?.status()).toBe(200)

    const root = page.getByTestId('sim-view')
    await expect(root).toBeVisible()
    // Initial state mirrors EMPTY_ENGINE_RUNTIME.
    await expect(root).toHaveAttribute('data-sim-tick', '0')
    await expect(root).toHaveAttribute('data-sim-speed', '1')
    await expect(root).toHaveAttribute('data-sim-time-ms', '0')
    await expect(root).toHaveAttribute('data-sim-server-cursor', '0')

    // The four speed buttons are present.
    for (const speed of [0, 1, 2, 4]) {
      const btn = page.getByTestId(`sim-speed-${speed}`)
      await expect(btn).toBeVisible()
      await expect(btn).toHaveAttribute('data-sim-speed-button', String(speed))
    }
    // 1x is the default active speed.
    await expect(page.getByTestId('sim-speed-1')).toHaveAttribute(
      'data-sim-speed-active',
      'true',
    )
    await expect(page.getByTestId('sim-speed-0')).toHaveAttribute(
      'data-sim-speed-active',
      'false',
    )

    // Drive CTA points back to the slug drive view.
    const driveCta = page.getByTestId('sim-drive-cta')
    await expect(driveCta).toBeVisible()
    await expect(driveCta).toHaveAttribute('href', '/sim-scaffold-spec')
    await expect(driveCta).toHaveAttribute('data-slug', 'sim-scaffold-spec')
    await expect(driveCta).toHaveText('Drive')

    // Readout block is present.
    await expect(page.getByTestId('sim-readout-tick')).toContainText('Tick:')
    await expect(page.getByTestId('sim-readout-time')).toContainText('Sim time:')
    await expect(page.getByTestId('sim-readout-pending')).toContainText(
      'Pending events:',
    )
    await expect(page.getByTestId('sim-readout-cursor')).toContainText(
      'Server cursor:',
    )
  })

  test('clicking Pause sets the active speed indicator and stops the tick', async ({
    page,
  }) => {
    await page.route('**/api/city/**/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-pause-spec',
          cursor: 0,
          events: [],
          nextCursor: 0,
          snapshot: null,
          snapshotCursor: 0,
        }),
      })
    })

    await page.goto('/sim-pause-spec/sim')
    const root = page.getByTestId('sim-view')

    // Click Pause.
    await page.getByTestId('sim-speed-0').click()
    await expect(page.getByTestId('sim-speed-0')).toHaveAttribute(
      'data-sim-speed-active',
      'true',
    )
    await expect(page.getByTestId('sim-speed-1')).toHaveAttribute(
      'data-sim-speed-active',
      'false',
    )
    // The data attribute reflects the new speed.
    await expect(root).toHaveAttribute('data-sim-speed', '0')

    // Tick should NOT advance under pause. Wait two tick intervals
    // (500ms) and confirm tick is still 0.
    await page.waitForTimeout(500)
    const tick = await root.getAttribute('data-sim-tick')
    expect(Number.parseInt(tick ?? '0', 10)).toBe(0)
  })

  test('the running sim advances the tick counter at 1x speed', async ({
    page,
  }) => {
    await page.route('**/api/city/**/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'sim-run-spec',
          cursor: 0,
          events: [],
          nextCursor: 0,
          snapshot: null,
          snapshotCursor: 0,
        }),
      })
    })

    await page.goto('/sim-run-spec/sim')
    const root = page.getByTestId('sim-view')
    // 1x speed = 250ms per tick. Wait ~1.5s and confirm tick advanced
    // by at least 4. Use a forgiving lower bound to avoid flake on
    // slow CI runners; the upper bound just confirms it did not
    // explode.
    await page.waitForTimeout(1500)
    const tickStr = await root.getAttribute('data-sim-tick')
    const tick = Number.parseInt(tickStr ?? '0', 10)
    expect(tick).toBeGreaterThanOrEqual(4)
    expect(tick).toBeLessThan(20)
  })

  test('zone palette + grid: painting a residential zone updates the cell', async ({
    page,
  }) => {
    await page.route('**/api/city/**/events', async (route, req) => {
      if (req.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            slug: 'sim-zone-spec',
            appended: 1,
            nextCursor: 1,
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            slug: 'sim-zone-spec',
            cursor: 0,
            events: [],
            nextCursor: 0,
            snapshot: null,
            snapshotCursor: 0,
          }),
        })
      }
    })

    await page.goto('/sim-zone-spec/sim')

    // Pause first so the integration tick does not interfere with the
    // assertion timing; zoning is independent of speed.
    await page.getByTestId('sim-speed-0').click()

    // Default selected tool is residential.
    const residentialTool = page.getByTestId('sim-zone-tool-residential')
    await expect(residentialTool).toHaveAttribute(
      'data-sim-zone-tool-active',
      'true',
    )

    // Click the origin cell on the grid.
    const originCell = page.locator(
      'svg[data-testid="sim-grid"] rect[data-cell-row="0"][data-cell-col="0"]',
    )
    await expect(originCell).toBeVisible()
    await originCell.click()

    // The same cell should now report a zoned state. The hook updates
    // local state synchronously when enqueueEvent fires.
    await expect(originCell).toHaveAttribute('data-cell-zoned', 'true')
    await expect(originCell).toHaveAttribute(
      'data-cell-zone-kind',
      'residential',
    )
    await expect(originCell).toHaveAttribute('data-cell-zone-density', '0')

    // Zone count on the grid root mirrors.
    const grid = page.getByTestId('sim-grid')
    await expect(grid).toHaveAttribute('data-zone-count', '1')
  })

  test('zone palette: switching tools and erasing removes a zone', async ({
    page,
  }) => {
    await page.route('**/api/city/**/events', async (route, req) => {
      if (req.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            slug: 'sim-erase-spec',
            appended: 1,
            nextCursor: 1,
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            slug: 'sim-erase-spec',
            cursor: 0,
            events: [],
            nextCursor: 0,
            snapshot: null,
            snapshotCursor: 0,
          }),
        })
      }
    })

    await page.goto('/sim-erase-spec/sim')
    await page.getByTestId('sim-speed-0').click()

    // Switch to commercial and paint cell (1, 1).
    await page.getByTestId('sim-zone-tool-commercial').click()
    await expect(page.getByTestId('sim-zone-tool-commercial')).toHaveAttribute(
      'data-sim-zone-tool-active',
      'true',
    )
    const cell = page.locator(
      'svg[data-testid="sim-grid"] rect[data-cell-row="1"][data-cell-col="1"]',
    )
    await cell.click()
    await expect(cell).toHaveAttribute('data-cell-zone-kind', 'commercial')

    // Switch to erase and click the same cell.
    await page.getByTestId('sim-zone-tool-erase').click()
    await expect(page.getByTestId('sim-zone-tool-erase')).toHaveAttribute(
      'data-sim-zone-tool-active',
      'true',
    )
    await cell.click()
    await expect(cell).toHaveAttribute('data-cell-zoned', 'false')
    await expect(page.getByTestId('sim-grid')).toHaveAttribute(
      'data-zone-count',
      '0',
    )
  })
})
