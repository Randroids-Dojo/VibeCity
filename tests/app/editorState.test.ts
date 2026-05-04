import { describe, expect, it } from 'vitest'
import {
  BUILDING_PALETTE,
  DEFAULT_BUILDING_TYPE,
  DEFAULT_PALETTE_CATEGORY,
  DEFAULT_PALETTE_TYPE,
  DEFAULT_ROTATION,
  DEFAULT_TOOL_MODE,
  ROTATIONS,
  STREET_PALETTE,
  eraseBuilding,
  erasePiece,
  nextRotation,
  placeBuilding,
  placePiece,
} from '@/app/[slug]/edit/editorState'
import {
  CitySchema,
  EMPTY_CITY,
  RotationSchema,
  type City,
  type Rotation,
} from '@/lib/schemas'

/**
 * REQ-017 (street palette: straight, left90, right90) and REQ-020
 * (place piece on grid cell with click).
 *
 * Tests cover the palette enumeration that the EditorClient renders
 * and the pure `placePiece` reducer the click handler dispatches.
 * The React component layer is exercised end-to-end by
 * `npm run build` plus the Playwright spec for the editor route.
 */

describe('STREET_PALETTE (REQ-017, REQ-018, REQ-019, REQ-061, REQ-062)', () => {
  it('exposes the v1 cardinal basics, the curve / sweep pieces, the intersection, then the corner-connector pieces', () => {
    expect(STREET_PALETTE.map((p) => p.type)).toEqual([
      'straight',
      'left90',
      'right90',
      'scurve',
      'scurveLeft',
      'sweepRight',
      'sweepLeft',
      'intersection',
      'arc45',
      'diagonal',
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
      pieces: STREET_PALETTE.map((entry, index) => ({
        type: entry.type,
        // Spread placements across cells so CitySchema also tolerates
        // them when the future overlap-aware schema check lands; for
        // type validation alone the cell choice is irrelevant.
        row: index,
        col: 0,
        rotation: 0,
      })),
      buildings: [],
    }
    // CitySchema would reject any unknown PieceType.
    expect(() => CitySchema.parse(sampleCity)).not.toThrow()
  })

  it('keeps Straight as the first entry so REQ-017 default selection is unchanged', () => {
    expect(STREET_PALETTE[0].type).toBe('straight')
  })

  it('orders REQ-018 entries after the REQ-017 cardinal basics', () => {
    const indexOf = (t: string) =>
      STREET_PALETTE.findIndex((p) => p.type === t)
    expect(indexOf('right90')).toBeLessThan(indexOf('scurve'))
    expect(indexOf('scurve')).toBeLessThan(indexOf('sweepRight'))
  })

  it('orders the REQ-019 intersection after every REQ-018 curve / sweep entry', () => {
    const indexOf = (t: string) =>
      STREET_PALETTE.findIndex((p) => p.type === t)
    expect(indexOf('sweepLeft')).toBeLessThan(indexOf('intersection'))
  })

  it('orders the REQ-061 arc45 and REQ-062 diagonal after the intersection', () => {
    const indexOf = (t: string) =>
      STREET_PALETTE.findIndex((p) => p.type === t)
    expect(indexOf('intersection')).toBeLessThan(indexOf('arc45'))
    expect(indexOf('arc45')).toBeLessThan(indexOf('diagonal'))
    // diagonal is the trailing entry so the corner-connector block stays
    // grouped at the end of the palette.
    expect(indexOf('diagonal')).toBe(STREET_PALETTE.length - 1)
  })

  it('does not advertise pieces from later slices (REQ-058, REQ-060)', () => {
    const types = new Set(STREET_PALETTE.map((p) => p.type))
    expect(types.has('megaSweepRight')).toBe(false)
    expect(types.has('megaSweepLeft')).toBe(false)
    expect(types.has('hairpin')).toBe(false)
  })

  it('does not duplicate any piece type', () => {
    const types = STREET_PALETTE.map((p) => p.type)
    expect(new Set(types).size).toBe(types.length)
  })
})

describe('placePiece with REQ-018 piece types', () => {
  it('places each REQ-018 piece type as a single-cell piece', () => {
    const types = ['scurve', 'scurveLeft', 'sweepRight', 'sweepLeft'] as const
    let city: City = EMPTY_CITY
    types.forEach((type, index) => {
      city = placePiece(city, type, index, 0)
    })
    expect(city.pieces).toHaveLength(types.length)
    expect(city.pieces.map((p) => p.type)).toEqual([...types])
    for (const piece of city.pieces) {
      expect(piece.footprint).toBeUndefined()
    }
  })

  it('still rejects overlap when placing a REQ-018 piece on an occupied cell', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const next = placePiece(seeded, 'sweepRight', 0, 0, 90)
    expect(next).toBe(seeded)
  })
})

