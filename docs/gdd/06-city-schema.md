# 6. City Schema and Versioning

**Status:** partial

VibeCity stores each city as a single JSON payload validated by `CitySchema`. The schema is the contract between the editor (write side), persistence (`docs/gdd/03-persistence.md`), and the drive view (read side). Strict on unknown fields: any extra key fails validation, so the editor cannot smuggle in state that the drive view does not understand.

This file is the canonical spec for the city schema requirements (REQ-012, REQ-013, REQ-059, REQ-063, REQ-064).

## Top-level shape

```ts
City = {
  pieces: Piece[]            // 0..MAX_PIECES_PER_CITY (256)
  buildings: Building[]      // 0..MAX_BUILDINGS_PER_CITY (512)
  mood?: CityMood            // optional, NOT included in version hash
}
```

An empty city (`{ pieces: [], buildings: [] }`) is the v1 starting state for a fresh slug. The constant `EMPTY_CITY` is exported from `src/lib/schemas.ts` so REQ-015 (kv unset fallback) and REQ-010 (fresh-slug landing) can return it without reconstructing.

## Pieces

Street pieces describe the drivable grid. Each piece has a `type`, a `(row, col)` anchor, a 90deg `rotation`, and an optional multi-cell `footprint` (REQ-059, defaults to single-cell).

Piece type taxonomy in v1 (REQ-017, REQ-018, REQ-019, REQ-058, REQ-060, REQ-061, REQ-062):

- `straight`, `left90`, `right90` (REQ-017)
- `scurve`, `scurveLeft`, `sweepRight`, `sweepLeft` (REQ-018)
- `megaSweepRight`, `megaSweepLeft` (REQ-058, ported from VibeRacer PR #80)
- `hairpin` (REQ-060, ported from VibeRacer PR #81)
- `arc45` (REQ-061, ported from VibeRacer): bridges a cardinal connector to a corner connector. At rotation 0, connector ports are S (cardinal) and NE (corner). Four cardinal rotations supported. This is the transition piece that lets cardinal-only runs hand off to diagonal runs and back.
- `diagonal` (REQ-062, ported from VibeRacer): chains corner-to-corner across one cell. At rotation 0, connector ports are SW and NE. Four cardinal rotations supported (180deg rotations are geometrically equivalent but accepted for consistency). Length is `CELL_SIZE * sqrt(2)` once geometry lands.
- `intersection` (REQ-019, VibeCity-specific 4-way junction extending VibeRacer's planned 3-connector junction)

The schema accepts every piece type in the planned v1 taxonomy. Hiding a piece from the palette UI is a separate concern; the schema does not gate placeability beyond the type enum.

`PieceFootprintCell` carries `dr` and `dc` integer offsets relative to the piece anchor. The schema is `.strict()` so a footprint cell cannot smuggle additional fields (e.g. weights). Future Phase 0 work (REQ-063 8-direction connectors, REQ-064 segment-based path) layers on top of this footprint without changing the schema's surface.

## Buildings

Buildings are placeholder primitive types in v1 (Q-004 default B). Four enum members:

- `small-house`, `mid-house`, `shop`, `factory`

Each building has a `(row, col)` anchor and a 90deg `rotation`. v1 buildings are single-cell with no simulation behavior (REQ-028, REQ-029, REQ-030); they are visual variety for the drive view. Multi-cell building footprints (Q-004 option C) are out of scope for v1.

## Mood

`CityMood` carries optional `timeOfDay` and `weather` fields. Both are short strings in v1; the schema does not enum-check them because the lighting / weather modules have not yet been ported. When the lighting port lands, this section will tighten the types to mirror VibeRacer's `TimeOfDaySchema` and `WeatherSchema`.

Mood is excluded from the version hash (REQ-013). Adding or changing the mood on an existing city does NOT produce a new content version, so prior version references remain stable.

## Versioning (REQ-013)

`hashCity(city)` (REQ-013, future slice) computes a stable hash over `pieces` and `buildings`. Mood is excluded. Hash format mirrors VibeRacer's `hashTrack` (a 64-char hex digest); see `kvKeys.cityVersion` in `src/lib/kv.ts` and `CityVersionHash` for the brand type.

Hash stability requirements:

- Equal `pieces` and `buildings` produce equal hashes regardless of object key order or array reference identity.
- Adding or removing a `footprint` key on a piece that does not change the resolved footprint must NOT change the hash. The future `hashCity` implementation canonicalizes by computing the resolved footprint, not the raw `footprint` field.
- Mood changes do not change the hash.

REQ-013 ships with its own slice and tests; this section will gain a Build log entry when it lands.

## Limits

| Limit | Value | Rationale |
| --- | --- | --- |
| `MAX_PIECES_PER_CITY` | 256 | Enough for a v1 city loop and a few side streets. Bump in a follow-up if playtest reveals city-scale pressure. |
| `MAX_BUILDINGS_PER_CITY` | 512 | Two buildings per piece on average is plenty for visual fill. |

VibeRacer's `MAX_PIECES_PER_TRACK` is 64 because a track is a closed loop. VibeCity's pieces form an open street network and need more room.

## Out of scope for v1

- Per-piece metadata (color, decorations, custom material). Pieces are placeholder visuals in v1.
- Building footprints beyond 1x1 (Q-004 default B fences this).
- Per-city lighting overrides beyond `timeOfDay` / `weather`.
- Schema migration tooling. v1 is small enough that breaking changes can be handled by namespace bumps in `city:` keys.
- Versioning of mood-only changes (mood is excluded from the hash by design).

### Build log

- 2026-05-03: REQ-061 (`arc45`) and REQ-062 (`diagonal`) piece types added to `PieceTypeSchema`. Files: `src/lib/schemas.ts` (extended `PieceTypeSchema` enum from 11 to 13 members; comment block expanded to describe the cardinal-to-corner bridge role of arc45 and the corner-to-corner role of diagonal), `tests/lib/schemas.test.ts` (added cases for both new types at every cardinal rotation, optional single-cell footprint on arc45, rejection of non-cardinal rotations, and a CitySchema scenario chaining `straight -> arc45 -> diagonal -> diagonal -> arc45`). Mirrors the VibeRacer 2026-05-03 port. Connector validation, sampled centerlines, wheel contact, pace notes, and difficulty scoring stay deferred to FOLLOWUPS (no driving in VibeCity yet); the schema lands first so saved cities can record arc45 / diagonal placements ahead of the runtime port. PR #N.
- 2026-05-03: REQ-013 landed. Files: `src/lib/hashCity.ts` (`hashCity`, `canonicalCityJson`, internal `normalizedFootprint` / `isDefaultFootprint`), `tests/lib/hashCity.test.ts` (18 cases covering format, determinism, mood exclusion, footprint canonicalization, change detection). Mood is excluded from the digest. Footprint canonicalization dedupes, collapses `-0` to `0`, sorts by `(dr, dc)`, and omits the field when it resolves to the single-cell default. PR #N.
- 2026-05-03: REQ-012 landed. Files: `src/lib/schemas.ts` (`PieceTypeSchema`, `RotationSchema`, `PieceFootprintCellSchema`, `PieceSchema`, `BuildingTypeSchema`, `BuildingSchema`, `CityMoodSchema`, `CitySchema`, `EMPTY_CITY`, `MAX_PIECES_PER_CITY`, `MAX_BUILDINGS_PER_CITY`), `tests/lib/schemas.test.ts` (city / piece / building / mood cases). Verified `npm run type-check`, `npm run test`, `npm run build` all green. Dash check clean. PR #N.
