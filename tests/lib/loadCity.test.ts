import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeKv } from '../_fakeKv'
import { EMPTY_CITY, type City, type Slug } from '@/lib/schemas'
import { kvKeys, type CityVersionHash } from '@/lib/cityKv'
import { hashCity } from '@/lib/hashCity'

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

const fake = new FakeKv()

vi.mock('@/lib/cityKv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cityKv')>('@/lib/cityKv')
  return { ...actual, getKv: () => fake }
})

describe('loadCity', () => {
  let snap: Record<string, string | undefined>

  beforeEach(async () => {
    snap = snapshotEnv()
    process.env.KV_REST_API_URL = 'http://fake'
    process.env.KV_REST_API_TOKEN = 'fake'
    // Reset the fake store between tests.
    await fake.del(
      kvKeys.cityLatest('s' as Slug),
      kvKeys.cityIndex(),
    )
  })

  afterEach(() => {
    restoreEnv(snap)
  })

  it('returns EMPTY_CITY when KV is not configured', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity('any-slug' as Slug)
    expect(result.city).toEqual(EMPTY_CITY)
    expect(result.versionHash).toBeNull()
  })

  it('returns EMPTY_CITY when no latest pointer exists', async () => {
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity('fresh-slug' as Slug)
    expect(result.city).toEqual(EMPTY_CITY)
    expect(result.versionHash).toBeNull()
  })

  it('returns the saved city when latest -> version is present', async () => {
    const slug = 'saved-slug' as Slug
    const city: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const hash = hashCity(city)
    await fake.set(kvKeys.cityLatest(slug), hash)
    await fake.set(kvKeys.cityVersion(slug, hash), JSON.stringify(city))

    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity(slug)
    expect(result.city).toEqual(city)
    expect(result.versionHash).toBe(hash)
  })

  it('returns EMPTY_CITY when latest points at a missing version', async () => {
    const slug = 'dangling-slug' as Slug
    await fake.set(
      kvKeys.cityLatest(slug),
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    )
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity(slug)
    expect(result.city).toEqual(EMPTY_CITY)
    expect(result.versionHash).toBeNull()
  })

  it('returns EMPTY_CITY and warns when stored payload fails CitySchema', async () => {
    const slug = 'corrupt-slug' as Slug
    const hash =
      'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe' as CityVersionHash
    await fake.set(kvKeys.cityLatest(slug), hash)
    await fake.set(
      kvKeys.cityVersion(slug, hash),
      JSON.stringify({ pieces: 'not-an-array', buildings: [] }),
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity(slug)
    expect(result.city).toEqual(EMPTY_CITY)
    expect(result.versionHash).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('honors a pinned version hash without consulting latest', async () => {
    const slug = 'pinned-slug' as Slug
    const cityA: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const cityB: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
      ],
      buildings: [],
    }
    const hashA = hashCity(cityA)
    const hashB = hashCity(cityB)
    await fake.set(kvKeys.cityLatest(slug), hashB)
    await fake.set(kvKeys.cityVersion(slug, hashA), JSON.stringify(cityA))
    await fake.set(kvKeys.cityVersion(slug, hashB), JSON.stringify(cityB))

    const { loadCity } = await import('@/lib/loadCity')
    const pinned = await loadCity(slug, hashA)
    expect(pinned.city).toEqual(cityA)
    expect(pinned.versionHash).toBe(hashA)

    const latest = await loadCity(slug)
    expect(latest.city).toEqual(cityB)
    expect(latest.versionHash).toBe(hashB)
  })

  it('returns EMPTY_CITY when a pinned version hash is unknown', async () => {
    const slug = 'unknown-pin' as Slug
    const { loadCity } = await import('@/lib/loadCity')
    const result = await loadCity(
      slug,
      'feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface' as CityVersionHash,
    )
    expect(result.city).toEqual(EMPTY_CITY)
    expect(result.versionHash).toBeNull()
  })
})
