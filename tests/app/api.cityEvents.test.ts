import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from '../_fakeKv'
import { kvKeys } from '@/lib/kv'
import { BUILDER_ID_COOKIE } from '@/lib/builderId'
import type { Slug } from '@/lib/schemas'
import type { SimEvent } from '@/lib/sim/events'

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

function tickEvent(deltaMs: number, t = 0, builderId = builderIdA): SimEvent {
  return {
    type: 'tick',
    payload: { deltaMs },
    clientCreatedAt: t,
    authorBuilderId: builderId,
  }
}

function setSpeedEvent(
  speed: 0 | 1 | 2 | 4,
  t = 0,
  builderId = builderIdA,
): SimEvent {
  return {
    type: 'setSpeed',
    payload: { speed },
    clientCreatedAt: t,
    authorBuilderId: builderId,
  }
}

async function clearSlug(slug: Slug) {
  await fake.del(
    kvKeys.cityEvents(slug),
    kvKeys.citySnapshot(slug),
    kvKeys.cityEventsSnapshotCursor(slug),
  )
}

describe('POST /api/city/[slug]/events', () => {
  beforeEach(async () => {
    await clearSlug('post-spec' as Slug)
  })

  it('rejects an invalid slug', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/Bad_Slug/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ events: [tickEvent(250)] }),
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'Bad_Slug' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid slug')
  })

  it('rejects when the builder id cookie is missing', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [tickEvent(250)] }),
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects when the builder id cookie is malformed', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: {
        cookie: `${BUILDER_ID_COOKIE}=not-a-uuid`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ events: [tickEvent(250)] }),
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects an empty events array', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects an oversize batch (>256 events)', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const events: SimEvent[] = []
    for (let i = 0; i < 257; i++) events.push(tickEvent(250, i))
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ events }),
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects malformed JSON', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: '{not json',
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects an event with a bad type', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        events: [
          { type: 'badType', payload: {}, clientCreatedAt: 0, authorBuilderId: builderIdA },
        ],
      }),
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    expect(res.status).toBe(400)
  })

  it('appends a single event and returns nextCursor=1', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ events: [tickEvent(250)] }),
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      slug: string
      appended: number
      nextCursor: number
    }
    expect(body.slug).toBe('post-spec')
    expect(body.appended).toBe(1)
    expect(body.nextCursor).toBe(1)
  })

  it('appends a batch of events in order and returns the new length', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        events: [tickEvent(250, 0), tickEvent(250, 1), setSpeedEvent(2, 2)],
      }),
    })
    const res = await POST(req, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { appended: number; nextCursor: number }
    expect(body.appended).toBe(3)
    expect(body.nextCursor).toBe(3)
  })

  it('stamps clientReceivedAt server-side (overrides any client-supplied value)', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')
    const before = Date.now()
    const event = {
      ...tickEvent(250),
      clientReceivedAt: 1, // bogus client-supplied value
    }
    const req = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
    })
    await POST(req, { params: Promise.resolve({ slug: 'post-spec' }) })
    const after = Date.now()

    const raws = await fake.lrange(kvKeys.cityEvents('post-spec' as Slug), 0, -1)
    expect(raws).toHaveLength(1)
    const stored = JSON.parse(raws[0]) as { clientReceivedAt: number }
    expect(stored.clientReceivedAt).toBeGreaterThanOrEqual(before)
    expect(stored.clientReceivedAt).toBeLessThanOrEqual(after)
    expect(stored.clientReceivedAt).not.toBe(1)
  })

  it('two consecutive POSTs from different builders both append in order', async () => {
    const { POST } = await import('@/app/api/city/[slug]/events/route')

    const req1 = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: {
        cookie: cookieHeader(builderIdA),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ events: [tickEvent(250, 0, builderIdA)] }),
    })
    const res1 = await POST(req1, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    const body1 = (await res1.json()) as { nextCursor: number }
    expect(body1.nextCursor).toBe(1)

    const req2 = new NextRequest('http://test/api/city/post-spec/events', {
      method: 'POST',
      headers: {
        cookie: cookieHeader(builderIdB),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ events: [setSpeedEvent(2, 1, builderIdB)] }),
    })
    const res2 = await POST(req2, {
      params: Promise.resolve({ slug: 'post-spec' }),
    })
    const body2 = (await res2.json()) as { nextCursor: number }
    expect(body2.nextCursor).toBe(2)

    const raws = await fake.lrange(kvKeys.cityEvents('post-spec' as Slug), 0, -1)
    expect(raws).toHaveLength(2)
    const e1 = JSON.parse(raws[0]) as { type: string; authorBuilderId: string }
    const e2 = JSON.parse(raws[1]) as { type: string; authorBuilderId: string }
    expect(e1.type).toBe('tick')
    expect(e1.authorBuilderId).toBe(builderIdA)
    expect(e2.type).toBe('setSpeed')
    expect(e2.authorBuilderId).toBe(builderIdB)
  })
})

