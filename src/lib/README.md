# `src/lib/` shared library code

Code under `src/lib/` is project-internal but reused across surfaces. The namespace is organized so new generic primitives have an obvious home and city-specific code stays out of the way of future-game ports.

## Generic namespaces (game-agnostic)

These directories contain pure helpers that have no dependency on the city schema or the city app tree. A future game (e.g. a VibeRacer port, a new builder) can import from any of these without dragging city code along.

| Directory | What lives here | v1 examples |
| --- | --- | --- |
| `audio/` | Web Audio rigs (oscillator + filter + gain wiring + per-frame `update`) | `engineAudio.ts`, `tireScreech.ts` |
| `auth/` | UUID v4 helpers, anonymous-cookie middleware factory | `uuidV4.ts`, `anonCookie.ts` |
| `editor/` | Generic editor primitives: undo/redo stack, autosave FSM | `history.ts`, `autosaveStatus.ts` |
| `format/` | Pure string formatters | `relativeTime.ts`, `countLabel.ts` |
| `input/` | Generic vehicle input plumbing: action vocabulary, default WASD/arrow bindings, key-set to input snapshot translator | `vehicleControls.ts` |
| `physics/` | Pure planar arcade vehicle integrator parameterized via `VehicleTuning` | `vehicle.ts` |
| `render/` | Pure rendering math (CSS transforms, chase camera, thumbnail projection, three.js defaults, cell-grid helpers) | `iso/projection.ts`, `iso/rotation.ts`, `cameraRig.ts`, `thumbnail.ts`, `scene.ts`, `grid.ts` |
| `share/` | Slug-based share-URL composition + clipboard-copy FSM | `index.ts` |
| `storage/` | Generic Upstash Redis client wrapper, SSR-safe localStorage helpers, versioned-envelope schema constructor | `kv.ts`, `localStorage.ts`, `versionedEnvelope.ts` |
| `ui/` | Pure UI state machines + visual constants | `pauseMenu.ts`, `transitionCurtain.ts` |

## City-specific modules

These live at the lib root because they are still shared across the city app surfaces (editor, drive scene, home page, route handlers) but are tightly coupled to the city schema.

| File | What it owns |
| --- | --- |
| `builderId.ts` | Anonymous owner id (REQ-009): VibeCity cookie name + the typed `BuilderId` wrapper around the generic `auth/uuidV4.ts` helpers. |
| `cellSize.ts` | World-space size of one grid cell (`CELL_SIZE = 4`). Single source of truth for both the drive scene and the trackPath geometry layer; `driveScene.ts` re-exports for backward compatibility. |
| `cityKv.ts` | `city:`-prefixed Redis key namespace + re-exports `getKv` / `hasKvConfigured` from `storage/kv.ts` for callsite ergonomics. |
| `cityCount.ts` | Wraps `format/countLabel.ts` with city-specific singular / plural / suffix labels for the home page header cue. |
| `cityThumbnail.ts` | Walks city pieces + buildings into placements, then delegates to `render/thumbnail.ts` for the home-page recent-card thumbnail. |
| `cityVersion.ts`, `hashCity.ts`, `loadCity.ts`, `recentSlugs.ts`, `recentVersions.ts`, `schemas.ts` | City persistence, hashing, and zod schemas. |
| `connectors.ts`, `trackPath.ts`, `wheelContact.ts` | Ports from VibeRacer's piece / track / wheel-contact substrate. |
| `controlsPersistence.ts` | Persisted controls envelope (REQ-043). Uses `storage/localStorage.ts` for the SSR-safe boundary. |
| `sim/` | Sim engine, solvers, schemas. City-coupled. |

## Wrapping pattern

Several lib-root modules are city-shaped wrappers around a generic core. The pattern: city wrapper builds a config object (or supplies city-specific labels) and re-exports the generic helpers under stable names so consumers of the wrapper do not have to learn two import paths. Examples:

- `cityCount.ts` -> `format/countLabel.ts`: city wrapper supplies `{ singular: 'city', plural: 'cities', suffix: 'so far' }`.
- `cityThumbnail.ts` -> `render/thumbnail.ts`: city wrapper gathers placements from city pieces + buildings, then delegates to `bboxNormalizedDots`.
- `builderId.ts` -> `auth/uuidV4.ts`: city wrapper holds the cookie-name constant, delegates the shape check + mint to the generic helpers.
- `cityKv.ts` -> `storage/kv.ts`: city wrapper owns the key-namespace map, re-exports the lazy Redis client.
- `controlsPersistence.ts` -> `storage/localStorage.ts`: city wrapper owns the schema + envelope name, delegates SSR-safe storage I/O to the generic helpers.
- `app/[slug]/driveControls.ts` -> `input/vehicleControls.ts` + `physics/vehicle.ts`: city wrapper builds a `VEHICLE_TUNING` object from `CELL_SIZE`-derived constants, pre-binds the lib integrator, re-exports `applyDriveStep` etc. under the same names.
- `app/[slug]/sceneTransition.ts` -> `ui/transitionCurtain.ts`: city wrapper holds the city target labels + testid prefix, re-exports the visual constants under the v1 `SCENE_TRANSITION_*` names.

## Test fakes

Test fakes live alongside the lib they fake under `tests/lib/<namespace>/`. The cross-game-portable fakes:

- `tests/lib/storage/_fakeKv.ts`: in-memory mirror of the Upstash Redis surface used by route-handler tests.

## Adding new code

When you add a new helper, check whether it depends on the city schema:

- **No city dependency** -> drop it into the appropriate generic namespace (or create a new one with a short reason in this README).
- **City-specific** -> keep it at the lib root.
- **Mixed (generic core + city-shaped wrapper)** -> follow the wrapping pattern above: the generic core lives in a generic namespace, and the city-shaped wrapper lives at the lib root (or inside `app/[slug]/`) and delegates.

The point of the split is that a future game-port branch only has to look at the lib-root files to understand what is city-specific. The generic namespaces stay portable.
