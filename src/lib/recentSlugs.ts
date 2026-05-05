import { SlugSchema, type Slug } from './schemas'
import { getKv, hasKvConfigured, kvKeys } from './kv'

/**
 * Default page size for the home page recently-updated list (REQ-011,
 * REQ-050). 12 is enough to fill the home page on a default desktop
 * viewport without paying for a large KV read; the home page can pass
 * a larger limit if a future slice adds pagination.
 */
export const DEFAULT_RECENT_SLUGS_LIMIT = 12

/**
 * Cap on the limit a caller may request. Mirrors a defensive bound so a
 * caller cannot accidentally pull the full sorted set across the wire
 * for an unbounded list. The home page never goes near this in v1; the
 * cap exists so a future paginated route cannot silently DoS KV.
 */
export const MAX_RECENT_SLUGS_LIMIT = 100

/**
 * One entry in the home-page recently-updated list (REQ-011, REQ-050).
 * `slug` is the branded `Slug` (lowercase letters, digits, hyphens; 1
 * to 128 chars). `updatedAt` is the `Date.now()` value the writer set
 * as the sorted-set score at the time the city was last saved; the home
 * page renders it as a relative "N ago" cue via `formatRelativeTime`
 * from `./relativeTime`.
 */
export type RecentCityEntry = {
  slug: Slug
  updatedAt: number
}

/**
 * Read the most-recently-updated slugs from the `city:index` sorted
 * set (REQ-011).
 *
 * Behavior contract:
 *   - When KV is not configured (`hasKvConfigured() === false`),
 *     returns an empty list. The home page (REQ-050) treats this as
 *     "no cities yet" so the local-dev experience without env vars is
 *     a clean empty state instead of a thrown error.
 *   - When `limit` is non-positive, returns an empty list.
 *   - The list returned has at most `limit` entries, ordered by
 *     `updatedAtMs` descending (newest first).
 *   - Each entry is filtered through `SlugSchema` so a malformed
 *     member written by an older version of the writer cannot leak into
 *     the home page UI as a broken link. Invalid members are skipped
 *     (and a warning is logged) rather than erroring the whole call.
 *
 * The `city:index` sorted set is written by `PUT /api/city/[slug]`
 * with `score = Date.now()` (REQ-014). A `ZRANGE 0 limit-1 REV` on
 * that key gives the newest-first window the home page needs.
 */
export async function recentSlugs(
  limit: number = DEFAULT_RECENT_SLUGS_LIMIT,
): Promise<Slug[]> {
  if (limit <= 0) return []
  const capped = Math.min(limit, MAX_RECENT_SLUGS_LIMIT)
  if (!hasKvConfigured()) return []

  const kv = getKv()
  const raw = await kv.zrange<string[]>(
    kvKeys.cityIndex(),
    0,
    capped - 1,
    { rev: true },
  )

  const out: Slug[] = []
  for (const member of raw) {
    const parsed = SlugSchema.safeParse(member)
    if (parsed.success) {
      out.push(parsed.data)
    } else {
      console.warn(
        `recentSlugs: skipping invalid slug member in city:index: ${String(
          member,
        )}`,
      )
    }
  }
  return out
}

/**
 * Read the most-recently-updated slugs alongside their stored
 * `updatedAt` timestamps (REQ-011, REQ-050). Mirrors `recentSlugs`
 * exactly except the return shape pairs each slug with the score the
 * `ZADD` writer set at save time so the home page can render a relative
 * "N ago" cue.
 *
 * Behavior contract:
 *   - Identical KV-unconfigured / empty / limit-cap fallbacks as
 *     `recentSlugs` so the empty-state branch on the home page stays
 *     consistent across both readers.
 *   - Members whose stored score is non-finite (`NaN`, `Infinity`, or
 *     non-numeric) are skipped with a warning so a tuning bug in the
 *     writer cannot leak `NaN ago` onto the home page.
 *   - Invalid `SlugSchema` members are skipped with a warning, mirroring
 *     `recentSlugs`. The two readers share the same defensive contract
 *     so the home page never displays a broken link.
 */
export async function recentCities(
  limit: number = DEFAULT_RECENT_SLUGS_LIMIT,
): Promise<RecentCityEntry[]> {
  if (limit <= 0) return []
  const capped = Math.min(limit, MAX_RECENT_SLUGS_LIMIT)
  if (!hasKvConfigured()) return []

  const kv = getKv()
  const raw = await kv.zrange<string[]>(
    kvKeys.cityIndex(),
    0,
    capped - 1,
    { rev: true, withScores: true },
  )

  // `withScores: true` interleaves [member, score, member, score, ...].
  const out: RecentCityEntry[] = []
  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i]
    const scoreRaw = raw[i + 1]
    const parsed = SlugSchema.safeParse(member)
    if (!parsed.success) {
      console.warn(
        `recentCities: skipping invalid slug member in city:index: ${String(
          member,
        )}`,
      )
      continue
    }
    const score = Number(scoreRaw)
    if (!Number.isFinite(score)) {
      console.warn(
        `recentCities: skipping member with non-finite score in city:index: ${String(
          member,
        )} -> ${String(scoreRaw)}`,
      )
      continue
    }
    out.push({ slug: parsed.data, updatedAt: score })
  }
  return out
}
