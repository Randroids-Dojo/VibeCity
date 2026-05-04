import { describe, expect, it } from 'vitest'
import {
  DIR_E,
  DIR_N,
  DIR_NE,
  DIR_S,
  DIR_W,
  connectorPortsOf,
} from '@/lib/connectors'
import type { Piece } from '@/lib/schemas'
import { CitySchema } from '@/lib/schemas'
import {
  buildTrackPath,
  findConnectedNeighbor,
  neighborAnchorCell,
  portCell,
  portsConnect,
} from '@/lib/trackPath'

/**
 * REQ-064: Segment-based path substrate.
 *
 * v1 substrate ships the connected-graph helpers (`portCell`,
 * `neighborAnchorCell`, `portsConnect`, `findConnectedNeighbor`) and
 * the `buildTrackPath` walker that produces a single segment from the
 * connected component starting at `city.pieces[0]` plus the
 * `cellToOrderIdx` and `cellToLocators` lookups. Geometry (sampled
 * centerlines, headings, spawn) is deferred to F-003 / F-004 / future
 * slices.
 */

function piece(
  type: Piece['type'],
  row: number,
  col: number,
  rotation: Piece['rotation'] = 0,
): Piece {
  return { type, row, col, rotation }
}

describe('portCell (REQ-064)', () => {
  it('returns the anchor cell for a port at the anchor offset', () => {
    expect(portCell(piece('straight', 3, 4), { dr: 0, dc: 0 })).toEqual({
      row: 3,
      col: 4,
    })
  })

  it('adds the port footprint offset to the piece anchor', () => {
    expect(portCell(piece('hairpin', 5, 7), { dr: -1, dc: 0 })).toEqual({
      row: 4,
      col: 7,
    })
    expect(portCell(piece('hairpin', 5, 7), { dr: 1, dc: 0 })).toEqual({
      row: 6,
      col: 7,
    })
  })

  it('handles negative anchor coordinates', () => {
    expect(portCell(piece('straight', -2, -3), { dr: 0, dc: 0 })).toEqual({
      row: -2,
      col: -3,
    })
  })
})

describe('neighborAnchorCell (REQ-064)', () => {
  it('steps one cell beyond the port host along the port direction', () => {
    const p = piece('straight', 0, 0, 0)
    const ports = connectorPortsOf(p)
    const south = ports.find((port) => port.dir === DIR_S)!
    expect(neighborAnchorCell(p, south)).toEqual({ row: 1, col: 0 })
    const north = ports.find((port) => port.dir === DIR_N)!
    expect(neighborAnchorCell(p, north)).toEqual({ row: -1, col: 0 })
  })

  it('walks from a multi-cell footprint port', () => {
    const p = piece('hairpin', 5, 7, 0)
    const ports = connectorPortsOf(p)
    const upperWest = ports.find(
      (port) => port.dir === DIR_W && port.dr === -1,
    )!
    // Port host cell is (4, 7); stepping west lands at (4, 6).
    expect(neighborAnchorCell(p, upperWest)).toEqual({ row: 4, col: 6 })
  })
})