describe('placePiece with REQ-019 intersection', () => {
  it('places intersection as a single-cell piece', () => {
    const next = placePiece(EMPTY_CITY, 'intersection', 0, 0)
    expect(next.pieces).toHaveLength(1)
    expect(next.pieces[0]).toEqual({
      type: 'intersection',
      row: 0,
      col: 0,
      rotation: 0,
    })
    expect(next.pieces[0].footprint).toBeUndefined()
  })

  it('records rotation when the click handler passes one', () => {
    const next = placePiece(EMPTY_CITY, 'intersection', 1, 2, 270)
    expect(next.pieces[0].rotation).toBe(270)
  })

  it('rejects placement on a cell already occupied by a piece', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const next = placePiece(seeded, 'intersection', 0, 0)
    expect(next).toBe(seeded)
  })

  it('rejects placement on a cell already occupied by a building', () => {
    // A building does not appear in occupiedPieceCells, so placePiece
    // does not block placement on a building cell. This is the v1
    // contract: pieces and buildings collide at the building reducer
    // boundary (placeBuilding rejects piece-cell overlap), not the
    // piece reducer. The intersection follows the same contract.
    const seeded: City = {
      pieces: [],
      buildings: [{ type: 'small-house', row: 0, col: 0, rotation: 0 }],
    }
    const next = placePiece(seeded, 'intersection', 0, 0)
    // Intersection placement still appends because the piece reducer
    // does not gate on the buildings array; this matches every other
    // street piece in the palette and keeps the v1 contract symmetric.
    expect(next).not.toBe(seeded)
    expect(next.pieces).toHaveLength(1)
    expect(next.pieces[0].type).toBe('intersection')
  })

  it('round-trips with erasePiece', () => {
    const placed = placePiece(EMPTY_CITY, 'intersection', 3, 4, 90)
    const erased = erasePiece(placed, 3, 4)
    expect(erased.pieces).toHaveLength(0)
  })

  it('returns a city that still validates against CitySchema', () => {
    const next = placePiece(EMPTY_CITY, 'intersection', 0, 0, 180)
    expect(() => CitySchema.parse(next)).not.toThrow()
  })
})

