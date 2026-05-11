import { describe, expect, it } from 'vitest'
import {
  DIR_E,
  DIR_N,
  DIR_NE,
  DIR_S,
  DIR_SW,
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
  summarizeTrackPath,
  unmatchedPortCells,
  validateConnections,
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

describe('validateConnections (REQ-019, REQ-064)', () => {
  it('returns an empty array for an empty city', () => {
    expect(validateConnections({ pieces: [] })).toEqual([])
  })

  it('reports both ports of a single straight as unmatched', () => {
    const a = piece('straight', 0, 0, 0)
    const result = validateConnections({ pieces: [a] })
    expect(result).toHaveLength(2)
    // Walked in connectorPortsOf order: S then N for straight at rotation 0.
    expect(result[0]).toEqual({
      pieceIndex: 0,
      cellRow: 0,
      cellCol: 0,
      dir: DIR_S,
    })
    expect(result[1]).toEqual({
      pieceIndex: 0,
      cellRow: 0,
      cellCol: 0,
      dir: DIR_N,
    })
  })

  it('matches two stacked straights and only reports the open ends', () => {
    // Two straights stacked vertically at (0,0) and (1,0). The shared
    // edge is matched (S of top with N of bottom); the outer ends stay
    // open (N of top, S of bottom).
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const result = validateConnections({ pieces: [a, b] })
    expect(result).toHaveLength(2)
    // Walked in placement order: piece 0 first.
    expect(result[0]).toEqual({
      pieceIndex: 0,
      cellRow: 0,
      cellCol: 0,
      dir: DIR_N,
    })
    expect(result[1]).toEqual({
      pieceIndex: 1,
      cellRow: 1,
      cellCol: 0,
      dir: DIR_S,
    })
  })

  it('returns an empty array when every port is matched', () => {
    // A 2x2 closed loop of 90deg corners. Every port has an opposing
    // neighbor port across the shared edge.
    const a = piece('right90', 0, 0, 0) // S, E
    const b = piece('left90', 0, 1, 0) // S, W
    const c = piece('right90', 1, 1, 180) // N, W
    const d = piece('left90', 1, 0, 180) // N, E
    // Sanity: portsConnect must hold for adjacent pairs (a-b right edge,
    // a-d bottom edge, b-c bottom edge, c-d left edge).
    const aPorts = connectorPortsOf(a)
    const bPorts = connectorPortsOf(b)
    expect(aPorts.some((p) => p.dir === DIR_E)).toBe(true)
    expect(bPorts.some((p) => p.dir === DIR_W)).toBe(true)
    const result = validateConnections({ pieces: [a, b, c, d] })
    expect(result).toEqual([])
  })

  it('reports an intersection 4-way as four open ports when alone', () => {
    const a = piece('intersection', 0, 0, 0)
    const result = validateConnections({ pieces: [a] })
    expect(result).toHaveLength(4)
    // All four ports come from piece 0 on the same cell.
    for (const r of result) {
      expect(r.pieceIndex).toBe(0)
      expect(r.cellRow).toBe(0)
      expect(r.cellCol).toBe(0)
    }
    const dirs = result.map((r) => r.dir).sort((x, y) => x - y)
    expect(dirs).toEqual([DIR_N, DIR_E, DIR_S, DIR_W])
  })

  it('matches an intersection wired to four straights and reports the four outer ends', () => {
    // Intersection at origin with one straight on each cardinal arm.
    const inter = piece('intersection', 0, 0, 0)
    const north = piece('straight', -1, 0, 0)
    const east = piece('straight', 0, 1, 90)
    const south = piece('straight', 1, 0, 0)
    const west = piece('straight', 0, -1, 90)
    const result = validateConnections({
      pieces: [inter, north, east, south, west],
    })
    // 4 intersection arms all matched, 1 port each on every straight is
    // matched (the one facing the intersection), and one outer port
    // each remains open. Total: 4 unmatched ports.
    expect(result).toHaveLength(4)
    // Each unmatched port belongs to one of the four straights.
    const ownerCounts = new Map<number, number>()
    for (const r of result) {
      ownerCounts.set(r.pieceIndex, (ownerCounts.get(r.pieceIndex) ?? 0) + 1)
    }
    expect(ownerCounts.get(0)).toBeUndefined()
    expect(ownerCounts.get(1)).toBe(1)
    expect(ownerCounts.get(2)).toBe(1)
    expect(ownerCounts.get(3)).toBe(1)
    expect(ownerCounts.get(4)).toBe(1)
  })

  it('does not match an intersection arm against its own opposing arm', () => {
    // The N and S ports of a single intersection live on the same cell
    // facing opposite directions. Without the source-piece guard, the N
    // port stepping north would land on (-1, 0) and look for a S port
    // there; the S port stepping south would land on (1, 0) and look
    // for a N port there. Neither path reads the source piece, so this
    // test just confirms the four ports remain unmatched when alone.
    const a = piece('intersection', 0, 0, 0)
    const result = validateConnections({ pieces: [a] })
    expect(result).toHaveLength(4)
  })

  it('reports unmatched ports for two adjacent but non-facing pieces', () => {
    // Two straights placed at right angles on adjacent cells. The S
    // port of the first lands on (1, 0) but the second piece exposes
    // E / W ports on (1, 0), not a N port. So no match.
    const a = piece('straight', 0, 0, 0) // S, N
    const b = piece('straight', 1, 0, 90) // E, W (rotated)
    const result = validateConnections({ pieces: [a, b] })
    expect(result).toHaveLength(4)
  })

  it('reports two diagonals laid corner-to-corner as matched on the shared corner', () => {
    // Two diagonal pieces at rotation 0 with corner-to-corner contact.
    // diagonal at (0,0) has SW + NE ports; diagonal at (-1,1) has SW + NE
    // ports rotated 0. The NE of (0,0) faces SW of (-1,1).
    const a = piece('diagonal', 0, 0, 0)
    const b = piece('diagonal', -1, 1, 0)
    const result = validateConnections({ pieces: [a, b] })
    // Each diagonal has 2 ports; one matched, one open.
    expect(result).toHaveLength(2)
    const dirs = result.map((r) => r.dir).sort((x, y) => x - y)
    // Open ports are SW of (0,0) and NE of (-1,1).
    expect(dirs).toEqual([1, 5])
  })

  it('walks pieces in placement order and ports in connectorPortsOf order', () => {
    // Three isolated straights placed in a non-monotonic anchor order
    // to confirm the result orders by placement, not by anchor.
    const a = piece('straight', 5, 5, 0)
    const b = piece('straight', 0, 0, 0)
    const c = piece('straight', -3, -3, 0)
    const result = validateConnections({ pieces: [a, b, c] })
    expect(result).toHaveLength(6)
    // First two entries are piece 0 (anchor 5,5); next two are piece 1
    // (anchor 0,0); last two are piece 2 (anchor -3,-3).
    expect(result[0].pieceIndex).toBe(0)
    expect(result[1].pieceIndex).toBe(0)
    expect(result[2].pieceIndex).toBe(1)
    expect(result[3].pieceIndex).toBe(1)
    expect(result[4].pieceIndex).toBe(2)
    expect(result[5].pieceIndex).toBe(2)
    // Each piece reports S then N (connectorPortsOf order at rotation 0).
    expect(result[0].dir).toBe(DIR_S)
    expect(result[1].dir).toBe(DIR_N)
  })

  it('returns a fresh array on every call', () => {
    const a = piece('straight', 0, 0, 0)
    const a1 = validateConnections({ pieces: [a] })
    const a2 = validateConnections({ pieces: [a] })
    expect(a1).not.toBe(a2)
    expect(a1).toEqual(a2)
  })

  it('uses absolute footprint cells for hairpin ports', () => {
    // Hairpin at anchor (0, 0) has two W-facing ports at footprint
    // offsets (-1, 0) and (1, 0), so the absolute cells are (-1, 0) and
    // (1, 0). With no neighbor pieces, both are unmatched.
    const a = piece('hairpin', 0, 0, 0)
    const result = validateConnections({ pieces: [a] })
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      pieceIndex: 0,
      cellRow: -1,
      cellCol: 0,
      dir: DIR_W,
    })
    expect(result[1]).toEqual({
      pieceIndex: 0,
      cellRow: 1,
      cellCol: 0,
      dir: DIR_W,
    })
  })

  it('matches an arc45 cardinal-corner pair with a corresponding partner', () => {
    // arc45 at (0, 0) rotation 0 has S (cardinal) + NE (corner) ports.
    // Pair its NE port with another arc45 at (-1, 1) rotation 180
    // (which puts its N + SW ports on, so SW faces back toward NE of
    // the first piece across the shared corner).
    const a = piece('arc45', 0, 0, 0) // S, NE
    const b = piece('arc45', -1, 1, 180) // N, SW
    const aPorts = connectorPortsOf(a)
    const bPorts = connectorPortsOf(b)
    expect(aPorts.map((p) => p.dir)).toEqual([DIR_S, DIR_NE])
    // Confirm sanity of partner: rotating arc45 by 180 takes S -> N,
    // NE -> SW.
    expect(bPorts.map((p) => p.dir).sort((x, y) => x - y)).toEqual([0, 5])
    const result = validateConnections({ pieces: [a, b] })
    // 4 total ports, 1 matched pair (NE / SW), 2 open.
    expect(result).toHaveLength(2)
    // a's open port is S; b's open port is N.
    expect(result[0]).toEqual({
      pieceIndex: 0,
      cellRow: 0,
      cellCol: 0,
      dir: DIR_S,
    })
    expect(result[1]).toEqual({
      pieceIndex: 1,
      cellRow: -1,
      cellCol: 1,
      dir: DIR_N,
    })
  })

  it('survives a CitySchema round trip', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const parsed = CitySchema.parse({ pieces: [a, b], buildings: [] })
    const result = validateConnections(parsed)
    expect(result).toHaveLength(2)
    expect(result[0].pieceIndex).toBe(0)
    expect(result[1].pieceIndex).toBe(1)
  })
})