describe('GET /api/city/[slug]/events', () => {
  beforeEach(async () => {
    await clearSlug('get-spec' as Slug)
  })

  it('rejects an invalid slug', async () => {
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/Bad_Slug/events')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'Bad_Slug' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a non-numeric cursor', async () => {
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest(
      'http://test/api/city/get-spec/events?cursor=abc',
    )
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'get-spec' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a negative cursor', async () => {
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest(
      'http://test/api/city/get-spec/events?cursor=-1',
    )
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'get-spec' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns an empty events array on a fresh slug', async () => {
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/get-spec/events')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'get-spec' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      events: SimEvent[]
      nextCursor: number
      totalLen?: number
      snapshot: unknown
      snapshotCursor: number
    }
    expect(body.events).toEqual([])
    expect(body.nextCursor).toBe(0)
    expect(body.snapshot).toBeNull()
    expect(body.snapshotCursor).toBe(0)
  })

  it('returns all events when no cursor is given', async () => {
    await fake.rpush(
      kvKeys.cityEvents('get-spec' as Slug),
      JSON.stringify(tickEvent(250, 0)),
      JSON.stringify(tickEvent(250, 1)),
      JSON.stringify(setSpeedEvent(2, 2)),
    )
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/get-spec/events')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'get-spec' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      events: SimEvent[]
      nextCursor: number
      totalLen?: number
    }
    expect(body.events).toHaveLength(3)
    expect(body.nextCursor).toBe(3)
    expect(body.totalLen).toBe(3)
    expect(body.events[0].type).toBe('tick')
    expect(body.events[2].type).toBe('setSpeed')
  })

  it('returns events from the given cursor onward (tail read)', async () => {
    await fake.rpush(
      kvKeys.cityEvents('get-spec' as Slug),
      JSON.stringify(tickEvent(250, 0)),
      JSON.stringify(tickEvent(250, 1)),
      JSON.stringify(setSpeedEvent(2, 2)),
    )
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/get-spec/events?cursor=2')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'get-spec' }),
    })
    const body = (await res.json()) as {
      events: SimEvent[]
      nextCursor: number
    }
    expect(body.events).toHaveLength(1)
    expect(body.events[0].type).toBe('setSpeed')
    expect(body.nextCursor).toBe(3)
  })

  it('returns empty events when cursor is at or past the end', async () => {
    await fake.rpush(
      kvKeys.cityEvents('get-spec' as Slug),
      JSON.stringify(tickEvent(250, 0)),
    )
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/get-spec/events?cursor=5')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'get-spec' }),
    })
    const body = (await res.json()) as {
      events: SimEvent[]
      nextCursor: number
    }
    expect(body.events).toEqual([])
    expect(body.nextCursor).toBe(5)
  })

  it('drops malformed events silently (does not 500)', async () => {
    await fake.rpush(
      kvKeys.cityEvents('get-spec' as Slug),
      JSON.stringify(tickEvent(250, 0)),
      'this-is-not-json',
      JSON.stringify({ type: 'unknownType' }),
      JSON.stringify(setSpeedEvent(2, 1)),
    )
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/get-spec/events')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'get-spec' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { events: SimEvent[] }
    expect(body.events).toHaveLength(2)
    expect(body.events[0].type).toBe('tick')
    expect(body.events[1].type).toBe('setSpeed')
  })

  it('returns the snapshot when one exists', async () => {
    await fake.set(
      kvKeys.citySnapshot('get-spec' as Slug),
      JSON.stringify({ tick: 100, simTimeMs: 25000 }),
    )
    await fake.set(
      kvKeys.cityEventsSnapshotCursor('get-spec' as Slug),
      String(50),
    )
    const { GET } = await import('@/app/api/city/[slug]/events/route')
    const req = new NextRequest('http://test/api/city/get-spec/events')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'get-spec' }),
    })
    const body = (await res.json()) as {
      snapshot: { tick: number; simTimeMs: number } | null
      snapshotCursor: number
    }
    expect(body.snapshot).toEqual({ tick: 100, simTimeMs: 25000 })
    expect(body.snapshotCursor).toBe(50)
  })

  it('returns sane defaults when KV is unconfigured', async () => {
    const url = process.env.KV_REST_API_URL
    const tok = process.env.KV_REST_API_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    try {
      const { GET } = await import('@/app/api/city/[slug]/events/route')
      const req = new NextRequest('http://test/api/city/get-spec/events')
      const res = await GET(req, {
        params: Promise.resolve({ slug: 'get-spec' }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        events: SimEvent[]
        snapshot: unknown
        nextCursor: number
      }
      expect(body.events).toEqual([])
      expect(body.snapshot).toBeNull()
      expect(body.nextCursor).toBe(0)
    } finally {
      process.env.KV_REST_API_URL = url
      process.env.KV_REST_API_TOKEN = tok
    }
  })
})

