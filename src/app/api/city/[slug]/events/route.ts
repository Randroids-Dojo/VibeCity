import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { SlugSchema, type Slug } from '@/lib/schemas'
import { getKv, hasKvConfigured, kvKeys } from '@/lib/cityKv'
import { BUILDER_ID_COOKIE, isValidBuilderId } from '@/lib/builderId'
import { SimEventSchema, type SimEvent } from '@/lib/sim/events'
import {
  buildSnapshot,
  parseEventStrings,
  shouldSnapshot,
} from '@/lib/sim/snapshot'
import { SimStateSchema, type SimState } from '@/lib/sim/state'

export const runtime = 'nodejs'

/**
 * POST /api/city/[slug]/events (REQ-072..074 substrate slice 2 of 4).
 *
 * Append a batch of sim events to the city's event log (Q-012 event
 * sourcing). Stamps `clientReceivedAt` on each event using
 * `Date.now()` server-side so client clock drift cannot bid for
 * ordering primacy. Open-edit per Q-008: any visitor with a valid
 * builder id cookie can append; the builder id stays for activity
 * attribution but is not a write gate.
 *
 * Storage: each event is RPUSHed to `city:${slug}:events` as a
 * JSON string. Insertion order is the canonical replay order; the
 * list length after the append is the new cursor for the client to
 * track (returned as `nextCursor` in the response). Concurrent
 * appends from two browsers are serialized by Redis at the network
 * layer; the resulting interleave is whatever order Redis processed
 * the RPUSH commands in.
 *
 * GET /api/city/[slug]/events?cursor=N (REQ-072..074 substrate slice 2 of 4).
 *
 * Return events from index `cursor` (default 0) to the end of the
 * log. Returns `{ events, nextCursor }` so the caller can store
 * `nextCursor` and pass it on the next poll. When `cursor` >= log
 * length, returns an empty `events` array and the unchanged cursor.
 *
 * GET also returns the latest snapshot (when present, REQ-073 slice 4
 * lands the snapshotting writer; this slice ships the read path so
 * cold-load can use it from day one) so a fresh client can derive
 * state from `snapshot` + `events`. When no snapshot exists, the
 * client derives from `EMPTY_SIM_STATE` + all events.
 */

/** Maximum events per POST batch. A bound prevents unbounded payload sizes. */
const MAX_EVENTS_PER_BATCH = 256

/** Maximum events returned per GET. A client polling more than this just polls again with the new cursor. */
const MAX_EVENTS_PER_GET = 2048

