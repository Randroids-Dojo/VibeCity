# 3. Persistence

**Status:** done

VibeCity stores cities in Upstash Redis under a flat `city:` namespace. Slugs are the storage keys. Each slug owns a "latest" pointer plus a content-addressed history so editor URLs can pin to a specific version (REQ-048, REQ-049).

This file is the canonical spec for the persistence requirements (REQ-004, REQ-014, REQ-015, REQ-052) and the home-page index reads (REQ-011, REQ-050).

## Backing store

- Upstash Redis via `@upstash/redis`.
- Env vars: `KV_REST_API_URL`, `KV_REST_API_TOKEN`. Set in the deployment dashboard, never in the repo.
- Client lives at `src/lib/kv.ts` as a lazy singleton (`getKv()`). Tests and routes that do not need persistence can import the module without crashing on missing env.
- `hasKvConfigured()` returns true iff both env vars are set. Callers that want a graceful empty-city fallback (REQ-015) branch on this before calling `getKv()`.

## Key namespace

All keys live under the `city:` prefix. Stable: external tooling reads these literal strings.

| Key | Type | Purpose | REQ |
| --- | --- | --- | --- |
| `city:${slug}:latest` | JSON string | Most recent saved city for a slug. | REQ-014, REQ-015 |
| `city:${slug}:version:${hash}` | JSON string | Content-addressed snapshot of a city. Hash is `hashCity(pieces+buildings)` per REQ-013. | REQ-014, REQ-015 |
| `city:${slug}:versions` | sorted set | `(timestampMs, hash)` history for a slug. Trimmed at PUT time to the newest `MAX_CITY_VERSIONS = 50` entries (REQ-052). | REQ-052 |
| `city:index` | sorted set | `(updatedAtMs, slug)` global feed for the home page. | REQ-011, REQ-050 |
| `city:${slug}:owner` | string | Builder id (REQ-009) of the first PUT to a slug. Subsequent PUTs must present a matching cookie or get 403. | REQ-014 |

The shape mirrors VibeRacer's `track:`-namespaced keys 1:1 so the persistence write path can reuse VibeRacer patterns when `PUT /api/city/[slug]` lands (REQ-014).

## Read path

`loadCity(slug)` (REQ-015) sequence:

1. If `hasKvConfigured()` is false, return an empty city.
2. Read `city:${slug}:latest`. If absent, return an empty city.
3. The latest pointer carries the hash; read `city:${slug}:version:${hash}` for the actual payload.
4. Validate against `CitySchema` (REQ-012). On parse failure, return an empty city and log a warning.

When `?v=<hash>` is present in the URL (REQ-048, REQ-049), the version key is read directly without consulting `latest`.

## Write path

`PUT /api/city/[slug]` (REQ-014) sequence:

1. Validate body against `CitySchema`.
2. Validate ownership cookie (`builderId`, REQ-009) against the slug's owner. First PUT to a slug claims ownership by writing `city:${slug}:owner = builderId`. Subsequent PUTs whose cookie does not match the recorded owner return 403.
3. Compute `hash = hashCity(body)` (REQ-013).
4. Write `city:${slug}:version:${hash}` (idempotent on identical content).
5. Write `city:${slug}:latest` to point at the new hash.
6. `ZADD city:${slug}:versions {now} {hash}`.
7. `ZREMRANGEBYRANK city:${slug}:versions 0 -(MAX_CITY_VERSIONS+1)` so the per-slug history retains only the newest `MAX_CITY_VERSIONS = 50` entries (REQ-052). The trim is rank-based and a no-op when the set is at or below the cap.
8. `ZADD city:index {now} {slug}` so the home page sees the freshness bump.
9. On the first claim only, write `city:${slug}:owner = builderId`.

The ordering matters: version key must exist before `latest` advances, so a reader can never see a `latest` that points at a missing version. The trim removes only the sorted-set membership; the version payload at `city:${slug}:version:${hash}` is left in place so a stale `?v=<hash>` deep link to a trimmed-from-history snapshot still loads (REQ-048, REQ-049).

