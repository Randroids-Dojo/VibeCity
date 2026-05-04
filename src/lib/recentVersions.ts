import { type Slug } from './schemas'
import {
  getKv,
  hasKvConfigured,
  kvKeys,
  type CityVersionHash,
} from './kv'
import { parseCityVersionHash } from './cityVersion'

/**
 * Maximum number of historical versions retained per slug (REQ-052). The
 * `city:${slug}:versions` sorted set holds at most this many `(timestampMs,
 * hash)` pairs; older entries are trimmed at PUT time so a long-running
 * slug cannot accumulate unbounded KV storage. The version payload itself
 * (`city:${slug}:version:${hash}`) is left in place because deleting it
 * would invalidate any outstanding `?v=<hash>` deep link to that snapshot.
 *
 * 50 entries is enough to cover a typical editor session of incremental
 * autosaves (`DEFAULT_AUTOSAVE_DEBOUNCE_MS = 600` per REQ-025) without
 * hiding the slug's recent edit narrative; it is small enough that the
 * trim cost stays bounded under sustained churn.
 */
export const MAX_CITY_VERSIONS = 50

/**
 * Default page size for `recentVersions(slug)`. Mirrors the home-page
 * `recentSlugs` default (12) so a future "version picker" UI can render
 * a viewport-sized list without paying for a full sorted-set read.
 */
export const DEFAULT_RECENT_VERSIONS_LIMIT = 12

/**
 * Cap on the limit a caller may request, mirroring `MAX_CITY_VERSIONS`
 * (the trim policy bounds the sorted set itself, but a defensive cap on
 * the read also prevents a future caller from accidentally pulling the
 * full set across the wire when an even larger window is requested).
 */
export const MAX_RECENT_VERSIONS_LIMIT = MAX_CITY_VERSIONS

/**
 * One entry in the per-slug version history (REQ-052). `hash` is the
 * branded `CityVersionHash` (sha256 hex digest per REQ-013). `updatedAt`
 * is the `Date.now()` value the writer set as the sorted-set score at
 * the time the version was saved.
 */
export type CityVersionEntry = {
  hash: CityVersionHash
  updatedAt: number
}

/**
 * Read the most-recently-saved versions for a slug from the
 * `city:${slug}:versions` sorted set (REQ-052).
 *
 * Behavior contract:
 *   - When KV is not configured, returns an empty list (mirrors the
 *     `recentSlugs` soft-fallback so the local-dev experience without
 *     env vars stays clean).
 *   - When `limit` is non-positive, returns an empty list.
 *   - Returns at most `Math.min(limit, MAX_RECENT_VERSIONS_LIMIT)`
 *     entries, ordered newest-first by `updatedAt`.
 *   - Each member is filtered through `parseCityVersionHash` so a
 *     malformed hash written by an older version of the writer cannot
 *     leak into a future version-picker UI as a broken deep link.
 *     Invalid members are skipped (and a warning is logged) rather
 *     than erroring the whole call.
 */
export async function recentVersions(
  slug: Slug,
  limit: number = DEFAULT_RECENT_VERSIONS_LIMIT,
): Promise<CityVersionEntry[]> {
  if (limit <= 0) return []
  const capped = Math.min(limit, MAX_RECENT_VERSIONS_LIMIT)
  if (!hasKvConfigured()) return []

  const kv = getKv()
  const raw = await kv.zrange<string[]>(
    kvKeys.cityVersions(slug),
    0,
    capped - 1,
    { rev: true, withScores: true },
  )

  // `withScores: true` interleaves [member, score, member, score, ...].
  const out: CityVersionEntry[] = []
  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i]
    const scoreRaw = raw[i + 1]
    const parsedHash = parseCityVersionHash(member)
    if (!parsedHash) {
      console.warn(
        `recentVersions: skipping invalid hash member in city:${slug}:versions: ${String(
          member,
        )}`,
      )
      continue
    }
    const score = Number(scoreRaw)
    if (!Number.isFinite(score)) {
      console.warn(
        `recentVersions: skipping member with non-finite score in city:${slug}:versions: ${String(
          member,
        )} -> ${String(scoreRaw)}`,
      )
      continue
    }
    out.push({ hash: parsedHash, updatedAt: score })
  }
  return out
}