const PostBodySchema = z
  .object({
    events: z.array(SimEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
  })
  .strict()

function jsonError(status: number, error: string, extra?: object) {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug: slugRaw } = await ctx.params
  const slugParsed = SlugSchema.safeParse(slugRaw)
  if (!slugParsed.success) return jsonError(400, 'invalid slug')
  const slug: Slug = slugParsed.data

  if (!hasKvConfigured()) {
    return jsonError(503, 'storage unavailable', {
      reason: 'KV not configured',
    })
  }

  const builderId = req.cookies.get(BUILDER_ID_COOKIE)?.value
  if (!builderId || !isValidBuilderId(builderId)) {
    return jsonError(401, 'no builder')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid json')
  }

  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success) return jsonError(400, 'invalid events')

  const now = Date.now()
  const stamped: SimEvent[] = parsed.data.events.map((event) => ({
    ...event,
    clientReceivedAt: now,
  }))

  const kv = getKv()
  let nextCursor: number
  try {
    nextCursor = await kv.rpush(
      kvKeys.cityEvents(slug),
      ...stamped.map((event) => JSON.stringify(event)),
    )
  } catch (e) {
    console.error('Failed to append events', e)
    return jsonError(503, 'storage unavailable', {
      reason: 'temporary storage failure',
    })
  }

  // Snapshot trigger (REQ-070..074 substrate slice 4 of 5, Q-013).
  // Run inline after the append so cold-load reads are bounded by
  // SNAPSHOT_EVERY_N_EVENTS regardless of session length. A failure
  // here does NOT fail the POST: the events are already persisted,
  // and the next POST will re-evaluate the trigger and try again.
  // Snapshot writes are idempotent per cursor: writing the same
  // snapshot twice produces the same state.
  let snapshotCursor = 0
  try {
    const cursorStr = await kv.get<string>(
      kvKeys.cityEventsSnapshotCursor(slug),
    )
    if (cursorStr !== null && cursorStr !== undefined) {
      const parsed = Number.parseInt(String(cursorStr), 10)
      if (Number.isFinite(parsed) && parsed >= 0) snapshotCursor = parsed
    }

    if (shouldSnapshot(nextCursor, snapshotCursor)) {
      const tailRaws = await kv.lrange(
        kvKeys.cityEvents(slug),
        snapshotCursor,
        nextCursor - 1,
      )
      const tailEvents = parseEventStrings(tailRaws)
      const previousRaw = await kv.get<unknown>(kvKeys.citySnapshot(slug))
      let previousSnapshot: SimState | null = null
      if (previousRaw !== null && previousRaw !== undefined) {
        const parsed = SimStateSchema.safeParse(previousRaw)
        if (parsed.success) previousSnapshot = parsed.data
      }
      const newSnapshot = buildSnapshot(previousSnapshot, tailEvents)
      await kv.set(
        kvKeys.citySnapshot(slug),
        JSON.stringify(newSnapshot),
      )
      await kv.set(
        kvKeys.cityEventsSnapshotCursor(slug),
        String(nextCursor),
      )
    }
  } catch (e) {
    // Snapshot failures are non-fatal. The events are persisted; cold
    // load will replay from the previous (or zero) snapshot cursor
    // until the next POST retries.
    console.error('Snapshot write failed (non-fatal)', e)
  }

  return NextResponse.json({
    slug,
    appended: stamped.length,
    nextCursor,
  })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug: slugRaw } = await ctx.params
  const slugParsed = SlugSchema.safeParse(slugRaw)
  if (!slugParsed.success) return jsonError(400, 'invalid slug')
  const slug: Slug = slugParsed.data

  const url = new URL(req.url)
  const cursorRaw = url.searchParams.get('cursor')
  let cursor = 0
  if (cursorRaw !== null) {
    const parsed = Number.parseInt(cursorRaw, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return jsonError(400, 'invalid cursor')
    }
    cursor = parsed
  }

  // KV-unconfigured fallback: empty log, empty snapshot. Mirrors
  // loadCity's REQ-015 fallback so the playwright e2e webServer (which
  // runs without KV) returns sane payloads.
  if (!hasKvConfigured()) {
    return NextResponse.json({
      slug,
      cursor,
      events: [],
      nextCursor: cursor,
      snapshot: null,
      snapshotCursor: 0,
    })
  }

  const kv = getKv()
  const stop = cursor + MAX_EVENTS_PER_GET - 1

  let raws: string[] = []
  let totalLen = 0
  let snapshot: unknown = null
  let snapshotCursor = 0
  try {
    raws = await kv.lrange(kvKeys.cityEvents(slug), cursor, stop)
    totalLen = await kv.llen(kvKeys.cityEvents(slug))
    snapshot = await kv.get(kvKeys.citySnapshot(slug))
    const cursorStr = await kv.get<string>(
      kvKeys.cityEventsSnapshotCursor(slug),
    )
    if (cursorStr !== null && cursorStr !== undefined) {
      const parsed = Number.parseInt(String(cursorStr), 10)
      if (Number.isFinite(parsed) && parsed >= 0) snapshotCursor = parsed
    }
  } catch (e) {
    console.error('Failed to read events', e)
    return jsonError(503, 'storage unavailable', {
      reason: 'temporary storage failure',
    })
  }

  const events: SimEvent[] = []
  for (const raw of raws) {
    try {
      const obj = JSON.parse(raw) as unknown
      const validated = SimEventSchema.safeParse(obj)
      if (validated.success) events.push(validated.data)
      // Silently drop malformed entries: the client cannot fix them
      // and replaying a bad event would diverge state. A future debug
      // route can surface them when needed.
    } catch {
      // ignore parse errors per the same reasoning
    }
  }

  return NextResponse.json({
    slug,
    cursor,
    events,
    nextCursor: cursor + events.length,
    totalLen,
    snapshot,
    snapshotCursor,
  })
}
