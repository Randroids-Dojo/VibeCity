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
