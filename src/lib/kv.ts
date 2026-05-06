import { Redis } from '@upstash/redis'
import type { Slug } from './schemas'

/**
 * Upstash Redis client and `city:`-namespaced key helpers for VibeCity.
 *
 * Ported from VibeRacer's `src/lib/kv.ts`. Differences from VibeRacer:
 *   - Top-level namespace is `city:` instead of `track:`.
 *   - Only the keys VibeCity v1 uses are exported (see `kvKeys`).
 *     Racing-only keys (leaderboards, replays, anticheat tokens) are
 *     intentionally omitted; add them in their own slice if they ever
 *     come into v1 scope.
 *
 * Env contract (per `README.md`):
 *   - `KV_REST_API_URL`
 *   - `KV_REST_API_TOKEN`
 *
 * `getKv()` is lazy: instantiation is deferred until first use so module
 * import does not crash routes that do not need persistence (e.g. `/`).
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

/**
 * Returns true iff both Upstash env vars are present. Callers that want to
 * gracefully fall back to an empty city when KV is unconfigured (REQ-015)
 * should branch on this before calling `getKv()`.
 */
export function hasKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

let _kv: Redis | null = null

/**
 * Returns the singleton Upstash Redis client. Throws if env is missing.
 * Use `hasKvConfigured()` first when a caller wants a soft fallback.
 */
export function getKv(): Redis {
  if (!_kv) {
    _kv = new Redis({
      url: requireEnv('KV_REST_API_URL'),
      token: requireEnv('KV_REST_API_TOKEN'),
    })
  }
  return _kv
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
