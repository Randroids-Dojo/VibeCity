## 9. Drive Mode

**Status:** partial

The drive view is the second half of VibeCity's "build it, drive it, build more" loop. It lives at `/<slug>` (REQ-006) and renders the saved city as a three.js scene the author can drive around in. v1 ships an aerial / orbit scaffold so the build / drive round trip can be experienced ahead of a drivable car (REQ-031 onward); the physics, wheel contact, chase camera, and input slices land on top of that scaffold once the segment-based path (REQ-064) and multi-cell footprint plumbing (REQ-059) ship.

This file is the canonical spec for the drive-mode requirements (REQ-031 through REQ-039 plus REQ-053, REQ-054, REQ-055).

## Scene scaffold (REQ-044, REQ-045, REQ-046)

The scene is a raw three.js mount on a canvas the React component owns. The `WebGLRenderer` attaches to the canvas directly so the React tree controls mounting / unmounting. A noon-style lighting rig (ambient plus directional from above and slightly south-east) lights a flat ground plane sized large enough to read past the visible city. Street pieces render as flat colored quads on the grid; buildings render as extruded boxes with per-type heights and colors so the four placeholder primitives form a visible silhouette vocabulary from the orbit view. World coordinates use `CELL_SIZE = 4` to match VibeRacer's world-unit so a saved city is reusable across both projects.

## Camera (REQ-033)

v1 ships a fixed aerial / orbit camera that tilts down at the city center from a height proportional to `CELL_SIZE` so a small starter city fits in frame on first load. The chase camera (REQ-033) lands when the car ships; the v1 scaffold deliberately omits the VibeRacer chase rig to keep the slice tight.

## Input (REQ-034, REQ-035)

v1 ships no input handling. Keyboard and touch input land with the car (REQ-034 / REQ-035). The Edit CTA at the top right of the scene navigates back to `/<slug>/edit`; the slug label at the top left names the active city.

## Empty grid (REQ-053)

When the city has zero pieces and zero buildings the scene renders a friendly "Place a road first" prompt centered on the canvas with an Open editor link back to `/<slug>/edit`. The prompt is a DOM overlay (not a three.js text mesh) so it is screen-reader friendly and does not require a font texture in v1. The overlay declares `role="status"` with `aria-live="polite"` and exposes the `drive-empty-prompt` test id; the underlying three.js scene still renders the ground plane and lighting rig so the empty city does not appear broken.

## Out of scope for v1

- Lap timer, checkpoints, race HUD (REQ-037 anti-feature, explicit).
- Pause menu (REQ-039) and settings pane (REQ-040 onward).
- Off-street penalty (REQ-054), spawn anchor (REQ-036), and wheel contact (REQ-032). These wait for the car physics slice (REQ-031) since none of them produce visible behavior without a movable vehicle.
- Smooth client-side transition between drive and edit (REQ-055). The v1 round trip uses a standard `next/link` navigation; the prefetch that lands here makes Q-002 default C cheap to wire in a follow-up slice.

### Build log

- 2026-05-04: drive scene scaffold landed (REQ-044, REQ-045, REQ-046, REQ-053). Files: `src/app/[slug]/driveScene.ts` (new pure helper module: `CELL_SIZE = 4` matching VibeRacer world units, `SKY_COLOR` / `GROUND_COLOR` defaults, `AMBIENT_LIGHT_INTENSITY` / `DIRECTIONAL_LIGHT_INTENSITY` / `DIRECTIONAL_LIGHT_POSITION` for the noon lighting rig, `CAMERA_FOV` / `CAMERA_NEAR` / `CAMERA_FAR` / `CAMERA_HEIGHT` / `CAMERA_DISTANCE` for the aerial / orbit camera, `PIECE_GROUND_LIFT` to avoid z-fighting with the ground plane, `BUILDING_HEIGHTS` / `BUILDING_COLORS` per-type maps for the four placeholder building primitives, `PIECE_COLORS` partial map plus `DEFAULT_PIECE_COLOR` so any future piece type still renders without a code change, `pieceColorFor` / `buildingColorFor` / `buildingHeightFor` total lookups, `cellToWorld(row, col)` that maps grid cells to world `(x, z)` matching the editor convention, `cityWorldBounds(pieces, buildings)` that returns null for an empty city so the empty-state prompt branch is a single null check, `rotationToRadians`), `src/app/[slug]/DriveSceneClient.tsx` (new use-client three.js mount: builds the renderer / scene / camera, attaches the ambient + directional lights, lays down a ground plane at `y = 0`, renders street pieces as flat `PlaneGeometry` quads lifted by `PIECE_GROUND_LIFT` and rotated around the world Y axis by the persisted rotation, renders buildings as `BoxGeometry` extrusions sized to the cell footprint with per-type heights, fits the camera to the bounds center, exposes the slug label and Edit CTA in fixed-position DOM overlays, renders the empty-state prompt when the city has zero pieces and zero buildings, cleans up renderer / scene materials on unmount), `src/app/[slug]/page.tsx` (replaces the placeholder Create CTA landing with the drive scene scaffold: validates the slug, loads the saved city via `loadCity`, mounts `DriveSceneClient`). Tests: `tests/app/driveScene.test.ts` (new file: 27 cases covering the constants, `pieceColorFor` / `buildingColorFor` / `buildingHeightFor` totality and silhouette ordering, `cellToWorld` symmetry across the four cardinal directions, `rotationToRadians` for every 90deg increment, `cityWorldBounds` empty-city / single-piece / two-piece / multi-cell-footprint / building-only / mixed-pieces-and-buildings cases). `e2e/drive.spec.ts` (new file: drive scaffold renders the canvas with the slug label, the Edit CTA, and the empty-state prompt for a fresh slug; the prompt's Open editor link navigates back to `/<slug>/edit`). `package.json` adds `three` and `@types/three` (raw three, no R3F per AGENTS.md Rule 3). REQ-006 flips `partial` to `done` because the drive view route now loads and renders the saved city. REQ-044, REQ-045, REQ-046, REQ-053 flip `not_started` to `done`. PR #N.
