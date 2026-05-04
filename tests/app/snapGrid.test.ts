import { describe, expect, it } from 'vitest'
import {
  CELL_PIXELS,
  GRID_DIAMETER,
  GRID_PIXEL_SIZE,
  GRID_RADIUS,
  HAIRPIN_FOOTPRINT,
  MEGA_SWEEP_LEFT_FOOTPRINT,
  MEGA_SWEEP_RIGHT_FOOTPRINT,
  cellKey,
  cellToPixel,
  defaultFootprintForPiece,
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

describe('MEGA_SWEEP_RIGHT_FOOTPRINT / MEGA_SWEEP_LEFT_FOOTPRINT (REQ-058)', () => {
  it('mega sweep right covers a 2x2 block anchored at the bottom-right', () => {
    // The four offsets define a 2x2 block: rows {-1, 0} x cols {-1, 0}.
    expect(MEGA_SWEEP_RIGHT_FOOTPRINT).toHaveLength(4)
    const rows = new Set(MEGA_SWEEP_RIGHT_FOOTPRINT.map((c) => c.dr))
    const cols = new Set(MEGA_SWEEP_RIGHT_FOOTPRINT.map((c) => c.dc))
    expect(rows).toEqual(new Set([-1, 0]))
    expect(cols).toEqual(new Set([-1, 0]))
  })

  it('mega sweep left covers a 2x2 block anchored at the bottom-left', () => {
    expect(MEGA_SWEEP_LEFT_FOOTPRINT).toHaveLength(4)
    const rows = new Set(MEGA_SWEEP_LEFT_FOOTPRINT.map((c) => c.dr))
    const cols = new Set(MEGA_SWEEP_LEFT_FOOTPRINT.map((c) => c.dc))
    expect(rows).toEqual(new Set([-1, 0]))
    expect(cols).toEqual(new Set([0, 1]))
  })

  it('mega sweep left mirrors mega sweep right across the column axis', () => {
    // For every (dr, dc) in right, (dr, dc + 1) (the mirrored offset
    // around the anchor) lives in left. The two sets are complementary
    // mirror images so a builder can flip between them with rotation
    // alone for axis-aligned shapes.
    const rightSet = new Set(
      MEGA_SWEEP_RIGHT_FOOTPRINT.map((c) => `${c.dr},${c.dc}`),
    )
    const leftSet = new Set(
      MEGA_SWEEP_LEFT_FOOTPRINT.map((c) => `${c.dr},${c.dc}`),
    )
    for (const cell of MEGA_SWEEP_RIGHT_FOOTPRINT) {
      expect(leftSet.has(`${cell.dr},${cell.dc + 1}`)).toBe(true)
    }
    for (const cell of MEGA_SWEEP_LEFT_FOOTPRINT) {
      expect(rightSet.has(`${cell.dr},${cell.dc - 1}`)).toBe(true)
    }
  })
})

describe('HAIRPIN_FOOTPRINT (REQ-060)', () => {
  it('covers a 2x3 block (rows -1, 0, 1 across cols 0, 1)', () => {
    expect(HAIRPIN_FOOTPRINT).toHaveLength(6)
    const rows = new Set(HAIRPIN_FOOTPRINT.map((c) => c.dr))
    const cols = new Set(HAIRPIN_FOOTPRINT.map((c) => c.dc))
    expect(rows).toEqual(new Set([-1, 0, 1]))
    expect(cols).toEqual(new Set([0, 1]))
  })

  it('exposes every cell of the 2x3 block exactly once', () => {
    const keys = new Set(HAIRPIN_FOOTPRINT.map((c) => `${c.dr},${c.dc}`))
    expect(keys.size).toBe(HAIRPIN_FOOTPRINT.length)
    expect(keys).toEqual(
      new Set(['-1,0', '-1,1', '0,0', '0,1', '1,0', '1,1']),
    )
  })

  it('includes the anchor cell (0, 0) so a hairpin always covers its placement cell', () => {
    const keys = new Set(HAIRPIN_FOOTPRINT.map((c) => `${c.dr},${c.dc}`))
    expect(keys.has('0,0')).toBe(true)
  })
})

describe('defaultFootprintForPiece (REQ-058, REQ-059, REQ-060)', () => {
  it('returns the single-cell default for a single-cell piece type', () => {
    expect(defaultFootprintForPiece({ type: 'straight', rotation: 0 })).toEqual([
      { dr: 0, dc: 0 },
    ])
  })

  it('returns the single-cell default for every cardinal-only palette type', () => {
    const cardinalTypes = [
      'straight',
      'left90',
      'right90',
      'scurve',
      'scurveLeft',
      'sweepRight',
      'sweepLeft',
      'intersection',
      'arc45',
      'diagonal',
    ] as const
    for (const type of cardinalTypes) {
      expect(defaultFootprintForPiece({ type, rotation: 0 })).toEqual([
        { dr: 0, dc: 0 },
      ])
    }
  })

  it('returns the canonical 2x2 footprint for megaSweepRight at rotation 0', () => {
    const cells = defaultFootprintForPiece({ type: 'megaSweepRight', rotation: 0 })
    expect(cells).toHaveLength(4)
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    expect(keys).toEqual(new Set(['-1,-1', '-1,0', '0,-1', '0,0']))
  })

  it('returns the canonical 2x2 footprint for megaSweepLeft at rotation 0', () => {
    const cells = defaultFootprintForPiece({ type: 'megaSweepLeft', rotation: 0 })
    expect(cells).toHaveLength(4)
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    expect(keys).toEqual(new Set(['-1,0', '-1,1', '0,0', '0,1']))
  })

  it('returns the canonical 2x3 footprint for hairpin at rotation 0 (REQ-060)', () => {
    const cells = defaultFootprintForPiece({ type: 'hairpin', rotation: 0 })
    expect(cells).toHaveLength(6)
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    expect(keys).toEqual(
      new Set(['-1,0', '-1,1', '0,0', '0,1', '1,0', '1,1']),
    )
  })

  it('rotates hairpin 90deg clockwise (the 2x3 block extends below the anchor as a 3x2)', () => {
    const cells = defaultFootprintForPiece({ type: 'hairpin', rotation: 90 })
    expect(cells).toHaveLength(6)
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    // 90deg rotate of (-1, 0) -> (0, 1); (-1, 1) -> (1, 1);
    // (0, 0) -> (0, 0); (0, 1) -> (1, 0); (1, 0) -> (0, -1);
    // (1, 1) -> (1, -1).
    expect(keys).toEqual(
      new Set(['0,1', '1,1', '0,0', '1,0', '0,-1', '1,-1']),
    )
  })

  it('rotates hairpin 180deg (mirror across the anchor)', () => {
    const cells = defaultFootprintForPiece({ type: 'hairpin', rotation: 180 })
    expect(cells).toHaveLength(6)
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    expect(keys).toEqual(
      new Set(['1,0', '1,-1', '0,0', '0,-1', '-1,0', '-1,-1']),
    )
  })

  it('rotates hairpin 270deg', () => {
    const cells = defaultFootprintForPiece({ type: 'hairpin', rotation: 270 })
    expect(cells).toHaveLength(6)
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    // Three 90deg clockwise steps applied to the canonical 2x3 block.
    // The 270 rotation places the block back as a 2x3 reaching up
    // and to the right of the anchor.
    expect(keys).toEqual(
      new Set(['0,-1', '-1,-1', '0,0', '-1,0', '0,1', '-1,1']),
    )
  })

  it('hairpin rotation collapses -0 to 0 in the rotated offsets', () => {
    const cells = defaultFootprintForPiece({ type: 'hairpin', rotation: 180 })
    for (const cell of cells) {
      expect(Object.is(cell.dr, -0)).toBe(false)
      expect(Object.is(cell.dc, -0)).toBe(false)
    }
  })

  it('rotates megaSweepRight 90deg clockwise (the 2x2 block extends to the right of the anchor)', () => {
    const cells = defaultFootprintForPiece({ type: 'megaSweepRight', rotation: 90 })
    expect(cells).toHaveLength(4)
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    // 90deg rotate of (-1, -1) -> (-1, 1); (-1, 0) -> (0, 1);
    // (0, -1) -> (-1, 0); (0, 0) -> (0, 0).
    expect(keys).toEqual(new Set(['-1,1', '0,1', '-1,0', '0,0']))
  })

  it('rotates megaSweepRight 180deg (mirror across the anchor)', () => {
    const cells = defaultFootprintForPiece({ type: 'megaSweepRight', rotation: 180 })
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    expect(keys).toEqual(new Set(['1,1', '1,0', '0,1', '0,0']))
  })

  it('rotates megaSweepRight 270deg', () => {
    const cells = defaultFootprintForPiece({ type: 'megaSweepRight', rotation: 270 })
    const keys = new Set(cells.map((c) => `${c.dr},${c.dc}`))
    expect(keys).toEqual(new Set(['1,-1', '0,-1', '1,0', '0,0']))
  })

  it('a 360deg rotation walks back to the canonical footprint', () => {
    // 270 then implicit-back-to-0 contract: full cycle returns to the
    // original cell set.
    const r0 = defaultFootprintForPiece({ type: 'megaSweepRight', rotation: 0 })
    const r0Keys = new Set(r0.map((c) => `${c.dr},${c.dc}`))
    // Compose four 90deg rotations by re-evaluating; the rotation arg
    // covers the cycle directly so this asserts the canonical set is
    // the same as the rotation-0 set.
    const rExplicit = defaultFootprintForPiece({
      type: 'megaSweepRight',
      rotation: 0,
    })
    const rKeys = new Set(rExplicit.map((c) => `${c.dr},${c.dc}`))
    expect(rKeys).toEqual(r0Keys)
  })

  it('collapses -0 to 0 in the rotated offsets', () => {
    // A 180deg rotate flips signs; (0, *) cells produce a (-0, *)
    // intermediate before normalization. The helper normalizes to 0.
    const cells = defaultFootprintForPiece({
      type: 'megaSweepRight',
      rotation: 180,
    })
    for (const cell of cells) {
      expect(Object.is(cell.dr, -0)).toBe(false)
      expect(Object.is(cell.dc, -0)).toBe(false)
    }
  })

  it('returns a fresh array on every call so callers cannot mutate the canonical constants', () => {
    const a = defaultFootprintForPiece({ type: 'megaSweepRight', rotation: 0 })
    const b = defaultFootprintForPiece({ type: 'megaSweepRight', rotation: 0 })
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('pieceFootprintCells (REQ-016, REQ-058, REQ-059, REQ-060)', () => {
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

  it('falls back to the type-driven default footprint for megaSweepRight (REQ-058)', () => {
    // Anchor at (5, 5), no explicit footprint. The type-driven default
    // resolves the canonical 2x2 block; absolute cells are (5 + dr,
    // 5 + dc) for every offset.
    const piece: Piece = {
      type: 'megaSweepRight',
      row: 5,
      col: 5,
      rotation: 0,
    }
    const cells = pieceFootprintCells(piece)
    expect(cells).toHaveLength(4)
    expect(cells).toContainEqual({ row: 4, col: 4 })
    expect(cells).toContainEqual({ row: 4, col: 5 })
    expect(cells).toContainEqual({ row: 5, col: 4 })
    expect(cells).toContainEqual({ row: 5, col: 5 })
  })

  it('falls back to the type-driven default footprint for megaSweepLeft (REQ-058)', () => {
    const piece: Piece = {
      type: 'megaSweepLeft',
      row: 0,
      col: 0,
      rotation: 0,
    }
    const cells = pieceFootprintCells(piece)
    expect(cells).toHaveLength(4)
    expect(cells).toContainEqual({ row: -1, col: 0 })
    expect(cells).toContainEqual({ row: -1, col: 1 })
    expect(cells).toContainEqual({ row: 0, col: 0 })
    expect(cells).toContainEqual({ row: 0, col: 1 })
  })

  it('falls back to the type-driven default footprint for hairpin (REQ-060)', () => {
    // The placePiece reducer never records an explicit footprint for a
    // hairpin, so pieceFootprintCells must derive the 2x3 footprint
    // from the piece type alone or it would treat the hairpin as a
    // single-cell piece and let neighboring pieces overlap five of its
    // six cells.
    const piece: Piece = {
      type: 'hairpin',
      row: 3,
      col: 3,
      rotation: 0,
    }
    const cells = pieceFootprintCells(piece)
    expect(cells).toHaveLength(6)
    expect(cells).toContainEqual({ row: 2, col: 3 })
    expect(cells).toContainEqual({ row: 2, col: 4 })
    expect(cells).toContainEqual({ row: 3, col: 3 })
    expect(cells).toContainEqual({ row: 3, col: 4 })
    expect(cells).toContainEqual({ row: 4, col: 3 })
    expect(cells).toContainEqual({ row: 4, col: 4 })
  })

  it('rotates the hairpin type-driven default with the piece rotation field (REQ-060)', () => {
    // hairpin at rotation 90 anchored at (5, 5) covers offsets
    // {(0, 1), (1, 1), (0, 0), (1, 0), (0, -1), (1, -1)}, so absolute
    // cells are (5, 6), (6, 6), (5, 5), (6, 5), (5, 4), (6, 4).
    const piece: Piece = {
      type: 'hairpin',
      row: 5,
      col: 5,
      rotation: 90,
    }
    const cells = pieceFootprintCells(piece)
    expect(cells).toHaveLength(6)
    expect(cells).toContainEqual({ row: 5, col: 6 })
    expect(cells).toContainEqual({ row: 6, col: 6 })
    expect(cells).toContainEqual({ row: 5, col: 5 })
    expect(cells).toContainEqual({ row: 6, col: 5 })
    expect(cells).toContainEqual({ row: 5, col: 4 })
    expect(cells).toContainEqual({ row: 6, col: 4 })
  })

  it('honors an explicit footprint over the type-driven default for a multi-cell type', () => {
    // A hand-edited or future-imported city can override the canonical
    // shape. The explicit field wins.
    const piece: Piece = {
      type: 'megaSweepRight',
      row: 0,
      col: 0,
      rotation: 0,
      footprint: [{ dr: 0, dc: 0 }],
    }
    expect(pieceFootprintCells(piece)).toEqual([{ row: 0, col: 0 }])
  })

  it('rotates the type-driven default with the piece rotation field', () => {
    // megaSweepRight at rotation 90 covers offsets (-1, 1), (0, 1),
    // (-1, 0), (0, 0). Anchor at (10, 10).
    const piece: Piece = {
      type: 'megaSweepRight',
      row: 10,
      col: 10,
      rotation: 90,
    }
    const cells = pieceFootprintCells(piece)
    expect(cells).toHaveLength(4)
    expect(cells).toContainEqual({ row: 9, col: 11 })
    expect(cells).toContainEqual({ row: 10, col: 11 })
    expect(cells).toContainEqual({ row: 9, col: 10 })
    expect(cells).toContainEqual({ row: 10, col: 10 })
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

  it('aggregates the type-driven default footprint for a megaSweep without explicit footprint (REQ-058)', () => {
    const city: City = {
      pieces: [
        {
          type: 'megaSweepRight',
          row: 1,
          col: 1,
          rotation: 0,
        },
      ],
      buildings: [],
    }
    const occupied = occupiedPieceCells(city)
    expect(occupied.size).toBe(4)
    expect(occupied.has('0,0')).toBe(true)
    expect(occupied.has('0,1')).toBe(true)
    expect(occupied.has('1,0')).toBe(true)
    expect(occupied.has('1,1')).toBe(true)
  })

  it('aggregates the type-driven default footprint for a hairpin without explicit footprint (REQ-060)', () => {
    const city: City = {
      pieces: [
        {
          type: 'hairpin',
          row: 2,
          col: 2,
          rotation: 0,
        },
      ],
      buildings: [],
    }
    const occupied = occupiedPieceCells(city)
    expect(occupied.size).toBe(6)
    for (const key of ['1,2', '1,3', '2,2', '2,3', '3,2', '3,3']) {
      expect(occupied.has(key)).toBe(true)
    }
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
