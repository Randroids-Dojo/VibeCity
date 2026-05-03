import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from '../_fakeKv'
import { hashCity } from '@/lib/hashCity'
import { kvKeys } from '@/lib/kv'
import { EMPTY_CITY, type City, type Slug } from '@/lib/schemas'
import { BUILDER_ID_COOKIE } from '@/lib/builderId'

const fake = new FakeKv()
const builderIdA = '11111111-1111-4111-8111-111111111111'
const builderIdB = '22222222-2222-4222-8222-222222222222'

beforeAll(() => {
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return { ...actual, getKv: () => fake }
})

function cookieHeader(builderId = builderIdA) {
  return `${BUILDER_ID_COOKIE}=${builderId}`
}

const sampleCity: City = {
  pieces: [
    { type: 'straight', row: 0, col: 0, rotation: 0 },
    { type: 'left90', row: 0, col: 1, rotation: 0 },
  ],
  buildings: [{ type: 'small-house', row: 1, col: 0, rotation: 0 }],
}

async function clearSlug(slug: Slug) {
  await fake.del(
    kvKeys.cityLatest(slug),
    kvKeys.cityVersions(slug),
    kvKeys.cityOwner(slug),
    kvKeys.cityIndex(),
  )
}

describe('PUT /api/city/[slug]', () => {
  beforeEach(async () => {
    await clearSlug('my-city' as Slug)
    await clearSlug('owned-by-a' as Slug)
    await clearSlug('idempotent' as Slug)
  })

  it('rejects an invalid slug', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest('http://test/api/city/Bad_Slug', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify(EMPTY_CITY),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'Bad_Slug' }) })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid slug')
  })

  it('rejects when the builder id cookie is missing', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest('http://test/api/city/my-city', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(EMPTY_CITY),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-city' }) })
    expect(res.status).toBe(401)
  })

  it('rejects when the builder id cookie is malformed', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest('http://test/api/city/my-city', {
      method: 'PUT',
      headers: {
        cookie: `${BUILDER_ID_COOKIE}=not-a-uuid`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(EMPTY_CITY),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-city' }) })
    expect(res.status).toBe(401)
  })

  it('rejects an invalid JSON body', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest('http://test/api/city/my-city', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: '{not-json',
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-city' }) })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid json')
  })

  it('rejects a body that fails CitySchema', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest('http://test/api/city/my-city', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: 'not-an-array', buildings: [] }),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-city' }) })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid city')
  })

  it('saves a valid city, claims ownership, and returns the canonical hash', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const slug = 'my-city' as Slug
    const req = new NextRequest('http://test/api/city/my-city', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify(sampleCity),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-city' }) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { versionHash: string; updatedAt: number }
    expect(body.versionHash).toBe(hashCity(sampleCity))
    expect(typeof body.updatedAt).toBe('number')

    expect(await fake.get<string>(kvKeys.cityLatest(slug))).toBe(body.versionHash)
    const stored = await fake.get<City>(
      kvKeys.cityVersion(slug, body.versionHash as never),
    )
    expect(stored).toEqual(sampleCity)
    expect(await fake.get<string>(kvKeys.cityOwner(slug))).toBe(builderIdA)
    expect(await fake.zscore(kvKeys.cityIndex(), slug)).toBe(body.updatedAt)
  })

  it('rejects a write from a different builder once a slug is owned', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const slug = 'owned-by-a' as Slug
    // First write claims ownership for builder A.
    await PUT(
      new NextRequest('http://test/api/city/owned-by-a', {
        method: 'PUT',
        headers: { cookie: cookieHeader(builderIdA), 'content-type': 'application/json' },
        body: JSON.stringify(EMPTY_CITY),
      }),
      { params: Promise.resolve({ slug: 'owned-by-a' }) },
    )
    expect(await fake.get<string>(kvKeys.cityOwner(slug))).toBe(builderIdA)

    // Builder B tries to overwrite.
    const res = await PUT(
      new NextRequest('http://test/api/city/owned-by-a', {
        method: 'PUT',
        headers: { cookie: cookieHeader(builderIdB), 'content-type': 'application/json' },
        body: JSON.stringify(sampleCity),
      }),
      { params: Promise.resolve({ slug: 'owned-by-a' }) },
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('not owner')
    // The owner is unchanged; the latest pointer is still empty city's hash.
    expect(await fake.get<string>(kvKeys.cityOwner(slug))).toBe(builderIdA)
    expect(await fake.get<string>(kvKeys.cityLatest(slug))).toBe(
      hashCity(EMPTY_CITY),
    )
  })

  it('lets the owner overwrite their own city', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const slug = 'idempotent' as Slug
    const first = await PUT(
      new NextRequest('http://test/api/city/idempotent', {
        method: 'PUT',
        headers: { cookie: cookieHeader(builderIdA), 'content-type': 'application/json' },
        body: JSON.stringify(EMPTY_CITY),
      }),
      { params: Promise.resolve({ slug: 'idempotent' }) },
    )
    expect(first.status).toBe(200)

    const second = await PUT(
      new NextRequest('http://test/api/city/idempotent', {
        method: 'PUT',
        headers: { cookie: cookieHeader(builderIdA), 'content-type': 'application/json' },
        body: JSON.stringify(sampleCity),
      }),
      { params: Promise.resolve({ slug: 'idempotent' }) },
    )
    expect(second.status).toBe(200)
    const body = (await second.json()) as { versionHash: string }
    expect(body.versionHash).toBe(hashCity(sampleCity))
    expect(await fake.get<string>(kvKeys.cityLatest(slug))).toBe(
      body.versionHash,
    )
    expect(await fake.get<string>(kvKeys.cityOwner(slug))).toBe(builderIdA)
  })
})

describe('GET /api/city/[slug]', () => {
  beforeEach(async () => {
    await clearSlug('get-empty' as Slug)
    await clearSlug('get-saved' as Slug)
  })

  it('rejects an invalid slug', async () => {
    const { GET } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest('http://test/api/city/Bad_Slug')
    const res = await GET(req, { params: Promise.resolve({ slug: 'Bad_Slug' }) })
    expect(res.status).toBe(400)
  })

  it('returns the empty city when no save exists', async () => {
    const { GET } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest('http://test/api/city/get-empty')
    const res = await GET(req, { params: Promise.resolve({ slug: 'get-empty' }) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      slug: string
      versionHash: string | null
      city: City
    }
    expect(body.city).toEqual(EMPTY_CITY)
    expect(body.versionHash).toBeNull()
    expect(body.slug).toBe('get-empty')
  })

  it('returns the saved city after a PUT', async () => {
    const { PUT, GET } = await import('@/app/api/city/[slug]/route')
    await PUT(
      new NextRequest('http://test/api/city/get-saved', {
        method: 'PUT',
        headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
        body: JSON.stringify(sampleCity),
      }),
      { params: Promise.resolve({ slug: 'get-saved' }) },
    )

    const res = await GET(
      new NextRequest('http://test/api/city/get-saved'),
      { params: Promise.resolve({ slug: 'get-saved' }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      versionHash: string
      city: City
    }
    expect(body.city).toEqual(sampleCity)
    expect(body.versionHash).toBe(hashCity(sampleCity))
  })

  it('rejects a malformed ?v= version hash', async () => {
    const { GET } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest('http://test/api/city/get-empty?v=not-a-hash')
    const res = await GET(req, { params: Promise.resolve({ slug: 'get-empty' }) })
    expect(res.status).toBe(400)
  })
})
