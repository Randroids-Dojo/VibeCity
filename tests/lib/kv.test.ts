import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  hasKvConfigured,
  kvKeys,
  getKv,
  type CityVersionHash,
} from '@/lib/kv'
import type { Slug } from '@/lib/schemas'

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

describe('hasKvConfigured', () => {
  let snap: Record<string, string | undefined>

  beforeEach(() => {
    snap = snapshotEnv()
  })
  afterEach(() => {
    restoreEnv(snap)
  })

  it('returns false when neither env var is set', () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    expect(hasKvConfigured()).toBe(false)
  })

  it('returns false when only the URL is set', () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io'
    delete process.env.KV_REST_API_TOKEN
    expect(hasKvConfigured()).toBe(false)
  })

  it('returns false when only the token is set', () => {
    delete process.env.KV_REST_API_URL
    process.env.KV_REST_API_TOKEN = 'tok'
    expect(hasKvConfigured()).toBe(false)
  })

  it('returns true when both are set', () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io'
    process.env.KV_REST_API_TOKEN = 'tok'
    expect(hasKvConfigured()).toBe(true)
  })

  it('returns false when either var is set to an empty string', () => {
    process.env.KV_REST_API_URL = ''
    process.env.KV_REST_API_TOKEN = 'tok'
    expect(hasKvConfigured()).toBe(false)
  })
})

describe('kvKeys', () => {
  const slug = 'my-city' as Slug
  const hash = 'abc123' as CityVersionHash

  it('cityLatest is namespaced under city: and includes the slug', () => {
    expect(kvKeys.cityLatest(slug)).toBe('city:my-city:latest')
  })

  it('cityVersion includes both the slug and the hash', () => {
    expect(kvKeys.cityVersion(slug, hash)).toBe('city:my-city:version:abc123')
  })

  it('cityVersions is the per-slug history sorted set', () => {
    expect(kvKeys.cityVersions(slug)).toBe('city:my-city:versions')
  })

  it('cityIndex is a flat global key', () => {
    expect(kvKeys.cityIndex()).toBe('city:index')
  })

  it('every key starts with the city: prefix', () => {
    const keys = [
      kvKeys.cityLatest(slug),
      kvKeys.cityVersion(slug, hash),
      kvKeys.cityVersions(slug),
      kvKeys.cityIndex(),
    ]
    for (const k of keys) expect(k.startsWith('city:')).toBe(true)
  })
})

describe('getKv', () => {
  let snap: Record<string, string | undefined>

  beforeEach(() => {
    snap = snapshotEnv()
  })
  afterEach(() => {
    restoreEnv(snap)
  })

  it('throws when env is unset', () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    expect(() => getKv()).toThrow(/Missing required environment variable/)
  })
})
