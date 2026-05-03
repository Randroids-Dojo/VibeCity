# 3. Persistence

**Status:** partial

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
| `city:${slug}:versions` | sorted set | `(timestampMs, hash)` history for a slug. Bounded; trim policy lives with REQ-052. | REQ-052 |
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
7. `ZADD city:index {now} {slug}` so the home page sees the freshness bump.
8. On the first claim only, write `city:${slug}:owner = builderId`.

The ordering matters: version key must exist before `latest` advances, so a reader can never see a `latest` that points at a missing version.

## Out of scope for v1

- Multi-region replication, read-your-write tier wiring.
- Encryption at rest beyond what Upstash provides by default.
- Migration tooling. v1 schema is small enough that breaking changes can be handled by namespace bumps.
- Soft-delete or recycle-bin for cities. Cities are immutable once written; "delete" is not a v1 surface.

### Build log

- 2026-05-03: REQ-014 + REQ-015 landed together. Added `src/lib/loadCity.ts` (`loadCity(slug, version?)` returns `{ city, versionHash }`; honors the `hasKvConfigured()` soft fallback per the Read path). Added `src/app/api/city/[slug]/route.ts` with GET (latest or `?v=<hash>` pinned) and PUT handlers. PUT validates the slug + builder id cookie + JSON body + `CitySchema`, then enforces ownership via a new `city:${slug}:owner` key (first PUT claims). Writes are sequenced (version key, then `:latest`, then `versions` ZADD, then global `city:index` ZADD, then owner claim on first PUT) so a reader never sees a `:latest` pointing at a missing version. Extended `kvKeys` with `cityOwner(slug)`. Added `tests/_fakeKv.ts` (in-memory Redis surface ported from VibeRacer's `tests/unit/_fakeKv.ts`), `tests/lib/loadCity.test.ts` (7 cases: KV-unset fallback, no-latest fallback, latest+version round-trip, dangling `:latest`, corrupt-payload graceful warn, pinned `?v=` versus latest, unknown pinned hash), and `tests/app/cityRoute.test.ts` (12 cases: invalid slug, missing / malformed cookie, malformed JSON, schema-fail, claim ownership on first PUT, 403 on non-owner overwrite, owner overwrite, GET empty / saved / invalid `?v=`). Verified `npm run check:dashes`, `npx tsc --noEmit`, `npm test` (152 pass), `npm run build`. PR #N.
- 2026-05-03: REQ-004 landed. Added `@upstash/redis ^1.37.0` to dependencies. Files: `src/lib/kv.ts` (`getKv` singleton, `hasKvConfigured`, `kvKeys` for `cityLatest` / `cityVersion` / `cityVersions` / `cityIndex`, `CityVersionHash` brand type), `tests/lib/kv.test.ts` (env-toggle, key-shape, throw-on-unset cases). Verified `npm run type-check`, `npm run test`, `npm run build` all green. Dash check clean. PR #N.
