import { describe, expect, it } from 'vitest'
import {
  CELL_PIXELS,
  GRID_DIAMETER,
  GRID_PIXEL_SIZE,
  GRID_RADIUS,
  cellKey,
  cellToPixel,
  gridCells,
  occupiedBuildingCells,
  occupiedPieceCells,
  pieceFootprintCells,
} from '@/app/[slug]/edit/snapGrid'
import type { City, Piece } from '@/lib/schemas'
import { EMPTY_CITY } from '@/lib/schemas'

/**
 * REQ-016: editor snap-grid surface.
 *
 * Tests cover the helper module that the SnapGrid component relies on
 * to enumerate cells, compute pixel positions, and derive occupancy
 * from a city's pieces. The component itself is presentational SVG;
 * its rendering is covered end-to-end by `npm run build` plus the
 * Playwright smoke for the editor route (covered by REQ-003 today
 * and tightened in a future smoke as the editor surface grows).
 */

describe('snapGrid (REQ-016) constants', () => {
  it('GRID_DIAMETER equals 2 * GRID_RADIUS + 1', () => {
    expect(GRID_DIAMETER).toBe(GRID_RADIUS * 2 + 1)
  })

  it('GRID_PIXEL_SIZE equals GRID_DIAMETER * CELL_PIXELS', () => {
    expect(GRID_PIXEL_SIZE).toBe(GRID_DIAMETER * CELL_PIXELS)
  })

  it('GRID_RADIUS is at least 4 so a starter loop fits without panning', () => {
    expect(GRID_RADIUS).toBeGreaterThanOrEqual(4)
  })

  it('CELL_PIXELS is a positive integer', () => {
    expect(Number.isInteger(CELL_PIXELS)).toBe(true)
    expect(CELL_PIXELS).toBeGreaterThan(0)
  })
})

describe('cellKey (REQ-016)', () => {
  it('returns "row,col" for the origin', () => {
    expect(cellKey(0, 0)).toBe('0,0')
  })

  it('preserves negative coordinates', () => {
    expect(cellKey(-3, -7)).toBe('-3,-7')
  })

  it('produces stable keys irrespective of call order', () => {
    expect(cellKey(2, 5)).toBe(cellKey(2, 5))
    expect(cellKey(2, 5)).not.toBe(cellKey(5, 2))
  })
})

describe('gridCells (REQ-016)', () => {
  it('emits exactly GRID_DIAMETER^2 cells', () => {
    expect(gridCells()).toHaveLength(GRID_DIAMETER * GRID_DIAMETER)
  })

  it('starts at (-GRID_RADIUS, -GRID_RADIUS) (top-left)', () => {
    const cells = gridCells()
    expect(cells[0]).toEqual({ row: -GRID_RADIUS, col: -GRID_RADIUS })
  })

  it('ends at (GRID_RADIUS, GRID_RADIUS) (bottom-right)', () => {
    const cells = gridCells()
    expect(cells[cells.length - 1]).toEqual({
      row: GRID_RADIUS,
      col: GRID_RADIUS,
    })
  })

  it('emits row-major order (col advances inside row)', () => {
    const cells = gridCells()
    expect(cells[0]).toEqual({ row: -GRID_RADIUS, col: -GRID_RADIUS })
    expect(cells[1]).toEqual({ row: -GRID_RADIUS, col: -GRID_RADIUS + 1 })
    expect(cells[GRID_DIAMETER]).toEqual({
      row: -GRID_RADIUS + 1,
      col: -GRID_RADIUS,
    })
  })

  it('contains the origin cell exactly once', () => {
    const origins = gridCells().filter((c) => c.row === 0 && c.col === 0)
    expect(origins).toHaveLength(1)
  })
})

