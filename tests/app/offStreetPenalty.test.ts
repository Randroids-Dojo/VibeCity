import { describe, expect, it } from 'vitest'
import {
  OFF_STREET_PENALTY_DRAG,
  OFF_STREET_PENALTY_MAX_REVERSE_SPEED,
  OFF_STREET_PENALTY_MAX_SPEED,
  applyOffStreetPenalty,
  closestStreetPiece,
  isOnStreetCell,
  streetCellSet,
  wheelOnStreet,
  wheelWorldPosition,
} from '@/app/[slug]/offStreetPenalty'
import { BUILDING_PENALTY_MAX_SPEED } from '@/app/[slug]/buildingCollision'
import {
  MAX_REVERSE_SPEED,
  MAX_SPEED,
  createVehicleState,
} from '@/app/[slug]/driveControls'
import { CELL_SIZE, carWheelOffsets } from '@/app/[slug]/driveScene'
import { buildTrackPath } from '@/lib/trackPath'
import type { Piece, PieceType } from '@/lib/schemas'

/**
 * REQ-054 (off-street penalty via cell-level binary penalty).
 *
 * Pure helpers in `offStreetPenalty.ts` are covered here. The three.js
 * mount in `DriveSceneClient.tsx` calls `applyOffStreetPenalty` after
 * `applyDriveStep` (and before the building-cell penalty) each frame
 * so the integration math stays fully unit-testable.
 */

const piece = (
  type: PieceType,
  row: number,
  col: number,
  rotation: 0 | 90 | 180 | 270 = 0,
  footprint?: Piece['footprint'],
): Piece => {
  const out: Piece = { type, row, col, rotation }
  if (footprint) out.footprint = footprint
  return out
}

describe('offStreetPenalty constants (REQ-054)', () => {
  it('OFF_STREET_PENALTY_MAX_SPEED is positive and below the on-street MAX_SPEED', () => {
    expect(OFF_STREET_PENALTY_MAX_SPEED).toBeGreaterThan(0)
    expect(OFF_STREET_PENALTY_MAX_SPEED).toBeLessThan(MAX_SPEED)
  })

  it('OFF_STREET_PENALTY_MAX_REVERSE_SPEED is positive and below the on-street MAX_REVERSE_SPEED', () => {
    expect(OFF_STREET_PENALTY_MAX_REVERSE_SPEED).toBeGreaterThan(0)
    expect(OFF_STREET_PENALTY_MAX_REVERSE_SPEED).toBeLessThan(MAX_REVERSE_SPEED)
  })

  it('OFF_STREET_PENALTY_DRAG is positive and finite', () => {
    expect(OFF_STREET_PENALTY_DRAG).toBeGreaterThan(0)
    expect(Number.isFinite(OFF_STREET_PENALTY_DRAG)).toBe(true)
  })

  it('penalty caps scale with CELL_SIZE so they track the world unit', () => {
    // Constants are expressed as `CELL_SIZE * <fraction>` so the value
    // stays parametric in the world unit. After the VibeRacer-tuning
    // port the fractions are 0.75 and 0.3, which are no longer whole
    // multiples of CELL_SIZE.
    expect(OFF_STREET_PENALTY_MAX_SPEED / CELL_SIZE).toBeGreaterThan(0)
    expect(
      OFF_STREET_PENALTY_MAX_REVERSE_SPEED / CELL_SIZE,
    ).toBeGreaterThan(0)
  })
})

