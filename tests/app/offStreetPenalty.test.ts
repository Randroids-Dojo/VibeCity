import { describe, expect, it } from 'vitest'
import {
  OFF_STREET_PENALTY_DRAG,
  OFF_STREET_PENALTY_MAX_REVERSE_SPEED,
  OFF_STREET_PENALTY_MAX_SPEED,
  applyOffStreetPenalty,
  isOnStreetCell,
  streetCellSet,
} from '@/app/[slug]/offStreetPenalty'
import {
  MAX_REVERSE_SPEED,
  MAX_SPEED,
  createVehicleState,
} from '@/app/[slug]/driveControls'
import { CELL_SIZE } from '@/app/[slug]/driveScene'
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
    expect(OFF_STREET_PENALTY_MAX_SPEED % CELL_SIZE).toBe(0)
    // Reverse cap is 1.5 * CELL_SIZE so the modulo is half a cell.
    expect((OFF_STREET_PENALTY_MAX_REVERSE_SPEED * 2) % CELL_SIZE).toBe(0)
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
    // The building penalty caps at CELL_SIZE * 2; off-street caps at
    // CELL_SIZE * 3 so a player who drove off the road but not into a
    // building still has more headroom than one who clipped a building.
    expect(OFF_STREET_PENALTY_MAX_SPEED).toBeGreaterThan(CELL_SIZE * 2)
  })
})
