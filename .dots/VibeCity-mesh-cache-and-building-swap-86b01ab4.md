---
title: "art: GLTF mesh cache + building mesh swap (slice 2 of 6)"
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:50:52-05:00"
---

## Description

Second slice of the Kenney City Kit drop-in. Add a generic GLTF cache loader
modelled on the existing single-car loader, then swap the four building types
in `driveScene.ts` from `BoxGeometry` to the meshes landed in slice 1.

## Context

`DriveSceneClient.tsx:1339` already constructs a `GLTFLoader` and a
`carGltfPromise` cache for the single car model. This slice generalizes that
pattern so any model URL can be loaded once and instanced. Buildings are the
first consumer; street pieces (slices 3 and 4) reuse the same cache.

Blocked-by: slice 1 (`source kenney city kit assets`).

## Approach

1. Extract a generic `loadGltfOnce(loader, url): Promise<GLTF | null>` cache.
   Loader is parameterized so the module stays three.js-agnostic (testable
   without dragging `GLTFLoader` into a Node test env). Errors are caught,
   logged once, and resolved as `null` so callers must handle a `null`
   return to fall back to procedural geometry. Lives in
   `src/lib/render/gltfCache.ts` so future games can reuse it (Rule 12: no
   city dependency, drop into `render/`).
2. Add a `BuildingType -> mesh URL` map next to `buildingColorFor` in
   `driveScene.ts` (city-specific mapping stays at city scope).
3. In `DriveSceneClient.tsx`, when a building is rendered:
   - Try the mesh path first via `loadGltfOnce`.
   - On promise resolution, instance the mesh at the building's grid position
     with its rotation applied.
   - On null / load failure, fall back to the existing `BoxGeometry` path so a
     missing asset never blocks the scene.
4. Drop the procedural per-building `BoxGeometry` body **only** when all four
   meshes are confirmed loading. Keep `buildingColorFor` and
   `buildingRoofColorFor` exported (they're still used by editor preview and
   thumbnails until those swap).

## Affected files

- `src/lib/render/gltfCache.ts`: new generic loader cache
- `src/app/[slug]/driveScene.ts`: add `buildingMeshUrlFor(type)`; keep color
  helpers exported for the editor and thumbnail paths
- `src/app/[slug]/DriveSceneClient.tsx`: replace per-building extrusion with
  cached-mesh instancing; preserve fallback
- `tests/lib/render/gltfCache.test.ts`: cache hit + cache miss + load failure
  cases (mock GLTFLoader)
- `tests/app/driveScene.test.ts`: assert `buildingMeshUrlFor` returns a URL
  for every `BuildingType` enum member

## Verify

- [ ] Drive any saved city. All four building types render as Kenney meshes.
- [ ] Loading the same scene twice does not re-fetch the .glb (cache hits).
- [ ] If you delete `public/models/buildings/factory.glb` and rebuild, factory
      tiles fall back to the colored box without crashing the scene.
- [ ] Iso editor preview is unaffected (still procedural top-down) since
      slice 5 owns the editor-side parity.
- [ ] No regression in `tests/app/driveScene.test.ts` color helpers.

## Dependencies

- Slice 1: assets must exist at the expected paths.
- Unblocks slices 3 and 4 (street piece mesh swap), which will reuse
  `loadGltfOnce`.
