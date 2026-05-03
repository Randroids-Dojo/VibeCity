import { expect, test } from '@playwright/test'

/**
 * REQ-017 + REQ-020: street piece palette and click-to-place.
 *
 * Drives the editor at `/playtest-city/edit`, asserts the palette
 * exposes the v1 cardinal-only types, switches the selection,
 * places pieces by clicking grid cells, and checks the visible
 * piece count plus the occupied-count attribute on the SVG.
 *
 * This spec does NOT exercise persistence (REQ-025) or rotate /
 * erase (REQ-021, REQ-022); those land in their own slices and
 * will tighten this spec when they do.
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
