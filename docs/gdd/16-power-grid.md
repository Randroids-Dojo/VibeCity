# 16. Power Grid

**Status:** partial

Power is the first gating utility for zone growth. A zoned cell without power growth-stalls; an existing populated cell without power browns out, citizens get unhappy, and the cell decays. Power is generated at plants, transmitted via lines, and consumed per-zone-cell.

This file is the canonical spec for the power layer (REQ-085 through REQ-089).

## What this section covers

- **REQ-085** Power plant placement. Two v1 plant types: `coal` (cheap, dirty, 100MW) and `solar` (expensive, clean, 30MW). Plants are 2x2 multi-cell footprint pieces. Placement is via a new `Power` toolbar tab in the editor, alongside Streets / Buildings.
- **REQ-086** Power lines. Power flows through dedicated power-line cells (single-cell, snap-grid, like streets). Lines have a `voltage` notion only insofar as line cells form a connected component; a connected zone cell receives power from any plant in that component. No transformer / substation chain in v1.
- **REQ-087** Connectivity solver. Each tick, the engine computes which zone cells are connected to which plants via lines, sums plant capacity per connected component, divides among demanding cells. A cell is "powered" if its component has remaining capacity; "browned out" otherwise.
- **REQ-088** Drive-mode visible signal. From the car, a powered residential cell at night shows lit windows (the existing lit-window dot, REQ-110 will land it on this signal). A browned-out cell shows dark windows. Power lines are visibly wired in the drive view.
- **REQ-089** Pollution from plants. `coal` plants emit a per-tick pollution value into adjacent cells. Pollution feeds into citizen happiness (REQ-079) and zone growth gates (REQ-081).

## Schema sketch

```ts
City.sim.power = {
  plants: Array<{ id: string; kind: 'coal' | 'solar'; row: number; col: number; capacityMW: number }>
  lines: Array<{ row: number; col: number }>      // single-cell line pieces
  cellPowerStatus: Record<string, 'powered' | 'brownout' | 'unpowered'>
  pollution: Record<string, number>               // per-cell pollution score
}
```

## Out of scope for this section

- Wind / nuclear / hydro plant types (defer to v1.1 once coal / solar feel right).
- Per-line voltage class, transformers, substations. v1 is "connected component sums capacity".
- Power outages from disasters (lives in disasters layer, REQ-105 series).

### Build log

- 2026-05-06: REQ-085 power slice 1 of N landed (schema + place/erase events + reducer; second sim layer to plug into the substrate after REQ-080 zoning). Files: `src/lib/sim/state.ts` (new `PowerPlantKindSchema` enum (coal / solar), `POWER_PLANT_CAPACITY_MW` constant Record (coal 100 MW, solar 30 MW per spec), strict `PowerPlantSchema` with kind/row/col, strict `PowerBucketSchema` with `plants: PowerPlant[]` and `lines: Record<"row,col", true>`, `EMPTY_POWER_BUCKET = { plants: [], lines: {} }` frozen at module load, `powerLineKey(row, col)` returning `"row,col"` matching the existing zoneCellKey / streetCellSet convention; `EMPTY_SIM_STATE.power` now points at `EMPTY_POWER_BUCKET` instead of `{}`), `src/lib/sim/events.ts` (new strict `PlacePowerPlantEventSchema` carrying `(kind, row, col)`, `RunPowerLineEventSchema` carrying `(row, col)`, `EraseLineEventSchema` carrying `(row, col)`; all three move into the `SimEventSchema` discriminated union; the `PlaceholderLayerEventSchema` enum drops `placePowerPlant` / `runPowerLine` / `eraseLine` since the typed variants now route them; the placeholder list shrinks to `placeWaterSource` / `placeServiceBuilding` / `spawnDisaster`. New reducer cases: `applyPlacePowerPlant` appends plants to the array (idempotent on duplicate-anchor-and-kind clicks; allows multiple plants of different kinds at the same anchor for v1, stricter overwrite semantics defer to a follow-on if playtest reveals the need); `applyRunPowerLine` adds a line cell (identity on duplicate); `applyEraseLine` removes a line cell (identity when no line at cell). Multi-cell plant footprints (REQ-085 spec text 2x2) record only the anchor cell in slice 1; the resolution lands with the UI slice (slice 3) which needs footprint validation against pieces / buildings / lines / other plants. Connectivity solver (REQ-087) lands in slice 2; per-cell powered/brownout/unpowered classification + lit-windows-at-night drive signal (REQ-088) lands in slice 4 once the solver is in place. Tests: `tests/lib/sim/state.test.ts` adds 18 new cases under PowerPlantKindSchema (accepts coal/solar, rejects nuclear/wind), POWER_PLANT_CAPACITY_MW (coal 100, solar 30, coal > solar invariant), PowerPlantSchema (origin, negative coords, strict-extras-rejected, non-integer-coords-rejected), PowerBucketSchema (empty/populated/strict-extras/bad-line-value), EMPTY_POWER_BUCKET (shape/schema/frozen), powerLineKey (matches zoneCellKey convention). `tests/lib/sim/events.test.ts` adds 13 new cases under placePowerPlant (appends to empty bucket, identity on duplicate, allows-different-kinds-at-same-anchor for v1, multi-plant ordering, no-mutation, preserves zones/other buckets) and runPowerLine + eraseLine (single line add, duplicate identity, multi-line, eraseLine identity-on-missing, eraseLine removes-targeted, only-removes-targeted, two-replay determinism over a mixed power-event log); the existing forward-compat layer test was reframed to placeServiceBuilding (REQ-100 not landed yet). Verified `npm run type-check`, `npm test` (1842/1842), `npm run build`, `npm run check:dashes`, `git diff --check` all green. REQ-085 flips not_started to partial. UI tools (Power tab in editor with plant/line buttons), 2x2 footprint validation, connectivity solver (REQ-087), per-cell power-status calc, lit-windows drive signal (REQ-088), pollution (REQ-089) all stay deferred to their own dots. PR #N.
