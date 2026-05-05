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
