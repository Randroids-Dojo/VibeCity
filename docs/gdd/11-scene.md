## 11. Scene

**Status:** partial

The three.js scene is the visual surface the drive view renders against. v1 ships a placeholder scene that swaps colored quads and extruded boxes for textured glyphs in a future polish slice; the goal of v1 is the build / drive round trip, not the visual fidelity of the city.

This file is the canonical spec for the scene requirements (REQ-044 through REQ-047).

## Lighting and ground (REQ-044)

The scene uses a noon-style lighting rig: an ambient light at 0.6 intensity keeps unlit faces from going pure black, and a directional key light at 0.9 intensity from `(60, 100, 40)` reads as the noon sun from the south-east so extruded buildings cast a believable shadowless lift. The renderer clears to a muted blue sky color (`SKY_COLOR = 0xbfd9e8`); the ground plane fills the world below `y = 0` with a warm sand / cream (`GROUND_COLOR = 0xf2ecd9`) that matches the editor's snap-grid background so the drive view feels like the same world the editor draws.

## Street pieces (REQ-045)

Street pieces render as flat colored `PlaneGeometry` quads at the cell center, lifted by `PIECE_GROUND_LIFT = 0.02` to avoid z-fighting with the ground plane and rotated around the world Y axis by the persisted rotation. v1 uses a single asphalt-grey palette per type group (cardinal basics darkest, intersections lightest) so the shape vocabulary reads from the orbit view; per-piece glyphs (curve outlines, intersection crosswalks, sweep arcs) wait for the textured visuals slice. Multi-cell footprints (REQ-059) and sampled centerlines (F-003) wait for the drive runtime port.

## Buildings (REQ-046)

Buildings render as `BoxGeometry` extrusions sized to the cell footprint with per-type heights and colors so the four placeholder primitives form a visible silhouette vocabulary from the orbit view: small house shortest, factory tallest, shop and mid-house in between with distinct hues. Boxes are anchored at the cell center on the ground plane and rotated around the world Y axis by the persisted rotation. Multi-cell building footprints (Q-004 option C) wait until playtest signal.

## Vehicle (REQ-047)

Out of scope for v1. The car ships with the drive scene runtime slices (REQ-031 onward).

## Out of scope for v1

- Per-piece textured glyphs (curve outlines, crosswalks, lane markings).
- Building decorations (windows, roofs, chimneys).
- Environment props (trees, signs, traffic lights).
- Sky dome mesh; v1 uses the renderer clear color.
- Shadow casting; v1 lighting is shadowless to keep the renderer cheap.

### Build log

- 2026-05-04: scene scaffold landed (REQ-044 ground / sky / lights, REQ-045 street pieces, REQ-046 building extrusions). Files: `src/app/[slug]/driveScene.ts` (helper module owns `SKY_COLOR`, `GROUND_COLOR`, ambient / directional intensities and position, camera defaults, `BUILDING_HEIGHTS` / `BUILDING_COLORS` / `PIECE_COLORS` maps, `cellToWorld` and `rotationToRadians` conversions, `cityWorldBounds` for camera fit and the empty-state branch), `src/app/[slug]/DriveSceneClient.tsx` (use-client three.js mount that owns the renderer / scene / camera lifecycle, lights, ground plane, per-piece quad meshes, per-building box meshes, and resize handling), `src/app/[slug]/page.tsx` (slug landing now mounts the scaffold instead of the Create CTA placeholder), `tests/app/driveScene.test.ts` (helper-module coverage for constants, color and height totality, world-coordinate conversions, bounds), `e2e/drive.spec.ts` (Playwright smoke that confirms the canvas mounts and the empty-state prompt renders for a fresh slug). PR #N.