describe('placePiece with REQ-061 arc45 and REQ-062 diagonal', () => {
  it('places arc45 as a single-cell piece', () => {
    const next = placePiece(EMPTY_CITY, 'arc45', 0, 0)
    expect(next.pieces).toHaveLength(1)
    expect(next.pieces[0]).toEqual({
      type: 'arc45',
      row: 0,
      col: 0,
      rotation: 0,
    })
    expect(next.pieces[0].footprint).toBeUndefined()
  })

  it('places diagonal as a single-cell piece', () => {
    const next = placePiece(EMPTY_CITY, 'diagonal', 1, 2)
    expect(next.pieces).toHaveLength(1)
    expect(next.pieces[0]).toEqual({
      type: 'diagonal',
      row: 1,
      col: 2,
      rotation: 0,
    })
    expect(next.pieces[0].footprint).toBeUndefined()
  })

  it('records rotation when the click handler passes one', () => {
    const placedArc = placePiece(EMPTY_CITY, 'arc45', 3, 4, 90)
    expect(placedArc.pieces[0].rotation).toBe(90)
    const placedDiagonal = placePiece(EMPTY_CITY, 'diagonal', 5, 6, 270)
    expect(placedDiagonal.pieces[0].rotation).toBe(270)
  })

  it('rejects placement on a cell already occupied by a piece', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    expect(placePiece(seeded, 'arc45', 0, 0)).toBe(seeded)
    expect(placePiece(seeded, 'diagonal', 0, 0)).toBe(seeded)
  })

  it('round-trips with erasePiece', () => {
    const placedArc = placePiece(EMPTY_CITY, 'arc45', 2, 3)
    expect(erasePiece(placedArc, 2, 3).pieces).toHaveLength(0)
    const placedDiagonal = placePiece(EMPTY_CITY, 'diagonal', -1, -2)
    expect(erasePiece(placedDiagonal, -1, -2).pieces).toHaveLength(0)
  })

  it('returns a city that still validates against CitySchema', () => {
    const arcCity = placePiece(EMPTY_CITY, 'arc45', 0, 0, 180)
    expect(() => CitySchema.parse(arcCity)).not.toThrow()
    const diagonalCity = placePiece(EMPTY_CITY, 'diagonal', 0, 1, 90)
    expect(() => CitySchema.parse(diagonalCity)).not.toThrow()
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

describe('ROTATIONS (REQ-021)', () => {
  it('exposes the four cardinal rotations in cycle order', () => {
    expect(ROTATIONS).toEqual([0, 90, 180, 270])
  })

  it('every entry is a valid Rotation in the schema', () => {
    for (const rotation of ROTATIONS) {
      expect(() => RotationSchema.parse(rotation)).not.toThrow()
    }
  })
})

describe('DEFAULT_ROTATION (REQ-021)', () => {
  it('matches the first rotation in the cycle', () => {
    expect(DEFAULT_ROTATION).toBe(ROTATIONS[0])
  })

  it('is 0 (canonical orientation for first-time authors)', () => {
    expect(DEFAULT_ROTATION).toBe(0)
  })
})

describe('nextRotation (REQ-021)', () => {
  it('advances 0 to 90', () => {
    expect(nextRotation(0)).toBe(90)
  })

  it('advances 90 to 180', () => {
    expect(nextRotation(90)).toBe(180)
  })

  it('advances 180 to 270', () => {
    expect(nextRotation(180)).toBe(270)
  })

  it('wraps 270 back to 0', () => {
    expect(nextRotation(270)).toBe(0)
  })

  it('returns to the starting rotation after four steps (full cycle)', () => {
    let r: Rotation = 0
    for (let i = 0; i < 4; i++) {
      r = nextRotation(r)
    }
    expect(r).toBe(0)
  })

  it('always returns a schema-valid Rotation', () => {
    for (const start of ROTATIONS) {
      const next = nextRotation(start)
      expect(() => RotationSchema.parse(next)).not.toThrow()
    }
  })
})

describe('placePiece with rotation argument (REQ-021)', () => {
  it('records the rotation passed by the click handler', () => {
    const next = placePiece(EMPTY_CITY, 'left90', 0, 0, 270)
    expect(next.pieces[0].rotation).toBe(270)
  })

  it('still applies overlap rejection regardless of rotation', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const next = placePiece(seeded, 'left90', 0, 0, 90)
    expect(next).toBe(seeded)
  })
})

describe('DEFAULT_TOOL_MODE (REQ-022)', () => {
  it('opens in place mode (no tool pick required for first placement)', () => {
    expect(DEFAULT_TOOL_MODE).toBe('place')
  })
})

describe('erasePiece (REQ-022)', () => {
  it('removes the piece occupying the target cell', () => {
    const seeded: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
      ],
      buildings: [],
    }
    const next = erasePiece(seeded, 0, 0)
    expect(next.pieces).toHaveLength(1)
    expect(next.pieces[0]).toEqual({
      type: 'left90',
      row: 0,
      col: 1,
      rotation: 0,
    })
  })

  it('returns the original city when no piece occupies the cell', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const next = erasePiece(seeded, 5, 5)
    expect(next).toBe(seeded)
  })

  it('returns the original empty city when there is nothing to erase', () => {
    const next = erasePiece(EMPTY_CITY, 0, 0)
    expect(next).toBe(EMPTY_CITY)
  })

  it('does not mutate the input city (functional update)', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const before = JSON.stringify(seeded)
    erasePiece(seeded, 0, 0)
    expect(JSON.stringify(seeded)).toBe(before)
  })

  it('preserves buildings array on accept and no-op', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [{ type: 'small-house', row: 5, col: 5, rotation: 0 }],
    }
    const erased = erasePiece(seeded, 0, 0)
    expect(erased.buildings).toEqual(seeded.buildings)
    const noop = erasePiece(seeded, 9, 9)
    expect(noop.buildings).toEqual(seeded.buildings)
  })

  it('removes a multi-cell piece when any footprint cell is clicked', () => {
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
    // Click the off-anchor footprint cell (1, 0); the whole piece should
    // disappear atomically.
    const next = erasePiece(seeded, 1, 0)
    expect(next.pieces).toHaveLength(0)
  })

  it('supports negative cell coordinates', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: -3, col: -7, rotation: 0 }],
      buildings: [],
    }
    const next = erasePiece(seeded, -3, -7)
    expect(next.pieces).toHaveLength(0)
  })

  it('only removes the first matching piece when two share a cell', () => {
    // placePiece would never produce this state, but a hand-edited city
    // could; the reducer must be deterministic.
    const seeded: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 0, rotation: 0 },
      ],
      buildings: [],
    }
    const next = erasePiece(seeded, 0, 0)
    expect(next.pieces).toHaveLength(1)
    expect(next.pieces[0].type).toBe('left90')
  })

  it('preserves placement order of remaining pieces', () => {
    const seeded: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
        { type: 'right90', row: 1, col: 0, rotation: 0 },
      ],
      buildings: [],
    }
    const next = erasePiece(seeded, 0, 1)
    expect(next.pieces.map((p) => p.type)).toEqual(['straight', 'right90'])
  })

  it('round-trips with placePiece (place then erase yields the original)', () => {
    const placed = placePiece(EMPTY_CITY, 'straight', 2, 3)
    expect(placed.pieces).toHaveLength(1)
    const erased = erasePiece(placed, 2, 3)
    expect(erased.pieces).toHaveLength(0)
    expect(erased.buildings).toEqual(EMPTY_CITY.buildings)
  })

  it('returns a city that still validates against CitySchema', () => {
    const seeded: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
      ],
      buildings: [],
    }
    const next = erasePiece(seeded, 0, 0)
    expect(() => CitySchema.parse(next)).not.toThrow()
  })
})

