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
} from '@/lib/kv'
import { BUILDER_ID_COOKIE, isValidBuilderId } from '@/lib/builderId'
import { loadCity } from '@/lib/loadCity'

export const runtime = 'nodejs'

/** sha256 hex digest is 64 lowercase hex chars. */
const VERSION_HASH_RE = /^[0-9a-f]{64}$/

function parseVersionHash(raw: string): CityVersionHash | null {
  return VERSION_HASH_RE.test(raw) ? (raw as CityVersionHash) : null
}

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
    const parsed = parseVersionHash(vRaw)
    if (!parsed) return jsonError(400, 'invalid version')
    pinned = parsed
  }

  const { city, versionHash } = await loadCity(slug, pinned)
  return NextResponse.json({ slug, versionHash, city })
}

/**
 * PUT /api/city/[slug] (REQ-014).
 *
 * Validates body against `CitySchema`, validates the builder id cookie,
 * gates ownership against `city:${slug}:owner` (first PUT claims the slug),
 * computes `hash = hashCity(body)`, and writes:
 *   1. `city:${slug}:version:${hash}` (idempotent on identical content)
 *   2. `city:${slug}:latest` -> the new hash
 *   3. `ZADD city:${slug}:versions ${now} ${hash}`
 *   4. `ZADD city:index ${now} ${slug}`
 *   5. On first claim: `city:${slug}:owner` -> the requesting builder id.
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

  const owner = await kv.get<string>(kvKeys.cityOwner(slug))
  if (owner && owner !== builderId) {
    return jsonError(403, 'not owner')
  }

  const hash = hashCity(city)
  const now = Date.now()

  try {
    await kv.set(kvKeys.cityVersion(slug, hash), JSON.stringify(city))
    await kv.set(kvKeys.cityLatest(slug), hash)
    await kv.zadd(kvKeys.cityVersions(slug), { score: now, member: hash })
    await kv.zadd(kvKeys.cityIndex(), { score: now, member: slug })
    if (!owner) {
      await kv.set(kvKeys.cityOwner(slug), builderId)
    }
  } catch (e) {
    console.error('Failed to persist city version', e)
    return jsonError(503, 'storage unavailable', {
      reason: 'temporary storage failure',
    })
  }

  return NextResponse.json({ slug, versionHash: hash, updatedAt: now })
}
