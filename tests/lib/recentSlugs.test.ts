import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeKv } from '../_fakeKv'
import { kvKeys } from '@/lib/kv'

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

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return { ...actual, getKv: () => fake }
})

/**
 * REQ-011 + REQ-050: recentSlugs reads top-N newest slugs from the
 * `city:index` sorted set, the same set that PUT /api/city/[slug]
 * writes to on every save. The home page (REQ-050) renders the result
 * as a list of recently-updated cities.
 */
describe('recentSlugs (REQ-011, REQ-050)', () => {
  let snap: Record<string, string | undefined>

  beforeEach(async () => {
    snap = snapshotEnv()
    process.env.KV_REST_API_URL = 'http://fake'
    process.env.KV_REST_API_TOKEN = 'fake'
    await fake.del(kvKeys.cityIndex())
  })

  afterEach(() => {
    restoreEnv(snap)
  })

  it('returns an empty list when KV is not configured', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    const { recentSlugs } = await import('@/lib/recentSlugs')
    expect(await recentSlugs()).toEqual([])
  })

  it('returns an empty list when the city:index sorted set is empty', async () => {
    const { recentSlugs } = await import('@/lib/recentSlugs')
    expect(await recentSlugs()).toEqual([])
  })

  it('returns slugs in newest-first order using ZRANGE rev semantics', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 100, member: 'oldest' })
    await fake.zadd(kvKeys.cityIndex(), { score: 200, member: 'middle' })
    await fake.zadd(kvKeys.cityIndex(), { score: 300, member: 'newest' })
    const { recentSlugs } = await import('@/lib/recentSlugs')
    const result = await recentSlugs()
    expect(result).toEqual(['newest', 'middle', 'oldest'])
  })

  it('respects an explicit limit smaller than the index size', async () => {
    for (let i = 0; i < 5; i++) {
      await fake.zadd(kvKeys.cityIndex(), {
        score: i * 100,
        member: `slug-${i}`,
      })
    }
    const { recentSlugs } = await import('@/lib/recentSlugs')
    const result = await recentSlugs(2)
    expect(result).toEqual(['slug-4', 'slug-3'])
  })

  it('returns the entire index when limit exceeds the count', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 1, member: 'a' })
    await fake.zadd(kvKeys.cityIndex(), { score: 2, member: 'b' })
    const { recentSlugs } = await import('@/lib/recentSlugs')
    const result = await recentSlugs(50)
    expect(result).toEqual(['b', 'a'])
  })

  it('returns an empty list when limit is zero or negative', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 1, member: 'a' })
    const { recentSlugs } = await import('@/lib/recentSlugs')
    expect(await recentSlugs(0)).toEqual([])
    expect(await recentSlugs(-3)).toEqual([])
  })

  it('caps the requested limit at MAX_RECENT_SLUGS_LIMIT to bound KV reads', async () => {
    const { recentSlugs, MAX_RECENT_SLUGS_LIMIT } = await import(
      '@/lib/recentSlugs'
    )
    const zrangeSpy = vi.spyOn(fake, 'zrange')
    await recentSlugs(MAX_RECENT_SLUGS_LIMIT * 10)
    expect(zrangeSpy).toHaveBeenCalledTimes(1)
    const args = zrangeSpy.mock.calls[0]
    // Args: (key, start, stop, opts). The cap means stop must equal
    // MAX_RECENT_SLUGS_LIMIT - 1 even when the caller asks for more.
    expect(args[1]).toBe(0)
    expect(args[2]).toBe(MAX_RECENT_SLUGS_LIMIT - 1)
    zrangeSpy.mockRestore()
  })

  it('skips members that fail SlugSchema and logs a warning', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 1, member: 'good-slug' })
    await fake.zadd(kvKeys.cityIndex(), { score: 2, member: 'BAD SLUG' })
    await fake.zadd(kvKeys.cityIndex(), { score: 3, member: 'another-good' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { recentSlugs } = await import('@/lib/recentSlugs')
    const result = await recentSlugs()
    expect(result).toEqual(['another-good', 'good-slug'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('uses the cityIndex key (city:index) so writers and readers share the namespace', async () => {
    expect(kvKeys.cityIndex()).toBe('city:index')
  })
})

/**
 * REQ-011 + REQ-050: recentCities mirrors recentSlugs but pairs each
 * slug with the `Date.now()` score the writer set so the home page can
 * render a relative "Updated N ago" cue. Same defensive fallbacks as
 * recentSlugs (KV unconfigured, empty index, schema-skip, limit cap)
 * plus a new defensive band for non-finite stored scores.
 */
describe('recentCities (REQ-011, REQ-050)', () => {
  let snap: Record<string, string | undefined>

  beforeEach(async () => {
    snap = snapshotEnv()
    process.env.KV_REST_API_URL = 'http://fake'
    process.env.KV_REST_API_TOKEN = 'fake'
    await fake.del(kvKeys.cityIndex())
  })

  afterEach(() => {
    restoreEnv(snap)
  })

  it('returns an empty list when KV is not configured', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    const { recentCities } = await import('@/lib/recentSlugs')
    expect(await recentCities()).toEqual([])
  })

  it('returns an empty list when the city:index sorted set is empty', async () => {
    const { recentCities } = await import('@/lib/recentSlugs')
    expect(await recentCities()).toEqual([])
  })

  it('returns slugs paired with their stored timestamps newest-first', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 100, member: 'oldest' })
    await fake.zadd(kvKeys.cityIndex(), { score: 200, member: 'middle' })
    await fake.zadd(kvKeys.cityIndex(), { score: 300, member: 'newest' })
    const { recentCities } = await import('@/lib/recentSlugs')
    const result = await recentCities()
    expect(result).toEqual([
      { slug: 'newest', updatedAt: 300 },
      { slug: 'middle', updatedAt: 200 },
      { slug: 'oldest', updatedAt: 100 },
    ])
  })

  it('respects an explicit limit smaller than the index size', async () => {
    for (let i = 0; i < 5; i++) {
      await fake.zadd(kvKeys.cityIndex(), {
        score: i * 100,
        member: `slug-${i}`,
      })
    }
    const { recentCities } = await import('@/lib/recentSlugs')
    const result = await recentCities(2)
    expect(result.map((e) => e.slug)).toEqual(['slug-4', 'slug-3'])
    expect(result.map((e) => e.updatedAt)).toEqual([400, 300])
  })

  it('returns the full index when limit exceeds the count', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 1, member: 'a' })
    await fake.zadd(kvKeys.cityIndex(), { score: 2, member: 'b' })
    const { recentCities } = await import('@/lib/recentSlugs')
    const result = await recentCities(50)
    expect(result.map((e) => e.slug)).toEqual(['b', 'a'])
  })

  it('returns an empty list when limit is zero or negative', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 1, member: 'a' })
    const { recentCities } = await import('@/lib/recentSlugs')
    expect(await recentCities(0)).toEqual([])
    expect(await recentCities(-3)).toEqual([])
  })

  it('caps the requested limit at MAX_RECENT_SLUGS_LIMIT to bound KV reads', async () => {
    const { recentCities, MAX_RECENT_SLUGS_LIMIT } = await import(
      '@/lib/recentSlugs'
    )
    const zrangeSpy = vi.spyOn(fake, 'zrange')
    await recentCities(MAX_RECENT_SLUGS_LIMIT * 10)
    expect(zrangeSpy).toHaveBeenCalledTimes(1)
    const args = zrangeSpy.mock.calls[0]
    expect(args[1]).toBe(0)
    expect(args[2]).toBe(MAX_RECENT_SLUGS_LIMIT - 1)
    zrangeSpy.mockRestore()
  })

  it('reads the sorted set with withScores: true so the score interleave is available', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 42, member: 'check-opts' })
    const zrangeSpy = vi.spyOn(fake, 'zrange')
    const { recentCities } = await import('@/lib/recentSlugs')
    await recentCities()
    expect(zrangeSpy).toHaveBeenCalledTimes(1)
    const args = zrangeSpy.mock.calls[0]
    expect(args[3]).toEqual({ rev: true, withScores: true })
    zrangeSpy.mockRestore()
  })

  it('skips members that fail SlugSchema and logs a warning', async () => {
    await fake.zadd(kvKeys.cityIndex(), { score: 1, member: 'good-slug' })
    await fake.zadd(kvKeys.cityIndex(), { score: 2, member: 'BAD SLUG' })
    await fake.zadd(kvKeys.cityIndex(), { score: 3, member: 'another-good' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { recentCities } = await import('@/lib/recentSlugs')
    const result = await recentCities()
    expect(result.map((e) => e.slug)).toEqual(['another-good', 'good-slug'])
    expect(result.map((e) => e.updatedAt)).toEqual([3, 1])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('uses the cityIndex key so the recentCities reader and ZADD writer share the namespace', async () => {
    expect(kvKeys.cityIndex()).toBe('city:index')
  })
})
