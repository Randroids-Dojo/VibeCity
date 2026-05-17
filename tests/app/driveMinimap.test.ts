import { describe, expect, it } from 'vitest'
import {
  MINIMAP_BACKGROUND_COLOR,
  MINIMAP_BORDER_COLOR,
  MINIMAP_BUILDING_COLOR,
  MINIMAP_CAR_COLOR,
  MINIMAP_CAR_SIZE_PX,
  MINIMAP_PADDING_CELLS,
  MINIMAP_PIECE_COLOR,
  MINIMAP_SIZE_PX,
  MINIMAP_ZONE_COLOR,
  headingToMinimapDegrees,
  minimapBoundsForCity,
  worldToMinimap,
} from '@/app/[slug]/driveMinimap'
import { CELL_SIZE } from '@/app/[slug]/driveScene'
import type { Building, Piece } from '@/lib/schemas'

/**
 * REQ-069 minimap: bounds projection, world-to-pixel mapping, heading
 * rotation. The drive scene client renders an SVG overlay on top of
 * these helpers; the projection math is fully unit-testable here.
 */

const piece = (row: number, col: number, type: Piece['type'] = 'straight'): Piece => ({
  row,
  col,
  type,
  rotation: 0,
})

const building = (
  row: number,
  col: number,
  type: Building['type'] = 'small-house',
): Building => ({
  row,
  col,
  type,
  rotation: 0,
})

