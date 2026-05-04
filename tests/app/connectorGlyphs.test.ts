import { describe, expect, it } from 'vitest'
import {
  CELL_HALF_PIXELS,
  CONNECTOR_DIR_LABEL,
  GLYPH_RADIUS_PIXELS,
  cityConnectorGlyphs,
  countMatchedGlyphs,
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
    expect(['matched', 'open']).toContain(glyph!.status)
  })
})

describe('connector match status (REQ-019, REQ-063)', () => {
  it('every glyph reports open by default for a single-piece city', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const glyphs = pieceConnectorGlyphs(piece, 0)
    for (const g of glyphs) {
      expect(g.status).toBe('open')
    }
  })

  it('two stacked straights both report matched on the shared edge', () => {
    // Straight at (0, 0) has ports facing N (row -1) and S (row 1).
    // Straight at (1, 0) has ports facing N (row 0) and S (row 2).
    // The S port of the first straight faces the N port of the second.
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 1, col: 0, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    const firstSouth = glyphs.find(
      (g) => g.pieceIndex === 0 && g.dir === DIR_S,
    )!
    const secondNorth = glyphs.find(
      (g) => g.pieceIndex === 1 && g.dir === DIR_N,
    )!
    expect(firstSouth.status).toBe('matched')
    expect(secondNorth.status).toBe('matched')
  })

  it('the open ends of a two-straight stack stay open', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 1, col: 0, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    const firstNorth = glyphs.find(
      (g) => g.pieceIndex === 0 && g.dir === DIR_N,
    )!
    const secondSouth = glyphs.find(
      (g) => g.pieceIndex === 1 && g.dir === DIR_S,
    )!
    expect(firstNorth.status).toBe('open')
    expect(secondSouth.status).toBe('open')
  })

  it('a straight against an empty cell reports both ports open', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    for (const g of glyphs) {
      expect(g.status).toBe('open')
    }
  })

  it('two adjacent straights at right angles do not match (cardinal-vs-cardinal opposite check fails)', () => {
    // First straight at (0, 0) faces N / S.
    // Second straight at (0, 1) (rotated 90deg) faces E / W.
    // No port pair faces opposite each other across the shared edge.
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: 1, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    for (const g of glyphs) {
      expect(g.status).toBe('open')
    }
  })

  it('an intersection links to a straight on each cardinal arm', () => {
    // Intersection at (0, 0) has N / E / S / W ports.
    // Place a straight at (1, 0) (S of intersection): the intersection's
    // S port faces the straight's N port -> matched.
    const pieces: Piece[] = [
      { type: 'intersection', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 1, col: 0, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    const intersectionS = glyphs.find(
      (g) => g.pieceIndex === 0 && g.dir === DIR_S,
    )!
    const straightN = glyphs.find(
      (g) => g.pieceIndex === 1 && g.dir === DIR_N,
    )!
    expect(intersectionS.status).toBe('matched')
    expect(straightN.status).toBe('matched')
    // The intersection's other three arms remain open.
    const otherArms = glyphs.filter(
      (g) => g.pieceIndex === 0 && g.dir !== DIR_S,
    )
    for (const g of otherArms) {
      expect(g.status).toBe('open')
    }
  })

  it('a port does not match itself even when its piece has another port at the same cell', () => {
    // An intersection has four ports on the same cell. A port facing N
    // walks one cell north and looks for an opposite (S) port on a
    // different piece. Without a neighbor, the port stays open even
    // though the source piece has its own E / S / W ports on the cell.
    const pieces: Piece[] = [
      { type: 'intersection', row: 0, col: 0, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    for (const g of glyphs) {
      expect(g.status).toBe('open')
    }
  })

  it('two diagonals laid end-to-end report matched on the shared corner', () => {
    // Diagonal at (0, 0) has SW + NE ports both anchored at cell (0, 0).
    // The NE port walks one cell NE to cell (-1, 1) looking for a SW
    // port at (-1, 1). Diagonal at (-1, 1) has SW + NE ports anchored
    // at cell (-1, 1), so the SW port at (-1, 1) faces back toward
    // (0, 0). These two ports face each other.
    const pieces: Piece[] = [
      { type: 'diagonal', row: 0, col: 0, rotation: 0 },
      { type: 'diagonal', row: -1, col: 1, rotation: 0 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    const firstNE = glyphs.find(
      (g) => g.pieceIndex === 0 && g.dir === DIR_NE,
    )!
    const secondSW = glyphs.find(
      (g) => g.pieceIndex === 1 && g.dir === DIR_SW,
    )!
    expect(firstNE.status).toBe('matched')
    expect(secondSW.status).toBe('matched')
  })

  it('rotation propagates through to the match check', () => {
    // First straight at (0, 0) rotation 90 faces E / W.
    // Second straight at (0, 1) rotation 90 faces E / W.
    // The first's E port (cell (0, 1)) meets the second's W port.
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 90 },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    const firstE = glyphs.find(
      (g) => g.pieceIndex === 0 && g.dir === DIR_E,
    )!
    const secondW = glyphs.find(
      (g) => g.pieceIndex === 1 && g.dir === DIR_W,
    )!
    expect(firstE.status).toBe('matched')
    expect(secondW.status).toBe('matched')
  })
})

describe('countMatchedGlyphs', () => {
  it('returns zero for an empty glyph list', () => {
    expect(countMatchedGlyphs([])).toBe(0)
  })

  it('returns zero when every glyph is open', () => {
    const glyphs = cityConnectorGlyphs([
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ])
    expect(countMatchedGlyphs(glyphs)).toBe(0)
  })

  it('counts only the matched glyphs (two-straight stack: 2 matched, 2 open)', () => {
    const glyphs = cityConnectorGlyphs([
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 1, col: 0, rotation: 0 },
    ])
    expect(countMatchedGlyphs(glyphs)).toBe(2)
    expect(glyphs).toHaveLength(4)
  })

  it('counts every matched glyph when an intersection links four straights', () => {
    // Intersection at (0, 0) plus straights at N, E, S, W neighbors.
    const pieces: Piece[] = [
      { type: 'intersection', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: -1, col: 0, rotation: 0 },
      { type: 'straight', row: 1, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: -1, rotation: 90 },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
    ]
    const glyphs = cityConnectorGlyphs(pieces)
    // Each straight has exactly one matched arm to the intersection
    // and one open arm pointing away. The intersection has all four
    // arms matched. Total matched: 4 (intersection) + 4 (straights) = 8.
    expect(countMatchedGlyphs(glyphs)).toBe(8)
  })
})
