---
title: "art: smooth + advanced street piece meshes (slice 4 of 6)"
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:50:52-05:00"
---

## Description

Fourth slice of the Kenney City Kit drop-in. Cover the nine piece types the
Kenney roads kit does not ship: `scurve`, `scurveLeft`, `sweepRight`,
`sweepLeft`, `megaSweepRight`, `megaSweepLeft`, `hairpin`, `arc45`, `diagonal`.

Decide per piece between (a) compositing from the cardinal mesh primitives
landed in slice 3 and (b) shipping a custom mesh in the Kenney aesthetic.

## Context

Kenney's road kits are built on cardinal grid moves: straight, 90deg turn,
intersection. None of the smooth or advanced VibeCity pieces fit that mould.
Two paths exist:

- **Composite**: render a smooth piece by stitching small straight + turn
  segments along the sampled centerline (which slice F-003 / the
  `implement-arc45-diagonal` dot will produce). Pro: zero new assets, the
  visual blends with cardinals automatically. Con: complex geometry, may look
  busy at scale, dependent on sampled-centerline work landing first.
- **Custom mesh**: model nine new pieces in Blender (or generate via
  Meshy.ai with a strict "Kenney City Kit aesthetic, flat colors, no
  textures, low poly, +Y up, +Z forward" prompt and clean up). Pro:
  decoupled from sampled-centerline work, ships independently. Con: nine new
  assets to maintain.

## Recommended split

- **Sub-slice 4a (composite)**: scurve, scurveLeft, sweepRight, sweepLeft,
  megaSweepRight, megaSweepLeft. These are smooth turns that read as "a
  straight road that gradually curves," which composites cleanly from short
  straight segments along the sampled centerline.
- **Sub-slice 4b (custom mesh)**: hairpin, arc45, diagonal. These have
  distinctive silhouettes that don't read right as composites; ship as
  bespoke .glb files matching the Kenney aesthetic.

Land 4a and 4b as separate PRs to keep diffs reviewable.

## Affected files (4a)

- `src/lib/render/pieceComposite.ts`: new generic helper that takes a
  sampled centerline and a per-segment piece mesh, returns a chained
  `THREE.Group` of instances. Lives in `render/` (no city dependency).
- `src/app/[slug]/driveScene.ts`: extend `pieceMeshUrlFor` (or add a
  composite-aware sibling) to return composite descriptors for these six
  types.
- `src/app/[slug]/DriveSceneClient.tsx`: route composite pieces through
  `pieceComposite`.
- `tests/lib/render/pieceComposite.test.ts`: instance count + bounding box
  assertions for representative samples.

## Affected files (4b)

- `public/models/pieces/hairpin.glb`, `arc45.glb`, `diagonal.glb`
- `public/models/KENNEY-LICENSE.txt`: append attribution if Kenney-derived,
  or a "VibeCity-original, CC0" line if generated.
- `src/app/[slug]/driveScene.ts`: `pieceMeshUrlFor` returns the new URLs.
- `tests/app/driveScene.test.ts`: every `PieceType` enum member now returns
  a non-null URL or composite descriptor.

## Verify

- [ ] Drive a city stuffed with one of every piece type. No procedural
      fallback box visible.
- [ ] Composite pieces visually flow into cardinal pieces at their
      connectors (no z-fighting, no width mismatch).
- [ ] Hairpin / arc45 / diagonal meshes match the Kenney aesthetic well
      enough that a player can't tell which slot they came from.
- [ ] Performance: drive scene maintains 60fps on a city with 200 pieces.

## Dependencies

- Slice 2: needs `loadGltfOnce` for sub-slice 4b.
- Slice 3: cardinal meshes must be live for composite alignment in 4a.
- Sub-slice 4a benefits from but does not strictly require the sampled
  centerline work in `implement-arc45-diagonal`. If composite alignment
  needs sampled paths, gate 4a until that ships.
