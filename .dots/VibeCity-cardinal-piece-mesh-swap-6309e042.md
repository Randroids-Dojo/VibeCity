---
title: "art: cardinal street piece mesh swap (slice 3 of 6)"
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:50:52-05:00"
---

## Description

Third slice of the Kenney City Kit drop-in. Swap the four cardinal street
piece types (`straight`, `left90`, `right90`, `intersection`) from
`BoxGeometry` colored slabs to the Kenney meshes landed in slice 1. Reuses
the `loadGltfOnce` cache from slice 2.

The remaining nine piece types (scurves, sweeps, mega sweeps, hairpin, arc45,
diagonal) are deferred to slice 4 because they need either compositing or
custom meshes outside the Kenney roads kit.

## Context

Cardinal pieces are the most-used types in any city and the cleanest 1:1 map
to the Kenney roads kit. Shipping these first gets the visual lift on the
critical mass of pieces while slice 4 figures out the smooth / advanced piece
solution.

Blocked-by: slice 2 (`mesh cache + building swap`).

## Approach

1. Add `pieceMeshUrlFor(type, rotation)` to `driveScene.ts`. Return a URL for
   the four cardinal piece types and `null` for everything else.
2. In `DriveSceneClient.tsx`, mirror the building swap pattern: try mesh
   first, fall back to `BoxGeometry` colored slab on null / failure. Pieces
   that return null (smooth + advanced) keep the existing procedural render
   until slice 4.
3. Confirm rotation handling. Kenney's roads kit defaults to one orientation;
   the other three rotations come from `THREE.Object3D.rotation.y`. Apply the
   piece's `rotation` field exactly as the procedural path does today.
4. Spot-check intersection mesh against the four-arm requirement. VibeRacer's
   intersection is three-arm; ours is four-arm (REQ-019). Kenney's standard
   crossroads is four-way, which fits.

## Affected files

- `src/app/[slug]/driveScene.ts`: add `pieceMeshUrlFor(type, rotation)` with
  cardinal-only coverage
- `src/app/[slug]/DriveSceneClient.tsx`: piece render path swaps to mesh
  when `pieceMeshUrlFor` returns a URL; fallback preserved
- `tests/app/driveScene.test.ts`: assert exactly the four cardinal types
  return non-null URLs; smooth + advanced types return null

## Verify

- [ ] Drive a city with a straight + left90 + right90 + intersection cluster.
      All four render as Kenney meshes at the correct scale and rotation.
- [ ] Drive a city that mixes cardinals with smooth pieces (scurve, sweep).
      Cardinals are mesh, smooth still procedural; no z-fighting at the
      transitions.
- [ ] Editor preview unchanged (slice 5 owns editor parity).
- [ ] Saved cities load without error.

## Dependencies

- Slice 2: needs `loadGltfOnce`.
- Parallel-safe with slice 4 once slice 2 ships, but recommend serial for
  reviewable diffs.
