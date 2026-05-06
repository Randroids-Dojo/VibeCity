# 17. Water and Sewage

**Status:** partial

Water is the second gating utility for zone growth. Same shape as power: plants pump water, pipes transmit, cells consume. Sewage is the dual: cells produce waste, sewage pipes route to treatment, untreated waste tanks citizen happiness.

This file is the canonical spec for the water + sewage layer (REQ-090 through REQ-094).

## What this section covers

- **REQ-090** Water source placement. v1 source types: `water-tower` (small, 50 units) and `pump-station` (large, 200 units, requires placement near a water tile when terrain ships). Editor toolbar `Water` tab.
- **REQ-091** Water pipes. Single-cell pipe pieces, snap-grid, like power lines but visually distinct (blue tint).
- **REQ-092** Sewage layer. Each populated cell produces N waste per tick. Waste flows toward the nearest connected `sewage-treatment` plant via dedicated sewage-pipe cells. Untreated waste accumulates and tanks happiness.
- **REQ-093** Connectivity solver. Mirrors REQ-087 (power) shape: per-tick connected-component sum.
- **REQ-094** Drive-mode visible signal. Water towers are visible from the car (tall cylindrical primitives). Sewage plants are large and unmistakable. Underground pipes are NOT visible in drive mode (placement-only signal).

## Schema sketch

```ts
City.sim.water = {
  sources: Array<{ id: string; kind: 'water-tower' | 'pump-station'; row: number; col: number; capacityUnits: number }>
  pipes: Array<{ row: number; col: number; kind: 'water' | 'sewage' }>
  treatmentPlants: Array<{ id: string; row: number; col: number; capacityUnits: number }>
  cellWaterStatus: Record<string, 'served' | 'unserved'>
  cellWasteAccumulation: Record<string, number>
}
```

## Out of scope for this section

- Terrain water (rivers, lakes). v1 is flat ground; pump-stations work anywhere until terrain ships.
- Per-pipe diameter, flow rate physics. Treat as connected-component capacity sum.

### Build log

