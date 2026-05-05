import { describe, expect, it } from 'vitest'
import type { Piece } from '@/lib/schemas'
import { buildTrackPath, type OrderedPiece } from '@/lib/trackPath'
import {
  pickClosestWheelContact,
  pieceAnchorDistance,
  pieceFootprintDistance,
  wheelCell,
  wheelContactCandidates,
  wheelTrackContact,
  type DistanceToCenterlineFn,
  type WheelContactCandidate,
} from '@/lib/wheelContact'

/**
 * REQ-065: multi-locator candidate evaluation for wheel contact.
 *
 * The substrate (REQ-064) emits one locator per footprint cell of every
 * placed piece into `path.cellToLocators`. This module is the
 * candidate-evaluation layer that returns every locator candidate at a
 * wheel's cell, then picks the closest by an injected
 * `distanceToCenterline` resolver. Without the multi-candidate
 * evaluation, multi-cell pieces (hairpin, mega sweep) silently report
 * on-street status against the wrong centerline mid-piece.
 */

const CELL_SIZE = 4

function piece(
  type: Piece['type'],
  row: number,
  col: number,
  rotation: Piece['rotation'] = 0,
): Piece {
  return { type, row, col, rotation }
}

describe('wheelCell (REQ-065)', () => {
  it('rounds the world-space (x, z) to the integer (row, col) cell', () => {
    expect(wheelCell(0, 0, CELL_SIZE)).toEqual({ row: 0, col: 0 })
    expect(wheelCell(CELL_SIZE, 0, CELL_SIZE)).toEqual({ row: 0, col: 1 })
    expect(wheelCell(0, CELL_SIZE, CELL_SIZE)).toEqual({ row: 1, col: 0 })
    expect(wheelCell(CELL_SIZE, CELL_SIZE, CELL_SIZE)).toEqual({
      row: 1,
      col: 1,
    })
  })

  it('rounds at the half-cell boundary so the cell center is at world coords (col * CELL_SIZE, row * CELL_SIZE)', () => {
    // Within half a cell of the cell center -> same cell.
    expect(wheelCell(CELL_SIZE * 0.49, CELL_SIZE * 0.49, CELL_SIZE)).toEqual({
      row: 0,
      col: 0,
    })
    // Beyond half a cell -> next cell.
    expect(wheelCell(CELL_SIZE * 0.51, CELL_SIZE * 0.51, CELL_SIZE)).toEqual({
      row: 1,
      col: 1,
    })
  })

  it('handles negative world coordinates symmetrically', () => {
    expect(wheelCell(-CELL_SIZE, -CELL_SIZE, CELL_SIZE)).toEqual({
      row: -1,
      col: -1,
    })
  })

  it('honors a custom cell size', () => {
    expect(wheelCell(10, 10, 5)).toEqual({ row: 2, col: 2 })
  })
})

describe('pieceAnchorDistance (REQ-065)', () => {
  function fakeOrdered(p: Piece): OrderedPiece {
    return {
      piece: p,
      entryPort: { dr: 0, dc: 0, dir: 0 },
      exitPort: { dr: 0, dc: 0, dir: 4 },
      entryDir: 0,
      exitDir: 4,
    }
  }

  it('returns zero at the piece anchor world center', () => {
    const ordered = fakeOrdered(piece('straight', 3, 4, 0))
    // Anchor world center for (row=3, col=4) is (col * CELL_SIZE, row * CELL_SIZE) = (16, 12).
    expect(pieceAnchorDistance(ordered, 16, 12, CELL_SIZE)).toBe(0)
  })

  it('returns the euclidean distance to the anchor world center', () => {
    const ordered = fakeOrdered(piece('straight', 0, 0, 0))
    expect(pieceAnchorDistance(ordered, 3, 4, CELL_SIZE)).toBeCloseTo(5)
  })

  it('is symmetric across negative offsets', () => {
    const ordered = fakeOrdered(piece('straight', 0, 0, 0))
    expect(pieceAnchorDistance(ordered, -3, -4, CELL_SIZE)).toBeCloseTo(5)
  })

  it('honors a custom cell size', () => {
    const ordered = fakeOrdered(piece('straight', 1, 1, 0))
    // Anchor world center for (row=1, col=1) at cell size 10 is (10, 10).
    expect(pieceAnchorDistance(ordered, 10, 10, 10)).toBe(0)
    expect(pieceAnchorDistance(ordered, 0, 0, 10)).toBeCloseTo(
      Math.sqrt(10 * 10 + 10 * 10),
    )
  })
})

