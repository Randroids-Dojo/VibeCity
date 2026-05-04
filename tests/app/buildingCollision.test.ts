import { describe, expect, it } from 'vitest'
import {
  BUILDING_PENALTY_DRAG,
  BUILDING_PENALTY_MAX_REVERSE_SPEED,
  BUILDING_PENALTY_MAX_SPEED,
  applyBuildingPenalty,
  buildingCellSet,
  isOnBuildingCell,
  worldToCell,
} from '@/app/[slug]/buildingCollision'
import {
  MAX_REVERSE_SPEED,
  MAX_SPEED,
  createVehicleState,
} from '@/app/[slug]/driveControls'
import { CELL_SIZE } from '@/app/[slug]/driveScene'
import type { Building } from '@/lib/schemas'

/**
 * REQ-030 (building collision via cell-level binary penalty,
 * Q-005 default A).
 *
 * Pure helpers in `buildingCollision.ts` are covered here. The
 * three.js mount in `DriveSceneClient.tsx` calls `applyBuildingPenalty`
 * after `applyDriveStep` each frame so the integration math stays
 * fully unit-testable.
 */

const building = (
  type: Building['type'],
  row: number,
  col: number,
): Building => ({
  type,
  row,
  col,
  rotation: 0,
})

describe('buildingCollision constants (REQ-030)', () => {
  it('BUILDING_PENALTY_MAX_SPEED is positive and below the on-street MAX_SPEED', () => {
    expect(BUILDING_PENALTY_MAX_SPEED).toBeGreaterThan(0)
    expect(BUILDING_PENALTY_MAX_SPEED).toBeLessThan(MAX_SPEED)
  })

  it('BUILDING_PENALTY_MAX_REVERSE_SPEED is positive and below the on-street MAX_REVERSE_SPEED', () => {
    expect(BUILDING_PENALTY_MAX_REVERSE_SPEED).toBeGreaterThan(0)
    expect(BUILDING_PENALTY_MAX_REVERSE_SPEED).toBeLessThan(MAX_REVERSE_SPEED)
  })

  it('BUILDING_PENALTY_DRAG is positive and finite', () => {
    expect(BUILDING_PENALTY_DRAG).toBeGreaterThan(0)
    expect(Number.isFinite(BUILDING_PENALTY_DRAG)).toBe(true)
  })

  it('penalty caps scale with CELL_SIZE so they track the world unit', () => {
    expect(BUILDING_PENALTY_MAX_SPEED % CELL_SIZE).toBe(0)
    expect(BUILDING_PENALTY_MAX_REVERSE_SPEED % CELL_SIZE).toBe(0)
  })
})

describe('worldToCell (REQ-030)', () => {
  it('maps the origin to (0, 0)', () => {
    expect(worldToCell(0, 0)).toEqual({ row: 0, col: 0 })
  })

  it('maps cell centers to integer cell coordinates', () => {
    expect(worldToCell(CELL_SIZE, 0)).toEqual({ row: 0, col: 1 })
    expect(worldToCell(0, CELL_SIZE)).toEqual({ row: 1, col: 0 })
    expect(worldToCell(2 * CELL_SIZE, 3 * CELL_SIZE)).toEqual({
      row: 3,
      col: 2,
    })
  })

  it('maps negative cells correctly', () => {
    expect(worldToCell(-CELL_SIZE, -CELL_SIZE)).toEqual({ row: -1, col: -1 })
  })

  it('rounds to the nearest cell so half-cell offsets snap to the next cell', () => {
    expect(worldToCell(CELL_SIZE * 0.4, 0)).toEqual({ row: 0, col: 0 })
    expect(worldToCell(CELL_SIZE * 0.6, 0)).toEqual({ row: 0, col: 1 })
  })
})

describe('buildingCellSet (REQ-030)', () => {
  it('returns an empty set for an empty building list', () => {
    expect(buildingCellSet([]).size).toBe(0)
  })

  it('keys cells by "row,col"', () => {
    const set = buildingCellSet([building('shop', 2, 3)])
    expect(set.has('2,3')).toBe(true)
  })

  it('handles many buildings without collisions', () => {
    const set = buildingCellSet([
      building('small-house', 0, 0),
      building('mid-house', 1, 0),
      building('shop', 0, 1),
      building('factory', -1, -1),
    ])
    expect(set.size).toBe(4)
    expect(set.has('0,0')).toBe(true)
    expect(set.has('1,0')).toBe(true)
    expect(set.has('0,1')).toBe(true)
    expect(set.has('-1,-1')).toBe(true)
  })

  it('returns a fresh set on each call', () => {
    const a = buildingCellSet([building('shop', 0, 0)])
    const b = buildingCellSet([building('shop', 0, 0)])
    expect(a).not.toBe(b)
  })
})

