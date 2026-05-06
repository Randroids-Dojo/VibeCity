# 14. Citizens

**Status:** partial

Citizens are the agents that move into zoned residential space, work in commercial / industrial space, and produce the visible street-level life the player sees from inside the car. Without citizens, the city is geometry; with them, it is a place.

This file is the canonical spec for the citizens layer (REQ-075 through REQ-079).

## What this section covers

- **REQ-075** Citizen population. Each residential zone cell has a capacity (small-house = 4, mid-house = 12 per existing building taxonomy). Population is an integer per cell, never per-citizen-instance for v1. The "citizens" the player sees are render proxies, not addressable agents.
- **REQ-076** Citizen pedestrians. Sidewalk-adjacent residential and commercial cells spawn ambient pedestrian sprites that walk between cells. Pedestrians are pure render; they have no goals, no schedule, no path-finding. Density mirrors population.
- **REQ-077** NPC vehicle traffic. The existing `ambient AI traffic` dot ships as the citizen-vehicle layer: cars spawn at residential zones, follow placed streets, despawn at commercial / industrial zones. Loop closes; rerun. One vehicle per "trip" demand event from the population layer.
- **REQ-078** Trip demand. Each tick, a residential cell with population > 0 generates trip demand toward the nearest commercial / industrial cell. The trip demand is a single integer counter on the cell; the vehicle layer reads it and drains it as cars complete trips.
- **REQ-079** Population growth and decline. Residential zones grow toward capacity at a rate gated by available services (REQ-100 series), employment (REQ-080 series), and power (REQ-085 series). With no constraints, full capacity in ~30 in-game days. With constraints, growth slows or population leaves.

## Schema sketch

```ts
City.sim.population = {
  // Keyed by "row,col". Only present for cells with a residential zone.
  cells: Record<string, { residents: number; tripDemand: number }>
  totalPopulation: number
  totalTripDemand: number
}
```

## Out of scope for this section

- Per-citizen names, identities, schedules, social networks (out: violates the proxy-not-agent stance for v1).
- Citizen happiness as a per-citizen state (citizens are integers, not records; happiness is a per-cell average).
- Voice acting, citizen dialog (no text bubbles, no audio in v1).

### Build log

- 2026-05-06: REQ-075 citizens slice 1 of N landed (population bucket + density-tied growth + editor readout). Files: `src/lib/sim/state.ts` (tightened `PopulationBucketSchema` from passthrough to strict `{ cells: Record<key, { residents, tripDemand }>, totalPopulation, totalTripDemand }`; new `RESIDENTIAL_CAPACITY_BY_DENSITY` constant Record (density 0=0, 1=4, 2=12, 3=40 residents per cell; SimCity 2000 organic-growth taxonomy scaled to v1 numbers, tunable as the citizen happiness / employment layers ship), strict `PopulationCellSchema` with `residents` and `tripDemand` fields, `EMPTY_POPULATION_BUCKET = { cells: {}, totalPopulation: 0, totalTripDemand: 0 }` frozen at module load; `EMPTY_SIM_STATE.population` now points at `EMPTY_POPULATION_BUCKET` instead of `{}`), `src/lib/sim/events.ts` (extended `applyTick` to call new exported pure helper `syncPopulationToZones(population, zones)` on every growth tick (every `GROWTH_INTERVAL_TICKS` = 20 ticks); the helper iterates zone cells, sets residents = `RESIDENTIAL_CAPACITY_BY_DENSITY[zone.density]` for residential zones, ignores commercial / industrial cells (those will contribute to job slots in REQ-083 follow-on), removes population entries for cells that fell out of the zones map (eraseZone or retype), tracks a `changed` flag so an idempotent sync returns the input bucket reference, and recomputes `totalPopulation` + `totalTripDemand` summaries for HUD readouts. Non-growth ticks skip the sync entirely so the per-tick cost stays bounded; the eventual-consistency model means an eraseZone clears the population entry within ~5s at 1x), `src/app/[slug]/edit/EditorClient.tsx` (added `editor-sim-population` readout span next to the existing tick readout in the sim-speed toolbar with `data-sim-population` attribute mirroring `simState.population.totalPopulation`). Tests: `tests/lib/sim/state.test.ts` adjusted the per-bucket-empty-object assertion to drop population (population is now strict, not passthrough) and added a "population bucket initialized to empty cells + zero totals" case; the passthrough-acceptance case swapped from population to water (water is still passthrough so the test still proves the substrate-tightening pattern). `tests/lib/sim/events.test.ts` adds 8 new cases under "population follows zone density (REQ-075 slice 1)" covering: placeZone alone keeps residents 0 (density 0 = 0 capacity), first growth tick on a residential bumps to 4, subsequent growth ticks step through 12 then 40, commercial / industrial zones do not contribute to residents, totalPopulation sums across multi-cell residential, eraseZone clears the population entry on the next growth tick, paused sim does not advance population, two-replay determinism over a mixed event log. `e2e/sim.spec.ts` adds 1 new case "residential zone growth bumps population readout" that switches to 4x speed, paints a residential cell at origin, asserts pop=0 initially, waits up to 4s for the first growth tick (1.25s wall-time at 4x = 250ms / 4 per tick * 20 ticks), asserts pop=4. Verified `npm run type-check`, `npm test` (1903/1903), `npm run build`, `npm run check:dashes`, `git diff --check` all green; `npx playwright test e2e/sim.spec.ts --project=chromium` 11/11 local. Pedestrians (REQ-076), NPC vehicle traffic (REQ-077), trip demand counters (REQ-078), demand-gated growth (REQ-079) all stay deferred to follow-on slices. PR #N.