describe('round trip POST -> GET', () => {
  beforeEach(async () => {
    await clearSlug('round-trip' as Slug)
  })

  it('appended events read back via GET in order', async () => {
    const { POST, GET } = await import('@/app/api/city/[slug]/events/route')

    const postReq = new NextRequest('http://test/api/city/round-trip/events', {
      method: 'POST',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        events: [tickEvent(250, 0), tickEvent(250, 1), setSpeedEvent(2, 2)],
      }),
    })
    await POST(postReq, { params: Promise.resolve({ slug: 'round-trip' }) })

    const getReq = new NextRequest('http://test/api/city/round-trip/events')
    const getRes = await GET(getReq, {
      params: Promise.resolve({ slug: 'round-trip' }),
    })
    const body = (await getRes.json()) as { events: SimEvent[] }
    expect(body.events).toHaveLength(3)
    expect(body.events[0].type).toBe('tick')
    expect(body.events[1].type).toBe('tick')
    expect(body.events[2].type).toBe('setSpeed')
  })

  it('cursor advancement chains correctly across two POST/GET cycles', async () => {
    const { POST, GET } = await import('@/app/api/city/[slug]/events/route')

    // First POST: 2 events
    await POST(
      new NextRequest('http://test/api/city/round-trip/events', {
        method: 'POST',
        headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [tickEvent(250, 0), tickEvent(250, 1)],
        }),
      }),
      { params: Promise.resolve({ slug: 'round-trip' }) },
    )

    // First GET: cursor=0, expect 2 events
    const get1 = await GET(
      new NextRequest('http://test/api/city/round-trip/events?cursor=0'),
      { params: Promise.resolve({ slug: 'round-trip' }) },
    )
    const body1 = (await get1.json()) as { nextCursor: number }
    expect(body1.nextCursor).toBe(2)

    // Second POST: 1 more event
    await POST(
      new NextRequest('http://test/api/city/round-trip/events', {
        method: 'POST',
        headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [setSpeedEvent(2, 2)],
        }),
      }),
      { params: Promise.resolve({ slug: 'round-trip' }) },
    )

    // Second GET: cursor=2, expect 1 event
    const get2 = await GET(
      new NextRequest('http://test/api/city/round-trip/events?cursor=2'),
      { params: Promise.resolve({ slug: 'round-trip' }) },
    )
    const body2 = (await get2.json()) as {
      events: SimEvent[]
      nextCursor: number
    }
    expect(body2.events).toHaveLength(1)
    expect(body2.events[0].type).toBe('setSpeed')
    expect(body2.nextCursor).toBe(3)
  })
})

describe('kvKeys event log entries', () => {
  it('cityEvents key uses the slug namespace', () => {
    expect(kvKeys.cityEvents('foo' as Slug)).toBe('city:foo:events')
  })

  it('citySnapshot key uses the slug namespace', () => {
    expect(kvKeys.citySnapshot('foo' as Slug)).toBe('city:foo:snapshot')
  })

  it('cityEventsSnapshotCursor key uses the slug namespace', () => {
    expect(kvKeys.cityEventsSnapshotCursor('foo' as Slug)).toBe(
      'city:foo:snapshot:cursor',
    )
  })

  it('every event key starts with city:', () => {
    const slug = 'foo' as Slug
    expect(kvKeys.cityEvents(slug).startsWith('city:')).toBe(true)
    expect(kvKeys.citySnapshot(slug).startsWith('city:')).toBe(true)
    expect(kvKeys.cityEventsSnapshotCursor(slug).startsWith('city:')).toBe(true)
  })
})
