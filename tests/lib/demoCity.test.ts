import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeKv } from './storage/_fakeKv'
import { DEMO_CITY, DEMO_SLUG } from '@/lib/demoCity'
import { CitySchema, SlugSchema, type Slug } from '@/lib/schemas'
import { SimStateSchema } from '@/lib/sim/state'
import {
  buildTrackPath,
  validateConnections,
} from '@/lib/trackPath'
import { kvKeys, type CityVersionHash } from '@/lib/cityKv'

const ENV_KEYS = ['KV_REST_API_URL', 'KV_REST_API_TOKEN'] as const

function snapshotEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const k of ENV_KEYS) out[k] = process.env[k]
  return out
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k]
    else process.env[k] = snap[k]
  }
}

describe('DEMO_SLUG', () => {
  it('passes SlugSchema', () => {
    expect(SlugSchema.safeParse(DEMO_SLUG).success).toBe(true)
  })

  it('is the literal string "demo"', () => {
    expect(DEMO_SLUG).toBe('demo')
  })
})

describe('DEMO_CITY schema validation', () => {
  it('parses through CitySchema (pieces + buildings + mood + sim)', () => {
    expect(CitySchema.safeParse(DEMO_CITY).success).toBe(true)
  })

  it('embedded sim state parses through SimStateSchema', () => {
    expect(SimStateSchema.safeParse(DEMO_CITY.sim).success).toBe(true)
  })

  it('mood is auto so the day-night cycle resolver phase-shifts both palettes', () => {
    expect(DEMO_CITY.mood?.timeOfDay).toBe('auto')
  })
})

describe('DEMO_CITY track substrate', () => {
  it('builds one closed segment with the full piece order', () => {
    const path = buildTrackPath(DEMO_CITY)
    expect(path.segments).toHaveLength(1)
    expect(path.segments[0].order).toHaveLength(DEMO_CITY.pieces.length)
  })

  it('has zero unmatched connector ports (closed loop, no dead ends)', () => {
    const unmatched = validateConnections(DEMO_CITY)
    expect(unmatched).toEqual([])
  })
})

describe('DEMO_CITY composition', () => {
  it('ships at least one of every building type so the kitchen sink reads', () => {
    const types = new Set(DEMO_CITY.buildings.map((b) => b.type))
    expect(types.has('small-house')).toBe(true)
    expect(types.has('mid-house')).toBe(true)
    expect(types.has('shop')).toBe(true)
    expect(types.has('factory')).toBe(true)
  })

  it('ships at least one of every service kind for coverage overlay diversity', () => {
    const services = DEMO_CITY.sim as
      | { services?: { buildings?: Array<{ kind: string }> } }
      | undefined
    const kinds = new Set(
      services?.services?.buildings?.map((b) => b.kind) ?? [],
    )
    expect(kinds.has('police-station')).toBe(true)
    expect(kinds.has('fire-station')).toBe(true)
    expect(kinds.has('hospital')).toBe(true)
    expect(kinds.has('school')).toBe(true)
    expect(kinds.has('garbage-depot')).toBe(true)
  })

  it('ships both power plant kinds so the power overlay vocabulary is exercised', () => {
    const sim = DEMO_CITY.sim as { power: { plants: Array<{ kind: string }> } }
    const kinds = new Set(sim.power.plants.map((p) => p.kind))
    expect(kinds.has('coal')).toBe(true)
    expect(kinds.has('solar')).toBe(true)
  })

  it('ships at least one water source and one sewage treatment plant', () => {
    const sim = DEMO_CITY.sim as {
      water: {
        sources: Array<{ kind: string }>
        treatmentPlants: Array<unknown>
      }
    }
    expect(sim.water.sources.length).toBeGreaterThanOrEqual(1)
    expect(sim.water.treatmentPlants.length).toBeGreaterThanOrEqual(1)
  })

  it('seeds population so the milestone toast fires on first paint', () => {
    const sim = DEMO_CITY.sim as {
      population: {
        totalPopulation: number
        highestMilestoneReached: number
      }
    }
    expect(sim.population.totalPopulation).toBeGreaterThanOrEqual(40)
    expect(sim.population.highestMilestoneReached).toBeGreaterThanOrEqual(40)
  })
})

// Re-bound per test in beforeEach so each case gets a fresh KV. The
// vi.mock factory closes over the `fake` binding so reassigning it
// before each test makes the new instance visible to loadCity.
let fake = new FakeKv()

vi.mock('@/lib/cityKv', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/cityKv')>('@/lib/cityKv')
  return { ...actual, getKv: () => fake }
})

describe('loadCity demo bypass', () => {
  let snap: Record<string, string | undefined>

  beforeEach(() => {
    snap = snapshotEnv()
    process.env.KV_REST_API_URL = 'http://fake'
    process.env.KV_REST_API_TOKEN = 'fake'
    fake = new FakeKv()
  })

  afterEach(() => {
    restoreEnv(snap)
  })

  it('returns DEMO_CITY for /demo when no save exists in KV', async () => {
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity(DEMO_SLUG)
    expect(result.city).toEqual(DEMO_CITY)
    expect(result.versionHash).toBeNull()
    // The returned payload must be a distinct object so a caller that
    // mutates it cannot corrupt the shared module singleton.
    expect(result.city).not.toBe(DEMO_CITY)
  })

  it('returns DEMO_CITY for /demo when KV is not configured', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity(DEMO_SLUG)
    expect(result.city).toEqual(DEMO_CITY)
    expect(result.versionHash).toBeNull()
    expect(result.city).not.toBe(DEMO_CITY)
  })

  it('clones DEMO_CITY deeply so mutating the returned payload leaves the bundle intact', async () => {
    const { loadCity } = await import('@/lib/loadCity')
    const originalPieceCount = DEMO_CITY.pieces.length
    const result = await loadCity(DEMO_SLUG)
    // Mutate the result and verify the module singleton stays clean.
    result.city.pieces.pop()
    expect(DEMO_CITY.pieces).toHaveLength(originalPieceCount)
  })

  it('returns the KV-saved fork when /demo has a :latest version stored', async () => {
    // Simulate a player saving over the demo slug. The KV branch should
    // win so the fork surfaces instead of the bundled payload.
    const forkedCity = { pieces: [], buildings: [] }
    const forkedHash =
      'aabbccddeeff0011aabbccddeeff0011aabbccddeeff0011aabbccddeeff0011' as CityVersionHash
    await fake.set(kvKeys.cityLatest(DEMO_SLUG), forkedHash)
    await fake.set(
      kvKeys.cityVersion(DEMO_SLUG, forkedHash),
      JSON.stringify(forkedCity),
    )
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity(DEMO_SLUG)
    expect(result.city).toEqual(forkedCity)
    expect(result.versionHash).toBe(forkedHash)
  })

  it('pinned version on /demo deep-links to the requested version (bypasses the demo bundle)', async () => {
    const pinnedCity = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 } as const],
      buildings: [],
    }
    const pinnedHash =
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as CityVersionHash
    await fake.set(
      kvKeys.cityVersion(DEMO_SLUG, pinnedHash),
      JSON.stringify(pinnedCity),
    )
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity(DEMO_SLUG, pinnedHash)
    expect(result.city).toEqual(pinnedCity)
    expect(result.versionHash).toBe(pinnedHash)
  })

  it('non-demo slug paths still use the KV-then-empty branch unchanged', async () => {
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity('some-other-city' as Slug)
    // Empty KV plus a non-demo slug yields EMPTY_CITY.
    expect(result.city.pieces).toEqual([])
    expect(result.city.buildings).toEqual([])
    expect(result.versionHash).toBeNull()
  })
})
