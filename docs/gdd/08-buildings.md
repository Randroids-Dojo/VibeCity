# 8. Buildings

**Status:** partial

Buildings are the second placement layer in the VibeCity editor. They share the snap grid with street pieces but live in their own array on the city schema (`city.buildings`) so the persistence hash, the editor reducers, and the future drive-mode collision treatment can address them separately. v1 ships placeholder primitive types only (Q-004 default B); simulation behavior (residential / commercial demand, trips, jobs) is explicitly out of scope.

This file is the canonical spec for the building requirements (REQ-028 through REQ-030).

## Building palette (REQ-028)

The building palette exposes four placeholder primitive types from `BuildingTypeSchema`:

- `small-house`
- `mid-house`
- `shop`
- `factory`

Each is single-cell (Q-004 default B). Multi-cell footprints (Q-004 option C) wait until the loop is fun and we have real playtest signal that the visual variety matters.

The editor toolbar exposes a category switcher with two tabs (Streets / Buildings). The street and building palettes share the click-to-place tool and the rotate / erase / undo / redo / autosave / Drive controls; only the palette buttons themselves swap based on the active category. The category switcher carries `role="tablist"` with `editor-palette-category-street` and `editor-palette-category-building` test ids; the active tab is reflected via `aria-selected` and a `data-palette-category` attribute.

## Tools

- Place building (REQ-028, REQ-029): in building category, click an empty cell to place the currently-selected building type. The reducer rejects placements on cells already occupied by a street piece OR another building so the two layers never stack.
- Rotate (REQ-029): the same rotate tool that powers street pieces (REQ-021) feeds into building placement; the active rotation is recorded on the placed building. v1 buildings render as flat colored cells in the editor SVG, so the rotation has no visible effect there yet, but the value is persisted so the future drive-mode render (REQ-046) can orient the extruded building.
- Erase (REQ-029): the same erase tool that powers street pieces (REQ-022) feeds into building erase. In erase mode plus building category, a click on a building cell removes that building. Clicks on empty cells or piece cells are no-ops while in building category. Switching the category in erase mode swaps which array a click affects.
- Drive collision (REQ-030, deferred): in drive mode, building cells are treated as off-street with the same penalty as off-grid driving (drag plus max-speed cap, Q-005 default A). Lands with the drive scene scaffold.

## Visual treatment

In the editor SVG, building cells render with a distinct olive fill (`#6b7d4a`) so they read differently from street piece cells (`#7d6b4a`). Each cell exposes a `data-cell-occupied-kind` attribute (`piece` / `building` / `none`) so e2e tests and future visual layers can branch on the occupied kind without re-deriving it from the city.

## Out of scope for v1

- Multi-cell building footprints (Q-004 option C).
- Per-building metadata (color, decorations, sub-type).
- Simulation behavior (population, jobs, trips, demand). v1 buildings are visual variety only.
- Hard-wall collision against the car (Q-005 default A: cell-level off-street penalty only).

### Build log

- 2026-05-04: REQ-030 (building cell collision penalty) landed under Q-005 default A. Files: `src/app/[slug]/buildingCollision.ts` (new pure module: `BUILDING_PENALTY_MAX_SPEED = CELL_SIZE * 2`, `BUILDING_PENALTY_MAX_REVERSE_SPEED = CELL_SIZE * 1`, `BUILDING_PENALTY_DRAG = CELL_SIZE * 12` tuning constants; `worldToCell(x, z)` rounds world coords to integer cell coords matching `cellToWorld`; `buildingCellSet(buildings)` builds a `Set<string>` keyed by `"row,col"` for constant-time lookup; `isOnBuildingCell(x, z, set)` returns true when the world position falls on a building cell; `applyBuildingPenalty(state, onBuildingCell, dt)` returns the input state unchanged when off building or for non-positive dt, otherwise drags the speed magnitude toward zero by `BUILDING_PENALTY_DRAG * dt` and clamps to the penalty caps). `src/app/[slug]/DriveSceneClient.tsx` (memoizes the building cell set with `useMemo`, calls `applyBuildingPenalty(vehicle, onBuilding, dt)` after `applyDriveStep` each tick, mirrors the live flag onto the scene root as `data-on-building='true' | 'false'`). Tests: `tests/app/buildingCollision.test.ts` (28 cases covering the constants invariants, `worldToCell` cell-center / negative / half-cell / nearest-rounding cases, `buildingCellSet` empty / multi-building / fresh-set / namespace cases, `isOnBuildingCell` empty-set / hit / miss / off-center / next-cell cases, `applyBuildingPenalty` pass-through / non-positive dt / forward-cap / reverse-cap / forward-drag / reverse-drag / small-positive-clamp-to-zero / small-negative-clamp-to-zero / position-immutability / no-mutation / sustained-throttle cases). `e2e/drive.spec.ts` (asserts `data-on-building='false'` on both the scaffold and empty-state specs since the playwright webServer runs without KV so `loadCity` returns the empty city). REQ-030 flips `not_started` to `done`. PR #N.

- 2026-05-04: REQ-028 + REQ-029 (building palette and place / rotate / erase parity) landed. Files: `src/app/[slug]/edit/editorState.ts` (added `PaletteCategory` union and `DEFAULT_PALETTE_CATEGORY = 'street'`, `BUILDING_PALETTE` with four single-cell placeholder types, `DEFAULT_BUILDING_TYPE = 'small-house'`, pure `placeBuilding(city, type, row, col, rotation?)` reducer that rejects on overlap with any piece footprint cell or any existing building cell, pure `eraseBuilding(city, row, col)` reducer that returns identity when no building covers the cell so callers branch on `next === city`), `src/app/[slug]/edit/snapGrid.ts` (added `occupiedBuildingCells(city)` helper paralleling `occupiedPieceCells`), `src/app/[slug]/edit/SnapGridView.tsx` (renders building cells with the olive fill and exposes `data-cell-occupied-kind` plus the `data-building-count` attribute on the SVG root), `src/app/[slug]/edit/EditorClient.tsx` (added category switcher with `editor-palette-category` test id and `editor-palette-category-street` / `editor-palette-category-building` per-tab test ids, separate `selectedBuildingType` state seeded from `DEFAULT_BUILDING_TYPE`, palette buttons swap based on the active category, click handler dispatches `placeBuilding` / `eraseBuilding` when in building category, the same rotate / erase / undo / redo / autosave / Drive controls service both categories, piece-count readout grows to include `Buildings placed: N` whenever any building is on the grid), `src/app/[slug]/edit/page.tsx` (CTA copy now mentions the Streets / Buildings category switch). Tests: extended `tests/app/snapGrid.test.ts` with `occupiedBuildingCells` cases (5 cases: empty city, four-building aggregation, parallel-pieces exclusion, dedupe, negative coordinates) and a "does not include building cells" guard on `occupiedPieceCells`. Extended `tests/app/editorState.test.ts` with palette / default coverage (4 BUILDING_PALETTE assertions, DEFAULT_BUILDING_TYPE, DEFAULT_PALETTE_CATEGORY) and `placeBuilding` / `eraseBuilding` reducer cases (12 placeBuilding cases including overlap with pieces, overlap with buildings, multi-cell piece footprint rejection, immutability, schema validity; 11 eraseBuilding cases including identity short-circuit, no-piece-touch, deterministic two-share-cell, round-trip, schema validity). Extended `e2e/editor.spec.ts` with a `/building-palette-spec/edit` spec that walks the category switch, places a piece then a building, asserts overlap rejection in both directions, switches building types, exercises erase in both categories, and confirms rotation flows through to building placement. PR #N.