describe('unmatchedPortCells (REQ-019, REQ-064)', () => {
  it('returns an empty set for an empty unmatched-ports list', () => {
    const result = unmatchedPortCells([])
    expect(result.size).toBe(0)
  })

  it('returns one cell key per unique unmatched port cell', () => {
    // A single straight at (0, 0) has both N and S ports unmatched,
    // both anchored on cell (0, 0); the set collapses to one entry.
    const a = piece('straight', 0, 0, 0)
    const ports = validateConnections({ pieces: [a] })
    const result = unmatchedPortCells(ports)
    expect(result.size).toBe(1)
    expect(result.has('0,0')).toBe(true)
  })

  it('reports separate keys for ports anchored on different cells', () => {
    // Two stacked straights leave the open ends on (0, 0) and (1, 0).
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const ports = validateConnections({ pieces: [a, b] })
    const result = unmatchedPortCells(ports)
    expect(result.size).toBe(2)
    expect(result.has('0,0')).toBe(true)
    expect(result.has('1,0')).toBe(true)
  })

  it('uses absolute footprint cells for multi-cell pieces', () => {
    // Hairpin at anchor (0, 0) reports unmatched ports on absolute
    // cells (-1, 0) and (1, 0), not on the anchor.
    const a = piece('hairpin', 0, 0, 0)
    const ports = validateConnections({ pieces: [a] })
    const result = unmatchedPortCells(ports)
    expect(result.size).toBe(2)
    expect(result.has('-1,0')).toBe(true)
    expect(result.has('1,0')).toBe(true)
    expect(result.has('0,0')).toBe(false)
  })

  it('returns a fresh set on every call', () => {
    const a = piece('straight', 0, 0, 0)
    const ports = validateConnections({ pieces: [a] })
    const r1 = unmatchedPortCells(ports)
    const r2 = unmatchedPortCells(ports)
    expect(r1).not.toBe(r2)
    expect(Array.from(r1).sort()).toEqual(Array.from(r2).sort())
  })

  it('does not mutate the input list', () => {
    const a = piece('straight', 0, 0, 0)
    const ports = validateConnections({ pieces: [a] })
    const before = ports.length
    unmatchedPortCells(ports)
    expect(ports.length).toBe(before)
  })
})

