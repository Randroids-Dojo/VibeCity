import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PALETTE_TYPE,
  STREET_PALETTE,
  placePiece,
} from '@/app/[slug]/edit/editorState'
import { CitySchema, EMPTY_CITY, type City } from '@/lib/schemas'

/**
 * REQ-017 (street palette: straight, left90, right90) and REQ-020
 * (place piece on grid cell with click).
 *
 * Tests cover the palette enumeration that the EditorClient renders
 * and the pure `placePiece` reducer the click handler dispatches.
 * The React component layer is exercised end-to-end by
 * `npm run build` plus the Playwright spec for the editor route.
 */

describe('STREET_PALETTE (REQ-017)', () => {
  it('exposes exactly the v1 cardinal-only types', () => {
    expect(STREET_PALETTE.map((p) => p.type)).toEqual([
      'straight',
      'left90',
      'right90',
    ])
  })

  it('every entry carries a non-empty label', () => {
    for (const entry of STREET_PALETTE) {
      expect(typeof entry.label).toBe('string')
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })

  it('every entry is a valid PieceType in the schema', () => {
    const sampleCity: City = {
      pieces: STREET_PALETTE.map((entry) => ({
        type: entry.type,
        row: 0,
        col: 0,
        rotation: 0,
      })),
      buildings: [],
    }
    // CitySchema would reject any unknown PieceType. Setting all pieces
    // at the same cell is fine here since we are validating the type
    // enum, not footprint occupancy (that is REQ-027 territory).
    expect(() => CitySchema.parse(sampleCity)).not.toThrow()
  })

  it('does not advertise pieces from later slices (REQ-018, REQ-019)', () => {
    const types = new Set(STREET_PALETTE.map((p) => p.type))
    expect(types.has('scurve')).toBe(false)
    expect(types.has('intersection')).toBe(false)
    expect(types.has('megaSweepRight')).toBe(false)
  })
})

describe('DEFAULT_PALETTE_TYPE (REQ-017)', () => {
  it('matches the first palette entry', () => {
    expect(DEFAULT_PALETTE_TYPE).toBe(STREET_PALETTE[0].type)
  })

  it('is straight (the most common starter piece)', () => {
    expect(DEFAULT_PALETTE_TYPE).toBe('straight')
  })
})

describe('placePiece (REQ-020)', () => {
  it('appends a single piece to the empty city', () => {
    const next = placePiece(EMPTY_CITY, 'straight', 0, 0)
    expect(next.pieces).toHaveLength(1)
    expect(next.pieces[0]).toEqual({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
  })

  it('preserves the original city (immutable update)', () => {
    const next = placePiece(EMPTY_CITY, 'straight', 0, 0)
    expect(EMPTY_CITY.pieces).toHaveLength(0)
    expect(next).not.toBe(EMPTY_CITY)
  })

  it('respects an explicit rotation argument', () => {
    const next = placePiece(EMPTY_CITY, 'left90', 1, 2, 90)
    expect(next.pieces[0]).toEqual({
      type: 'left90',
      row: 1,
      col: 2,
      rotation: 90,
    })
  })

  it('defaults rotation to 0 when omitted', () => {
    const next = placePiece(EMPTY_CITY, 'right90', -1, -1)
    expect(next.pieces[0].rotation).toBe(0)
  })

  it('supports negative cell coordinates', () => {
    const next = placePiece(EMPTY_CITY, 'straight', -3, -7)
    expect(next.pieces[0]).toEqual({
      type: 'straight',
      row: -3,
      col: -7,
      rotation: 0,
    })
  })

  it('appends pieces in placement order', () => {
    let city: City = EMPTY_CITY
    city = placePiece(city, 'straight', 0, 0)
    city = placePiece(city, 'left90', 0, 1)
    city = placePiece(city, 'right90', 1, 0)
    expect(city.pieces.map((p) => p.type)).toEqual([
      'straight',
      'left90',
      'right90',
    ])
  })

  it('rejects a placement that overlaps an existing piece (REQ-027)', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const next = placePiece(seeded, 'left90', 0, 0)
    expect(next).toBe(seeded)
    expect(next.pieces).toHaveLength(1)
  })

  it('rejects a placement whose multi-cell footprint overlaps any existing cell', () => {
    const seeded: City = {
      pieces: [
        {
          type: 'megaSweepRight',
          row: 0,
          col: 0,
          rotation: 0,
          footprint: [
            { dr: 0, dc: 0 },
            { dr: 0, dc: 1 },
            { dr: 1, dc: 0 },
          ],
        },
      ],
      buildings: [],
    }
    // straight has implicit single-cell footprint at (0, 1) which
    // overlaps the seeded mega sweep's (0, 1) cell.
    const next = placePiece(seeded, 'straight', 0, 1)
    expect(next).toBe(seeded)
  })

  it('accepts a placement adjacent to an existing piece', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const next = placePiece(seeded, 'straight', 0, 1)
    expect(next).not.toBe(seeded)
    expect(next.pieces).toHaveLength(2)
    expect(next.pieces[1]).toEqual({
      type: 'straight',
      row: 0,
      col: 1,
      rotation: 0,
    })
  })

  it('does not mutate the input city (functional update)', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const before = JSON.stringify(seeded)
    placePiece(seeded, 'left90', 1, 1)
    expect(JSON.stringify(seeded)).toBe(before)
  })

  it('preserves buildings array on accept and reject', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [{ type: 'small-house', row: 5, col: 5, rotation: 0 }],
    }
    const accepted = placePiece(seeded, 'straight', 1, 1)
    expect(accepted.buildings).toEqual(seeded.buildings)
    const rejected = placePiece(seeded, 'left90', 0, 0)
    expect(rejected.buildings).toEqual(seeded.buildings)
  })
})
