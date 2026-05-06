# 15. Zoning and Business

**Status:** partial

Zoning is how the player tells the sim "this area is for housing" / "this area is for shops" / "this area is for factories". The sim then grows buildings into the zoned cells based on demand from the citizens and economy layers. Business is the commercial and industrial layer that consumes labor and produces tax revenue.

This file is the canonical spec for the zoning + business layer (REQ-080 through REQ-084).

## What this section covers

- **REQ-080** Zoning categories. Three zone types replace the existing four placeholder building types: `residential`, `commercial`, `industrial`. Each is paintable on the sim grid in any cell that does NOT contain a street piece. Density is implicit in v1 (every zone cell starts low-density and grows; no separate low/medium/high paint).
- **REQ-081** Zone-to-building growth. Each tick, a zoned cell with met demand from the population layer grows a building. The building primitive replaces the existing flat building cell render: `residential` grows `small-house` then `mid-house` then `apartment` (new); `commercial` grows `shop` then `mall` (new); `industrial` grows `factory` then `plant` (new). Growth is one density step per N ticks.
- **REQ-082** Demand readout. The sim-as-primary view (REQ-110 series) surfaces the current R / C / I demand bars (SimCity 2000 standard). Demand is a function of population, available power, available water, services, and economy.
- **REQ-083** Job slots. Commercial and industrial cells expose job slots proportional to their density. Population layer trip demand reads the nearest open job slot.
- **REQ-084** Schema and persistence. Zones live on the existing `city.buildings` array as a discriminated union of zoned vs flat-placeholder cells; the v1 placeholder building types stay supported during a migration period (a city saved before the sim layer landed should still load and render).

## Schema sketch

```ts
Zone = {
  kind: 'residential' | 'commercial' | 'industrial'
  density: 0 | 1 | 2 | 3       // 0 = empty zoned cell, 3 = max
  row: number
  col: number
  // grown building shape derives from kind + density at render time
}

City.buildings now includes Zone in addition to the v1 placeholder types.
```

## Out of scope for this section

- Mixed-use zoning (a single cell that is both residential and commercial). Not in SimCity 2000 either.
- Zone density paint (low / medium / high). v1 grows organically from low to high.
- Per-building decoration variants. The grown building visual is determined by kind + density only.

### Build log

- 2026-05-06: REQ-080 zoning slice 1 of N landed (schema + placeZone/eraseZone events + reducer; first sim layer to plug into the substrate). Files: `src/lib/sim/state.ts` (tightened the `ZonesBucketSchema` from `z.object({}).passthrough()` to a strict `{ cells: Record<string, ZoneCell> }` shape; new `ZoneKindSchema` enum (residential / commercial / industrial), `ZoneDensitySchema` union (0..3), `ZoneCellSchema` strict `{ kind, density }`, `EMPTY_ZONES_BUCKET = { cells: {} }` frozen at module load, `zoneCellKey(row, col)` returning the `"row,col"` string matching the existing `streetCellSet` / `buildingCellSet` convention; `EMPTY_SIM_STATE.zones` now points at `EMPTY_ZONES_BUCKET` instead of the raw `{}`), `src/lib/sim/events.ts` (new strict `PlaceZoneEventSchema` and `EraseZoneEventSchema` carrying the `(kind, row, col)` and `(row, col)` payloads; added both to the `SimEventSchema` discriminated union; removed `placeZone` and `eraseZone` from the `PlaceholderLayerEventSchema` enum so the typed variants are routed there instead; added `applyPlaceZone` and `applyEraseZone` reducer cases to the `applySimEvent` dispatch; `applyPlaceZone` returns identity when the same kind is painted on an already-zoned cell, overwrites the kind on a retype, and preserves the existing density on retype so the per-tick growth reducer (REQ-081, follow-on slice) does not get reset by an editing player; `applyEraseZone` returns identity when the targeted cell is not zoned). The spec text in REQ-084 originally placed zones on the existing `city.buildings` array as a discriminated union; after Q-012 (event sourcing) resolved, the cleaner home is `city.sim.zones.cells` because the reducer is scoped to mutate sim state only. The legacy `city.buildings` array stays untouched for v1 placeholder buildings (small-house etc.); a future migration slice can lift those into the zone system when the visual divergence becomes a felt gap. Tests: `tests/lib/sim/state.test.ts` (added 25 new cases under ZoneKindSchema / ZoneDensitySchema / ZoneCellSchema / ZonesBucketSchema / EMPTY_ZONES_BUCKET / zoneCellKey covering accepts the three v1 kinds, rejects unknown kinds, density 0..3 accept and out-of-range reject, strict ZoneCell with bad-extras rejection, ZonesBucket with populated-cells acceptance and bad-kind rejection, EMPTY_ZONES_BUCKET shape and frozen invariant, zoneCellKey for zero / negative / convention-match), `tests/lib/sim/events.test.ts` (added 14 new cases: `placeZone` adds new cell at density 0, identity-on-same-kind-same-cell, kind-overwrite-on-retype, density-preserved-on-retype with a forged density-2 starting point, no-mutation, multi-cell-independent-positions, negative-coords; `eraseZone` identity-on-fresh-slug, removes-targeted-cell, only-removes-targeted, identity-on-nonexistent; `reduceSimEvents` over the full zoning vocabulary covering replay determinism and two-builder-id convergence; renamed the layer-specific forward-compat block to drop the placeZone test case since it is now strict). Verified `npm run type-check`, `npm test` (1802/1802), `npm run build`, `npm run check:dashes`, `git diff --check` all green. REQ-080 flips not_started to partial. The zone-painting UI (REQ-082 demand bars, the toolbar tab from REQ-112), per-tick growth reducer (REQ-081), and citizen demand integration (REQ-082) land in follow-on slices. PR #N.
