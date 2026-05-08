import type { Slug } from './schemas'

/**
 * VibeCity-specific key namespace for the Upstash Redis store. The
 * generic Redis client wrapper (`getKv`, `hasKvConfigured`) lives in
 * `@/lib/storage/kv`; this module owns the `city:`-prefixed key
 * shapes the route handlers and lib helpers use.
 *
 * Keep these key strings stable: external tooling (migrations,
 * dashboards) reads them literally.
 */

// Re-export the storage-layer wrappers for backwards-compatible import
// shape. Callers that only need the city keys should import from this
// module; new generic callers can import directly from `@/lib/storage/kv`.
export { getKv, hasKvConfigured } from './storage/kv'

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