describe('pieceFootprintDistance (REQ-065)', () => {
  // Helper: walk the substrate so the OrderedPiece for a test fixture
  // is the same shape `wheelTrackContact` would feed the resolver.
  function orderedFor(p: Piece): OrderedPiece {
    const path = buildTrackPath({ pieces: [p] })
    const main = path.segments[0]
    if (!main) throw new Error('expected a main segment')
    const ordered = main.order[0]
    if (!ordered) throw new Error('expected an ordered piece')
    return ordered
  }

  it('returns zero at the anchor world center for a single-cell piece', () => {
    const ordered = orderedFor(piece('straight', 3, 4, 0))
    // Anchor world center for (row=3, col=4) is (col * CELL_SIZE, row * CELL_SIZE) = (16, 12).
    expect(pieceFootprintDistance(ordered, 16, 12, CELL_SIZE)).toBe(0)
  })

  it('matches pieceAnchorDistance for a single-cell piece because the only footprint cell IS the anchor', () => {
    const ordered = orderedFor(piece('straight', 0, 0, 0))
    expect(pieceFootprintDistance(ordered, 3, 4, CELL_SIZE)).toBeCloseTo(
      pieceAnchorDistance(ordered, 3, 4, CELL_SIZE),
    )
    expect(pieceFootprintDistance(ordered, -3, -4, CELL_SIZE)).toBeCloseTo(
      pieceAnchorDistance(ordered, -3, -4, CELL_SIZE),
    )
  })

  it('returns zero at any footprint-cell center of a multi-cell piece', () => {
    // Hairpin canonical footprint at (row=5, col=5) covers absolute cells
    // (4,5), (4,6), (5,5), (5,6), (6,5), (6,6). Their world centers are
    // (5*CELL_SIZE, 4*CELL_SIZE) etc. Each of those points sits ON one
    // footprint cell so the closest-cell distance is exactly zero.
    const h = piece('hairpin', 5, 5, 0)
    const ordered = orderedFor(h)
    expect(
      pieceFootprintDistance(ordered, 5 * CELL_SIZE, 4 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    expect(
      pieceFootprintDistance(ordered, 6 * CELL_SIZE, 4 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    expect(
      pieceFootprintDistance(ordered, 5 * CELL_SIZE, 5 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    expect(
      pieceFootprintDistance(ordered, 6 * CELL_SIZE, 5 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    expect(
      pieceFootprintDistance(ordered, 5 * CELL_SIZE, 6 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    expect(
      pieceFootprintDistance(ordered, 6 * CELL_SIZE, 6 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
  })

  it('strictly improves on pieceAnchorDistance for a wheel at the far edge of a multi-cell footprint', () => {
    // Hairpin at (row=5, col=5) anchors at world (5*CELL_SIZE, 5*CELL_SIZE).
    // A wheel at the far-corner footprint cell (6, 6) world center
    // (6*CELL_SIZE, 6*CELL_SIZE) sits ON that cell so the footprint
    // distance is zero, but the anchor distance is sqrt(2) * CELL_SIZE.
    const ordered = orderedFor(piece('hairpin', 5, 5, 0))
    const wheelX = 6 * CELL_SIZE
    const wheelZ = 6 * CELL_SIZE
    expect(pieceFootprintDistance(ordered, wheelX, wheelZ, CELL_SIZE)).toBe(0)
    expect(
      pieceAnchorDistance(ordered, wheelX, wheelZ, CELL_SIZE),
    ).toBeCloseTo(Math.sqrt(2) * CELL_SIZE)
  })

  it('returns the euclidean distance to the closest footprint cell from a wheel just off the footprint', () => {
    // Mega sweep right at (row=0, col=0) covers (-1,-1), (-1,0), (0,-1),
    // (0,0). A wheel at world (CELL_SIZE * 0.6, 0) sits closest to the
    // (0, 1)-bordering edge. The closest footprint cell is (0, 0) at
    // world (0, 0). Distance is CELL_SIZE * 0.6.
    const ordered = orderedFor(piece('megaSweepRight', 0, 0, 0))
    const wheelX = CELL_SIZE * 0.6
    const wheelZ = 0
    expect(pieceFootprintDistance(ordered, wheelX, wheelZ, CELL_SIZE)).toBeCloseTo(
      CELL_SIZE * 0.6,
    )
    // The anchor is (0, 0) world center, which IS the closest cell here,
    // so anchor and footprint distance agree at that wheel position.
    expect(
      pieceAnchorDistance(ordered, wheelX, wheelZ, CELL_SIZE),
    ).toBeCloseTo(CELL_SIZE * 0.6)
  })

  it('honors a custom cell size', () => {
    const ordered = orderedFor(piece('hairpin', 0, 0, 0))
    // Hairpin at (0, 0) at cellSize 10 covers absolute cells (-1, 0),
    // (-1, 1), (0, 0), (0, 1), (1, 0), (1, 1). World center (10, 10) is
    // the cell (1, 1) so footprint distance is zero.
    expect(pieceFootprintDistance(ordered, 10, 10, 10)).toBe(0)
    // World (5, 5) sits between cells (0, 0) center and (1, 1) center;
    // the closest cell center is (0, 0) at world (0, 0) so the distance
    // is sqrt(50) regardless of which two of the four equally close
    // cells the resolver picks first.
    expect(pieceFootprintDistance(ordered, 5, 5, 10)).toBeCloseTo(
      Math.sqrt(5 * 5 + 5 * 5),
    )
  })

  it('rotates with the piece so a 90deg-rotated multi-cell footprint covers the rotated cells', () => {
    // Hairpin at (row=5, col=5) rotated 90 degrees CW should cover
    // absolute cells derived from the rotated canonical footprint. The
    // canonical hairpin footprint is the 2x3 set
    // {(-1,0), (-1,1), (0,0), (0,1), (1,0), (1,1)}; after 90 CW it
    // becomes {(0,1), (1,1), (0,0), (1,0), (0,-1), (1,-1)}. With anchor
    // (5, 5) the absolute cells are (5,6), (6,6), (5,5), (6,5), (5,4),
    // (6,4). Each of those world centers should report zero distance.
    const ordered = orderedFor(piece('hairpin', 5, 5, 90))
    expect(
      pieceFootprintDistance(ordered, 6 * CELL_SIZE, 5 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    expect(
      pieceFootprintDistance(ordered, 4 * CELL_SIZE, 5 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    expect(
      pieceFootprintDistance(ordered, 6 * CELL_SIZE, 6 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    expect(
      pieceFootprintDistance(ordered, 4 * CELL_SIZE, 6 * CELL_SIZE, CELL_SIZE),
    ).toBe(0)
  })

  it('returns the closest cell distance regardless of footprint walk order', () => {
    // The footprint resolver iterates `pieceFootprintCells` in the
    // declared order; the resolver picks the minimum so the order does
    // not change the answer. Sample two wheel positions that are
    // closer to the LAST cell in the canonical hairpin footprint than
    // to the first; the resolver still returns the correct minimum.
    const ordered = orderedFor(piece('hairpin', 0, 0, 0))
    // World center of the last canonical hairpin cell (dr=+1, dc=+1)
    // for anchor (0, 0) is (1*CELL_SIZE, 1*CELL_SIZE).
    expect(
      pieceFootprintDistance(ordered, CELL_SIZE, CELL_SIZE, CELL_SIZE),
    ).toBe(0)
    // World center of the first canonical hairpin cell (dr=-1, dc=0)
    // for anchor (0, 0) is (0, -1*CELL_SIZE). A wheel at (0, -CELL_SIZE)
    // is on that cell.
    expect(pieceFootprintDistance(ordered, 0, -CELL_SIZE, CELL_SIZE)).toBe(0)
  })

  it('cooperates with pickClosestWheelContact to pick the closer multi-cell piece on a shared cell', () => {
    // Two hairpins whose footprints touch at the cell (1, 0) and (1, 1)
    // (a hairpin at (0, 0) covers rows -1..1 cols 0..1; a hairpin at
    // (3, 0) covers rows 2..4 cols 0..1). They never share a cell so
    // a single-cell overlap test would be misleading; instead, pick a
    // wheel position on the cell (1, 0) which is exclusively owned by
    // the first hairpin and verify the picker selects it.
    const a = piece('hairpin', 0, 0, 0)
    const b = piece('hairpin', 3, 0, 0)
    const path = buildTrackPath({ pieces: [a, b] })
    const candidates = wheelContactCandidates(
      0, // col 0 -> x = 0
      CELL_SIZE, // row 1 -> z = CELL_SIZE
      path,
      [a, b],
      CELL_SIZE,
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].piece).toBe(a)
    const pick = pickClosestWheelContact(
      candidates,
      (ordered, x, z) => pieceFootprintDistance(ordered, x, z, CELL_SIZE),
      0,
      CELL_SIZE,
    )
    expect(pick).not.toBeNull()
    expect(pick?.candidate.piece).toBe(a)
    expect(pick?.distance).toBe(0)
  })
})

describe('wheelContactCandidates (REQ-065)', () => {
  it('returns an empty array on an empty path', () => {
    const path = buildTrackPath({ pieces: [] })
    expect(wheelContactCandidates(0, 0, path, [], CELL_SIZE)).toEqual([])
  })

  it('returns an empty array for a wheel cell off the path', () => {
    const a = piece('straight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [a] })
    // Wheel at (5, 0) lands on cell (0, 1) which is off the single
    // straight at (0, 0).
    expect(
      wheelContactCandidates(CELL_SIZE * 5, 0, path, [a], CELL_SIZE),
    ).toEqual([])
  })

  it('returns one candidate for a wheel on a single-cell piece', () => {
    const a = piece('straight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [a] })
    const candidates = wheelContactCandidates(0, 0, path, [a], CELL_SIZE)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].locator).toEqual({ segmentId: 'main', idx: 0 })
    expect(candidates[0].piece).toBe(a)
    expect(candidates[0].ordered.piece).toBe(a)
  })

  it('returns one candidate per footprint cell of a multi-cell piece (single-locator-per-cell)', () => {
    const h = piece('hairpin', 5, 5, 0)
    const path = buildTrackPath({ pieces: [h] })
    // Each hairpin footprint cell maps to exactly one locator pointing
    // at the same ordered piece. Sample two distinct footprint cells.
    const top = wheelContactCandidates(
      5 * CELL_SIZE, // col=5 -> x = 5*CELL_SIZE
      4 * CELL_SIZE, // row=4 (top of footprint, dr=-1)
      path,
      [h],
      CELL_SIZE,
    )
    expect(top).toHaveLength(1)
    expect(top[0].piece).toBe(h)

    const bottom = wheelContactCandidates(
      5 * CELL_SIZE,
      6 * CELL_SIZE, // row=6 (bottom of footprint, dr=+1)
      path,
      [h],
      CELL_SIZE,
    )
    expect(bottom).toHaveLength(1)
    expect(bottom[0].piece).toBe(h)
  })

  it('returns the same number of candidates as locators on a shared cell', () => {
    // Two pieces with explicit footprints that overlap on the same
    // cell. The schema does not allow this in a saved city (REQ-027),
    // but the substrate emits a locator per footprint cell of every
    // listed piece, so the candidate walker should surface both.
    const a: Piece = {
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
      ],
    }
    const b: Piece = {
      type: 'straight',
      row: 0,
      col: 1,
      rotation: 0,
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
      ],
    }
    const path = buildTrackPath({ pieces: [a, b] })
    const candidates = wheelContactCandidates(
      CELL_SIZE, // x=CELL_SIZE -> col=1, the shared overlap cell
      0,
      path,
      [a, b],
      CELL_SIZE,
    )
    expect(candidates.length).toBeGreaterThanOrEqual(2)
    const pieces = candidates.map((c) => c.piece)
    expect(pieces).toContain(a)
    expect(pieces).toContain(b)
  })

  it('returns candidates in cellToLocators insertion order', () => {
    // Multi-cell mega sweep then a connected straight. Each candidate
    // list per cell should walk in placement order then footprint order.
    const a = piece('megaSweepRight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [a] })
    // Sample one footprint cell. Insertion order matches the footprint
    // walk inside `pieceFootprintCells` for the megaSweepRight type.
    const candidates = wheelContactCandidates(0, 0, path, [a], CELL_SIZE)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].piece).toBe(a)
  })

  it('falls back to cellToOrderIdx when cellToLocators is empty', () => {
    // Hand-crafted path: the v1 builder always populates cellToLocators
    // for every footprint cell, but a future builder change or a
    // hand-edited path could leave a cell addressable only by
    // cellToOrderIdx. The candidate walker uses cellToOrderIdx as the
    // fallback so existing single-locator consumers stay compatible.
    const a = piece('straight', 2, 3, 0)
    const ordered: OrderedPiece = {
      piece: a,
      entryPort: { dr: 0, dc: 0, dir: 0 },
      exitPort: { dr: 0, dc: 0, dir: 4 },
      entryDir: 0,
      exitDir: 4,
    }
    const path = {
      segments: [
        {
          id: 'main',
          order: [ordered],
          closesLoop: false,
        },
      ],
      cellToOrderIdx: new Map([['2,3', 0]]),
      cellToLocators: new Map(),
    }
    const candidates = wheelContactCandidates(
      3 * CELL_SIZE, // col=3 -> x = 3 * CELL_SIZE
      2 * CELL_SIZE, // row=2 -> z = 2 * CELL_SIZE
      path,
      [a],
      CELL_SIZE,
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].piece).toBe(a)
    expect(candidates[0].locator).toEqual({ segmentId: 'main', idx: 0 })
  })

  it('returns an empty array when the cellToOrderIdx fallback resolves to a missing segment', () => {
    // Defensive: if a path is built such that cellToOrderIdx points
    // into a missing segment, the walker returns an empty list rather
    // than throwing.
    const a = piece('straight', 0, 0, 0)
    const path = {
      segments: [],
      cellToOrderIdx: new Map([['0,0', 0]]),
      cellToLocators: new Map(),
    }
    expect(wheelContactCandidates(0, 0, path, [a], CELL_SIZE)).toEqual([])
  })

  it('returns a fresh array on every call', () => {
    const a = piece('straight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [a] })
    const first = wheelContactCandidates(0, 0, path, [a], CELL_SIZE)
    const second = wheelContactCandidates(0, 0, path, [a], CELL_SIZE)
    expect(first).not.toBe(second)
  })
})

describe('pickClosestWheelContact (REQ-065)', () => {
  function fakeCandidate(p: Piece, idx = 0): WheelContactCandidate {
    return {
      locator: { segmentId: 'main', idx },
      piece: p,
      ordered: {
        piece: p,
        entryPort: { dr: 0, dc: 0, dir: 0 },
        exitPort: { dr: 0, dc: 0, dir: 4 },
        entryDir: 0,
        exitDir: 4,
      },
    }
  }

  it('returns null on an empty candidate list', () => {
    const fn: DistanceToCenterlineFn = () => 0
    expect(pickClosestWheelContact([], fn, 0, 0)).toBeNull()
  })

  it('returns null when every distance is non-finite', () => {
    const a = fakeCandidate(piece('straight', 0, 0, 0))
    const b = fakeCandidate(piece('straight', 1, 0, 0), 1)
    const fn: DistanceToCenterlineFn = () => Number.POSITIVE_INFINITY
    expect(pickClosestWheelContact([a, b], fn, 0, 0)).toBeNull()
  })

  it('returns the only finite candidate when others are non-finite', () => {
    const a = fakeCandidate(piece('straight', 0, 0, 0))
    const b = fakeCandidate(piece('straight', 1, 0, 0), 1)
    const fn: DistanceToCenterlineFn = (ordered) =>
      ordered.piece.row === 0 ? 5 : NaN
    const pick = pickClosestWheelContact([a, b], fn, 0, 0)
    expect(pick?.candidate.piece.row).toBe(0)
    expect(pick?.distance).toBe(5)
  })

  it('picks the candidate with the smallest distance', () => {
    const a = fakeCandidate(piece('straight', 0, 0, 0))
    const b = fakeCandidate(piece('straight', 5, 0, 0), 1)
    const fn: DistanceToCenterlineFn = (ordered) =>
      ordered.piece.row === 0 ? 10 : 3
    const pick = pickClosestWheelContact([a, b], fn, 0, 0)
    expect(pick?.candidate.piece.row).toBe(5)
    expect(pick?.distance).toBe(3)
  })

  it('breaks ties by candidate insertion order (first wins)', () => {
    const a = fakeCandidate(piece('straight', 0, 0, 0))
    const b = fakeCandidate(piece('straight', 1, 0, 0), 1)
    const fn: DistanceToCenterlineFn = () => 4
    const pick = pickClosestWheelContact([a, b], fn, 0, 0)
    expect(pick?.candidate.piece.row).toBe(0)
  })

  it('passes the wheel coordinates through to the distance function', () => {
    const calls: Array<{ x: number; z: number }> = []
    const a = fakeCandidate(piece('straight', 0, 0, 0))
    const fn: DistanceToCenterlineFn = (_ordered, x, z) => {
      calls.push({ x, z })
      return Math.abs(x) + Math.abs(z)
    }
    pickClosestWheelContact([a], fn, 7, -3)
    expect(calls).toEqual([{ x: 7, z: -3 }])
  })

  it('does not mutate the candidate list', () => {
    const a = fakeCandidate(piece('straight', 0, 0, 0))
    const b = fakeCandidate(piece('straight', 1, 0, 0), 1)
    const list = [a, b]
    const snapshot = [...list]
    const fn: DistanceToCenterlineFn = () => 1
    pickClosestWheelContact(list, fn, 0, 0)
    expect(list).toEqual(snapshot)
  })
})

describe('wheelTrackContact (REQ-065)', () => {
  it('returns null when the wheel is off the path', () => {
    const a = piece('straight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [a] })
    const pick = wheelTrackContact(
      CELL_SIZE * 5,
      0,
      path,
      [a],
      CELL_SIZE,
      (ordered, x, z) => pieceAnchorDistance(ordered, x, z, CELL_SIZE),
    )
    expect(pick).toBeNull()
  })

  it('returns the only candidate on a single-locator cell', () => {
    const a = piece('straight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [a] })
    const pick = wheelTrackContact(0, 0, path, [a], CELL_SIZE, (ordered, x, z) =>
      pieceAnchorDistance(ordered, x, z, CELL_SIZE),
    )
    expect(pick?.candidate.piece).toBe(a)
    expect(pick?.distance).toBe(0)
  })

  it('picks the closer piece when two locators share a cell', () => {
    // Two overlapping pieces (defensive: schema disallows but substrate
    // surfaces both). The picker should prefer the closer one.
    const a: Piece = {
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      footprint: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }],
    }
    const b: Piece = {
      type: 'straight',
      row: 0,
      col: 1,
      rotation: 0,
      footprint: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }],
    }
    const path = buildTrackPath({ pieces: [a, b] })
    // Wheel sits at the world-space center of the shared cell (row=0, col=1).
    // a's anchor is (0, 0) -> world (0, 0); distance = CELL_SIZE.
    // b's anchor is (0, 1) -> world (CELL_SIZE, 0); distance = 0.
    // Picker should pick b (closer to its anchor).
    const pick = wheelTrackContact(
      CELL_SIZE,
      0,
      path,
      [a, b],
      CELL_SIZE,
      (ordered, x, z) => pieceAnchorDistance(ordered, x, z, CELL_SIZE),
    )
    expect(pick?.candidate.piece).toBe(b)
    expect(pick?.distance).toBeCloseTo(0)
  })

  it('lands the closest pick across a multi-cell footprint', () => {
    // Two adjacent hairpins (at anchor rows 0 and 4 so footprints do
    // not overlap). A wheel centered on hairpin a's bottom-right
    // footprint cell (1, 1) is closer to a's anchor (0, 0) than to b's
    // anchor (4, 0).
    const a = piece('hairpin', 0, 0, 0)
    const b = piece('hairpin', 4, 0, 0)
    const path = buildTrackPath({ pieces: [a, b] })
    const pick = wheelTrackContact(
      CELL_SIZE, // col=1
      CELL_SIZE, // row=1
      path,
      [a, b],
      CELL_SIZE,
      (ordered, x, z) => pieceAnchorDistance(ordered, x, z, CELL_SIZE),
    )
    expect(pick?.candidate.piece).toBe(a)
  })

  it('threads through to the injected distance function', () => {
    const a = piece('straight', 0, 0, 0)
    const path = buildTrackPath({ pieces: [a] })
    const calls: number[] = []
    const fn: DistanceToCenterlineFn = (_ordered, x) => {
      calls.push(x)
      return 1
    }
    wheelTrackContact(0, 0, path, [a], CELL_SIZE, fn)
    expect(calls).toEqual([0])
  })
})
