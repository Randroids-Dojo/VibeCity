---
title: "art: port VibeRacer procedural road surface (replaces per-piece mesh swap)"
status: closed
priority: 3
issue-type: task
created-at: "2026-05-09T11:39:35-05:00"
closed-at: "2026-05-10T17:48:36.323713-05:00"
close-reason: "shipped in PR #212: drive scene now renders one mesh per TrackPath segment via trackSurfaceGeometry; legacy per-piece quad loop dropped; arc45+diagonal deferred to F-003/F-004 as expected."
---

## Description

Replace VibeCity's per-piece colored quads (and the abandoned slice 3
Kenney piece mesh swap) with a port of VibeRacer's procedural road
surface. Result: every piece type (cardinals, smooth, advanced) renders
as one continuous triangle-strip ribbon that follows the sampled
centerline at the per-piece track width. One uniform look, no Kenney /
procedural visual seam.

This dot supersedes:

- `VibeCity-cardinal-piece-mesh-swap-6309e042.md` (slice 3, abandoned at
  PR #202)
- `VibeCity-smooth-and-advanced-piece-meshes-1f2ee509.md` (slice 4
  composite + custom mesh plan, abandoned)

## Reference

VibeRacer ships the road surface as a procedural ribbon, not as
per-piece meshes. The pieces involved:

- `../VibeRacer/src/game/trackPath.ts`: `OrderedPiece` carries
  `samples: SampledPoint[]` per cell. Each `SampledPoint` is
  `{ x, z, heading, t }` parameterized from entry (`t = 0`) to exit
  (`t = 1`). Per-type local sample sets (`SCURVE_LOCAL_SAMPLES`,
  `MEGA_SWEEP_RIGHT_LOCAL_SAMPLES`, `HAIRPIN_LOCAL_SAMPLES`, etc.) are
  generated once and reused via `transformSample` per placement.
- `../VibeRacer/src/game/sceneBuilder.ts:426 trackSurfaceGeometry(path)`:
  walks `continuousTrackSamples(path)`, generates two vertices per
  sample (left + right edge using `halfWidthAt(op, t)`), and stitches
  them into a triangle strip. Material is one
  `MeshStandardMaterial({ color, roughness: 0.9 })`.
- `../VibeRacer/src/game/trackWidth.ts`: per-piece half-width values.

## Slice plan

Three PR-sized slices:

### Slice A: port the sampled centerline geometry layer

This is the existing `VibeCity-implement-sampled-centerline-df63c74d.md`
dot. Land it first. It adds `SampledPoint` / `OrderedPiece.samples` and
the per-type local sample sets to `src/lib/trackPath.ts` for every
piece type currently in `PieceTypeSchema`. arc45 / diagonal samples
land in the sister dot `VibeCity-implement-arc45-diagonal-b4b77a2f.md`.

### Slice B: port the road surface ribbon

- Add `src/lib/render/trackSurface.ts` (game-agnostic per Rule 12).
  Exports `trackSurfaceGeometry(samples, halfWidthFor)` returning a
  three.js `BufferGeometry`. No city dependency; the caller passes in
  the sample array and a `(op, t) -> halfWidth` resolver.
- Add `src/lib/trackWidth.ts` (or extend an existing module): per-piece
  half-width. v1: one constant `DEFAULT_TRACK_HALF_WIDTH` so every
  piece is the same width; per-type overrides land in a follow-on if
  the visual reads thin or thick on certain types.
- Wire `DriveSceneClient.tsx`: drop the per-piece `PlaneGeometry` quad
  loop (and the slice 3 Kenney piece mesh swap). Build one mesh from
  `trackSurfaceGeometry(continuousTrackSamples(path), halfWidthFor)`,
  add to scene at `y = 0.01` to avoid z-fighting with the ground plane.
- Drop the `pieceMeshUrlFor` / `pieceMeshScale` / `pieceMeshExtraYaw`
  exports landed in slice 3.
- Asphalt color: copy VibeRacer's default `trackColor` (or pick a
  neutral that reads under the cream ground plane).

### Slice C: visual polish

Sidewalks, intersection details, and signage that blend with Kenney
buildings live in their own dot
(`VibeCity-explore-sidewalks-intersections-signage-9b26e94a.md`) so
this slice can ship the bare ribbon first and iterate.

## Asset cleanup

Delete `public/models/pieces/` entirely once slice B lands. The four
cardinal piece GLBs landed in slices 1+2 (PR #201) become unused
assets.

Per slice 1 we keep `public/models/pieces/Textures/colormap.png` only
if a follow-on slice (sidewalks / signage) reuses Kenney road art.
Otherwise drop it too.

## Verify

- [ ] All three sub-slices ship as separate PRs in slice-discipline order
- [ ] Existing piece-color helpers (`pieceColorFor`,
      `pieceFootprintWorldCells`) stay around or get cleanly retired
- [ ] Drive every piece type end-to-end: ribbon flows continuously
      through cardinals + smooth + advanced without visual breaks
- [ ] No regression on the off-street penalty or wheel contact tests
- [ ] `pieces/*.glb` assets removed from `public/models/`

## Dependencies

- Slice A (sampled centerline) is blocked only by reading
  `../VibeRacer/src/game/trackPath.ts`.
- Slice B is blocked by slice A.
- Slice C is blocked by slice B (and by the sidewalk-exploration dot
  resolving its open questions).
