import { describe, expect, it } from 'vitest'
import {
  RESPAWN_KEY_CODE,
  respawnVehicle,
} from '@/app/[slug]/respawn'
import { CELL_SIZE, cellToWorld, rotationToRadians } from '@/app/[slug]/driveScene'
import { DEFAULT_KEY_BINDINGS } from '@/app/[slug]/driveControls'
import type { Piece } from '@/lib/schemas'

/**
 * REQ-067 respawn key. The pure module is the unit-tested surface
 * here; the keyboard wiring and the camera rig snap live in
 * `DriveSceneClient.tsx` and ride on top of these helpers.
 */

const STRAIGHT_AT = (
  row: number,
  col: number,
  rotation: 0 | 90 | 180 | 270 = 0,
): Piece => ({ type: 'straight', row, col, rotation })

describe('RESPAWN_KEY_CODE', () => {
  it('is the KeyR keyboard event code', () => {
    expect(RESPAWN_KEY_CODE).toBe('KeyR')
  })

  it('does not collide with any default drive binding', () => {
    expect(DEFAULT_KEY_BINDINGS).not.toHaveProperty(RESPAWN_KEY_CODE)
  })

  it('does not collide with the Escape pause key (REQ-039)', () => {
    expect(RESPAWN_KEY_CODE).not.toBe('Escape')
  })
})

describe('respawnVehicle', () => {
  it('returns the grid origin pose with heading 0 when no pieces are placed', () => {
    const state = respawnVehicle([])
    expect(state.x).toBe(0)
    expect(state.z).toBe(0)
    expect(state.heading).toBe(0)
    expect(state.speed).toBe(0)
  })

  it('returns the world-space center of the first placed piece', () => {
    const pieces: Piece[] = [STRAIGHT_AT(2, 3)]
    const state = respawnVehicle(pieces)
    const expected = cellToWorld(2, 3)
    expect(state.x).toBe(expected.x)
    expect(state.z).toBe(expected.z)
  })

  it('matches the cell-to-world convention (col x CELL_SIZE, row x CELL_SIZE)', () => {
    const pieces: Piece[] = [STRAIGHT_AT(1, 4)]
    const state = respawnVehicle(pieces)
    expect(state.x).toBe(4 * CELL_SIZE)
    expect(state.z).toBe(1 * CELL_SIZE)
  })

  it('applies the first piece rotation to the heading', () => {
    const pieces: Piece[] = [STRAIGHT_AT(0, 0, 90)]
    const state = respawnVehicle(pieces)
    expect(state.heading).toBe(rotationToRadians(90))
  })

  it('handles each cardinal rotation', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const pieces: Piece[] = [STRAIGHT_AT(0, 0, rotation)]
      const state = respawnVehicle(pieces)
      expect(state.heading).toBe(rotationToRadians(rotation))
    }
  })

  it('zeroes the speed so the integrator does not pick up residual velocity', () => {
    const pieces: Piece[] = [STRAIGHT_AT(5, 5, 270)]
    const state = respawnVehicle(pieces)
    expect(state.speed).toBe(0)
  })

  it('uses only the first piece when several are placed', () => {
    const pieces: Piece[] = [
      STRAIGHT_AT(0, 0, 0),
      STRAIGHT_AT(7, 7, 90),
      STRAIGHT_AT(-3, -3, 180),
    ]
    const state = respawnVehicle(pieces)
    expect(state.x).toBe(0)
    expect(state.z).toBe(0)
    expect(state.heading).toBe(0)
  })

  it('handles negative cell coordinates', () => {
    const pieces: Piece[] = [STRAIGHT_AT(-2, -4)]
    const state = respawnVehicle(pieces)
    expect(state.x).toBe(-4 * CELL_SIZE)
    expect(state.z).toBe(-2 * CELL_SIZE)
  })

  it('returns a fresh object so a caller cannot mutate a shared singleton', () => {
    const pieces: Piece[] = [STRAIGHT_AT(0, 0)]
    const a = respawnVehicle(pieces)
    const b = respawnVehicle(pieces)
    expect(a).not.toBe(b)
    a.x = 999
    expect(b.x).toBe(0)
  })

  it('does not mutate the input pieces array', () => {
    const pieces: Piece[] = [STRAIGHT_AT(2, 3, 90)]
    const snapshot = JSON.parse(JSON.stringify(pieces))
    respawnVehicle(pieces)
    expect(pieces).toEqual(snapshot)
  })
})