describe('cellToPixel (REQ-016)', () => {
  it('maps the top-left cell to (0, 0)', () => {
    expect(cellToPixel({ row: -GRID_RADIUS, col: -GRID_RADIUS })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('maps the origin cell to the visual center', () => {
    expect(cellToPixel({ row: 0, col: 0 })).toEqual({
      x: GRID_RADIUS * CELL_PIXELS,
      y: GRID_RADIUS * CELL_PIXELS,
    })
  })

  it('maps the bottom-right cell flush to the inner edge', () => {
    expect(cellToPixel({ row: GRID_RADIUS, col: GRID_RADIUS })).toEqual({
      x: GRID_PIXEL_SIZE - CELL_PIXELS,
      y: GRID_PIXEL_SIZE - CELL_PIXELS,
    })
  })
})

describe('pieceFootprintCells (REQ-016, REQ-059)', () => {
  it('expands a piece without footprint to a single anchor cell', () => {
    const piece: Piece = {
      type: 'straight',
      row: 2,
      col: -1,
      rotation: 90,
    }
    expect(pieceFootprintCells(piece)).toEqual([{ row: 2, col: -1 }])
  })

  it('expands an explicit single-cell footprint to the anchor cell', () => {
    const piece: Piece = {
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      footprint: [{ dr: 0, dc: 0 }],
    }
    expect(pieceFootprintCells(piece)).toEqual([{ row: 0, col: 0 }])
  })

  it('expands a multi-cell footprint (mega sweep style) into all cells', () => {
    const piece: Piece = {
      type: 'megaSweepRight',
      row: 1,
      col: 1,
      rotation: 0,
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
        { dr: 1, dc: 1 },
        { dr: 2, dc: 0 },
        { dr: 2, dc: 1 },
        { dr: 0, dc: 2 },
        { dr: 1, dc: 2 },
        { dr: 2, dc: 2 },
      ],
    }
    const cells = pieceFootprintCells(piece)
    expect(cells).toHaveLength(9)
    expect(cells).toContainEqual({ row: 1, col: 1 })
    expect(cells).toContainEqual({ row: 3, col: 3 })
  })
})

describe('occupiedPieceCells (REQ-016, REQ-027 prep)', () => {
  it('returns an empty set for the empty city', () => {
    expect(occupiedPieceCells(EMPTY_CITY).size).toBe(0)
  })

  it('aggregates one cell per single-cell piece', () => {
    const city: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
        { type: 'right90', row: 1, col: 0, rotation: 0 },
      ],
      buildings: [],
    }
    const occupied = occupiedPieceCells(city)
    expect(occupied.size).toBe(3)
    expect(occupied.has('0,0')).toBe(true)
    expect(occupied.has('0,1')).toBe(true)
    expect(occupied.has('1,0')).toBe(true)
  })

  it('aggregates every footprint cell of a multi-cell piece', () => {
    const city: City = {
      pieces: [
        {
          type: 'megaSweepLeft',
          row: 0,
          col: 0,
          rotation: 0,
          footprint: [
            { dr: 0, dc: 0 },
            { dr: 0, dc: 1 },
            { dr: 1, dc: 0 },
          ],
        },
      ],
      buildings: [],
    }
    const occupied = occupiedPieceCells(city)
    expect(occupied.size).toBe(3)
    expect(occupied.has('0,0')).toBe(true)
    expect(occupied.has('0,1')).toBe(true)
    expect(occupied.has('1,0')).toBe(true)
  })

  it('dedupes overlapping cells across pieces (raw set semantics)', () => {
    const city: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'straight', row: 0, col: 0, rotation: 90 },
      ],
      buildings: [],
    }
    expect(occupiedPieceCells(city).size).toBe(1)
  })

  it('does not include building cells (parallel helper covers buildings)', () => {
    const city: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [{ type: 'small-house', row: 1, col: 1, rotation: 0 }],
    }
    const occupied = occupiedPieceCells(city)
    expect(occupied.size).toBe(1)
    expect(occupied.has('0,0')).toBe(true)
    expect(occupied.has('1,1')).toBe(false)
  })
})

describe('occupiedBuildingCells (REQ-028, REQ-029)', () => {
  it('returns an empty set for the empty city', () => {
    expect(occupiedBuildingCells(EMPTY_CITY).size).toBe(0)
  })

  it('aggregates one cell per single-cell building', () => {
    const city: City = {
      pieces: [],
      buildings: [
        { type: 'small-house', row: 0, col: 0, rotation: 0 },
        { type: 'mid-house', row: 0, col: 1, rotation: 0 },
        { type: 'shop', row: 1, col: 0, rotation: 0 },
        { type: 'factory', row: 1, col: 1, rotation: 0 },
      ],
    }
    const occupied = occupiedBuildingCells(city)
    expect(occupied.size).toBe(4)
    expect(occupied.has('0,0')).toBe(true)
    expect(occupied.has('0,1')).toBe(true)
    expect(occupied.has('1,0')).toBe(true)
    expect(occupied.has('1,1')).toBe(true)
  })

  it('does not include piece cells (parallel helper covers pieces)', () => {
    const city: City = {
      pieces: [{ type: 'straight', row: 5, col: 5, rotation: 0 }],
      buildings: [{ type: 'small-house', row: 1, col: 1, rotation: 0 }],
    }
    const occupied = occupiedBuildingCells(city)
    expect(occupied.size).toBe(1)
    expect(occupied.has('1,1')).toBe(true)
    expect(occupied.has('5,5')).toBe(false)
  })

  it('dedupes overlapping building cells (raw set semantics)', () => {
    const city: City = {
      pieces: [],
      buildings: [
        { type: 'small-house', row: 0, col: 0, rotation: 0 },
        { type: 'shop', row: 0, col: 0, rotation: 90 },
      ],
    }
    expect(occupiedBuildingCells(city).size).toBe(1)
  })

  it('preserves negative cell coordinates', () => {
    const city: City = {
      pieces: [],
      buildings: [{ type: 'small-house', row: -3, col: -7, rotation: 0 }],
    }
    expect(occupiedBuildingCells(city).has('-3,-7')).toBe(true)
  })
})
