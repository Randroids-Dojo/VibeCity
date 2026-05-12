import { CitySchema, EMPTY_CITY, type City, type Slug } from './schemas'
import { getKv, kvKeys, type CityVersionHash } from './cityKv'
import { DEMO_CITY, DEMO_SLUG } from './demoCity'

/**
 * Read a saved city for a slug (REQ-015).
 *
 * Sequence (matches `docs/gdd/03-persistence.md` Read path):
 *   1. If slug equals `DEMO_SLUG` and no `version` is pinned, return the
 *      bundled `DEMO_CITY` regardless of KV state. Lets the showcase
 *      slug surface a full city in local dev / preview environments
 *      without a configured Upstash binding, and avoids overwriting the
 *      bundled payload when a player saves over the slug (the KV value
 *      will then take precedence on the next read because a pinned
 *      version still flows through the KV branch).
 *   2. If KV is not configured (`getKv()` returns null), return `EMPTY_CITY`.
 *   3. Read `city:${slug}:latest` to get the active version hash. If absent,
 *      return `EMPTY_CITY`.
 *   4. Read `city:${slug}:version:${hash}` for the actual payload.
 *   5. Validate against `CitySchema` (REQ-012). On parse failure, return
 *      `EMPTY_CITY` and log a warning.
 *
 * When `version` is supplied (REQ-048, REQ-049 deep-link case), the version
 * key is read directly without consulting `latest`. A pinned version that is
 * missing from KV resolves to `EMPTY_CITY`, mirroring the unset-latest path,
 * so a stale URL never crashes the page. The demo bypass intentionally
 * skips for pinned versions so a `?v=<hash>` link to a saved fork of the
 * demo loads the saved version, not the bundled payload.
 */
export async function loadCity(
  slug: Slug,
  version?: CityVersionHash,
): Promise<{ city: City; versionHash: CityVersionHash | null }> {
  if (slug === DEMO_SLUG && !version) {
    const kv = getKv()
    if (!kv) {
      // No KV: demo always wins.
      return { city: DEMO_CITY, versionHash: null }
    }
    // KV configured: prefer the bundled demo when no save exists yet so
    // a player visiting /demo before anyone has saved sees the showcase
    // rather than the empty starter city.
    const latest = await kv.get<CityVersionHash>(kvKeys.cityLatest(slug))
    if (latest === null || latest === undefined) {
      return { city: DEMO_CITY, versionHash: null }
    }
    // Fall through to the KV read path so a saved fork of the demo
    // surfaces the player's edits instead of the bundled payload.
  }

  const kv = getKv()
  if (!kv) {
    return { city: EMPTY_CITY, versionHash: null }
  }

  let versionHash: CityVersionHash | null
  if (version) {
    versionHash = version
  } else {
    versionHash = await kv.get<CityVersionHash>(kvKeys.cityLatest(slug))
  }

  if (!versionHash) {
    return { city: EMPTY_CITY, versionHash: null }
  }

  const raw = await kv.get<unknown>(kvKeys.cityVersion(slug, versionHash))
  if (raw === null || raw === undefined) {
    return { city: EMPTY_CITY, versionHash: null }
  }

  const parsed = CitySchema.safeParse(raw)
  if (!parsed.success) {
    console.warn(
      `loadCity: stored payload at city:${slug}:version:${versionHash} failed CitySchema parse`,
    )
    return { city: EMPTY_CITY, versionHash: null }
  }

  return { city: parsed.data, versionHash }
}
