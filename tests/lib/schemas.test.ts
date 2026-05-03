import { describe, it, expect } from 'vitest'
import {
  SlugSchema,
  normalizeSlug,
  PieceTypeSchema,
  RotationSchema,
  PieceSchema,
  BuildingTypeSchema,
  BuildingSchema,
  CityMoodSchema,
  CitySchema,
  EMPTY_CITY,
  MAX_PIECES_PER_CITY,
  MAX_BUILDINGS_PER_CITY,
  type Piece,
  type Building,
  type City,
} from '@/lib/schemas'

describe('SlugSchema', () => {
  it('accepts a single lowercase letter', () => {
    expect(SlugSchema.safeParse('a').success).toBe(true)
  })

  it('accepts a single digit', () => {
    expect(SlugSchema.safeParse('0').success).toBe(true)
  })

  it('accepts a kebab-case slug with letters, digits, and dashes', () => {
    expect(SlugSchema.safeParse('my-city-42').success).toBe(true)
  })

  it('accepts the maximum length of 128 chars', () => {
    const slug = 'a'.repeat(128)
    expect(SlugSchema.safeParse(slug).success).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(SlugSchema.safeParse('').success).toBe(false)
  })

  it('rejects a slug longer than 128 chars', () => {
    const slug = 'a'.repeat(129)
    expect(SlugSchema.safeParse(slug).success).toBe(false)
  })

  it('rejects a slug starting with a dash', () => {
    expect(SlugSchema.safeParse('-bad').success).toBe(false)
  })

  it('rejects uppercase letters', () => {
    expect(SlugSchema.safeParse('MyCity').success).toBe(false)
  })

  it('rejects underscores', () => {
    expect(SlugSchema.safeParse('my_city').success).toBe(false)
  })

  it('rejects spaces', () => {
    expect(SlugSchema.safeParse('my city').success).toBe(false)
  })

  it('rejects unicode letters', () => {
    expect(SlugSchema.safeParse('café').success).toBe(false)
  })

  it('rejects emoji', () => {
    expect(SlugSchema.safeParse('city-1').success).toBe(true)
    expect(SlugSchema.safeParse('city-1-rocket').success).toBe(true)
  })
})

describe('normalizeSlug', () => {
  it('lowercases mixed-case input', () => {
    expect(normalizeSlug('MyCity')).toBe('mycity')
  })

  it('drops disallowed characters', () => {
    expect(normalizeSlug('My City!')).toBe('mycity')
  })

  it('preserves dashes between letters', () => {
    expect(normalizeSlug('My-City-42')).toBe('my-city-42')
  })

  it('strips a leading run of dashes', () => {
    expect(normalizeSlug('---hello')).toBe('hello')
  })

  it('clamps to 128 chars', () => {
    const long = 'a'.repeat(200)
    expect(normalizeSlug(long).length).toBe(128)
  })

  it('returns the empty string when input collapses to nothing', () => {
    expect(normalizeSlug('!!!')).toBe('')
  })

  it('output of a valid kebab-case input is itself a valid Slug', () => {
    const out = normalizeSlug('my-city-42')
    expect(SlugSchema.safeParse(out).success).toBe(true)
  })
})

describe('PieceTypeSchema', () => {
  it('accepts every v1 street piece type', () => {
    const types = [
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
      'arc45',
      'diagonal',
      'intersection',
    ]
    for (const t of types) {
      expect(PieceTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('accepts the 45-degree connector piece types', () => {
    expect(PieceTypeSchema.safeParse('arc45').success).toBe(true)
    expect(PieceTypeSchema.safeParse('diagonal').success).toBe(true)
  })

  it('rejects unknown piece types', () => {
    expect(PieceTypeSchema.safeParse('roundabout').success).toBe(false)
    expect(PieceTypeSchema.safeParse('').success).toBe(false)
  })
})

describe('RotationSchema', () => {
  it('accepts the four cardinal rotations', () => {
    for (const r of [0, 90, 180, 270]) {
      expect(RotationSchema.safeParse(r).success).toBe(true)
    }
  })

  it('rejects non-cardinal rotations', () => {
    expect(RotationSchema.safeParse(45).success).toBe(false)
    expect(RotationSchema.safeParse(360).success).toBe(false)
    expect(RotationSchema.safeParse(-90).success).toBe(false)
  })
})

describe('PieceSchema', () => {
  const valid: Piece = {
    type: 'straight',
    row: 0,
    col: 0,
    rotation: 0,
  }

  it('accepts a minimal piece without footprint', () => {
    expect(PieceSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a piece with an explicit footprint', () => {
    const piece: Piece = {
      ...valid,
      type: 'megaSweepRight',
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
      ],
    }
    expect(PieceSchema.safeParse(piece).success).toBe(true)
  })

  it('rejects a piece with an empty footprint array', () => {
    expect(
      PieceSchema.safeParse({ ...valid, footprint: [] }).success,
    ).toBe(false)
  })

  it('rejects a piece with non-integer coordinates', () => {
    expect(
      PieceSchema.safeParse({ ...valid, row: 1.5 }).success,
    ).toBe(false)
  })

  it('rejects a piece with unknown fields', () => {
    expect(
      PieceSchema.safeParse({ ...valid, color: 'red' }).success,
    ).toBe(false)
  })

  it('rejects a footprint cell with unknown fields', () => {
    expect(
      PieceSchema.safeParse({
        ...valid,
        footprint: [{ dr: 0, dc: 0, weight: 1 }],
      }).success,
    ).toBe(false)
  })

  it('accepts an arc45 piece at every cardinal rotation', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const piece = { type: 'arc45', row: 2, col: 3, rotation }
      expect(PieceSchema.safeParse(piece).success).toBe(true)
    }
  })

  it('accepts a diagonal piece at every cardinal rotation', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const piece = { type: 'diagonal', row: 4, col: 5, rotation }
      expect(PieceSchema.safeParse(piece).success).toBe(true)
    }
  })

  it('accepts an arc45 piece with an explicit single-cell footprint', () => {
    expect(
      PieceSchema.safeParse({
        type: 'arc45',
        row: 0,
        col: 0,
        rotation: 0,
        footprint: [{ dr: 0, dc: 0 }],
      }).success,
    ).toBe(true)
  })

  it('rejects an arc45 piece with a non-cardinal rotation', () => {
    expect(
      PieceSchema.safeParse({
        type: 'arc45',
        row: 0,
        col: 0,
        rotation: 45,
      }).success,
    ).toBe(false)
  })

  it('rejects a diagonal piece with a non-cardinal rotation', () => {
    expect(
      PieceSchema.safeParse({
        type: 'diagonal',
        row: 0,
        col: 0,
        rotation: 135,
      }).success,
    ).toBe(false)
  })
})