describe('portsConnect (REQ-064)', () => {
  it('returns true for two straights stacked north to south', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const portsA = connectorPortsOf(a)
    const south = portsA.find((p) => p.dir === DIR_S)!
    expect(portsConnect(a, south, b)).toBe(true)
  })

  it('returns false when the neighbor is offset to a non-adjacent cell', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 5, 0, 0)
    const portsA = connectorPortsOf(a)
    const south = portsA.find((p) => p.dir === DIR_S)!
    expect(portsConnect(a, south, b)).toBe(false)
  })

  it('returns false when the port direction is not opposite the neighbor port', () => {
    // Two straights side by side; their north / south ports do not face each other.
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 0, 1, 0)
    const portsA = connectorPortsOf(a)
    const south = portsA.find((p) => p.dir === DIR_S)!
    expect(portsConnect(a, south, b)).toBe(false)
  })

  it('connects an intersection arm to a straight on each cardinal arm', () => {
    const inter = piece('intersection', 0, 0, 0)
    const ports = connectorPortsOf(inter)
    const north = ports.find((p) => p.dir === DIR_N)!
    const east = ports.find((p) => p.dir === DIR_E)!
    const south = ports.find((p) => p.dir === DIR_S)!
    const west = ports.find((p) => p.dir === DIR_W)!
    const sNorth = piece('straight', -1, 0, 0)
    const sEast = piece('straight', 0, 1, 90)
    const sSouth = piece('straight', 1, 0, 0)
    const sWest = piece('straight', 0, -1, 90)
    expect(portsConnect(inter, north, sNorth)).toBe(true)
    expect(portsConnect(inter, east, sEast)).toBe(true)
    expect(portsConnect(inter, south, sSouth)).toBe(true)
    expect(portsConnect(inter, west, sWest)).toBe(true)
  })

  it('connects two diagonals corner to corner', () => {
    // diagonal at rotation 0 has ports SW (5) and NE (1). Two diagonals
    // chained NE / SW should link.
    const a = piece('diagonal', 0, 0, 0)
    const b = piece('diagonal', -1, 1, 0)
    const portsA = connectorPortsOf(a)
    const ne = portsA.find((p) => p.dir === DIR_NE)!
    expect(portsConnect(a, ne, b)).toBe(true)
  })

  it('rejects cardinal-vs-corner cross even when offsets align', () => {
    // A straight's south port at (1, 0) cannot link to a diagonal's
    // SW corner port (those ports never face each other geometrically).
    const a = piece('straight', 0, 0, 0)
    const b = piece('diagonal', 1, 0, 0)
    const portsA = connectorPortsOf(a)
    const south = portsA.find((p) => p.dir === DIR_S)!
    expect(portsConnect(a, south, b)).toBe(false)
  })
})

describe('findConnectedNeighbor (REQ-064)', () => {
  it('returns null when no piece is connected to the port', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 5, 0, 0)
    const portsA = connectorPortsOf(a)
    const south = portsA.find((p) => p.dir === DIR_S)!
    expect(findConnectedNeighbor(a, south, [a, b])).toBeNull()
  })

  it('returns the first matching neighbor', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const portsA = connectorPortsOf(a)
    const south = portsA.find((p) => p.dir === DIR_S)!
    expect(findConnectedNeighbor(a, south, [a, b])).toBe(b)
  })

  it('skips the source piece itself', () => {
    const a = piece('straight', 0, 0, 0)
    const portsA = connectorPortsOf(a)
    const south = portsA.find((p) => p.dir === DIR_S)!
    expect(findConnectedNeighbor(a, south, [a])).toBeNull()
  })

  it('returns the first connected candidate when multiple match', () => {
    // Defensive: the v1 schema does not allow two pieces in the same
    // cell, but the helper should still return the first match if a
    // hand-edited or future-imported city passes a degenerate list.
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const c = piece('straight', 1, 0, 0)
    const portsA = connectorPortsOf(a)
    const south = portsA.find((p) => p.dir === DIR_S)!
    expect(findConnectedNeighbor(a, south, [a, b, c])).toBe(b)
  })
})