describe('minimap constants', () => {
  it('exposes a positive square viewport size in CSS pixels', () => {
    expect(MINIMAP_SIZE_PX).toBeGreaterThan(0)
    expect(Number.isFinite(MINIMAP_SIZE_PX)).toBe(true)
    expect(Number.isInteger(MINIMAP_SIZE_PX)).toBe(true)
  })

  it('exposes a non-negative padding so an edge piece still has a frame', () => {
    expect(MINIMAP_PADDING_CELLS).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(MINIMAP_PADDING_CELLS)).toBe(true)
  })

  it('exposes a positive car triangle size smaller than the viewport', () => {
    expect(MINIMAP_CAR_SIZE_PX).toBeGreaterThan(0)
    expect(MINIMAP_CAR_SIZE_PX).toBeLessThan(MINIMAP_SIZE_PX / 4)
  })

  it('exposes valid CSS colors for every layer', () => {
    expect(MINIMAP_PIECE_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
    expect(MINIMAP_BUILDING_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
    expect(MINIMAP_CAR_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
    expect(MINIMAP_BORDER_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
    expect(MINIMAP_BACKGROUND_COLOR.length).toBeGreaterThan(0)
  })

  it('keeps piece and building colors distinct so a player can tell them apart', () => {
    expect(MINIMAP_PIECE_COLOR).not.toBe(MINIMAP_BUILDING_COLOR)
  })

  it('keeps the car color distinct from the piece and building colors', () => {
    expect(MINIMAP_CAR_COLOR).not.toBe(MINIMAP_PIECE_COLOR)
    expect(MINIMAP_CAR_COLOR).not.toBe(MINIMAP_BUILDING_COLOR)
  })

  it('exposes a valid hex color per zone kind', () => {
    for (const kind of ['residential', 'commercial', 'industrial'] as const) {
      expect(MINIMAP_ZONE_COLOR[kind]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('keeps every zone color distinct from the others', () => {
    expect(MINIMAP_ZONE_COLOR.residential).not.toBe(MINIMAP_ZONE_COLOR.commercial)
    expect(MINIMAP_ZONE_COLOR.commercial).not.toBe(MINIMAP_ZONE_COLOR.industrial)
    expect(MINIMAP_ZONE_COLOR.residential).not.toBe(MINIMAP_ZONE_COLOR.industrial)
  })

  it('keeps zone colors distinct from the piece and building colors', () => {
    for (const kind of ['residential', 'commercial', 'industrial'] as const) {
      expect(MINIMAP_ZONE_COLOR[kind]).not.toBe(MINIMAP_PIECE_COLOR)
      expect(MINIMAP_ZONE_COLOR[kind]).not.toBe(MINIMAP_BUILDING_COLOR)
    }
  })
})

describe('minimapBoundsForCity', () => {
  it('returns null for an empty city', () => {
    expect(minimapBoundsForCity([], [])).toBeNull()
  })

  it('returns null when the size override is non-positive or non-finite', () => {
    expect(minimapBoundsForCity([piece(0, 0)], [], 1, 0)).toBeNull()
    expect(minimapBoundsForCity([piece(0, 0)], [], 1, -10)).toBeNull()
    expect(minimapBoundsForCity([piece(0, 0)], [], 1, Number.NaN)).toBeNull()
  })

  it('produces a square scale that fits a single piece in the viewport', () => {
    const bounds = minimapBoundsForCity([piece(0, 0)], [], 0)
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.width).toBe(CELL_SIZE)
    expect(bounds.depth).toBe(CELL_SIZE)
    expect(bounds.scale).toBe(MINIMAP_SIZE_PX / CELL_SIZE)
    expect(bounds.offsetX).toBe(0)
    expect(bounds.offsetY).toBe(0)
    expect(bounds.sizePx).toBe(MINIMAP_SIZE_PX)
  })

  it('uses MINIMAP_PADDING_CELLS by default to keep edge pieces away from the frame', () => {
    const bounds = minimapBoundsForCity([piece(0, 0)], [])
    expect(bounds).not.toBeNull()
    if (!bounds) return
    // One cell of padding per side around a single-cell footprint.
    expect(bounds.width).toBe(CELL_SIZE + 2 * MINIMAP_PADDING_CELLS * CELL_SIZE)
    expect(bounds.depth).toBe(CELL_SIZE + 2 * MINIMAP_PADDING_CELLS * CELL_SIZE)
  })

  it('respects an explicit padding override (REQ-040 future settings)', () => {
    const tight = minimapBoundsForCity([piece(0, 0)], [], 0)
    const loose = minimapBoundsForCity([piece(0, 0)], [], 2)
    expect(tight).not.toBeNull()
    expect(loose).not.toBeNull()
    if (!tight || !loose) return
    expect(loose.width).toBeGreaterThan(tight.width)
  })

  it('letterboxes a wide city so the longer axis fills the viewport', () => {
    // Wide city: 3 cells wide, 1 cell tall (no padding).
    const bounds = minimapBoundsForCity(
      [piece(0, 0), piece(0, 1), piece(0, 2)],
      [],
      0,
    )
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.width).toBe(CELL_SIZE * 3)
    expect(bounds.depth).toBe(CELL_SIZE)
    // Horizontal axis is the longer one, so the scale matches it.
    expect(bounds.scale).toBe(MINIMAP_SIZE_PX / (CELL_SIZE * 3))
    // X offset is zero because the wider axis drives the scale.
    expect(bounds.offsetX).toBe(0)
    // Y offset centers the shorter axis vertically.
    const expectedYOffset = (MINIMAP_SIZE_PX - bounds.depth * bounds.scale) / 2
    expect(bounds.offsetY).toBeCloseTo(expectedYOffset, 6)
    expect(bounds.offsetY).toBeGreaterThan(0)
  })

  it('letterboxes a tall city so the longer axis fills the viewport', () => {
    // Tall city: 1 cell wide, 3 cells tall (no padding).
    const bounds = minimapBoundsForCity(
      [piece(0, 0), piece(1, 0), piece(2, 0)],
      [],
      0,
    )
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.width).toBe(CELL_SIZE)
    expect(bounds.depth).toBe(CELL_SIZE * 3)
    expect(bounds.scale).toBe(MINIMAP_SIZE_PX / (CELL_SIZE * 3))
    expect(bounds.offsetY).toBe(0)
    const expectedXOffset = (MINIMAP_SIZE_PX - bounds.width * bounds.scale) / 2
    expect(bounds.offsetX).toBeCloseTo(expectedXOffset, 6)
    expect(bounds.offsetX).toBeGreaterThan(0)
  })

  it('includes building cells in the bounds', () => {
    const bounds = minimapBoundsForCity([], [building(0, 0)], 0)
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.width).toBe(CELL_SIZE)
    expect(bounds.depth).toBe(CELL_SIZE)
  })

  it('mixes piece and building cells into the same bounds', () => {
    const bounds = minimapBoundsForCity(
      [piece(0, 0)],
      [building(0, 5)],
      0,
    )
    expect(bounds).not.toBeNull()
    if (!bounds) return
    // x covers cell col 0..5 with half-cell halos, so 6 cells total.
    expect(bounds.width).toBe(CELL_SIZE * 6)
    expect(bounds.depth).toBe(CELL_SIZE)
  })

  it('handles negative coordinates symmetrically with positive coordinates', () => {
    const positive = minimapBoundsForCity([piece(0, 0), piece(0, 2)], [], 0)
    const negative = minimapBoundsForCity([piece(0, -2), piece(0, 0)], [], 0)
    expect(positive).not.toBeNull()
    expect(negative).not.toBeNull()
    if (!positive || !negative) return
    expect(negative.width).toBeCloseTo(positive.width, 6)
    expect(negative.depth).toBeCloseTo(positive.depth, 6)
    expect(negative.scale).toBeCloseTo(positive.scale, 6)
  })

  it('expands multi-cell footprints into the bounds', () => {
    const multiCell: Piece = {
      row: 0,
      col: 0,
      type: 'straight',
      rotation: 0,
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
        { dr: 1, dc: 1 },
      ],
    }
    const bounds = minimapBoundsForCity([multiCell], [], 0)
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.width).toBe(CELL_SIZE * 2)
    expect(bounds.depth).toBe(CELL_SIZE * 2)
  })

  it('expands bounds to include zoned cells outside the piece bbox', () => {
    // Zone at (5, 5) sits well outside a single piece at (0, 0).
    const withZones = minimapBoundsForCity(
      [piece(0, 0)],
      [],
      0,
      undefined,
      [{ row: 5, col: 5 }],
    )
    const withoutZones = minimapBoundsForCity([piece(0, 0)], [], 0)
    expect(withZones).not.toBeNull()
    expect(withoutZones).not.toBeNull()
    if (!withZones || !withoutZones) return
    // Bounds must be larger when zones extend past the piece footprint.
    expect(withZones.width).toBeGreaterThan(withoutZones.width)
    expect(withZones.depth).toBeGreaterThan(withoutZones.depth)
  })

  it('ignores zone cells with non-finite coordinates', () => {
    const bounds = minimapBoundsForCity(
      [piece(0, 0)],
      [],
      0,
      undefined,
      [
        { row: Number.NaN, col: 5 },
        { row: 5, col: Number.POSITIVE_INFINITY },
      ],
    )
    const without = minimapBoundsForCity([piece(0, 0)], [], 0)
    expect(bounds).not.toBeNull()
    expect(without).not.toBeNull()
    if (!bounds || !without) return
    expect(bounds.width).toBe(without.width)
    expect(bounds.depth).toBe(without.depth)
  })
})

describe('worldToMinimap', () => {
  const bounds = minimapBoundsForCity(
    [piece(0, 0), piece(0, 2)],
    [],
    0,
  )!

  it('projects the city min corner to the viewport origin', () => {
    const projected = worldToMinimap(bounds.minX, bounds.minZ, bounds)
    expect(projected.x).toBeCloseTo(bounds.offsetX, 6)
    expect(projected.y).toBeCloseTo(bounds.offsetY, 6)
  })

  it('projects the city max corner to the far viewport edge along the longer axis', () => {
    const projected = worldToMinimap(bounds.maxX, bounds.maxZ, bounds)
    expect(projected.x).toBeCloseTo(
      bounds.offsetX + bounds.width * bounds.scale,
      6,
    )
    expect(projected.y).toBeCloseTo(
      bounds.offsetY + bounds.depth * bounds.scale,
      6,
    )
  })

  it('projects the city center to the viewport center', () => {
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerZ = (bounds.minZ + bounds.maxZ) / 2
    const projected = worldToMinimap(centerX, centerZ, bounds)
    expect(projected.x).toBeCloseTo(MINIMAP_SIZE_PX / 2, 6)
    expect(projected.y).toBeCloseTo(MINIMAP_SIZE_PX / 2, 6)
  })

  it('keeps north at the top of the minimap (smaller z renders higher)', () => {
    // World +z is south; SVG +y is down; so a smaller z renders at a
    // smaller y, which means smaller z is visually higher on the map.
    const high = worldToMinimap(bounds.minX, bounds.minZ, bounds)
    const low = worldToMinimap(bounds.minX, bounds.maxZ, bounds)
    expect(high.y).toBeLessThan(low.y)
  })

  it('returns NaN coordinates for non-finite world inputs', () => {
    const projected = worldToMinimap(Number.NaN, 0, bounds)
    expect(Number.isNaN(projected.x)).toBe(true)
    expect(Number.isNaN(projected.y)).toBe(true)
    const projected2 = worldToMinimap(0, Number.POSITIVE_INFINITY, bounds)
    expect(Number.isNaN(projected2.x)).toBe(true)
    expect(Number.isNaN(projected2.y)).toBe(true)
  })

  it('scales linearly with world distance', () => {
    const a = worldToMinimap(bounds.minX, bounds.minZ, bounds)
    const b = worldToMinimap(bounds.minX + CELL_SIZE, bounds.minZ, bounds)
    const c = worldToMinimap(bounds.minX + 2 * CELL_SIZE, bounds.minZ, bounds)
    expect(b.x - a.x).toBeCloseTo(c.x - b.x, 6)
  })
})

describe('headingToMinimapDegrees', () => {
  it('returns 0 for a north-pointing heading', () => {
    expect(headingToMinimapDegrees(0)).toBe(0)
  })

  it('converts a quarter turn to 90 degrees', () => {
    expect(headingToMinimapDegrees(Math.PI / 2)).toBeCloseTo(90, 6)
  })

  it('converts a half turn to 180 degrees', () => {
    expect(headingToMinimapDegrees(Math.PI)).toBeCloseTo(180, 6)
  })

  it('converts a three-quarter turn to 270 degrees', () => {
    expect(headingToMinimapDegrees((3 * Math.PI) / 2)).toBeCloseTo(270, 6)
  })

  it('handles negative radian values symmetrically', () => {
    expect(headingToMinimapDegrees(-Math.PI / 2)).toBeCloseTo(-90, 6)
  })

  it('returns 0 for non-finite inputs', () => {
    expect(headingToMinimapDegrees(Number.NaN)).toBe(0)
    expect(headingToMinimapDegrees(Number.POSITIVE_INFINITY)).toBe(0)
    expect(headingToMinimapDegrees(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('returns a finite number for any finite radian input', () => {
    expect(Number.isFinite(headingToMinimapDegrees(123.456))).toBe(true)
    expect(Number.isFinite(headingToMinimapDegrees(-7.89))).toBe(true)
  })
})