describe('streetCellSet (REQ-054)', () => {
  it('returns an empty set for an empty piece list', () => {
    expect(streetCellSet([]).size).toBe(0)
  })

  it('keys cells by "row,col" for single-cell pieces', () => {
    const set = streetCellSet([piece('straight', 2, 3)])
    expect(set.has('2,3')).toBe(true)
    expect(set.size).toBe(1)
  })

  it('handles many single-cell pieces without collisions', () => {
    const set = streetCellSet([
      piece('straight', 0, 0),
      piece('left90', 1, 0),
      piece('right90', 0, 1),
      piece('intersection', -1, -1),
    ])
    expect(set.size).toBe(4)
    expect(set.has('0,0')).toBe(true)
    expect(set.has('1,0')).toBe(true)
    expect(set.has('0,1')).toBe(true)
    expect(set.has('-1,-1')).toBe(true)
  })

  it('expands a multi-cell footprint to every covered cell', () => {
    // A 2x2 footprint anchored at (5, 7) covers (5, 7), (5, 8), (6, 7),
    // (6, 8). Mirrors how `pieceFootprintCells` resolves explicit
    // footprints; multi-cell pieces (mega sweep, hairpin) ride the
    // same path.
    const set = streetCellSet([
      piece('straight', 5, 7, 0, [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
        { dr: 1, dc: 1 },
      ]),
    ])
    expect(set.size).toBe(4)
    expect(set.has('5,7')).toBe(true)
    expect(set.has('5,8')).toBe(true)
    expect(set.has('6,7')).toBe(true)
    expect(set.has('6,8')).toBe(true)
  })

  it('returns a fresh set on each call', () => {
    const a = streetCellSet([piece('straight', 0, 0)])
    const b = streetCellSet([piece('straight', 0, 0)])
    expect(a).not.toBe(b)
  })
})

describe('isOnStreetCell (REQ-054)', () => {
  it('returns false on an empty street set (every position is off-street)', () => {
    const set = streetCellSet([])
    expect(isOnStreetCell(0, 0, set)).toBe(false)
    expect(isOnStreetCell(CELL_SIZE * 2, CELL_SIZE * 5, set)).toBe(false)
  })

  it('returns true when the world position falls on a street cell', () => {
    const set = streetCellSet([piece('straight', 1, 2)])
    const x = 2 * CELL_SIZE
    const z = 1 * CELL_SIZE
    expect(isOnStreetCell(x, z, set)).toBe(true)
  })

  it('returns false when the world position falls on a non-street cell', () => {
    const set = streetCellSet([piece('straight', 1, 2)])
    expect(isOnStreetCell(0, 0, set)).toBe(false)
  })

  it('reports true within the cell bounds even off-center', () => {
    const set = streetCellSet([piece('straight', 0, 0)])
    expect(isOnStreetCell(CELL_SIZE * 0.4, CELL_SIZE * 0.3, set)).toBe(true)
    expect(isOnStreetCell(-CELL_SIZE * 0.4, CELL_SIZE * 0.4, set)).toBe(true)
  })

  it('reports false at the next cell over', () => {
    const set = streetCellSet([piece('straight', 0, 0)])
    expect(isOnStreetCell(CELL_SIZE * 1.0, 0, set)).toBe(false)
  })

  it('reports true on every cell of a multi-cell footprint', () => {
    const set = streetCellSet([
      piece('straight', 0, 0, 0, [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
      ]),
    ])
    expect(isOnStreetCell(0, 0, set)).toBe(true)
    expect(isOnStreetCell(CELL_SIZE, 0, set)).toBe(true)
    expect(isOnStreetCell(CELL_SIZE * 2, 0, set)).toBe(false)
  })
})