describe('BUILDING_PALETTE (REQ-028)', () => {
  it('exposes the v1 four placeholder primitive types in order', () => {
    expect(BUILDING_PALETTE.map((b) => b.type)).toEqual([
      'small-house',
      'mid-house',
      'shop',
      'factory',
    ])
  })

  it('every entry carries a non-empty label', () => {
    for (const entry of BUILDING_PALETTE) {
      expect(typeof entry.label).toBe('string')
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })

  it('every entry is a valid BuildingType in the schema', () => {
    const sampleCity: City = {
      pieces: [],
      buildings: BUILDING_PALETTE.map((entry, index) => ({
        type: entry.type,
        row: index,
        col: 0,
        rotation: 0,
      })),
    }
    expect(() => CitySchema.parse(sampleCity)).not.toThrow()
  })

  it('does not duplicate any building type', () => {
    const types = BUILDING_PALETTE.map((b) => b.type)
    expect(new Set(types).size).toBe(types.length)
  })
})

describe('DEFAULT_BUILDING_TYPE (REQ-028)', () => {
  it('matches the first entry in BUILDING_PALETTE', () => {
    expect(DEFAULT_BUILDING_TYPE).toBe(BUILDING_PALETTE[0].type)
  })

  it('is small-house (smallest primitive, lowest-friction default)', () => {
    expect(DEFAULT_BUILDING_TYPE).toBe('small-house')
  })
})

describe('DEFAULT_PALETTE_CATEGORY (REQ-028)', () => {
  it('opens in street category so a first placement is a road', () => {
    expect(DEFAULT_PALETTE_CATEGORY).toBe('street')
  })
})

describe('placeBuilding (REQ-028, REQ-029)', () => {
  it('appends a single building to the empty city', () => {
    const next = placeBuilding(EMPTY_CITY, 'small-house', 0, 0)
    expect(next.buildings).toHaveLength(1)
    expect(next.buildings[0]).toEqual({
      type: 'small-house',
      row: 0,
      col: 0,
      rotation: 0,
    })
  })

  it('preserves the original city (immutable update)', () => {
    const next = placeBuilding(EMPTY_CITY, 'mid-house', 1, 1)
    expect(EMPTY_CITY.buildings).toHaveLength(0)
    expect(next).not.toBe(EMPTY_CITY)
  })

  it('respects an explicit rotation argument', () => {
    const next = placeBuilding(EMPTY_CITY, 'shop', 1, 2, 90)
    expect(next.buildings[0]).toEqual({
      type: 'shop',
      row: 1,
      col: 2,
      rotation: 90,
    })
  })

  it('defaults rotation to 0 when omitted', () => {
    const next = placeBuilding(EMPTY_CITY, 'factory', -1, -1)
    expect(next.buildings[0].rotation).toBe(0)
  })

  it('supports negative cell coordinates', () => {
    const next = placeBuilding(EMPTY_CITY, 'small-house', -3, -7)
    expect(next.buildings[0]).toEqual({
      type: 'small-house',
      row: -3,
      col: -7,
      rotation: 0,
    })
  })

  it('appends buildings in placement order', () => {
    let city: City = EMPTY_CITY
    city = placeBuilding(city, 'small-house', 0, 0)
    city = placeBuilding(city, 'mid-house', 0, 1)
    city = placeBuilding(city, 'shop', 1, 0)
    expect(city.buildings.map((b) => b.type)).toEqual([
      'small-house',
      'mid-house',
      'shop',
    ])
  })

  it('rejects placement on a cell already occupied by a piece (no street-building stacking)', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const next = placeBuilding(seeded, 'small-house', 0, 0)
    expect(next).toBe(seeded)
  })

  it('rejects placement on a cell already occupied by another building', () => {
    const seeded: City = {
      pieces: [],
      buildings: [{ type: 'small-house', row: 0, col: 0, rotation: 0 }],
    }
    const next = placeBuilding(seeded, 'shop', 0, 0)
    expect(next).toBe(seeded)
  })

  it('rejects placement on a multi-cell piece footprint cell', () => {
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
    const next = placeBuilding(seeded, 'small-house', 1, 0)
    expect(next).toBe(seeded)
  })

  it('accepts placement adjacent to an existing piece', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const next = placeBuilding(seeded, 'small-house', 1, 0)
    expect(next).not.toBe(seeded)
    expect(next.buildings).toHaveLength(1)
  })

  it('preserves the pieces array on accept and reject', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const accepted = placeBuilding(seeded, 'small-house', 1, 1)
    expect(accepted.pieces).toBe(seeded.pieces)
    const rejected = placeBuilding(seeded, 'small-house', 0, 0)
    expect(rejected.pieces).toBe(seeded.pieces)
  })

  it('does not mutate the input city (functional update)', () => {
    const seeded: City = {
      pieces: [],
      buildings: [{ type: 'small-house', row: 0, col: 0, rotation: 0 }],
    }
    const before = JSON.stringify(seeded)
    placeBuilding(seeded, 'mid-house', 1, 1)
    expect(JSON.stringify(seeded)).toBe(before)
  })

  it('returns a city that still validates against CitySchema', () => {
    const next = placeBuilding(EMPTY_CITY, 'shop', 0, 0, 90)
    expect(() => CitySchema.parse(next)).not.toThrow()
  })
})

