import { describe, expect, it } from 'vitest'
import type { Piece } from '@/lib/schemas'
import { buildTrackPath, type OrderedPiece } from '@/lib/trackPath'
import {
  pickClosestWheelContact,
  pieceAnchorDistance,
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