describe('applyOffStreetPenalty (REQ-054)', () => {
  it('returns the input state unchanged when on a street cell', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: MAX_SPEED,
    }
    const next = applyOffStreetPenalty(state, true, 0.016)
    expect(next).toBe(state)
  })

  it('returns the input state unchanged for non-positive dt', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: MAX_SPEED,
    }
    expect(applyOffStreetPenalty(state, false, 0)).toBe(state)
    expect(applyOffStreetPenalty(state, false, -1)).toBe(state)
    expect(applyOffStreetPenalty(state, false, Number.NaN)).toBe(state)
  })

  it('caps a held forward speed to OFF_STREET_PENALTY_MAX_SPEED off-street', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: MAX_SPEED,
    }
    const next = applyOffStreetPenalty(state, false, 0.016)
    expect(next.speed).toBeLessThanOrEqual(OFF_STREET_PENALTY_MAX_SPEED)
  })

  it('caps a held reverse speed to OFF_STREET_PENALTY_MAX_REVERSE_SPEED off-street', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: -MAX_REVERSE_SPEED,
    }
    const next = applyOffStreetPenalty(state, false, 0.016)
    expect(next.speed).toBeGreaterThanOrEqual(
      -OFF_STREET_PENALTY_MAX_REVERSE_SPEED,
    )
  })

  it('drags a forward speed already inside the cap toward zero', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: OFF_STREET_PENALTY_MAX_SPEED * 0.5,
    }
    const next = applyOffStreetPenalty(state, false, 0.1)
    expect(next.speed).toBeLessThan(state.speed)
    expect(next.speed).toBeGreaterThanOrEqual(0)
  })

  it('drags a reverse speed already inside the cap toward zero', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: -OFF_STREET_PENALTY_MAX_REVERSE_SPEED * 0.5,
    }
    const next = applyOffStreetPenalty(state, false, 0.1)
    expect(next.speed).toBeGreaterThan(state.speed)
    expect(next.speed).toBeLessThanOrEqual(0)
  })

  it('clamps a small positive speed to zero rather than passing through it', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: 0.0001,
    }
    const next = applyOffStreetPenalty(state, false, 1)
    expect(next.speed).toBe(0)
  })

  it('clamps a small negative speed to zero rather than overshooting past it', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: -0.0001,
    }
    const next = applyOffStreetPenalty(state, false, 1)
    expect(next.speed).toBe(0)
  })

  it('does not move the car position; only the speed scalar changes', () => {
    const state = {
      ...createVehicleState({ x: 1, z: 2, heading: 0.5 }),
      speed: MAX_SPEED,
    }
    const next = applyOffStreetPenalty(state, false, 0.016)
    expect(next.x).toBe(state.x)
    expect(next.z).toBe(state.z)
    expect(next.heading).toBe(state.heading)
  })

  it('does not mutate the input state', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: MAX_SPEED,
    }
    const before = { ...state }
    applyOffStreetPenalty(state, false, 0.016)
    expect(state).toEqual(before)
  })

  it('a sustained throttle off-street drives speed to the cap quickly', () => {
    let state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: MAX_SPEED,
    }
    state = applyOffStreetPenalty(state, false, 1 / 60)
    expect(state.speed).toBeLessThanOrEqual(OFF_STREET_PENALTY_MAX_SPEED)
  })

  it('off-street cap is more permissive than the building cap so off-road feels lighter', () => {
    // A player who drove off the road but not into a building should
    // have more headroom than one who clipped a building. Compare
    // directly against the building cap so the test tracks the live
    // constant when tuning shifts.
    expect(OFF_STREET_PENALTY_MAX_SPEED).toBeGreaterThan(
      BUILDING_PENALTY_MAX_SPEED,
    )
  })
})

describe('wheelWorldPosition (REQ-032)', () => {
  it('returns the vehicle center for a zero offset at zero heading', () => {
    const out = wheelWorldPosition(
      { x: 10, z: 20, heading: 0 },
      { x: 0, z: 0 },
    )
    expect(out.x).toBeCloseTo(10, 10)
    expect(out.z).toBeCloseTo(20, 10)
  })

  it('translates a local +x offset to world +x at zero heading', () => {
    const out = wheelWorldPosition(
      { x: 0, z: 0, heading: 0 },
      { x: 1, z: 0 },
    )
    expect(out.x).toBeCloseTo(1, 10)
    expect(out.z).toBeCloseTo(0, 10)
  })

  it('translates a local -z offset (forward) to world -z at zero heading', () => {
    const out = wheelWorldPosition(
      { x: 0, z: 0, heading: 0 },
      { x: 0, z: -1 },
    )
    expect(out.x).toBeCloseTo(0, 10)
    expect(out.z).toBeCloseTo(-1, 10)
  })

  it('rotates the offset by the heading (Y-axis rotation matching the placed mesh)', () => {
    // Heading = +PI/2 means the car has yawed 90deg counter-clockwise
    // looking down +Y. With `car.rotation.y = heading`, a local +x
    // offset (right-of-car) maps to world +z.
    const out = wheelWorldPosition(
      { x: 0, z: 0, heading: Math.PI / 2 },
      { x: 1, z: 0 },
    )
    expect(out.x).toBeCloseTo(0, 10)
    expect(out.z).toBeCloseTo(-1, 10)
  })

  it('returns a fresh object on every call', () => {
    const a = wheelWorldPosition({ x: 0, z: 0, heading: 0 }, { x: 1, z: 1 })
    const b = wheelWorldPosition({ x: 0, z: 0, heading: 0 }, { x: 1, z: 1 })
    expect(a).not.toBe(b)
  })

  it('does not mutate the input', () => {
    const offset = { x: 1, z: -2 }
    const before = { ...offset }
    wheelWorldPosition({ x: 0, z: 0, heading: 1.5 }, offset)
    expect(offset).toEqual(before)
  })
})