describe('buildTrackPath (REQ-064)', () => {
  it('returns an empty path for an empty city', () => {
    const path = buildTrackPath({ pieces: [] })
    expect(path.segments).toEqual([])
    expect(path.cellToOrderIdx.size).toBe(0)
    expect(path.cellToLocators.size).toBe(0)
  })

  it('returns one segment with one ordered piece for a single straight', () => {
    const a = piece('straight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [a] })
    expect(path.segments).toHaveLength(1)
    const seg = path.segments[0]
    expect(seg.id).toBe('main')
    expect(seg.order).toHaveLength(1)
    expect(seg.order[0].piece).toBe(a)
    expect(seg.closesLoop).toBe(false)
  })

  it('maps the anchor cell to order index 0 for a single piece', () => {
    const a = piece('straight', 3, 4, 0)
    const path = buildTrackPath({ pieces: [a] })
    expect(path.cellToOrderIdx.get('3,4')).toBe(0)
    expect(path.cellToOrderIdx.size).toBe(1)
  })

  it('maps the single-cell footprint to one locator entry', () => {
    const a = piece('straight', 3, 4, 0)
    const path = buildTrackPath({ pieces: [a] })
    expect(path.cellToLocators.get('3,4')).toEqual([
      { segmentId: 'main', idx: 0 },
    ])
    expect(path.cellToLocators.size).toBe(1)
  })

  it('walks two connected straights in order', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const path = buildTrackPath({ pieces: [a, b] })
    expect(path.segments[0].order.map((o) => o.piece)).toEqual([a, b])
    expect(path.cellToOrderIdx.get('0,0')).toBe(0)
    expect(path.cellToOrderIdx.get('1,0')).toBe(1)
  })

  it('emits a separate segment per disconnected piece', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const c = piece('straight', 5, 5, 0)
    const path = buildTrackPath({ pieces: [a, b, c] })
    // Main segment contains the connected (a, b) chain; segment-1
    // contains the disconnected island piece c.
    expect(path.segments).toHaveLength(2)
    expect(path.segments[0].id).toBe('main')
    expect(path.segments[0].order).toHaveLength(2)
    expect(path.segments[1].id).toBe('segment-1')
    expect(path.segments[1].order.map((o) => o.piece)).toEqual([c])
    // cellToOrderIdx is scoped to the main segment so the disconnected
    // anchor stays absent there.
    expect(path.cellToOrderIdx.has('5,5')).toBe(false)
    // cellToLocators carries every segment so the disconnected anchor
    // is now addressable via segment-1.
    expect(path.cellToLocators.get('5,5')).toEqual([
      { segmentId: 'segment-1', idx: 0 },
    ])
  })

  it('emits one locator per footprint cell of a multi-cell hairpin', () => {
    const h = piece('hairpin', 0, 0, 0)
    const path = buildTrackPath({ pieces: [h] })
    // Hairpin canonical 2x3 footprint at anchor (0, 0):
    // (-1, 0), (-1, 1), (0, 0), (0, 1), (1, 0), (1, 1)
    const expectedKeys = ['-1,0', '-1,1', '0,0', '0,1', '1,0', '1,1']
    expect(path.cellToLocators.size).toBe(expectedKeys.length)
    for (const key of expectedKeys) {
      expect(path.cellToLocators.get(key)).toEqual([
        { segmentId: 'main', idx: 0 },
      ])
    }
  })

  it('emits one locator per footprint cell of a multi-cell mega sweep', () => {
    const m = piece('megaSweepRight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [m] })
    // megaSweepRight canonical 2x2 anchored at bottom-right:
    // (-1, -1), (-1, 0), (0, -1), (0, 0)
    const expectedKeys = ['-1,-1', '-1,0', '0,-1', '0,0']
    expect(path.cellToLocators.size).toBe(expectedKeys.length)
    for (const key of expectedKeys) {
      expect(path.cellToLocators.get(key)).toEqual([
        { segmentId: 'main', idx: 0 },
      ])
    }
  })

  it('walks through a 4-way intersection by picking the opposite-direction exit', () => {
    // straight (0,0,0) entry from north, intersection at (1, 0), straight at (2, 0).
    // Walker enters intersection from north (dir N) and should exit via south
    // (the port directly opposite) to continue the line.
    const top = piece('straight', 0, 0, 0)
    const inter = piece('intersection', 1, 0, 0)
    const bottom = piece('straight', 2, 0, 0)
    const path = buildTrackPath({ pieces: [top, inter, bottom] })
    expect(path.segments[0].order.map((o) => o.piece)).toEqual([
      top,
      inter,
      bottom,
    ])
  })

  it('records exitDir / entryDir on each ordered piece', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const path = buildTrackPath({ pieces: [a, b] })
    expect(path.segments[0].order[0].exitDir).toBe(DIR_S)
    expect(path.segments[0].order[1].entryDir).toBe(DIR_N)
  })

  it('terminates without infinite loop on a closed two-piece loop', () => {
    // Two pieces is degenerate as a loop, but the seen-cell guard
    // must trip on revisit, so ensure the walker terminates.
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    // Reverse order is also a valid arrangement; the walker must
    // still produce a finite order list.
    const path = buildTrackPath({ pieces: [a, b] })
    expect(path.segments[0].order.length).toBeLessThanOrEqual(2)
  })

  it('round-trips with CitySchema validation', () => {
    const city = {
      pieces: [piece('straight', 0, 0, 0), piece('straight', 1, 0, 0)],
      buildings: [],
    }
    const parsed = CitySchema.parse(city)
    const path = buildTrackPath(parsed)
    expect(path.segments[0].order).toHaveLength(2)
  })

  it('keeps a disconnected island piece out of the main segment', () => {
    // a connects to its second neighbor c; b is a far island. Putting
    // c at index 1 lets the walker prefer the c-facing exit on the
    // start. b appears in its own segment-1 so the main segment stays
    // restricted to the (a, c) chain.
    const a = piece('straight', 0, 0, 0)
    const c = piece('straight', 1, 0, 0)
    const b = piece('straight', 5, 5, 0)
    const path = buildTrackPath({ pieces: [a, c, b] })
    const orderPieces = path.segments[0].order.map((o) => o.piece)
    expect(orderPieces).toContain(a)
    expect(orderPieces).toContain(c)
    expect(orderPieces).not.toContain(b)
    // Main-segment lookup stays scoped to the connected chain.
    expect(path.cellToOrderIdx.has('5,5')).toBe(false)
    // The island piece becomes its own segment.
    expect(path.segments).toHaveLength(2)
    expect(path.segments[1].id).toBe('segment-1')
    expect(path.segments[1].order.map((o) => o.piece)).toEqual([b])
    expect(path.cellToLocators.get('5,5')).toEqual([
      { segmentId: 'segment-1', idx: 0 },
    ])
  })

  it('cellToOrderIdx is keyed by anchor cell only, not by every footprint cell', () => {
    // Multi-cell pieces map only their anchor in cellToOrderIdx; the full
    // footprint lives in cellToLocators.
    const h = piece('hairpin', 0, 0, 0)
    const path = buildTrackPath({ pieces: [h] })
    expect(path.cellToOrderIdx.has('0,0')).toBe(true)
    expect(path.cellToOrderIdx.has('-1,0')).toBe(false)
    expect(path.cellToOrderIdx.has('1,1')).toBe(false)
    expect(path.cellToOrderIdx.size).toBe(1)
    expect(path.cellToLocators.size).toBe(6)
  })

  it('returns a fresh path on every call (no aliasing across builds)', () => {
    const a = piece('straight', 0, 0, 0)
    const path1 = buildTrackPath({ pieces: [a] })
    const path2 = buildTrackPath({ pieces: [a] })
    expect(path1).not.toBe(path2)
    expect(path1.cellToOrderIdx).not.toBe(path2.cellToOrderIdx)
    expect(path1.cellToLocators).not.toBe(path2.cellToLocators)
  })

  it('intersection alone has at most one ordered piece (start)', () => {
    const inter = piece('intersection', 0, 0, 0)
    const path = buildTrackPath({ pieces: [inter] })
    expect(path.segments[0].order).toHaveLength(1)
    expect(path.segments[0].order[0].piece).toBe(inter)
  })

  it('emits one segment per disconnected component in placement order', () => {
    // Two separate two-piece chains. The first chain anchors at (0,0)
    // and the second at (5,5). Each component becomes its own segment.
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const c = piece('straight', 5, 5, 0)
    const d = piece('straight', 6, 5, 0)
    const path = buildTrackPath({ pieces: [a, b, c, d] })
    expect(path.segments).toHaveLength(2)
    expect(path.segments[0].id).toBe('main')
    expect(path.segments[0].order.map((o) => o.piece)).toEqual([a, b])
    expect(path.segments[1].id).toBe('segment-1')
    expect(path.segments[1].order.map((o) => o.piece)).toEqual([c, d])
  })

  it('walks three disconnected components into segment-2', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 5, 5, 0)
    const c = piece('straight', -3, -3, 0)
    const path = buildTrackPath({ pieces: [a, b, c] })
    expect(path.segments).toHaveLength(3)
    expect(path.segments.map((s) => s.id)).toEqual([
      'main',
      'segment-1',
      'segment-2',
    ])
    expect(path.segments[0].order[0].piece).toBe(a)
    expect(path.segments[1].order[0].piece).toBe(b)
    expect(path.segments[2].order[0].piece).toBe(c)
  })

  it('cellToLocators carries locators for every segment, not just main', () => {
    const a = piece('straight', 0, 0, 0)
    const island = piece('straight', 5, 5, 0)
    const path = buildTrackPath({ pieces: [a, island] })
    expect(path.cellToLocators.get('0,0')).toEqual([
      { segmentId: 'main', idx: 0 },
    ])
    expect(path.cellToLocators.get('5,5')).toEqual([
      { segmentId: 'segment-1', idx: 0 },
    ])
  })

  it('cellToOrderIdx stays scoped to the main segment', () => {
    const a = piece('straight', 0, 0, 0)
    const island = piece('straight', 5, 5, 0)
    const path = buildTrackPath({ pieces: [a, island] })
    expect(path.cellToOrderIdx.get('0,0')).toBe(0)
    expect(path.cellToOrderIdx.has('5,5')).toBe(false)
    expect(path.cellToOrderIdx.size).toBe(1)
  })

  it('emits a multi-cell footprint for each isolated segment correctly', () => {
    // Two isolated multi-cell pieces become separate segments with
    // their own footprint locator entries.
    const m = piece('megaSweepRight', 0, 0, 0)
    const h = piece('hairpin', 5, 5, 0)
    const path = buildTrackPath({ pieces: [m, h] })
    expect(path.segments).toHaveLength(2)
    // megaSweepRight canonical 2x2 anchored at bottom-right (0, 0):
    // (-1, -1), (-1, 0), (0, -1), (0, 0).
    const sweepKeys = ['-1,-1', '-1,0', '0,-1', '0,0']
    for (const key of sweepKeys) {
      expect(path.cellToLocators.get(key)).toEqual([
        { segmentId: 'main', idx: 0 },
      ])
    }
    // Hairpin canonical 2x3 footprint anchored at (5, 5):
    // (4, 5), (4, 6), (5, 5), (5, 6), (6, 5), (6, 6).
    const hairpinKeys = ['4,5', '4,6', '5,5', '5,6', '6,5', '6,6']
    for (const key of hairpinKeys) {
      expect(path.cellToLocators.get(key)).toEqual([
        { segmentId: 'segment-1', idx: 0 },
      ])
    }
  })

  it('returns segments in placement order, not anchor order', () => {
    // First piece in the array seeds the main segment regardless of
    // its anchor coordinates. A piece at (10, 10) listed first still
    // becomes the main segment.
    const far = piece('straight', 10, 10, 0)
    const near = piece('straight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [far, near] })
    expect(path.segments[0].id).toBe('main')
    expect(path.segments[0].order[0].piece).toBe(far)
    expect(path.segments[1].id).toBe('segment-1')
    expect(path.segments[1].order[0].piece).toBe(near)
  })

  it('walks the full main chain even when an island piece is listed first', () => {
    // Pieces in placement order: island, chain-a, chain-b. The walker
    // gives the main segment to the island (because it is first), but
    // the second segment captures the connected (chain-a, chain-b)
    // chain in placement order.
    const island = piece('straight', 5, 5, 0)
    const chainA = piece('straight', 0, 0, 0)
    const chainB = piece('straight', 1, 0, 0)
    const path = buildTrackPath({ pieces: [island, chainA, chainB] })
    expect(path.segments[0].order.map((o) => o.piece)).toEqual([island])
    expect(path.segments[1].order.map((o) => o.piece)).toEqual([
      chainA,
      chainB,
    ])
  })

  it('every visited piece appears in exactly one segment', () => {
    // Sanity invariant: with N pieces, the sum of segment lengths
    // equals N because the walker visits every piece once.
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const c = piece('straight', 5, 5, 0)
    const d = piece('straight', 6, 5, 0)
    const e = piece('straight', -3, -3, 0)
    const path = buildTrackPath({ pieces: [a, b, c, d, e] })
    const total = path.segments.reduce((n, seg) => n + seg.order.length, 0)
    expect(total).toBe(5)
  })

  it('disconnected segments do not share locator entries', () => {
    // Two islands at (0,0) and (5,5). Each cellToLocators key carries
    // exactly one locator (no spurious cross-segment entries).
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 5, 5, 0)
    const path = buildTrackPath({ pieces: [a, b] })
    for (const list of path.cellToLocators.values()) {
      expect(list).toHaveLength(1)
    }
  })
})
