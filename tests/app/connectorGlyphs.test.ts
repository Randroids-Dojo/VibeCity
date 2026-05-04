import { describe, expect, it } from 'vitest'
import {
  CELL_HALF_PIXELS,
  CONNECTOR_DIR_LABEL,
  GLYPH_RADIUS_PIXELS,
  cityConnectorGlyphs,
  pieceConnectorGlyphs,
  type ConnectorGlyph,
} from '@/app/[slug]/edit/connectorGlyphs'
import { CELL_PIXELS, GRID_RADIUS } from '@/app/[slug]/edit/snapGrid'
import {
  DIR_E,
  DIR_N,
  DIR_NE,
  DIR_S,
  DIR_SW,
  DIR_W,
} from '@/lib/connectors'
import type { Piece } from '@/lib/schemas'

/**
 * REQ-019, REQ-063: connector glyph helpers.
 *
 * Pure pixel-space glyph computation. The SnapGridView renders these
 * glyphs over each placed piece; this suite locks down the math so a
 * future glyph style swap (different shape, different anchor) does
 * not silently shift the on-screen marker positions.
 */

describe('connectorGlyphs constants', () => {
  it('CELL_HALF_PIXELS is half a cell so cardinal connectors land on the edge', () => {
    expect(CELL_HALF_PIXELS).toBe(CELL_PIXELS / 2)
  })

  it('GLYPH_RADIUS_PIXELS is positive and below half a cell so glyphs do not overflow the cell', () => {
    expect(GLYPH_RADIUS_PIXELS).toBeGreaterThan(0)
    expect(GLYPH_RADIUS_PIXELS).toBeLessThan(CELL_HALF_PIXELS)
  })

  it('CONNECTOR_DIR_LABEL covers every Dir 0..7 with the canonical compass label', () => {
    expect(CONNECTOR_DIR_LABEL[0]).toBe('N')
    expect(CONNECTOR_DIR_LABEL[1]).toBe('NE')
    expect(CONNECTOR_DIR_LABEL[2]).toBe('E')
    expect(CONNECTOR_DIR_LABEL[3]).toBe('SE')
    expect(CONNECTOR_DIR_LABEL[4]).toBe('S')
    expect(CONNECTOR_DIR_LABEL[5]).toBe('SW')
    expect(CONNECTOR_DIR_LABEL[6]).toBe('W')
    expect(CONNECTOR_DIR_LABEL[7]).toBe('NW')
  })

  it('CONNECTOR_DIR_LABEL has eight unique labels', () => {
    const labels = Object.values(CONNECTOR_DIR_LABEL)
    expect(labels).toHaveLength(8)
    expect(new Set(labels).size).toBe(8)
  })
})

