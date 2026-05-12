import { getKv } from '@randroids-dojo/vibekit/server'
import type { Slug } from './schemas'

/**
 * VibeCity-specific key namespace for the Upstash Redis store. The
 * generic Redis client wrapper (`getKv`) is sourced from
 * `@randroids-dojo/vibekit/server`; this module owns the `city:`-
 * prefixed key shapes the route handlers and lib helpers use plus a
 * `hasKvConfigured` synonym for the soft-fallback branch.
 *
 * Keep these key strings stable: external tooling (migrations,
 * dashboards) reads them literally.
 */

// Re-export the kit's lazy singleton so existing callers keep the same
// import path. The kit returns `null` on missing env (no throw); the
// `hasKvConfigured` helper below preserves the boolean-check ergonomic
// for callers that branched on it before the migration.
export { getKv } from '@randroids-dojo/vibekit/server'

/**
 * Boolean-check synonym for `getKv() !== null`. Preserves the public
 * API the route handlers and lib helpers branched on before the F-018
 * slice 3 migration. The kit collapsed the two-call pattern
 * `if (!hasKvConfigured()) return ...; const kv = getKv()` into a
 * single nullable read; new call sites should prefer `const kv = getKv();
 * if (!kv) return ...` directly. The kit caches the resolution so
 * back-to-back calls are cheap.
 */
export function hasKvConfigured(): boolean {
  return getKv() !== null
}

/**
 * Hash of a city's pieces+buildings (REQ-013). Typed nominally so a raw
 * `string` cannot be passed where a hash is expected without intent.
 */
export type CityVersionHash = string & { readonly __brand: 'CityVersionHash' }

/**
 * Key namespace for VibeCity persistence. Keep these stable: external
 * tooling (migrations, dashboards) reads these literal strings.
 */
export const kvKeys = {
  /** Latest saved city for a slug (REQ-014, REQ-015). */
  cityLatest: (slug: Slug) => `city:${slug}:latest`,
  /** Versioned snapshot of a city by content hash (REQ-014, REQ-015). */
  cityVersion: (slug: Slug, hash: CityVersionHash) =>
    `city:${slug}:version:${hash}`,
  /** Sorted set of `(timestampMs, hash)` for a slug's history (REQ-052). */
  cityVersions: (slug: Slug) => `city:${slug}:versions`,
  /** Sorted set of `(updatedAtMs, slug)` for the home page list (REQ-011, REQ-050). */
  cityIndex: () => 'city:index',
  /**
   * Append-only event log for a slug's sim events (REQ-072..074, Q-012
   * event sourcing). Stored as a Redis list so insertion order is the
   * canonical replay order. Each list entry is the JSON-encoded
   * `SimEvent` augmented with the server-stamped `clientReceivedAt`.
   * The list length is the cursor; cold load reads from index 0;
   * incremental load reads from the client's last-seen cursor.
   */
  cityEvents: (slug: Slug) => `city:${slug}:events`,
  /**
   * Latest derived sim-state snapshot for a slug (REQ-073, Q-013
   * snapshotting). Stored as a JSON-encoded SimState. The companion
   * `cityEventsSnapshotCursor` records how many events the snapshot
   * incorporates; cold load fetches snapshot + events from cursor on.
   * Slice 4 (snapshotting trigger) writes these; slice 2 (this slice)
   * reserves the key shape so the route handler can read it when
   * present.
   */
  citySnapshot: (slug: Slug) => `city:${slug}:snapshot`,
  /** Integer cursor: how many events the snapshot in `citySnapshot(slug)` includes. */
  cityEventsSnapshotCursor: (slug: Slug) => `city:${slug}:snapshot:cursor`,
} as const