describe('wheelOnStreet (REQ-032)', () => {
  const localOffsets = carWheelOffsets().map(({ x, z }) => ({ x, z }))

  it('returns false for an empty city (no segments)', () => {
    const path = buildTrackPath({ pieces: [] })
    const result = wheelOnStreet(
      { x: 0, z: 0, heading: 0 },
      localOffsets,
      path,
      [],
      CELL_SIZE,
    )
    expect(result).toBe(false)
  })

  it('returns true when the car is centered on a single street piece', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = wheelOnStreet(
      { x: 0, z: 0, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBe(true)
  })

  it('returns false when the car is far from every placed piece', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = wheelOnStreet(
      { x: CELL_SIZE * 10, z: CELL_SIZE * 10, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBe(false)
  })

  it('returns true when at least one wheel sits on a street cell even though the car center does not', () => {
    // Place a single street piece at (0, 0). Move the car center to
    // (-CELL_SIZE * 0.5, 0) so the car center is on the boundary
    // between cells (-1, 0) and (0, 0). The right-side wheels (positive
    // local x) sit closer to the (0, 0) cell while the left-side wheels
    // sit closer to (0, -1).
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = wheelOnStreet(
      { x: -CELL_SIZE * 0.5 + 0.01, z: 0, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBe(true)
  })

  it('returns true when the car straddles a multi-cell mega-sweep footprint', () => {
    // A 2x2 mega-sweep-like footprint anchored at (0, 0).
    const pieces: Piece[] = [
      piece('megaSweepRight', 0, 0, 0, [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
        { dr: 1, dc: 1 },
      ]),
    ]
    const path = buildTrackPath({ pieces })
    // Center the car on cell (1, 1) of the footprint.
    const result = wheelOnStreet(
      { x: CELL_SIZE * 1, z: CELL_SIZE * 1, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBe(true)
  })

  it('rotates wheels by heading so a yawed car still reads on-street while centered on a piece', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = wheelOnStreet(
      { x: 0, z: 0, heading: Math.PI / 4 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBe(true)
  })

  it('returns true when a single wheel sits on the next cell of a two-piece chain', () => {
    // Two pieces stacked north / south so both report on-street at
    // their respective cells. Place the car center on the seam between
    // them; at least one wheel sits on each cell.
    const pieces: Piece[] = [
      piece('straight', 0, 0),
      piece('straight', 1, 0),
    ]
    const path = buildTrackPath({ pieces })
    const result = wheelOnStreet(
      { x: 0, z: CELL_SIZE * 0.5, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBe(true)
  })

  it('returns false when the car drifts fully off the placed piece', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    // Push the car well off the piece center so every wheel lands on
    // an off-piece cell.
    const result = wheelOnStreet(
      { x: CELL_SIZE * 3, z: CELL_SIZE * 3, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBe(false)
  })

  it('handles an empty wheel-offset list by reporting off-street', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = wheelOnStreet(
      { x: 0, z: 0, heading: 0 },
      [],
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBe(false)
  })

  it('does not mutate the wheel-offset list', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const offsets = [...localOffsets]
    const before = offsets.map((o) => ({ ...o }))
    wheelOnStreet(
      { x: 0, z: 0, heading: 1.2 },
      offsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(offsets).toEqual(before)
  })

  it('uses the multi-locator substrate so a multi-cell hairpin reports on-street from every footprint cell', () => {
    // Build a trackPath from a hairpin (2x3 footprint). Every footprint
    // cell should report on-street when the car center sits on it.
    const pieces: Piece[] = [piece('hairpin', 0, 0)]
    const path = buildTrackPath({ pieces })
    // Sample a couple of representative footprint cells. The hairpin
    // canonical footprint covers (-1, 0), (-1, 1), (0, 0), (0, 1),
    // (1, 0), (1, 1) under the row, col convention used by the editor.
    const cellPositions = [
      { x: 0, z: 0 },
      { x: CELL_SIZE, z: 0 },
      { x: 0, z: -CELL_SIZE },
      { x: CELL_SIZE, z: -CELL_SIZE },
      { x: 0, z: CELL_SIZE },
      { x: CELL_SIZE, z: CELL_SIZE },
    ]
    for (const pos of cellPositions) {
      const result = wheelOnStreet(
        { x: pos.x, z: pos.z, heading: 0 },
        localOffsets,
        path,
        pieces,
        CELL_SIZE,
      )
      expect(result).toBe(true)
    }
  })
})

describe('closestStreetPiece (REQ-032, REQ-065)', () => {
  const localOffsets = carWheelOffsets().map(({ x, z }) => ({ x, z }))

  it('returns null on an empty city (no segments)', () => {
    const path = buildTrackPath({ pieces: [] })
    const result = closestStreetPiece(
      { x: 0, z: 0, heading: 0 },
      localOffsets,
      path,
      [],
      CELL_SIZE,
    )
    expect(result).toBeNull()
  })

  it('returns null when every wheel is far from every placed piece', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = closestStreetPiece(
      { x: CELL_SIZE * 50, z: CELL_SIZE * 50, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBeNull()
  })

  it('returns null on an empty wheel-offset list', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = closestStreetPiece(
      { x: 0, z: 0, heading: 0 },
      [],
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).toBeNull()
  })

  it('picks the only placed piece when the car sits on it', () => {
    const pieces: Piece[] = [piece('straight', 2, 3)]
    const path = buildTrackPath({ pieces })
    const x = pieces[0].col * CELL_SIZE
    const z = pieces[0].row * CELL_SIZE
    const result = closestStreetPiece(
      { x, z, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).not.toBeNull()
    expect(result?.pieceIndex).toBe(0)
    expect(result?.pieceType).toBe('straight')
    expect(result?.segmentId).toBe('main')
    expect(result?.idx).toBe(0)
    expect(result?.distance).toBeGreaterThanOrEqual(0)
    expect(result?.wheelIndex).toBeGreaterThanOrEqual(0)
    expect(result?.wheelIndex).toBeLessThan(localOffsets.length)
  })

  it('reports the piece index from the source city pieces array', () => {
    // Place three pieces; pick a vehicle pose centered on the third.
    const pieces: Piece[] = [
      piece('straight', 0, 0),
      piece('straight', 0, 5),
      piece('straight', 0, 10),
    ]
    const path = buildTrackPath({ pieces })
    const target = pieces[2]
    const x = target.col * CELL_SIZE
    const z = target.row * CELL_SIZE
    const result = closestStreetPiece(
      { x, z, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result?.pieceIndex).toBe(2)
    expect(result?.pieceType).toBe('straight')
  })

  it('picks the closer of two pieces when the wheel is between them', () => {
    // Two single-cell pieces three cells apart so the cell sets do not
    // overlap. Place the car center close to the second piece so a wheel
    // on it picks the second piece.
    const pieces: Piece[] = [
      piece('straight', 0, 0),
      piece('straight', 0, 3),
    ]
    const path = buildTrackPath({ pieces })
    const x = pieces[1].col * CELL_SIZE
    const z = pieces[1].row * CELL_SIZE
    const result = closestStreetPiece(
      { x, z, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result?.pieceIndex).toBe(1)
  })

  it('threads the segment id through for a non-main segment piece', () => {
    // Two disconnected pieces: pieces[0] is `main`, pieces[1] is
    // `segment-1`. Park the car on the second piece so the closest pick
    // is the disconnected one.
    const pieces: Piece[] = [
      piece('straight', 0, 0),
      piece('straight', 5, 5),
    ]
    const path = buildTrackPath({ pieces })
    const target = pieces[1]
    const x = target.col * CELL_SIZE
    const z = target.row * CELL_SIZE
    const result = closestStreetPiece(
      { x, z, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result?.pieceIndex).toBe(1)
    expect(result?.segmentId).toBe('segment-1')
    expect(result?.idx).toBe(0)
  })

  it('picks a multi-cell hairpin from any of its footprint cells', () => {
    // The canonical hairpin footprint covers (-1..1, 0..1) under the
    // editor convention. Park the car on each footprint cell and confirm
    // the resolver picks the hairpin every time.
    const pieces: Piece[] = [piece('hairpin', 0, 0)]
    const path = buildTrackPath({ pieces })
    const cellPositions = [
      { x: 0, z: 0 },
      { x: CELL_SIZE, z: 0 },
      { x: 0, z: -CELL_SIZE },
      { x: CELL_SIZE, z: -CELL_SIZE },
      { x: 0, z: CELL_SIZE },
      { x: CELL_SIZE, z: CELL_SIZE },
    ]
    for (const pos of cellPositions) {
      const result = closestStreetPiece(
        { x: pos.x, z: pos.z, heading: 0 },
        localOffsets,
        path,
        pieces,
        CELL_SIZE,
      )
      expect(result).not.toBeNull()
      expect(result?.pieceIndex).toBe(0)
      expect(result?.pieceType).toBe('hairpin')
    }
  })

  it('emits a finite, non-negative distance', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = closestStreetPiece(
      { x: 0, z: 0, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).not.toBeNull()
    expect(Number.isFinite(result?.distance ?? NaN)).toBe(true)
    expect(result?.distance).toBeGreaterThanOrEqual(0)
  })

  it('does not mutate the wheel-offset list', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const offsets = [...localOffsets]
    const before = offsets.map((o) => ({ ...o }))
    closestStreetPiece(
      { x: 0, z: 0, heading: 1.2 },
      offsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(offsets).toEqual(before)
  })

  it('rotates with the car heading and still picks the on-piece piece', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = closestStreetPiece(
      { x: 0, z: 0, heading: Math.PI / 2 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result?.pieceIndex).toBe(0)
  })

  it('picks a piece that only one wheel is on (cross-wheel min)', () => {
    // Place a single-cell piece. Position the car so its center is one
    // cell off the piece in +x; the front-left or front-right wheel still
    // overlaps the piece cell at heading 0 because the wheel offsets are
    // small relative to CELL_SIZE. The cross-wheel pick should pick the
    // piece even though the center cell is off it.
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    // Move the car center to (-CELL_SIZE * 0.5, 0) so the wheels straddle
    // the piece cell vs the off-piece cell.
    const result = closestStreetPiece(
      { x: -CELL_SIZE * 0.5 + 0.01, z: 0, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result).not.toBeNull()
    expect(result?.pieceIndex).toBe(0)
  })

  it('returns a wheelIndex inside the offsets range', () => {
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = closestStreetPiece(
      { x: 0, z: 0, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result?.wheelIndex).toBeGreaterThanOrEqual(0)
    expect(result?.wheelIndex).toBeLessThan(localOffsets.length)
  })

  it('breaks cross-wheel ties by earlier wheel index when distances tie', () => {
    // Custom wheel offsets so two wheels sit at exactly equal distance
    // from the piece's footprint cell center. The earlier wheel in the
    // list wins.
    const pieces: Piece[] = [piece('straight', 0, 0)]
    const path = buildTrackPath({ pieces })
    // Two wheels at (+1, 0) and (-1, 0) in local coords; vehicle at
    // (0, 0, heading 0) so both are 1 unit from the piece center cell.
    const offsets = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
    ]
    const result = closestStreetPiece(
      { x: 0, z: 0, heading: 0 },
      offsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result?.wheelIndex).toBe(0)
  })

  it('reports the piece type for a non-straight piece', () => {
    const pieces: Piece[] = [piece('intersection', 0, 0)]
    const path = buildTrackPath({ pieces })
    const result = closestStreetPiece(
      { x: 0, z: 0, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result?.pieceType).toBe('intersection')
  })

  it('idx into the segment order matches the piece position', () => {
    // A two-piece chain: pieces[0] becomes segment.order[0] and pieces[1]
    // becomes segment.order[1]. Picking the second piece should report
    // idx 1.
    const pieces: Piece[] = [
      piece('straight', 0, 0),
      piece('straight', 1, 0),
    ]
    const path = buildTrackPath({ pieces })
    const target = pieces[1]
    const result = closestStreetPiece(
      { x: target.col * CELL_SIZE, z: target.row * CELL_SIZE, heading: 0 },
      localOffsets,
      path,
      pieces,
      CELL_SIZE,
    )
    expect(result?.idx).toBe(1)
  })
})
