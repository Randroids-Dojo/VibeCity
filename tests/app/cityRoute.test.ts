import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from '../_fakeKv'
import { hashCity } from '@/lib/hashCity'
import { kvKeys } from '@/lib/cityKv'
import { EMPTY_CITY, type City, type Slug } from '@/lib/schemas'
import { BUILDER_ID_COOKIE } from '@/lib/builderId'
import { MAX_CITY_VERSIONS } from '@/lib/recentVersions'

const fake = new FakeKv()
const builderIdA = '11111111-1111-4111-8111-111111111111'
const builderIdB = '22222222-2222-4222-8222-222222222222'

beforeAll(() => {
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

vi.mock('@/lib/cityKv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cityKv')>('@/lib/cityKv')
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

  it('saves a valid city and returns the canonical hash', async () => {
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
    expect(await fake.zscore(kvKeys.cityIndex(), slug)).toBe(body.updatedAt)
  })

  it('lets any builder overwrite an existing city (open-edit)', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const slug = 'owned-by-a' as Slug
    // Builder A writes first.
    await PUT(
      new NextRequest('http://test/api/city/owned-by-a', {
        method: 'PUT',
        headers: { cookie: cookieHeader(builderIdA), 'content-type': 'application/json' },
        body: JSON.stringify(EMPTY_CITY),
      }),
      { params: Promise.resolve({ slug: 'owned-by-a' }) },
    )
    expect(await fake.get<string>(kvKeys.cityLatest(slug))).toBe(
      hashCity(EMPTY_CITY),
    )

    // Builder B overwrites: open-edit means the second writer succeeds.
    const res = await PUT(
      new NextRequest('http://test/api/city/owned-by-a', {
        method: 'PUT',
        headers: { cookie: cookieHeader(builderIdB), 'content-type': 'application/json' },
        body: JSON.stringify(sampleCity),
      }),
      { params: Promise.resolve({ slug: 'owned-by-a' }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { versionHash: string }
    expect(body.versionHash).toBe(hashCity(sampleCity))
    expect(await fake.get<string>(kvKeys.cityLatest(slug))).toBe(
      hashCity(sampleCity),
    )
  })

  it('appends to city:${slug}:versions on every save (REQ-052)', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const slug = 'history-write' as Slug
    await fake.del(kvKeys.cityVersions(slug))
    await fake.del(kvKeys.cityLatest(slug))

    // First save: empty city.
    await PUT(
      new NextRequest('http://test/api/city/history-write', {
        method: 'PUT',
        headers: {
          cookie: cookieHeader(builderIdA),
          'content-type': 'application/json',
        },
        body: JSON.stringify(EMPTY_CITY),
      }),
      { params: Promise.resolve({ slug: 'history-write' }) },
    )
    // Second save: a different city under the same slug.
    await PUT(
      new NextRequest('http://test/api/city/history-write', {
        method: 'PUT',
        headers: {
          cookie: cookieHeader(builderIdA),
          'content-type': 'application/json',
        },
        body: JSON.stringify(sampleCity),
      }),
      { params: Promise.resolve({ slug: 'history-write' }) },
    )
    expect(await fake.zcard(kvKeys.cityVersions(slug))).toBe(2)
    const newestFirst = await fake.zrange(
      kvKeys.cityVersions(slug),
      0,
      -1,
      { rev: true },
    )
    expect(newestFirst).toEqual([hashCity(sampleCity), hashCity(EMPTY_CITY)])
  })

  it('trims the per-slug version history to MAX_CITY_VERSIONS oldest-first (REQ-052)', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const slug = 'history-trim' as Slug
    await fake.del(kvKeys.cityVersions(slug))
    await fake.del(kvKeys.cityLatest(slug))

    // Synthesize MAX_CITY_VERSIONS oldest entries that are NOT real
    // PUT-written versions; the trim is rank-based so any pre-existing
    // members count toward the bound.
    for (let i = 0; i < MAX_CITY_VERSIONS; i++) {
      await fake.zadd(kvKeys.cityVersions(slug), {
        score: i + 1,
        member:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'.slice(
            0,
            56,
          ) + i.toString(16).padStart(8, '0'),
      })
    }
    expect(await fake.zcard(kvKeys.cityVersions(slug))).toBe(MAX_CITY_VERSIONS)

    // One real PUT pushes the cap over and triggers a trim of one entry.
    await PUT(
      new NextRequest('http://test/api/city/history-trim', {
        method: 'PUT',
        headers: {
          cookie: cookieHeader(builderIdA),
          'content-type': 'application/json',
        },
        body: JSON.stringify(sampleCity),
      }),
      { params: Promise.resolve({ slug: 'history-trim' }) },
    )

    expect(await fake.zcard(kvKeys.cityVersions(slug))).toBe(
      MAX_CITY_VERSIONS,
    )
    // The newest entry is the just-PUT hash; the oldest synthetic entry
    // (score = 1) was trimmed.
    const newestFirst = await fake.zrange(
      kvKeys.cityVersions(slug),
      0,
      -1,
      { rev: true },
    )
    expect(newestFirst[0]).toBe(hashCity(sampleCity))
    // The score-1 entry is gone, but score-2 survived.
    const trimmedScore = await fake.zscore(
      kvKeys.cityVersions(slug),
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00000000',
    )
    expect(trimmedScore).toBeNull()
    const survivedScore = await fake.zscore(
      kvKeys.cityVersions(slug),
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00000001',
    )
    expect(survivedScore).toBe(2)
  })

  it('does not delete the version payload when trimming the history (deep-link survival, REQ-052)', async () => {
    const { PUT } = await import('@/app/api/city/[slug]/route')
    const slug = 'history-payload' as Slug
    await fake.del(kvKeys.cityVersions(slug))
    await fake.del(kvKeys.cityLatest(slug))

    // Pre-seed the oldest entry's payload alongside its history member;
    // confirm the payload survives the trim. The trim policy intentionally
    // leaves `city:${slug}:version:${hash}` in place so a stale ?v=
    // deep link still loads (per the GDD persistence read path).
    const oldestMember =
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00000000'
    await fake.set(
      kvKeys.cityVersion(slug, oldestMember as never),
      JSON.stringify(EMPTY_CITY),
    )
    for (let i = 0; i < MAX_CITY_VERSIONS; i++) {
      await fake.zadd(kvKeys.cityVersions(slug), {
        score: i + 1,
        member:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'.slice(
            0,
            56,
          ) + i.toString(16).padStart(8, '0'),
      })
    }

    await PUT(
      new NextRequest('http://test/api/city/history-payload', {
        method: 'PUT',
        headers: {
          cookie: cookieHeader(builderIdA),
          'content-type': 'application/json',
        },
        body: JSON.stringify(sampleCity),
      }),
      { params: Promise.resolve({ slug: 'history-payload' }) },
    )

    // Payload still readable even though the history member was trimmed.
    expect(
      await fake.get<unknown>(kvKeys.cityVersion(slug, oldestMember as never)),
    ).toEqual(EMPTY_CITY)
  })

  it('lets the same builder overwrite their own city', async () => {
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

  it('rejects ?v= with uppercase hex', async () => {
    const { GET } = await import('@/app/api/city/[slug]/route')
    const req = new NextRequest(
      'http://test/api/city/get-empty?v=0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    )
    const res = await GET(req, { params: Promise.resolve({ slug: 'get-empty' }) })
    expect(res.status).toBe(400)
  })

  it('honors a pinned ?v= and returns that version even when latest moved on', async () => {
    const { PUT, GET } = await import('@/app/api/city/[slug]/route')
    // First save a small city; capture its hash.
    const cityA: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const hashA = hashCity(cityA)
    await clearSlug('pinned-get' as Slug)
    await PUT(
      new NextRequest('http://test/api/city/pinned-get', {
        method: 'PUT',
        headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
        body: JSON.stringify(cityA),
      }),
      { params: Promise.resolve({ slug: 'pinned-get' }) },
    )

    // Then save a different city under the same slug.
    await PUT(
      new NextRequest('http://test/api/city/pinned-get', {
        method: 'PUT',
        headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
        body: JSON.stringify(sampleCity),
      }),
      { params: Promise.resolve({ slug: 'pinned-get' }) },
    )

    // Latest now points at sampleCity; pin to hashA.
    const pinned = await GET(
      new NextRequest(`http://test/api/city/pinned-get?v=${hashA}`),
      { params: Promise.resolve({ slug: 'pinned-get' }) },
    )
    expect(pinned.status).toBe(200)
    const pinnedBody = (await pinned.json()) as {
      versionHash: string
      city: City
    }
    expect(pinnedBody.versionHash).toBe(hashA)
    expect(pinnedBody.city).toEqual(cityA)

    // Sanity: the unpinned read returns the latest (sampleCity).
    const latest = await GET(
      new NextRequest('http://test/api/city/pinned-get'),
      { params: Promise.resolve({ slug: 'pinned-get' }) },
    )
    const latestBody = (await latest.json()) as {
      versionHash: string
      city: City
    }
    expect(latestBody.versionHash).toBe(hashCity(sampleCity))
    expect(latestBody.city).toEqual(sampleCity)
  })

  it('returns the empty city when ?v= is well-formed but unknown', async () => {
    const { GET } = await import('@/app/api/city/[slug]/route')
    const unknownHash =
      'feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface'
    const res = await GET(
      new NextRequest(`http://test/api/city/get-empty?v=${unknownHash}`),
      { params: Promise.resolve({ slug: 'get-empty' }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      versionHash: string | null
      city: City
    }
    expect(body.city).toEqual(EMPTY_CITY)
    expect(body.versionHash).toBeNull()
  })
})
