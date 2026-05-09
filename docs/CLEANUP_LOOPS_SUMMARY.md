# Cleanup Loops Summary

Three 10-round cleanup loops shipped between 2026-05-08 and 2026-05-09 reorganized `src/lib/` and surrounding code so future games can import the generic primitives without dragging the city schema along. This file is the index. The full per-round detail lives in `docs/PROGRESS_LOG.md`; the namespace map and wrapping pattern live in `src/lib/README.md`; the contribution rule lives in `AGENTS.md` Rule 12.

## Loop 1 (R1 to R10): seed the namespaces

| # | PR | Net effect |
| --- | --- | --- |
| R1 | #171 | `src/lib/render/iso/{projection,rotation}.ts` (iso projection + rotation helpers) |
| R2 | #172 | `src/lib/editor/history.ts` (undo/redo stack) |
| R3 | #173 | `src/lib/editor/autosaveStatus.ts` (FSM split from city equality) |
| R4 | #174 | `src/lib/share/index.ts` (slug share-URL composition + clipboard FSM) |
| R5 | #175 | `src/lib/format/relativeTime.ts` (relative-time formatter) |
| R6 | #176 | `src/lib/storage/kv.ts` + `src/lib/cityKv.ts` (KV client wrapper split from city keys) |
| R7 | #177 | `src/lib/format/countLabel.ts` (generic pluralized count formatter) |
| R8 | #178 | `src/lib/auth/uuidV4.ts` (generic UUID v4 helpers) |
| R9 | #179 | `src/lib/render/thumbnail.ts` (generic bbox-to-normalized projector) |
| R10 | #180 | `src/lib/README.md` (namespace map for the new lib structure) |

## Loop 2 (R11 to R20): expand into audio + ui + storage primitives

| # | PR | Net effect |
| --- | --- | --- |
| R11 | #181 | `src/lib/auth/anonCookie.ts` (generic Next.js cookie middleware factory) |
| R12 | #182 | `src/lib/storage/{localStorage,versionedEnvelope}.ts` (SSR-safe storage primitives) |
| R13 | #183 | `src/lib/audio/engineAudio.ts` (Web Audio engine rig, parameterized via maxSpeed) |
| R14 | #184 | `src/lib/audio/tireScreech.ts` (Web Audio screech rig) |
| R15 | #185 | `src/lib/render/cameraRig.ts` (chase camera rig + `chaseCameraDefaults` factory) |
| R16 | #186 | `src/lib/ui/pauseMenu.ts` (pause state machine) |
| R17 | #187 | `tests/lib/storage/_fakeKv.ts` (test fake relocated alongside the lib it fakes) |
| R18 | #188 | Knip pass 1: drop unused `readBuilderId` + downgrade `DEFAULT_RECENT_SLUGS_LIMIT` to internal |
| R19 | #189 | Drop `export` from 6 unused type aliases |
| R20 | #190 | `src/lib/README.md` refresh: cover the new `audio/` and `ui/` rows |

## Loop 3 (R21 to R30): finish the substrate, codify the convention

| # | PR | Net effect |
| --- | --- | --- |
| R21 | #191 | `src/lib/ui/transitionCurtain.ts` (generic curtain visual constants) |
| R22 | #192 | `src/lib/render/grid.ts` (generic `cellKey` + `GridCellCoord`, removes 2 private dupes) |
| R23 | #193 | `src/lib/input/vehicleControls.ts` (action vocabulary + key bindings + input snapshot) |
| R24 | #194 | `src/lib/physics/vehicle.ts` (planar arcade integrator parameterized via `VehicleTuning`) |
| R25 | #195 | `src/lib/render/scene.ts` (three.js scene defaults: lighting, camera FOV / near / far) |
| R26 | #196 | `src/lib/README.md` refresh + new "Wrapping pattern" section cataloguing the 7 city wrappers |
| R27 | #197 | `docs/GDD_COVERAGE.json` audit: 13 stale paths repaired |
| R28 | #198 | Knip pass 2: drop `DriveAction` re-export + `PieceFootprintCellSchema` export |
| R29 | #199 | `AGENTS.md` Rule 12 codifies the `src/lib/` decision tree |
| R30 | #200 | This summary doc |

## Final lib namespace

Ten generic namespaces shipped (each row in `src/lib/README.md` has a one-line description and example modules):

- `audio/`: engine + tire-screech Web Audio rigs
- `auth/`: UUID v4 + anonymous-cookie middleware factory
- `editor/`: undo/redo history + autosave FSM
- `format/`: relative-time + count-label formatters
- `input/`: vehicle action vocabulary + keyboard bindings + input snapshot
- `physics/`: planar arcade vehicle integrator
- `render/`: iso projection + rotation, chase camera rig, thumbnail projector, three.js scene defaults, cell-grid helpers
- `share/`: slug share-URL composition + clipboard-copy FSM
- `storage/`: Upstash Redis client wrapper, SSR-safe localStorage helpers, versioned-envelope schema
- `ui/`: pause menu state machine, transition curtain visual constants

## Test count

Vitest grew from 2310 cases (start of loop 1) to 2416 cases (end of loop 3): +106 tests across the three loops, almost all of them new generic-helper coverage in `tests/lib/<namespace>/`.

## What stayed deferred

- `gridViewport.ts` extraction (R5 deferred, still deferred): heavily coupled to the city's `snapGrid.ts` cell math + `GRID_PIXEL_SIZE`. A future game with a different cell size could revisit.
- Touch input plumbing (R16 considered): `touchInput.ts` and `touchSettings.ts` are coupled to `DriveInput` and the city's controls layer. The dual-stick / single-stick mapper bakes in the city action vocabulary; a future shared touch-input library would need its own slice.
- Drive scene piece / building rendering: `driveScene.ts` ships building extrusion heights + colors and piece colors that are city-specific. The lighting / camera defaults moved to `lib/render/scene.ts` (R25) but the rest stays.
- Sim engine substrate (`src/lib/sim/`): heavily coupled to the city schema (zones, power, water, services). A future game would need to fork or build alongside.

## Open knip findings (false-positive suppressions)

- `eslint`, `eslint-config-next` flagged as unused devDeps. Used by `next lint`.
- Sim event schemas + `*Panel` `DEFAULT_*` constants flagged as unused. Used via zod composition or dynamic import.
- `chaseCameraDefaults` + `CAMERA_RIG_UNIT_SIZE` flagged as unused. Forward-looking exports for future games with a different unit size.
- `MAX_RECENT_VERSIONS_LIMIT` flagged as a duplicate export. R18 attempted to drop the duplicate but the test suite imports it via `await import(...)` which knip cannot trace.