describe('pieceConnectorGlyphs (single-cell straight)', () => {
  it('returns two cardinal glyphs at the south and north edges of cell (0, 0)', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    expect(glyphs).toHaveLength(2)
    const center = (GRID_RADIUS + 0.5) * CELL_PIXELS
    const south = glyphs.find((g) => g.dir === DIR_S)
    const north = glyphs.find((g) => g.dir === DIR_N)
    expect(south).toBeDefined()
    expect(north).toBeDefined()
    expect(south!.x).toBe(center)
    expect(south!.y).toBe(center + CELL_HALF_PIXELS)
    expect(north!.x).toBe(center)
    expect(north!.y).toBe(center - CELL_HALF_PIXELS)
  })

  it('every glyph reports cardinal kind for a cardinal-only piece', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    for (const g of glyphs) {
      expect(g.kind).toBe('cardinal')
    }
  })

  it('rotates the glyph compass directions through 90deg turns', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 90 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    const dirs = glyphs.map((g) => g.dir).sort((a, b) => a - b)
    expect(dirs).toEqual([DIR_E, DIR_W])
  })

  it('reports the source piece index on every glyph', () => {
    const piece: Piece = { type: 'straight', row: 1, col: 2, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 7)
    for (const g of glyphs) {
      expect(g.pieceIndex).toBe(7)
    }
  })

  it('reports the absolute footprint cell each glyph anchors on', () => {
    const piece: Piece = { type: 'straight', row: 3, col: -2, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    for (const g of glyphs) {
      expect(g.cellRow).toBe(3)
      expect(g.cellCol).toBe(-2)
    }
  })

  it('returns a fresh array on every call so callers cannot mutate cached state', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const a = pieceConnectorGlyphs(piece, 0)
    const b = pieceConnectorGlyphs(piece, 0)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('pieceConnectorGlyphs (intersection 4-way)', () => {
  it('returns four cardinal glyphs covering N / E / S / W', () => {
    const piece: Piece = { type: 'intersection', row: 0, col: 0, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    expect(glyphs).toHaveLength(4)
    const dirs = glyphs.map((g) => g.dir).sort((a, b) => a - b)
    expect(dirs).toEqual([DIR_N, DIR_E, DIR_S, DIR_W])
    for (const g of glyphs) {
      expect(g.kind).toBe('cardinal')
    }
  })

  it('rotation is invariant for the four-way intersection (the set is the same)', () => {
    const a = pieceConnectorGlyphs(
      { type: 'intersection', row: 0, col: 0, rotation: 0 },
      0,
    )
    const b = pieceConnectorGlyphs(
      { type: 'intersection', row: 0, col: 0, rotation: 90 },
      0,
    )
    const aDirs = a.map((g) => g.dir).sort((x, y) => x - y)
    const bDirs = b.map((g) => g.dir).sort((x, y) => x - y)
    expect(aDirs).toEqual(bDirs)
  })
})

describe('pieceConnectorGlyphs (corner-connector pieces)', () => {
  it('arc45 reports one cardinal and one corner glyph at rotation 0', () => {
    const piece: Piece = { type: 'arc45', row: 0, col: 0, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    expect(glyphs).toHaveLength(2)
    const kinds = glyphs.map((g) => g.kind).sort()
    expect(kinds).toEqual(['cardinal', 'corner'])
  })

  it('diagonal reports two corner glyphs (SW and NE) at rotation 0', () => {
    const piece: Piece = { type: 'diagonal', row: 0, col: 0, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    expect(glyphs).toHaveLength(2)
    for (const g of glyphs) {
      expect(g.kind).toBe('corner')
    }
    const dirs = glyphs.map((g) => g.dir).sort((a, b) => a - b)
    expect(dirs).toEqual([DIR_NE, DIR_SW])
  })
})

describe('pieceConnectorGlyphs (multi-cell mega sweep)', () => {
  it('mega sweep reports the cardinal glyphs on the canonical anchor cell', () => {
    const piece: Piece = {
      type: 'megaSweepRight',
      row: 0,
      col: 0,
      rotation: 0,
    }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    expect(glyphs).toHaveLength(2)
    for (const g of glyphs) {
      expect(g.cellRow).toBe(0)
      expect(g.cellCol).toBe(0)
      expect(g.kind).toBe('cardinal')
    }
  })
})

describe('cityConnectorGlyphs (whole-city walk)', () => {
  it('returns the union of every piece glyph in placement order', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'left90', row: 1, col: 0, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    expect(glyphs).toHaveLength(4)
    const indices = glyphs.map((g) => g.pieceIndex)
    expect(indices).toEqual([0, 0, 1, 1])
  })

  it('returns an empty array for an empty piece list', () => {
    const glyphs = cityConnectorGlyphs([])
    expect(glyphs).toEqual([])
  })

  it('returns a fresh array on every call', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ]
    const a = cityConnectorGlyphs(pieces)
    const b = cityConnectorGlyphs(pieces)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('preserves the per-piece glyph order (south then north for a straight)', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    expect(glyphs[0].dir).toBe(DIR_S)
    expect(glyphs[1].dir).toBe(DIR_N)
  })
})

describe('pieceConnectorGlyphs glyph positions', () => {
  it('cardinal glyph sits exactly on the cell edge midpoint', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    const south = glyphs.find((g) => g.dir === DIR_S)!
    expect(south.y % CELL_PIXELS).toBe(0)
  })

  it('corner glyph sits exactly on the cell corner', () => {
    const piece: Piece = { type: 'diagonal', row: 0, col: 0, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    for (const g of glyphs) {
      expect(g.x % CELL_PIXELS).toBe(0)
      expect(g.y % CELL_PIXELS).toBe(0)
    }
  })

  it('exposes finite numeric x and y on every glyph', () => {
    const pieces: Piece[] = [
      { type: 'intersection', row: 1, col: 2, rotation: 0 },
      { type: 'megaSweepLeft', row: -3, col: 4, rotation: 90 },
      { type: 'arc45', row: 0, col: 0, rotation: 180 },
      { type: 'diagonal', row: 5, col: -5, rotation: 270 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    expect(glyphs.length).toBeGreaterThan(0)
    for (const g of glyphs) {
      expect(Number.isFinite(g.x)).toBe(true)
      expect(Number.isFinite(g.y)).toBe(true)
    }
  })
})

describe('ConnectorGlyph type shape', () => {
  it('returns the documented shape', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const glyph: ConnectorGlyph | undefined = pieceConnectorGlyphs(piece, 0)[0]
    expect(glyph).toBeDefined()
    expect(typeof glyph!.x).toBe('number')
    expect(typeof glyph!.y).toBe('number')
    expect(typeof glyph!.dir).toBe('number')
    expect(['cardinal', 'corner']).toContain(glyph!.kind)
    expect(typeof glyph!.pieceIndex).toBe('number')
    expect(typeof glyph!.cellRow).toBe('number')
    expect(typeof glyph!.cellCol).toBe('number')
  })
})
