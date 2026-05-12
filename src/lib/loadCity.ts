import { CitySchema, EMPTY_CITY, type City, type Slug } from './schemas'
import { getKv, kvKeys, type CityVersionHash } from './cityKv'

/**
 * Read a saved city for a slug (REQ-015).
 *
 * Sequence (matches `docs/gdd/03-persistence.md` Read path):
 *   1. If KV is not configured (`getKv()` returns null), return `EMPTY_CITY`.
 *   2. Read `city:${slug}:latest` to get the active version hash. If absent,
 *      return `EMPTY_CITY`.
 *   3. Read `city:${slug}:version:${hash}` for the actual payload.
 *   4. Validate against `CitySchema` (REQ-012). On parse failure, return
 *      `EMPTY_CITY` and log a warning.
 *
 * When `version` is supplied (REQ-048, REQ-049 deep-link case), the version
 * key is read directly without consulting `latest`. A pinned version that is
 * missing from KV resolves to `EMPTY_CITY`, mirroring the unset-latest path,
 * so a stale URL never crashes the page.
 */
export async function loadCity(
  slug: Slug,
  version?: CityVersionHash,
): Promise<{ city: City; versionHash: CityVersionHash | null }> {
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
