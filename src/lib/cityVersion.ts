import type { CityVersionHash } from './cityKv'

/**
 * sha256 hex digest is 64 lowercase hex chars (REQ-013).
 *
 * `hashCity()` always emits this shape; the regex is the precise
 * accept / reject contract for any caller that receives a raw string
 * from outside the trust boundary (URL `?v=` query, route segment, KV
 * payload pulled cold from the wire).
 */
export const VERSION_HASH_RE = /^[0-9a-f]{64}$/

/**
 * Validate a raw `?v=` query value against the canonical version hash
 * shape and return the branded `CityVersionHash` on success. Returns
 * `null` on any non-conforming input (wrong length, mixed case, non-hex
 * characters, empty string).
 *
 * Used by:
 *   - `src/app/api/city/[slug]/route.ts` GET handler (returns 400).
 *   - `src/app/[slug]/page.tsx` drive-view page (calls `notFound()`).
 *   - `src/app/[slug]/edit/page.tsx` editor page (calls `notFound()`).
 *
 * Both pages and the API route route through this single helper so the
 * accept / reject contract is identical across surfaces. A malformed
 * pin in any URL fails fast instead of silently falling through to the
 * latest version (which would be a confusing UX for a shared link).
 */
export function parseCityVersionHash(raw: string): CityVersionHash | null {
  return VERSION_HASH_RE.test(raw) ? (raw as CityVersionHash) : null
}

/**
 * Read the `?v=` value from a Next.js App Router `searchParams` entry
 * and validate it. The page-route convention passes `searchParams` as a
 * `Promise<Record<string, string | string[] | undefined>>`; resolve and
 * pass the `v` field directly into this helper.
 *
 * Returns `null` when the field is absent (so the caller falls through
 * to loading the latest version) or when the value is malformed (so
 * the caller can decide how to surface the rejection: API route returns
 * 400, page route calls `notFound()`).
 *
 * Array-shaped values (a URL like `?v=a&v=b`) collapse to `null` so a
 * malformed share link cannot silently pick one of the two values.
 */
export function readVersionParam(
  raw: string | string[] | undefined,
): CityVersionHash | null {
  if (typeof raw !== 'string') return null
  return parseCityVersionHash(raw)
}