describe('isOnBuildingCell (REQ-030)', () => {
  it('returns false on an empty building set', () => {
    const set = buildingCellSet([])
    expect(isOnBuildingCell(0, 0, set)).toBe(false)
    expect(isOnBuildingCell(CELL_SIZE * 2, CELL_SIZE * 5, set)).toBe(false)
  })

  it('returns true when the world position falls on a building cell', () => {
    const set = buildingCellSet([building('shop', 1, 2)])
    const x = 2 * CELL_SIZE
    const z = 1 * CELL_SIZE
    expect(isOnBuildingCell(x, z, set)).toBe(true)
  })

  it('returns false when the world position falls on a non-building cell', () => {
    const set = buildingCellSet([building('shop', 1, 2)])
    expect(isOnBuildingCell(0, 0, set)).toBe(false)
  })

  it('reports true within the cell bounds even off-center', () => {
    const set = buildingCellSet([building('factory', 0, 0)])
    expect(isOnBuildingCell(CELL_SIZE * 0.4, CELL_SIZE * 0.3, set)).toBe(true)
    expect(isOnBuildingCell(-CELL_SIZE * 0.4, CELL_SIZE * 0.4, set)).toBe(true)
  })

  it('reports false at the next cell over', () => {
    const set = buildingCellSet([building('factory', 0, 0)])
    expect(isOnBuildingCell(CELL_SIZE * 1.0, 0, set)).toBe(false)
  })
})

describe('applyBuildingPenalty (REQ-030)', () => {
  it('returns the input state unchanged when not on a building cell', () => {
    const state = { ...createVehicleState({ x: 0, z: 0, heading: 0 }), speed: MAX_SPEED }
    const next = applyBuildingPenalty(state, false, 0.016)
    expect(next).toBe(state)
  })

  it('returns the input state unchanged for non-positive dt', () => {
    const state = { ...createVehicleState({ x: 0, z: 0, heading: 0 }), speed: MAX_SPEED }
    expect(applyBuildingPenalty(state, true, 0)).toBe(state)
    expect(applyBuildingPenalty(state, true, -1)).toBe(state)
    expect(applyBuildingPenalty(state, true, Number.NaN)).toBe(state)
  })

  it('caps a held forward speed to BUILDING_PENALTY_MAX_SPEED on building cells', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: MAX_SPEED,
    }
    const next = applyBuildingPenalty(state, true, 0.016)
    expect(next.speed).toBeLessThanOrEqual(BUILDING_PENALTY_MAX_SPEED)
  })

  it('caps a held reverse speed to BUILDING_PENALTY_MAX_REVERSE_SPEED on building cells', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: -MAX_REVERSE_SPEED,
    }
    const next = applyBuildingPenalty(state, true, 0.016)
    expect(next.speed).toBeGreaterThanOrEqual(-BUILDING_PENALTY_MAX_REVERSE_SPEED)
  })

  it('drags a forward speed already inside the cap toward zero', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: BUILDING_PENALTY_MAX_SPEED * 0.5,
    }
    const next = applyBuildingPenalty(state, true, 0.1)
    expect(next.speed).toBeLessThan(state.speed)
    expect(next.speed).toBeGreaterThanOrEqual(0)
  })

  it('drags a reverse speed already inside the cap toward zero', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: -BUILDING_PENALTY_MAX_REVERSE_SPEED * 0.5,
    }
    const next = applyBuildingPenalty(state, true, 0.1)
    expect(next.speed).toBeGreaterThan(state.speed)
    expect(next.speed).toBeLessThanOrEqual(0)
  })

  it('clamps a small positive speed to zero rather than passing through it', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: 0.0001,
    }
    const next = applyBuildingPenalty(state, true, 1)
    expect(next.speed).toBe(0)
  })

  it('clamps a small negative speed to zero rather than overshooting past it', () => {
    const state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: -0.0001,
    }
    const next = applyBuildingPenalty(state, true, 1)
    expect(next.speed).toBe(0)
  })

  it('does not move the car position; only the speed scalar changes', () => {
    const state = {
      ...createVehicleState({ x: 1, z: 2, heading: 0.5 }),
      speed: MAX_SPEED,
    }
    const next = applyBuildingPenalty(state, true, 0.016)
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
    applyBuildingPenalty(state, true, 0.016)
    expect(state).toEqual(before)
  })

  it('a sustained throttle on a building cell drives speed below the cap quickly', () => {
    let state = {
      ...createVehicleState({ x: 0, z: 0, heading: 0 }),
      speed: MAX_SPEED,
    }
    // After one frame at 60Hz on a building cell, the cap kicks in.
    state = applyBuildingPenalty(state, true, 1 / 60)
    expect(state.speed).toBeLessThanOrEqual(BUILDING_PENALTY_MAX_SPEED)
  })
})