describe('summarizeTrackPath (REQ-019, REQ-064)', () => {
  it('returns zeros for an empty city', () => {
    const path = buildTrackPath({ pieces: [] })
    expect(summarizeTrackPath(path)).toEqual({
      mainSegmentLength: 0,
      totalPieces: 0,
      mainSegmentClosesLoop: false,
      segmentCount: 0,
    })
  })

  it('reports a single straight as a one-piece open main segment', () => {
    const path = buildTrackPath({ pieces: [piece('straight', 0, 0, 0)] })
    expect(summarizeTrackPath(path)).toEqual({
      mainSegmentLength: 1,
      totalPieces: 1,
      mainSegmentClosesLoop: false,
      segmentCount: 1,
    })
  })

  it('reports two stacked straights as a two-piece open main segment', () => {
    const path = buildTrackPath({
      pieces: [piece('straight', 0, 0, 0), piece('straight', 1, 0, 0)],
    })
    expect(summarizeTrackPath(path)).toEqual({
      mainSegmentLength: 2,
      totalPieces: 2,
      mainSegmentClosesLoop: false,
      segmentCount: 1,
    })
  })

  it('flags a 2x2 closed loop as mainSegmentClosesLoop=true', () => {
    // Four 90deg corners walking N -> E -> S -> W and back into the
    // first piece form a closed rectangular loop.
    const path = buildTrackPath({
      pieces: [
        piece('right90', 0, 0, 0),
        piece('left90', 0, 1, 0),
        piece('right90', 1, 1, 180),
        piece('left90', 1, 0, 180),
      ],
    })
    const summary = summarizeTrackPath(path)
    expect(summary.mainSegmentClosesLoop).toBe(true)
    expect(summary.mainSegmentLength).toBe(4)
    expect(summary.totalPieces).toBe(4)
    expect(summary.segmentCount).toBe(1)
  })

  it('counts disconnected components separately so mainSegmentLength is less than totalPieces', () => {
    // Two stacked straights are the main segment; a lone straight at
    // (5, 5) is a separate component (segment-1).
    const path = buildTrackPath({
      pieces: [
        piece('straight', 0, 0, 0),
        piece('straight', 1, 0, 0),
        piece('straight', 5, 5, 0),
      ],
    })
    expect(summarizeTrackPath(path)).toEqual({
      mainSegmentLength: 2,
      totalPieces: 3,
      mainSegmentClosesLoop: false,
      segmentCount: 2,
    })
  })

  it('reports segmentCount = 3 for three isolated pieces', () => {
    const path = buildTrackPath({
      pieces: [
        piece('straight', 0, 0, 0),
        piece('straight', 5, 5, 0),
        piece('straight', -3, -3, 0),
      ],
    })
    const summary = summarizeTrackPath(path)
    expect(summary.segmentCount).toBe(3)
    expect(summary.totalPieces).toBe(3)
    expect(summary.mainSegmentLength).toBe(1)
    expect(summary.mainSegmentClosesLoop).toBe(false)
  })

  it('counts a multi-cell hairpin as one piece in the main segment', () => {
    // A single hairpin is a one-piece component even though it occupies
    // six footprint cells; the summary counts pieces, not cells.
    const path = buildTrackPath({ pieces: [piece('hairpin', 5, 7, 0)] })
    expect(summarizeTrackPath(path)).toEqual({
      mainSegmentLength: 1,
      totalPieces: 1,
      mainSegmentClosesLoop: false,
      segmentCount: 1,
    })
  })

  it('totals pieces across every segment', () => {
    // Two two-piece chains plus an isolated piece.
    const path = buildTrackPath({
      pieces: [
        piece('straight', 0, 0, 0),
        piece('straight', 1, 0, 0),
        piece('straight', 5, 5, 0),
        piece('straight', 6, 5, 0),
        piece('straight', -3, -3, 0),
      ],
    })
    const summary = summarizeTrackPath(path)
    expect(summary.mainSegmentLength).toBe(2)
    expect(summary.totalPieces).toBe(5)
    expect(summary.segmentCount).toBe(3)
    expect(summary.mainSegmentClosesLoop).toBe(false)
  })

  it('does not mutate the input path', () => {
    const path = buildTrackPath({
      pieces: [piece('straight', 0, 0, 0), piece('straight', 1, 0, 0)],
    })
    const beforeSegments = path.segments.slice()
    const beforeMainOrder = path.segments[0].order.slice()
    summarizeTrackPath(path)
    expect(path.segments).toHaveLength(beforeSegments.length)
    expect(path.segments[0].order).toEqual(beforeMainOrder)
  })

  it('reports the walker output for an intersection wired to four straights', () => {
    // An intersection wired with a straight on each cardinal arm walks
    // a pass-through main segment (intersection + entry + opposite exit)
    // and the two non-pass-through arms become their own segments per
    // the multi-component walker. The multi-segment-per-intersection
    // walker that absorbs every arm into one branching segment is still
    // deferred to its own slice; the summary reflects the walker output
    // verbatim so a future walker upgrade lands in this test.
    const path = buildTrackPath({
      pieces: [
        piece('intersection', 0, 0, 0),
        piece('straight', -1, 0, 0),
        piece('straight', 0, 1, 90),
        piece('straight', 1, 0, 0),
        piece('straight', 0, -1, 90),
      ],
    })
    const summary = summarizeTrackPath(path)
    expect(summary.totalPieces).toBe(5)
    expect(summary.mainSegmentLength).toBeGreaterThanOrEqual(1)
    expect(summary.mainSegmentLength).toBeLessThanOrEqual(5)
    expect(summary.segmentCount).toBeGreaterThanOrEqual(1)
    expect(summary.mainSegmentClosesLoop).toBe(false)
  })

  it('survives a CitySchema round trip', () => {
    const a = piece('straight', 0, 0, 0)
    const b = piece('straight', 1, 0, 0)
    const parsed = CitySchema.parse({ pieces: [a, b], buildings: [] })
    const path = buildTrackPath(parsed)
    expect(summarizeTrackPath(path)).toEqual({
      mainSegmentLength: 2,
      totalPieces: 2,
      mainSegmentClosesLoop: false,
      segmentCount: 1,
    })
  })
})

