# 19. Services

**Status:** partial

Services are the buildings the player places to satisfy citizen needs that money alone does not. Each service has a coverage radius; cells outside the coverage degrade. Services include police, fire, hospitals, schools, garbage.

This file is the canonical spec for the services layer (REQ-100 through REQ-104).

## What this section covers

- **REQ-100** Service building placement. Five v1 service types: `police-station`, `fire-station`, `hospital`, `school`, `garbage-depot`. Each has a fixed coverage radius (in cell units) and a per-tick maintenance cost.
- **REQ-101** Coverage solver. Each tick, the engine computes coverage by service-type for every populated cell. A cell may be covered by multiple stations; coverage is binary per service-type (covered or not).
- **REQ-102** Citizen happiness from services. Each missing service-type docks happiness by N points. The aggregate happiness gates zone growth (REQ-081) and influences trip demand patterns.
- **REQ-103** Service-specific behaviors. Police lower crime accumulation per tick; fire reduce fire-disaster spawn rate (REQ-105); hospitals reduce sickness; schools raise property value over many ticks; garbage depots prevent garbage accumulation that lowers happiness.
- **REQ-104** Drive-mode visible signal. Service buildings are visibly distinct from the car. Police lights flash when crime is active; fire trucks dispatch from fire stations during fire events.

## Schema sketch

```ts
City.sim.services = {
  stations: Array<{ id: string; kind: ServiceKind; row: number; col: number; coverageCells: number }>
  cellCoverage: Record<string, Record<ServiceKind, boolean>>
  cellCrimeAccumulation: Record<string, number>
  cellGarbageAccumulation: Record<string, number>
}
```

## Out of scope for this section

- Service vehicle path-finding (police cars do not actually drive to the crime cell in v1; the lights flash in place).
- Service quality tiers (a basic clinic vs a hospital). v1 is binary: present or absent.
- Funding sliders per service. Maintenance cost is fixed per-tick.

### Build log

- 2026-05-06: REQ-100 services slice 2 of N landed (editor Services tab + 5 tools). Files: `src/app/[slug]/edit/editorState.ts` (extended `PaletteCategory` to include `'services'`; new `ServicePaletteToolType` union + `SERVICE_PALETTE` with 5 entries (Police / Fire / Hospital / School / Garbage), `DEFAULT_SERVICE_TOOL = 'police-station'` because police is the SimCity-canonical first-service-placed), `src/app/[slug]/edit/EditorClient.tsx` (added `selectedServiceTool` state, extended the tablist + label-resolver to include 'services', added a per-category palette branch rendering 5 service buttons with kind-distinct palette colors (police blue, fire red, hospital pink-red, school purple, garbage olive), extended `handleCellClick` to dispatch `EraseServiceBuildingEvent` (erase mode) or `PlaceServiceBuildingEvent` with kind from selectedServiceTool, passed `simState.services` to the SnapGrid as a new optional prop), `src/app/[slug]/edit/SnapGridView.tsx` (added optional `services?: ServicesBucket | null` prop; new `SERVICE_FILL` and `SERVICE_STROKE` constant Records per-kind matching the palette palette; renders each placed service as a `editor-service-building` overlay 4px-inset from cell with kind-distinct fill/stroke + `data-service-kind` / `data-service-row` / `data-service-col` attributes; layered after the power layer but before the connector glyphs so the place / erase ghosts and open-end warnings stay legible). Tests: `e2e/sim.spec.ts` adds 1 new case "Services tab exposes 5 tools and paints a hospital" that switches to Services category, asserts all 5 tools visible, asserts police is the default selected, switches to hospital, paints at (1,1), asserts the overlay appears with kind=hospital. Verified `npm run type-check`, `npm test` (1921/1921), `npm run build`, `npm run check:dashes`, `git diff --check` all green; `npx playwright test e2e/sim.spec.ts --project=chromium` 13/13 local. Coverage solver (REQ-101), per-kind happiness contribution (REQ-102), service-specific behaviors (REQ-103), and drive-mode visible signals (REQ-104) stay deferred to follow-on slices. PR #N.
- 2026-05-06: REQ-100 services slice 1 of N landed (schema + place/erase events + reducer; UI tab + tools defer to slice 2). Files: `src/lib/sim/state.ts` (new `ServiceKindSchema` enum (police-station / fire-station / hospital / school / garbage-depot), `SERVICE_COVERAGE_CELLS` per-kind radius constants (police 6, fire 6, hospital 8, school 5, garbage-depot 6), `SERVICE_MAINTENANCE_PER_TICK` per-kind upkeep (police 1.0, fire 1.0, hospital 1.5, school 0.8, garbage-depot 0.6) which the economy reducer in slice 2 will pull when applyEconomyTick reads from state.services, strict `ServiceBuildingSchema` with kind/row/col, strict `ServicesBucketSchema` carrying `buildings: ServiceBuilding[]`, `EMPTY_SERVICES_BUCKET` frozen with empty array; `EMPTY_SIM_STATE.services` now points at `EMPTY_SERVICES_BUCKET` instead of `{}`), `src/lib/sim/events.ts` (new strict `PlaceServiceBuildingEventSchema` and `EraseServiceBuildingEventSchema`; both move into the `SimEventSchema` discriminated union; the `PlaceholderLayerEventSchema` enum drops `placeServiceBuilding` and gains `spawnDisaster` (REQ-105) as the only remaining placeholder along with `placeWaterSource`. New reducer cases: `applyPlaceServiceBuilding` is idempotent on duplicate-anchor-and-kind, allows different kinds at the same anchor for v1 (the UI slice will add overlap validation against pieces / buildings / lines / plants / other services); `applyEraseServiceBuilding` removes any service at the cell and is identity when no service exists at the cell. Tests: `tests/lib/sim/state.test.ts` adds 1 case for the `EMPTY_SIM_STATE.services` strict shape (`{ buildings: [] }`). `tests/lib/sim/events.test.ts` adds 8 cases under "placeServiceBuilding + eraseServiceBuilding (REQ-100 slice 1)" covering: appends a single police-station, identity on duplicate anchor+kind, allows-different-kinds-at-same-anchor for v1, multi-service ordering across all 5 kinds, eraseServiceBuilding removes a placed service, identity when no service at cell, multi-kind erase removes all at the cell, two-replay determinism. The forward-compat layer test was reframed from placeServiceBuilding to spawnDisaster (REQ-105 not landed yet) since placeServiceBuilding is now strict. Verified `npm run type-check`, `npm test` (1921/1921), `npm run build`, `npm run check:dashes`, `git diff --check` all green. UI tab + 5 tools land in slice 2 (Services tab in editor with police / fire / hospital / school / garbage buttons; SnapGridView renders each service as a kind-distinct overlay). Coverage solver (REQ-101) and per-cell happiness contribution (REQ-102) land in subsequent slices. PR #N.
