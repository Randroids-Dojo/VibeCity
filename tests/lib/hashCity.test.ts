import { describe, it, expect } from 'vitest'
import { hashCity, canonicalCityJson } from '@/lib/hashCity'
import type { Building, City, Piece } from '@/lib/schemas'
import { EMPTY_CITY } from '@/lib/schemas'

const HEX64 = /^[a-f0-9]{64}$/

const straight = (row: number, col: number, rotation: 0 | 90 | 180 | 270 = 0): Piece => ({
  type: 'straight',
  row,
  col,
  rotation,
})

const shop = (row: number, col: number, rotation: 0 | 90 | 180 | 270 = 0): Building => ({
  type: 'shop',
  row,
  col,
  rotation,
})

describe('hashCity', () => {
  it('returns a 64-char hex digest', () => {
    const hash = hashCity(EMPTY_CITY)
    expect(hash).toMatch(HEX64)
  })

  it('is deterministic for the same input', () => {
    const a = hashCity(EMPTY_CITY)
    const b = hashCity(EMPTY_CITY)
    expect(a).toBe(b)
  })

  it('differs between empty city and a city with one piece', () => {
    const a = hashCity(EMPTY_CITY)
    const b = hashCity({ pieces: [straight(0, 0)], buildings: [] })
    expect(a).not.toBe(b)
  })

  it('is invariant to piece array order', () => {
    const cityA: City = {
      pieces: [straight(0, 0), straight(1, 1)],
      buildings: [],
    }
    const cityB: City = {
      pieces: [straight(1, 1), straight(0, 0)],
      buildings: [],
    }
    expect(hashCity(cityA)).toBe(hashCity(cityB))
  })

  it('is invariant to building array order', () => {
    const cityA: City = {
      pieces: [],
      buildings: [shop(0, 0), shop(2, 3)],
    }
    const cityB: City = {
      pieces: [],
      buildings: [shop(2, 3), shop(0, 0)],
    }
    expect(hashCity(cityA)).toBe(hashCity(cityB))
  })

  it('is invariant to mood presence', () => {
    const base: City = { pieces: [straight(0, 0)], buildings: [shop(0, 1)] }
    const moody: City = { ...base, mood: { timeOfDay: 'noon' } }
    const moodier: City = { ...base, mood: { timeOfDay: 'dusk', weather: 'rain' } }
    expect(hashCity(base)).toBe(hashCity(moody))
    expect(hashCity(base)).toBe(hashCity(moodier))
  })

  it('treats omitted footprint and explicit single-cell default footprint as equal', () => {
    const cityA: City = {
      pieces: [straight(0, 0)],
      buildings: [],
    }
    const cityB: City = {
      pieces: [{ ...straight(0, 0), footprint: [{ dr: 0, dc: 0 }] }],
      buildings: [],
    }
    expect(hashCity(cityA)).toBe(hashCity(cityB))
  })

  it('treats footprint cell order as irrelevant', () => {
    const cityA: City = {
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
    const cityB: City = {
      pieces: [
        {
          type: 'megaSweepRight',
          row: 0,
          col: 0,
          rotation: 0,
          footprint: [
            { dr: 1, dc: 0 },
            { dr: 0, dc: 0 },
            { dr: 0, dc: 1 },
          ],
        },
      ],
      buildings: [],
    }
    expect(hashCity(cityA)).toBe(hashCity(cityB))
  })

  it('changes when a piece moves', () => {
    const a = hashCity({ pieces: [straight(0, 0)], buildings: [] })
    const b = hashCity({ pieces: [straight(1, 0)], buildings: [] })
    expect(a).not.toBe(b)
  })

  it('changes when a piece rotates', () => {
    const a = hashCity({ pieces: [straight(0, 0, 0)], buildings: [] })
    const b = hashCity({ pieces: [straight(0, 0, 90)], buildings: [] })
    expect(a).not.toBe(b)
  })

  it('changes when a piece type changes', () => {
    const a = hashCity({ pieces: [straight(0, 0)], buildings: [] })
    const b = hashCity({
      pieces: [{ type: 'left90', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    })
    expect(a).not.toBe(b)
  })

  it('changes when a building moves', () => {
    const a = hashCity({ pieces: [], buildings: [shop(0, 0)] })
    const b = hashCity({ pieces: [], buildings: [shop(0, 1)] })
    expect(a).not.toBe(b)
  })

  it('changes when a building type changes', () => {
    const a = hashCity({ pieces: [], buildings: [shop(0, 0)] })
    const b = hashCity({
      pieces: [],
      buildings: [{ type: 'factory', row: 0, col: 0, rotation: 0 }],
    })
    expect(a).not.toBe(b)
  })

  it('changes when a non-default footprint changes', () => {
    const cityA: City = {
      pieces: [
        {
          type: 'megaSweepRight',
          row: 0,
          col: 0,
          rotation: 0,
          footprint: [
            { dr: 0, dc: 0 },
            { dr: 0, dc: 1 },
          ],
        },
      ],
      buildings: [],
    }
    const cityB: City = {
      pieces: [
        {
          type: 'megaSweepRight',
          row: 0,
          col: 0,
          rotation: 0,
          footprint: [
            { dr: 0, dc: 0 },
            { dr: 1, dc: 0 },
          ],
        },
      ],
      buildings: [],
    }
    expect(hashCity(cityA)).not.toBe(hashCity(cityB))
  })

  it('collapses negative-zero offsets to zero in the canonical form', () => {
    const cityA: City = {
      pieces: [{ ...straight(0, 0), footprint: [{ dr: 0, dc: 0 }] }],
      buildings: [],
    }
    const cityB: City = {
      pieces: [{ ...straight(0, 0), footprint: [{ dr: -0, dc: -0 }] }],
      buildings: [],
    }
    expect(hashCity(cityA)).toBe(hashCity(cityB))
  })
})

describe('canonicalCityJson', () => {
  it('produces deterministic key order in the serialized output', () => {
    const json = canonicalCityJson(EMPTY_CITY)
    expect(json).toBe('{"pieces":[],"buildings":[]}')
  })

  it('omits footprint when it resolves to the single-cell default', () => {
    const json = canonicalCityJson({
      pieces: [straight(0, 0)],
      buildings: [],
    })
    expect(json).not.toContain('footprint')
  })

  it('emits a normalized footprint when it differs from the default', () => {
    const json = canonicalCityJson({
      pieces: [
        {
          type: 'megaSweepRight',
          row: 0,
          col: 0,
          rotation: 0,
          footprint: [
            { dr: 1, dc: 0 },
            { dr: 0, dc: 1 },
            { dr: 0, dc: 0 },
          ],
        },
      ],
      buildings: [],
    })
    // sorted by (dr, dc)
    expect(json).toContain(
      '"footprint":[{"dr":0,"dc":0},{"dr":0,"dc":1},{"dr":1,"dc":0}]',
    )
  })
})
