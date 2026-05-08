import { NextResponse, type NextRequest } from 'next/server'
import {
  CitySchema,
  SlugSchema,
  type Slug,
} from '@/lib/schemas'
import { hashCity } from '@/lib/hashCity'
import {
  getKv,
  hasKvConfigured,
  kvKeys,
  type CityVersionHash,
} from '@/lib/cityKv'
import { BUILDER_ID_COOKIE, isValidBuilderId } from '@/lib/builderId'
import { loadCity } from '@/lib/loadCity'
import { parseCityVersionHash } from '@/lib/cityVersion'
import { MAX_CITY_VERSIONS } from '@/lib/recentVersions'

export const runtime = 'nodejs'

function jsonError(status: number, error: string, extra?: object) {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status })
}

/**
 * GET /api/city/[slug] (REQ-015).
 *
 * Returns the latest saved city for a slug, or the empty city when no save
 * exists or KV is unconfigured. Supports `?v=<hash>` to pin to a historical
 * version (REQ-048, REQ-049). Hash format is sha256 hex (64 lowercase hex
 * chars) per REQ-013; malformed input rejects with 400.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug: slugRaw } = await ctx.params
  const slugParsed = SlugSchema.safeParse(slugRaw)
  if (!slugParsed.success) return jsonError(400, 'invalid slug')
  const slug: Slug = slugParsed.data

  const url = new URL(req.url)
  const vRaw = url.searchParams.get('v')
  let pinned: CityVersionHash | undefined
  if (vRaw !== null) {
    const parsed = parseCityVersionHash(vRaw)
    if (!parsed) return jsonError(400, 'invalid version')
    pinned = parsed
  }

  const { city, versionHash } = await loadCity(slug, pinned)
  return NextResponse.json({ slug, versionHash, city })
}

/**
 * PUT /api/city/[slug] (REQ-014).
 *
 * Open-edit by design: any visitor with a valid builder id cookie can
 * write to any slug. There is no per-slug owner; the builder id stays
 * minted (middleware) and shape-validated here, available for future
 * activity attribution, but is not persisted with the save and is not a
 * write gate.
 *
 * Validates body against `CitySchema`, validates the builder id cookie,
 * computes `hash = hashCity(body)`, and writes:
 *   1. `city:${slug}:version:${hash}` (idempotent on identical content)
 *   2. `city:${slug}:latest` -> the new hash
 *   3. `ZADD city:${slug}:versions ${now} ${hash}`
 *   4. `ZREMRANGEBYRANK city:${slug}:versions 0 -(MAX_CITY_VERSIONS+1)` so
 *      the per-slug history is bounded (REQ-052). The version payload
 *      itself is left in place because deleting it would invalidate any
 *      outstanding `?v=<hash>` deep link to that snapshot.
 *   5. `ZADD city:index ${now} ${slug}`
 *
 * Ordering: the version key is written before `:latest` advances so a
 * concurrent reader can never see a `:latest` that points at a missing
 * version.
 */
export async function PUT(
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

  const cityParsed = CitySchema.safeParse(body)
  if (!cityParsed.success) return jsonError(400, 'invalid city')
  const city = cityParsed.data

  const kv = getKv()

  const hash = hashCity(city)
  const now = Date.now()

  try {
    await kv.set(kvKeys.cityVersion(slug, hash), JSON.stringify(city))
    await kv.set(kvKeys.cityLatest(slug), hash)
    await kv.zadd(kvKeys.cityVersions(slug), { score: now, member: hash })
    // Trim the per-slug history to the newest MAX_CITY_VERSIONS entries
    // (REQ-052). Sorted-set rank is low-score-first so rank 0 is the
    // oldest entry; removing rank 0 .. -(MAX+1) is a no-op when the set
    // has fewer than MAX entries.
    await kv.zremrangebyrank(
      kvKeys.cityVersions(slug),
      0,
      -(MAX_CITY_VERSIONS + 1),
    )
    await kv.zadd(kvKeys.cityIndex(), { score: now, member: slug })
  } catch (e) {
    console.error('Failed to persist city version', e)
    return jsonError(503, 'storage unavailable', {
      reason: 'temporary storage failure',
    })
  }

  return NextResponse.json({ slug, versionHash: hash, updatedAt: now })
}