- 2026-05-06: REQ-090 water slice 2 of N landed (editor Water tab + 4 tools). Files: `src/app/[slug]/edit/editorState.ts` (extended `PaletteCategory` to include `'water'`; new `WaterPaletteToolType` union (4 entries: `source-water-tower` / `source-pump-station` / `pipe-water` / `pipe-sewage`), `WATER_PALETTE` constant, `DEFAULT_WATER_TOOL = 'pipe-water'` because pipe edits dominate water-grid placement), `src/app/[slug]/edit/EditorClient.tsx` (added `selectedWaterTool` state, extended the tablist + label-resolver to include 'water' (Water label), added a per-category palette branch rendering 4 water buttons with kind-distinct palette colors (water-tower light blue, pump-station deep blue, water pipe bright blue, sewage pipe brown), extended `handleCellClick` to dispatch `EraseWaterPipeEvent` (erase mode) or branch on the selected tool: source tools dispatch `PlaceWaterSourceEvent`, pipe tools dispatch `RunWaterPipeEvent` with the kind discriminator, passed `simState.water` to the SnapGrid as a new optional prop), `src/app/[slug]/edit/SnapGridView.tsx` (added optional `water?: WaterBucket | null` prop; new `WATER_SOURCE_FILL` / `WATER_SOURCE_STROKE` and `WATER_PIPE_FILL` / `WATER_PIPE_STROKE` constant Records; renders each pipe cell as a 50%-cell-size kind-tinted square overlay (water = bright blue, sewage = brown) with `editor-water-pipe` testid plus `data-water-pipe-row` / `data-water-pipe-col` / `data-water-pipe-kind` attributes; renders each source as an `editor-water-source` overlay 4px-inset from cell with kind-distinct fill/stroke + `data-water-source-kind` attribute; both layers render after the services layer but before the connector glyphs so the place / erase ghosts and open-end warnings stay legible). Tests: `e2e/sim.spec.ts` adds 1 new case "Water tab exposes 4 tools and paints a water tower + pipe" that switches to Water category, asserts all 4 tools visible, asserts pipe-water is the default selected, switches to source-water-tower and paints at (0,0) (source overlay appears), switches to pipe-water and paints at (0,1) (water pipe overlay appears with kind=water), switches to pipe-sewage and paints at (1,0) (sewage pipe overlay appears with kind=sewage). Verified `npm run type-check`, `npm test` (1951/1951), `npm run build`, `npm run check:dashes`, `git diff --check` all green; `npx playwright test e2e/sim.spec.ts --project=chromium` 15/15 local. Connectivity solver mirroring `powerSolver.ts` pattern (REQ-093) lands in slice 3, sewage waste accumulation (REQ-092) in slice 4, drive-visible water towers + sewage plants (REQ-094) in slice 5. PR #N.
- 2026-05-06: REQ-090 water slice 1 of N landed (schema + place/erase events + reducer; UI + connectivity solver defer to slices 2/3). Files: `src/lib/sim/state.ts` (new `WaterSourceKindSchema` (water-tower / pump-station), `WATER_SOURCE_CAPACITY` per-kind (water-tower 50, pump-station 200), `WATER_PIPE_MAINTENANCE_PER_TICK = 0.04` and `WATER_SOURCE_MAINTENANCE_PER_TICK` per-kind (water-tower 0.3, pump-station 0.8) for the economy reducer to pull in slice 2, `WaterPipeKindSchema` (water / sewage), strict `WaterSourceSchema` and `WaterBucketSchema` (`{ sources: WaterSource[], pipes: Record<key, WaterPipeKind> }`), `EMPTY_WATER_BUCKET` frozen, `waterPipeKey` matching the existing convention; `EMPTY_SIM_STATE.water` now points at `EMPTY_WATER_BUCKET` instead of `{}`), `src/lib/sim/events.ts` (3 new strict event schemas: `PlaceWaterSourceEventSchema` carrying kind/row/col, `RunWaterPipeEventSchema` carrying kind/row/col, `EraseWaterPipeEventSchema` carrying row/col; all routed in the `SimEventSchema` discriminated union; the `PlaceholderLayerEventSchema` enum drops `placeWaterSource` since the typed variants now route it; only `spawnDisaster` (REQ-105) remains as a forward-compat placeholder. New reducer cases: `applyPlaceWaterSource` idempotent on duplicate anchor+kind allowing different kinds at the same anchor for v1, `applyRunWaterPipe` returns identity on duplicate-same-kind and overwrites kind on different-kind-same-cell so a player retyping water -> sewage at one cell flips cleanly, `applyEraseWaterPipe` removes any pipe (water or sewage) at the cell). Tests: `tests/lib/sim/state.test.ts` adds 1 case for the strict `EMPTY_SIM_STATE.water` shape (`{ sources: [], pipes: {} }`); the passthrough-acceptance case swapped from water to disasters (disasters is the only remaining passthrough bucket). `tests/lib/sim/events.test.ts` adds 9 cases under "water layer events (REQ-090 slice 1)" covering: appends a single water tower, identity on duplicate source anchor+kind, runs a water pipe, runs a sewage pipe, identity on duplicate same-kind, overwrites kind on different-kind-same-cell, eraseWaterPipe removes a placed pipe, eraseWaterPipe identity on missing, two-replay determinism over a mixed water event log. Verified `npm run type-check`, `npm test` (1951/1951), `npm run build`, `npm run check:dashes`, `git diff --check` all green. UI tab + 4 tools (water-tower, pump-station, water pipe, sewage pipe) land in slice 2, connectivity solver mirroring `powerSolver.ts` pattern lands in slice 3, drive-visible water towers + sewage plants + pollution-from-coal land in subsequent slices. PR #N.