## Version history reads

`recentVersions(slug, limit)` (REQ-052) reads the per-slug history newest-first.

- Returns at most `Math.min(limit, MAX_RECENT_VERSIONS_LIMIT)` entries, where `MAX_RECENT_VERSIONS_LIMIT === MAX_CITY_VERSIONS = 50` so a reader cannot ask for more than the writer keeps.
- Default limit is `DEFAULT_RECENT_VERSIONS_LIMIT = 12`, mirroring the home-page `recentSlugs` default so a future "version picker" UI can render a viewport-sized list cheaply.
- Returns an empty list when KV is unconfigured (mirrors the `recentSlugs` soft-fallback so local-dev without env vars stays clean) or when `limit <= 0`.
- Each member is filtered through `parseCityVersionHash` so a malformed hash written by an older writer cannot leak into a future UI as a broken deep link; invalid members are skipped with a `console.warn`.

## Out of scope for v1

- Multi-region replication, read-your-write tier wiring.
- Encryption at rest beyond what Upstash provides by default.
- Migration tooling. v1 schema is small enough that breaking changes can be handled by namespace bumps.
- Soft-delete or recycle-bin for cities. Cities are immutable once written; "delete" is not a v1 surface.

### Build log

- 2026-05-04: Migrated VibeCity to a dedicated Upstash store. Provisioned `vibecity-kv` via `vercel integration add upstash/upstash-kv --name vibecity-kv` plus the marketplace dashboard handshake (region / plan / connect-to-project). Removed the five legacy shared-store env vars (`vercel env rm`) before the connect step so the new resource wrote clean values into `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, and `REDIS_URL` across `production`, `preview`, and `development`. `vercel integration ls` now shows `vibecity-kv` attached only to `vibe-city` (no shared resource visible). `vercel env pull` refreshed `.env.local`. `vercel --prod` redeploy completed. End-to-end smoke on slug `dedicated-store-smoke-1777946271`: `PUT` returned a real `versionHash`, follow-up `GET` read the persisted piece back, confirming the dedicated store handles the full write+read round trip on production. README env section updated to point at `vibecity-kv` instead of the shared-store wording. F-009 closes against this slice. PR #65.
- 2026-05-04: Production saving wired up. The `vibe-city` Vercel project had no env vars set, so every prior PUT to `/api/city/<slug>` on the live host returned a soft-empty city via the `hasKvConfigured()` fallback path and never persisted. This slice provisioned `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, and `REDIS_URL` on the `vibe-city` project across `production`, `preview`, and `development` via `vercel env add`, pointed at the existing `upstash-kv-rose-garden` store already attached to the `vibe-racer` project. The `city:` vs `track:` namespace separation in `src/lib/kv.ts` keeps the two products' keys disjoint inside the shared store. The local `.env.local` (gitignored) is materialized via `vercel env pull`. Production redeployed via `vercel --prod`; smoke verified end to end with a `GET /api/city/loop-saving-smoketest` (200 empty city plus `vibecity.builderId` cookie issuance from middleware) followed by a `PUT` of a single straight piece (200 with a real `versionHash`) and a follow-up GET that read the persisted piece back. Q-007 records the choice to share the store rather than provision a dedicated one. README env section updated to reflect that the env vars are now live, not "follow-up". No source code changed. PR #N.
- 2026-05-04: REQ-052 landed. `src/lib/recentVersions.ts` ships `MAX_CITY_VERSIONS = 50` (per-slug history bound), `DEFAULT_RECENT_VERSIONS_LIMIT = 12`, `MAX_RECENT_VERSIONS_LIMIT === MAX_CITY_VERSIONS`, the `CityVersionEntry = { hash, updatedAt }` shape, and `recentVersions(slug, limit)` that reads `city:${slug}:versions` newest-first via `kv.zrange(..., { rev: true, withScores: true })` and filters each member through `parseCityVersionHash` so a malformed entry cannot leak into a future deep link UI. `src/app/api/city/[slug]/route.ts` PUT handler now calls `kv.zremrangebyrank(kvKeys.cityVersions(slug), 0, -(MAX_CITY_VERSIONS + 1))` immediately after the `zadd` so the per-slug history is bounded; the trim is rank-based and a no-op when the set is at or below the cap. The version payload at `city:${slug}:version:${hash}` is intentionally NOT deleted so a stale `?v=<hash>` deep link to a trimmed-from-history snapshot still loads via the existing `loadCity` read path. `tests/_fakeKv.ts` gained `zcard` and a Redis-faithful `zremrangebyrank` (negative-index resolution that does not bump out-of-range stop indices into valid range, so e.g. `ZREMRANGEBYRANK 0 -51` on a 2-element set is a no-op as Redis does it). `tests/lib/recentVersions.test.ts` ships 12 cases covering KV-unconfigured / empty-set / newest-first ordering / explicit limit / limit-exceeds-count / non-positive limit / `MAX_RECENT_VERSIONS_LIMIT` cap (vi.spyOn against `fake.zrange` to confirm the stop arg) / invalid-member skip with warn / namespace key invariant / `MAX_CITY_VERSIONS` positive integer / `MAX_RECENT_VERSIONS_LIMIT === MAX_CITY_VERSIONS` / `DEFAULT_RECENT_VERSIONS_LIMIT` bounds. `tests/app/cityRoute.test.ts` gained 3 PUT cases: the history zset grows on every save (zcard = 2 after two PUTs, newest-first order verified), a saturated-history PUT trims one oldest entry (zcard stays at `MAX_CITY_VERSIONS`, the score-1 synthetic entry is gone, the score-2 entry survives), and the version payload survives the trim so deep links to trimmed entries still resolve. PR #N.
- 2026-05-03: REQ-014 + REQ-015 landed together. Added `src/lib/loadCity.ts` (`loadCity(slug, version?)` returns `{ city, versionHash }`; honors the `hasKvConfigured()` soft fallback per the Read path). Added `src/app/api/city/[slug]/route.ts` with GET (latest or `?v=<hash>` pinned) and PUT handlers. PUT validates the slug + builder id cookie + JSON body + `CitySchema`, then enforces ownership via a new `city:${slug}:owner` key (first PUT claims). Writes are sequenced (version key, then `:latest`, then `versions` ZADD, then global `city:index` ZADD, then owner claim on first PUT) so a reader never sees a `:latest` pointing at a missing version. Extended `kvKeys` with `cityOwner(slug)`. Added `tests/_fakeKv.ts` (in-memory Redis surface ported from VibeRacer's `tests/unit/_fakeKv.ts`), `tests/lib/loadCity.test.ts` (7 cases: KV-unset fallback, no-latest fallback, latest+version round-trip, dangling `:latest`, corrupt-payload graceful warn, pinned `?v=` versus latest, unknown pinned hash), and `tests/app/cityRoute.test.ts` (12 cases: invalid slug, missing / malformed cookie, malformed JSON, schema-fail, claim ownership on first PUT, 403 on non-owner overwrite, owner overwrite, GET empty / saved / invalid `?v=`). Verified `npm run check:dashes`, `npx tsc --noEmit`, `npm test` (152 pass), `npm run build`. PR #N.
- 2026-05-03: REQ-004 landed. Added `@upstash/redis ^1.37.0` to dependencies. Files: `src/lib/kv.ts` (`getKv` singleton, `hasKvConfigured`, `kvKeys` for `cityLatest` / `cityVersion` / `cityVersions` / `cityIndex`, `CityVersionHash` brand type), `tests/lib/kv.test.ts` (env-toggle, key-shape, throw-on-unset cases). Verified `npm run type-check`, `npm run test`, `npm run build` all green. Dash check clean. PR #N.