import {
  ARC45_SAMPLE_COUNT,
  CORNER_SAMPLE_COUNT,
  DIAGONAL_SAMPLE_COUNT,
  HAIRPIN_SAMPLE_COUNT,
  MEGA_SWEEP_SAMPLE_COUNT,
  SCURVE_SAMPLE_COUNT,
  STRAIGHT_SAMPLE_COUNT,
  SWEEP_SAMPLE_COUNT,
  pieceTransform,
  sampledPointsForPiece,
  transformSample,
  type SampledPoint,
} from '@/lib/trackPath'
import { CELL_SIZE } from '@/lib/cellSize'
import { PieceTypeSchema } from '@/lib/schemas'

describe('sampled centerline geometry (slice A)', () => {
  const SUPPORTED_TYPES = [
    'straight',
    'left90',
    'right90',
    'scurve',
    'scurveLeft',
    'sweepRight',
    'sweepLeft',
    'megaSweepRight',
    'megaSweepLeft',
    'hairpin',
    'intersection',
    'arc45',
    'diagonal',
  ] as const

  const DEFERRED_TYPES: readonly string[] = []

  describe('per-type sample counts', () => {
    it('STRAIGHT_SAMPLE_COUNT, CORNER_SAMPLE_COUNT, etc are positive integers', () => {
      for (const n of [
        STRAIGHT_SAMPLE_COUNT,
        CORNER_SAMPLE_COUNT,
        SCURVE_SAMPLE_COUNT,
        SWEEP_SAMPLE_COUNT,
        MEGA_SWEEP_SAMPLE_COUNT,
        HAIRPIN_SAMPLE_COUNT,
        ARC45_SAMPLE_COUNT,
        DIAGONAL_SAMPLE_COUNT,
      ]) {
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('sampledPointsForPiece', () => {
    it('returns a non-empty array for every supported piece type', () => {
      for (const type of SUPPORTED_TYPES) {
        const p = piece(type, 0, 0, 0)
        const entry = type === 'diagonal' ? DIR_SW : DIR_S
        const samples = sampledPointsForPiece(p, entry)
        expect(samples).not.toBeNull()
        expect(samples!.length).toBeGreaterThan(1)
      }
    })

    it('every sample has finite x, z, heading', () => {
      for (const type of SUPPORTED_TYPES) {
        const entry = type === 'diagonal' ? DIR_SW : DIR_S
        const samples = sampledPointsForPiece(piece(type, 0, 0, 0), entry)
        for (const s of samples!) {
          expect(Number.isFinite(s.x)).toBe(true)
          expect(Number.isFinite(s.z)).toBe(true)
          expect(Number.isFinite(s.heading)).toBe(true)
        }
      }
    })

    it('returns a fresh array per call (callers can mutate)', () => {
      const a = sampledPointsForPiece(piece('straight', 0, 0, 0), DIR_S)!
      const b = sampledPointsForPiece(piece('straight', 0, 0, 0), DIR_S)!
      expect(a).not.toBe(b)
      a[0].x = 999
      expect(b[0].x).not.toBe(999)
    })

    it('straight at origin runs from (0, +HALF) south to (0, -HALF) north', () => {
      const samples = sampledPointsForPiece(piece('straight', 0, 0, 0), DIR_S)!
      const first = samples[0]
      const last = samples[samples.length - 1]
      expect(first.x).toBeCloseTo(0, 6)
      expect(first.z).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(last.x).toBeCloseTo(0, 6)
      expect(last.z).toBeCloseTo(-CELL_SIZE / 2, 6)
    })

    it('straight at (row=2, col=3) translates to world (3*CELL_SIZE, 2*CELL_SIZE)', () => {
      const samples = sampledPointsForPiece(piece('straight', 2, 3, 0), DIR_S)!
      const first = samples[0]
      const last = samples[samples.length - 1]
      expect(first.x).toBeCloseTo(3 * CELL_SIZE, 6)
      expect(first.z).toBeCloseTo(2 * CELL_SIZE + CELL_SIZE / 2, 6)
      expect(last.x).toBeCloseTo(3 * CELL_SIZE, 6)
      expect(last.z).toBeCloseTo(2 * CELL_SIZE - CELL_SIZE / 2, 6)
    })

    it('reversal flips sample order and rotates headings by 180deg', () => {
      // entryDir = north (0) on an unrotated straight reverses the path.
      const fwd = sampledPointsForPiece(piece('straight', 0, 0, 0), DIR_S)!
      const rev = sampledPointsForPiece(piece('straight', 0, 0, 0), DIR_N)!
      expect(rev[0].x).toBeCloseTo(fwd[fwd.length - 1].x, 6)
      expect(rev[0].z).toBeCloseTo(fwd[fwd.length - 1].z, 6)
      // Forward heading is PI/2 (north); reversed heading should be PI/2 + PI
      // mod 2PI which lands at -PI/2 (south).
      const fwdHeading = fwd[0].heading
      const revHeading = rev[rev.length - 1].heading
      const diff = (((revHeading - fwdHeading) % (2 * Math.PI)) + 2 * Math.PI) %
        (2 * Math.PI)
      expect(diff).toBeCloseTo(Math.PI, 6)
    })

    it('right90 enters south and exits east at the cell edge', () => {
      const samples = sampledPointsForPiece(piece('right90', 0, 0, 0), DIR_S)!
      const first = samples[0]
      const last = samples[samples.length - 1]
      expect(first.x).toBeCloseTo(0, 6)
      expect(first.z).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(last.x).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(last.z).toBeCloseTo(0, 6)
    })

    it('left90 enters south and exits west at the cell edge', () => {
      const samples = sampledPointsForPiece(piece('left90', 0, 0, 0), DIR_S)!
      const first = samples[0]
      const last = samples[samples.length - 1]
      expect(first.x).toBeCloseTo(0, 6)
      expect(first.z).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(last.x).toBeCloseTo(-CELL_SIZE / 2, 6)
      expect(last.z).toBeCloseTo(0, 6)
    })

    it('rotation 90 rotates the entry/exit by one cardinal step', () => {
      // straight at rotation 90: base entry S becomes W, base exit N becomes E.
      const samples = sampledPointsForPiece(piece('straight', 0, 0, 90), DIR_W)!
      const first = samples[0]
      const last = samples[samples.length - 1]
      // Entry was at local (0, +HALF) heading north; rotated 90 CW it lands
      // at world (-HALF, 0) heading east.
      expect(first.x).toBeCloseTo(-CELL_SIZE / 2, 6)
      expect(first.z).toBeCloseTo(0, 6)
      expect(last.x).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(last.z).toBeCloseTo(0, 6)
    })

    it('left90 and right90 are mirror images across the local x axis', () => {
      const right = sampledPointsForPiece(piece('right90', 0, 0, 0), DIR_S)!
      const left = sampledPointsForPiece(piece('left90', 0, 0, 0), DIR_S)!
      expect(left.length).toBe(right.length)
      for (let i = 0; i < right.length; i++) {
        expect(left[i].x).toBeCloseTo(-right[i].x, 6)
        expect(left[i].z).toBeCloseTo(right[i].z, 6)
      }
    })

    it('PieceTypeSchema is fully covered by SUPPORTED + DEFERRED partition', () => {
      const supported = new Set<string>(SUPPORTED_TYPES)
      const deferred = new Set<string>(DEFERRED_TYPES)
      for (const type of PieceTypeSchema.options) {
        const inOne = supported.has(type) || deferred.has(type)
        expect(inOne).toBe(true)
      }
    })

    it('arc45 enters south heading north and exits at the NE corner heading northeast', () => {
      const samples = sampledPointsForPiece(piece('arc45', 0, 0, 0), DIR_S)!
      expect(samples.length).toBe(ARC45_SAMPLE_COUNT)
      const first = samples[0]
      const last = samples[samples.length - 1]
      expect(first.x).toBeCloseTo(0, 6)
      expect(first.z).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(first.heading).toBeCloseTo(Math.PI / 2, 6)
      expect(last.x).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(last.z).toBeCloseTo(-CELL_SIZE / 2, 6)
      // Exit heading at the NE corner is northeast (PI/4) because the bezier
      // arrives at p3 with a tangent that bisects north and east.
      expect(last.heading).toBeCloseTo(Math.PI / 4, 2)
    })

    it('arc45 reverses entry direction on 180deg flip', () => {
      // Entering arc45 from its NE port (DIR_NE) is the OPPOSITE end of the
      // base entry (DIR_S), so the sample order reverses and headings rotate
      // by 180 degrees.
      const fwd = sampledPointsForPiece(piece('arc45', 0, 0, 0), DIR_S)!
      const rev = sampledPointsForPiece(piece('arc45', 0, 0, 0), DIR_NE)!
      expect(rev.length).toBe(fwd.length)
      expect(rev[0].x).toBeCloseTo(fwd[fwd.length - 1].x, 6)
      expect(rev[0].z).toBeCloseTo(fwd[fwd.length - 1].z, 6)
      const fwdHeading = fwd[0].heading
      const revHeading = rev[rev.length - 1].heading
      const diff = (((revHeading - fwdHeading) % (2 * Math.PI)) + 2 * Math.PI) %
        (2 * Math.PI)
      expect(diff).toBeCloseTo(Math.PI, 6)
    })

    it('diagonal runs from SW corner to NE corner along a 45deg line', () => {
      const samples = sampledPointsForPiece(
        piece('diagonal', 0, 0, 0),
        DIR_SW,
      )!
      expect(samples.length).toBe(DIAGONAL_SAMPLE_COUNT)
      const first = samples[0]
      const last = samples[samples.length - 1]
      expect(first.x).toBeCloseTo(-CELL_SIZE / 2, 6)
      expect(first.z).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(last.x).toBeCloseTo(CELL_SIZE / 2, 6)
      expect(last.z).toBeCloseTo(-CELL_SIZE / 2, 6)
      for (const s of samples) {
        expect(s.heading).toBeCloseTo(Math.PI / 4, 6)
      }
    })

    it('diagonal reverses entry direction on 180deg flip', () => {
      // diagonal at rotation 0 has SW (5) and NE (1) ports. Entering from NE
      // is the OPPOSITE end so the sample order reverses and headings flip
      // by 180deg (PI/4 -> -3PI/4 which is equivalent to PI/4 + PI mod 2PI).
      const fwd = sampledPointsForPiece(piece('diagonal', 0, 0, 0), DIR_SW)!
      const rev = sampledPointsForPiece(piece('diagonal', 0, 0, 0), DIR_NE)!
      expect(rev.length).toBe(fwd.length)
      expect(rev[0].x).toBeCloseTo(fwd[fwd.length - 1].x, 6)
      expect(rev[0].z).toBeCloseTo(fwd[fwd.length - 1].z, 6)
      const fwdHeading = fwd[0].heading
      const revHeading = rev[rev.length - 1].heading
      const diff = (((revHeading - fwdHeading) % (2 * Math.PI)) + 2 * Math.PI) %
        (2 * Math.PI)
      expect(diff).toBeCloseTo(Math.PI, 6)
    })

    it('arc45 at (row=2, col=3) translates into world space by piece anchor', () => {
      const samples = sampledPointsForPiece(piece('arc45', 2, 3, 0), DIR_S)!
      const first = samples[0]
      expect(first.x).toBeCloseTo(3 * CELL_SIZE, 6)
      expect(first.z).toBeCloseTo(2 * CELL_SIZE + CELL_SIZE / 2, 6)
    })

    it('diagonal at (row=2, col=3) translates into world space by piece anchor', () => {
      const samples = sampledPointsForPiece(
        piece('diagonal', 2, 3, 0),
        DIR_SW,
      )!
      const first = samples[0]
      const last = samples[samples.length - 1]
      expect(first.x).toBeCloseTo(3 * CELL_SIZE - CELL_SIZE / 2, 6)
      expect(first.z).toBeCloseTo(2 * CELL_SIZE + CELL_SIZE / 2, 6)
      expect(last.x).toBeCloseTo(3 * CELL_SIZE + CELL_SIZE / 2, 6)
      expect(last.z).toBeCloseTo(2 * CELL_SIZE - CELL_SIZE / 2, 6)
    })
  })

  describe('transformSample + pieceTransform', () => {
    it('pieceTransform converts (row, col, rotation) to (world x, z, theta)', () => {
      const t = pieceTransform({ row: 2, col: 3, rotation: 90 })
      expect(t.x).toBeCloseTo(3 * CELL_SIZE, 6)
      expect(t.z).toBeCloseTo(2 * CELL_SIZE, 6)
      expect(t.theta).toBeCloseTo(Math.PI / 2, 6)
    })

    it('transformSample with theta = 0 only translates', () => {
      const s: SampledPoint = { x: 1, z: 2, heading: Math.PI / 4 }
      const out = transformSample(s, { x: 10, z: 20, theta: 0 })
      expect(out.x).toBeCloseTo(11, 6)
      expect(out.z).toBeCloseTo(22, 6)
      expect(out.heading).toBeCloseTo(Math.PI / 4, 6)
    })

    it('transformSample rotates a +Z (south) tangent by theta = PI / 2 to +X (east)', () => {
      const s: SampledPoint = { x: 0, z: 1, heading: -Math.PI / 2 }
      const out = transformSample(s, { x: 0, z: 0, theta: Math.PI / 2 })
      // Local +Z rotates 90 CW (compass) to world -X.
      expect(out.x).toBeCloseTo(-1, 6)
      expect(out.z).toBeCloseTo(0, 6)
      // Heading rotates by -theta, so -PI/2 becomes -PI which is equivalent
      // to PI mod 2PI.
      const wrapped = ((out.heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
      expect(Math.abs(Math.abs(wrapped) - Math.PI)).toBeLessThan(1e-6)
    })
  })

  describe('walker populates OrderedPiece.samples', () => {
    it('every walked piece gets a non-null samples array for supported types', () => {
      const path = buildTrackPath({
        pieces: [
          piece('straight', 0, 0, 0),
          piece('straight', -1, 0, 0),
          piece('straight', -2, 0, 0),
        ],
      })
      const ordered = path.segments[0].order
      expect(ordered.length).toBe(3)
      for (const op of ordered) {
        expect(op.samples).not.toBeNull()
        expect(op.samples!.length).toBeGreaterThan(1)
      }
    })

    it('arc45 / diagonal pieces produce a sampled centerline once F-003 lands', () => {
      const arcPath = buildTrackPath({ pieces: [piece('arc45', 0, 0, 0)] })
      const arcSamples = arcPath.segments[0].order[0].samples
      expect(arcSamples).not.toBeNull()
      expect(arcSamples!.length).toBe(ARC45_SAMPLE_COUNT)

      const diagPath = buildTrackPath({ pieces: [piece('diagonal', 0, 0, 0)] })
      const diagSamples = diagPath.segments[0].order[0].samples
      expect(diagSamples).not.toBeNull()
      expect(diagSamples!.length).toBe(DIAGONAL_SAMPLE_COUNT)
    })
  })
})
