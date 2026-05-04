import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeKv } from '../_fakeKv'
import { kvKeys, type CityVersionHash } from '@/lib/kv'
import { type Slug } from '@/lib/schemas'

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

const SLUG = 'history-slug' as Slug

/**
 * Build a deterministic 64-char lowercase hex hash from a small integer
 * so tests can enumerate distinct versions without computing real
 * sha256 digests. The padded string lands inside `VERSION_HASH_RE` so
 * `parseCityVersionHash` accepts it.
 */
function fakeHash(n: number): CityVersionHash {
  const stem = n.toString(16).padStart(8, '0')
  return (stem + 'a'.repeat(64 - stem.length)) as CityVersionHash
}

/**
 * REQ-052: per-slug version history reads from the
 * `city:${slug}:versions` sorted set. The PUT route writes to that set
 * on every save, then trims to `MAX_CITY_VERSIONS`. `recentVersions`
 * is the read helper a future "version picker" UI consumes.
 */
describe('recentVersions (REQ-052)', () => {
  let snap: Record<string, string | undefined>

  beforeEach(async () => {
    snap = snapshotEnv()
    process.env.KV_REST_API_URL = 'http://fake'
    process.env.KV_REST_API_TOKEN = 'fake'
    await fake.del(kvKeys.cityVersions(SLUG))
  })

  afterEach(() => {
    restoreEnv(snap)
  })

  it('returns an empty list when KV is not configured', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    const { recentVersions } = await import('@/lib/recentVersions')
    expect(await recentVersions(SLUG)).toEqual([])
  })

  it('returns an empty list when the versions sorted set is empty', async () => {
    const { recentVersions } = await import('@/lib/recentVersions')
    expect(await recentVersions(SLUG)).toEqual([])
  })

  it('returns versions newest-first with their stored timestamps', async () => {
    const a = fakeHash(1)
    const b = fakeHash(2)
    const c = fakeHash(3)
    await fake.zadd(kvKeys.cityVersions(SLUG), { score: 100, member: a })
    await fake.zadd(kvKeys.cityVersions(SLUG), { score: 200, member: b })
    await fake.zadd(kvKeys.cityVersions(SLUG), { score: 300, member: c })
    const { recentVersions } = await import('@/lib/recentVersions')
    const result = await recentVersions(SLUG)
    expect(result).toEqual([
      { hash: c, updatedAt: 300 },
      { hash: b, updatedAt: 200 },
      { hash: a, updatedAt: 100 },
    ])
  })

  it('respects an explicit limit smaller than the history size', async () => {
    for (let i = 0; i < 5; i++) {
      await fake.zadd(kvKeys.cityVersions(SLUG), {
        score: i * 100,
        member: fakeHash(i + 1),
      })
    }
    const { recentVersions } = await import('@/lib/recentVersions')
    const result = await recentVersions(SLUG, 2)
    expect(result.map((e) => e.hash)).toEqual([fakeHash(5), fakeHash(4)])
    expect(result.map((e) => e.updatedAt)).toEqual([400, 300])
  })

  it('returns the full history when limit exceeds the count', async () => {
    await fake.zadd(kvKeys.cityVersions(SLUG), {
      score: 1,
      member: fakeHash(1),
    })
    await fake.zadd(kvKeys.cityVersions(SLUG), {
      score: 2,
      member: fakeHash(2),
    })
    const { recentVersions } = await import('@/lib/recentVersions')
    const result = await recentVersions(SLUG, 50)
    expect(result.map((e) => e.hash)).toEqual([fakeHash(2), fakeHash(1)])
  })

  it('returns an empty list when limit is zero or negative', async () => {
    await fake.zadd(kvKeys.cityVersions(SLUG), {
      score: 1,
      member: fakeHash(1),
    })
    const { recentVersions } = await import('@/lib/recentVersions')
    expect(await recentVersions(SLUG, 0)).toEqual([])
    expect(await recentVersions(SLUG, -3)).toEqual([])
  })

  it('caps the requested limit at MAX_RECENT_VERSIONS_LIMIT to bound KV reads', async () => {
    const { recentVersions, MAX_RECENT_VERSIONS_LIMIT } = await import(
      '@/lib/recentVersions'
    )
    const zrangeSpy = vi.spyOn(fake, 'zrange')
    await recentVersions(SLUG, MAX_RECENT_VERSIONS_LIMIT * 10)
    expect(zrangeSpy).toHaveBeenCalledTimes(1)
    const args = zrangeSpy.mock.calls[0]
    expect(args[1]).toBe(0)
    expect(args[2]).toBe(MAX_RECENT_VERSIONS_LIMIT - 1)
    zrangeSpy.mockRestore()
  })

  it('skips members that fail parseCityVersionHash and logs a warning', async () => {
    const good = fakeHash(1)
    const goodLater = fakeHash(2)
    await fake.zadd(kvKeys.cityVersions(SLUG), { score: 1, member: good })
    await fake.zadd(kvKeys.cityVersions(SLUG), {
      score: 2,
      member: 'NOT-A-HASH',
    })
    await fake.zadd(kvKeys.cityVersions(SLUG), {
      score: 3,
      member: goodLater,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { recentVersions } = await import('@/lib/recentVersions')
    const result = await recentVersions(SLUG)
    expect(result.map((e) => e.hash)).toEqual([goodLater, good])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('uses the cityVersions key shape so writers and readers share the namespace', async () => {
    expect(kvKeys.cityVersions(SLUG)).toBe(`city:${SLUG}:versions`)
  })

  it('exports MAX_CITY_VERSIONS as a positive integer', async () => {
    const { MAX_CITY_VERSIONS } = await import('@/lib/recentVersions')
    expect(Number.isInteger(MAX_CITY_VERSIONS)).toBe(true)
    expect(MAX_CITY_VERSIONS).toBeGreaterThan(0)
  })

  it('exports MAX_RECENT_VERSIONS_LIMIT equal to MAX_CITY_VERSIONS so a reader cannot ask for more than the writer keeps', async () => {
    const { MAX_CITY_VERSIONS, MAX_RECENT_VERSIONS_LIMIT } = await import(
      '@/lib/recentVersions'
    )
    expect(MAX_RECENT_VERSIONS_LIMIT).toBe(MAX_CITY_VERSIONS)
  })

  it('DEFAULT_RECENT_VERSIONS_LIMIT is positive and at most MAX_RECENT_VERSIONS_LIMIT', async () => {
    const { DEFAULT_RECENT_VERSIONS_LIMIT, MAX_RECENT_VERSIONS_LIMIT } =
      await import('@/lib/recentVersions')
    expect(DEFAULT_RECENT_VERSIONS_LIMIT).toBeGreaterThan(0)
    expect(DEFAULT_RECENT_VERSIONS_LIMIT).toBeLessThanOrEqual(
      MAX_RECENT_VERSIONS_LIMIT,
    )
  })
})