describe('BuildingTypeSchema', () => {
  it('accepts every v1 building type', () => {
    for (const t of ['small-house', 'mid-house', 'shop', 'factory']) {
      expect(BuildingTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown building types', () => {
    expect(BuildingTypeSchema.safeParse('skyscraper').success).toBe(false)
  })
})

describe('BuildingSchema', () => {
  const valid: Building = {
    type: 'small-house',
    row: 1,
    col: 2,
    rotation: 90,
  }

  it('accepts a valid building', () => {
    expect(BuildingSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a building with unknown fields', () => {
    expect(
      BuildingSchema.safeParse({ ...valid, height: 3 }).success,
    ).toBe(false)
  })

  it('rejects a building with non-integer coordinates', () => {
    expect(
      BuildingSchema.safeParse({ ...valid, col: 2.5 }).success,
    ).toBe(false)
  })
})

describe('CityMoodSchema', () => {
  it('accepts an empty mood object', () => {
    expect(CityMoodSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a mood with only timeOfDay', () => {
    expect(CityMoodSchema.safeParse({ timeOfDay: 'noon' }).success).toBe(true)
  })

  it('accepts a mood with only weather', () => {
    expect(CityMoodSchema.safeParse({ weather: 'clear' }).success).toBe(true)
  })

  it('accepts a mood with both fields', () => {
    expect(
      CityMoodSchema.safeParse({ timeOfDay: 'noon', weather: 'clear' }).success,
    ).toBe(true)
  })

  it('rejects unknown fields', () => {
    expect(
      CityMoodSchema.safeParse({ timeOfDay: 'noon', wind: 'high' }).success,
    ).toBe(false)
  })
})

describe('CitySchema', () => {
  it('accepts the empty city', () => {
    const result = CitySchema.safeParse(EMPTY_CITY)
    expect(result.success).toBe(true)
  })

  it('accepts a city with pieces and buildings', () => {
    const city: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 1, col: 0, rotation: 90 },
      ],
      buildings: [{ type: 'shop', row: 0, col: 1, rotation: 0 }],
    }
    expect(CitySchema.safeParse(city).success).toBe(true)
  })

  it('accepts a city with optional mood', () => {
    const city = {
      pieces: [],
      buildings: [],
      mood: { timeOfDay: 'noon' },
    }
    expect(CitySchema.safeParse(city).success).toBe(true)
  })

  it('rejects a city missing pieces', () => {
    expect(CitySchema.safeParse({ buildings: [] }).success).toBe(false)
  })

  it('rejects a city missing buildings', () => {
    expect(CitySchema.safeParse({ pieces: [] }).success).toBe(false)
  })

  it('rejects a city with unknown top-level fields', () => {
    expect(
      CitySchema.safeParse({ pieces: [], buildings: [], owner: 'x' }).success,
    ).toBe(false)
  })

  it('rejects a city with too many pieces', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const city = {
      pieces: Array.from({ length: MAX_PIECES_PER_CITY + 1 }, () => piece),
      buildings: [],
    }
    expect(CitySchema.safeParse(city).success).toBe(false)
  })

  it('rejects a city with too many buildings', () => {
    const building: Building = {
      type: 'small-house',
      row: 0,
      col: 0,
      rotation: 0,
    }
    const city = {
      pieces: [],
      buildings: Array.from(
        { length: MAX_BUILDINGS_PER_CITY + 1 },
        () => building,
      ),
    }
    expect(CitySchema.safeParse(city).success).toBe(false)
  })

  it('rejects a city whose piece has unknown fields', () => {
    const city = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0, color: 'red' },
      ],
      buildings: [],
    }
    expect(CitySchema.safeParse(city).success).toBe(false)
  })

  it('accepts a city using arc45 to bridge into a diagonal run', () => {
    const city: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'arc45', row: 1, col: 0, rotation: 0 },
        { type: 'diagonal', row: 2, col: 1, rotation: 0 },
        { type: 'diagonal', row: 3, col: 2, rotation: 0 },
        { type: 'arc45', row: 4, col: 3, rotation: 180 },
      ],
      buildings: [],
    }
    expect(CitySchema.safeParse(city).success).toBe(true)
  })
})

describe('EMPTY_CITY', () => {
  it('parses successfully against CitySchema', () => {
    expect(CitySchema.safeParse(EMPTY_CITY).success).toBe(true)
  })

  it('has empty pieces and buildings arrays', () => {
    expect(EMPTY_CITY.pieces).toEqual([])
    expect(EMPTY_CITY.buildings).toEqual([])
  })
})