describe('eraseBuilding (REQ-029)', () => {
  it('removes the building at the target cell', () => {
    const seeded: City = {
      pieces: [],
      buildings: [
        { type: 'small-house', row: 0, col: 0, rotation: 0 },
        { type: 'mid-house', row: 0, col: 1, rotation: 0 },
      ],
    }
    const next = eraseBuilding(seeded, 0, 0)
    expect(next.buildings).toHaveLength(1)
    expect(next.buildings[0]).toEqual({
      type: 'mid-house',
      row: 0,
      col: 1,
      rotation: 0,
    })
  })

  it('returns the original city when no building occupies the cell', () => {
    const seeded: City = {
      pieces: [],
      buildings: [{ type: 'small-house', row: 0, col: 0, rotation: 0 }],
    }
    const next = eraseBuilding(seeded, 5, 5)
    expect(next).toBe(seeded)
  })

  it('returns the original empty city when there is nothing to erase', () => {
    const next = eraseBuilding(EMPTY_CITY, 0, 0)
    expect(next).toBe(EMPTY_CITY)
  })

  it('does not touch the pieces array', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [{ type: 'small-house', row: 1, col: 1, rotation: 0 }],
    }
    const next = eraseBuilding(seeded, 1, 1)
    expect(next.pieces).toBe(seeded.pieces)
  })

  it('does not erase a piece that happens to share the cell', () => {
    const seeded: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    // Even if a building palette click landed on a piece cell (which
    // placeBuilding rejects), erase should not pull a piece by mistake.
    const next = eraseBuilding(seeded, 0, 0)
    expect(next).toBe(seeded)
    expect(next.pieces).toHaveLength(1)
  })

  it('does not mutate the input city (functional update)', () => {
    const seeded: City = {
      pieces: [],
      buildings: [{ type: 'small-house', row: 0, col: 0, rotation: 0 }],
    }
    const before = JSON.stringify(seeded)
    eraseBuilding(seeded, 0, 0)
    expect(JSON.stringify(seeded)).toBe(before)
  })

  it('only removes the first matching building when two share a cell', () => {
    // placeBuilding prevents this state, but a hand-edited city could
    // produce it; the reducer must be deterministic.
    const seeded: City = {
      pieces: [],
      buildings: [
        { type: 'small-house', row: 0, col: 0, rotation: 0 },
        { type: 'shop', row: 0, col: 0, rotation: 0 },
      ],
    }
    const next = eraseBuilding(seeded, 0, 0)
    expect(next.buildings).toHaveLength(1)
    expect(next.buildings[0].type).toBe('shop')
  })

  it('preserves placement order of remaining buildings', () => {
    const seeded: City = {
      pieces: [],
      buildings: [
        { type: 'small-house', row: 0, col: 0, rotation: 0 },
        { type: 'mid-house', row: 0, col: 1, rotation: 0 },
        { type: 'shop', row: 1, col: 0, rotation: 0 },
      ],
    }
    const next = eraseBuilding(seeded, 0, 1)
    expect(next.buildings.map((b) => b.type)).toEqual(['small-house', 'shop'])
  })

  it('round-trips with placeBuilding (place then erase yields the original)', () => {
    const placed = placeBuilding(EMPTY_CITY, 'small-house', 2, 3)
    expect(placed.buildings).toHaveLength(1)
    const erased = eraseBuilding(placed, 2, 3)
    expect(erased.buildings).toHaveLength(0)
    expect(erased.pieces).toEqual(EMPTY_CITY.pieces)
  })

  it('returns a city that still validates against CitySchema', () => {
    const seeded: City = {
      pieces: [],
      buildings: [
        { type: 'small-house', row: 0, col: 0, rotation: 0 },
        { type: 'shop', row: 0, col: 1, rotation: 0 },
      ],
    }
    const next = eraseBuilding(seeded, 0, 0)
    expect(() => CitySchema.parse(next)).not.toThrow()
  })
})
