---
title: "art: iso editor preview parity with mesh-based drive scene (slice 5 of 6)"
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:50:52-05:00"
---

## Status note (2026-05-09)

The piece-sprite half of this slice (cardinal piece top-down sprites
for the editor preview) becomes moot when the procedural road ribbon
ships (`VibeCity-port-viberacer-procedural-roads-bcee89d0.md`); the
editor's iso preview will need a different parity strategy for the
ribbon. The building-sprite half stays valid. Re-scope when the
procedural roads land.

## Description

Fifth slice of the Kenney City Kit drop-in. The drive scene now renders
buildings and pieces as Kenney meshes (slices 2, 3, 4); the iso editor still
shows colored top-down slabs. Bring the editor preview into visual parity so
players see what they're building.

## Context

The editor lives at `src/app/[slug]/edit/EditorClient.tsx` (2082 lines) plus
`SnapGridView.tsx` (964 lines). Today both render placed pieces and buildings
using flat colored fills derived from `pieceColorFor` /
`buildingColorFor` / `buildingRoofColorFor`. After slices 2-4 ship, the drive
scene uses Kenney meshes; the editor needs the same visual identity so players
build with confidence.

Two implementation paths:

- **Path A: re-use the mesh in the iso editor**. The editor's iso projection
  is a fixed angle, so a small three.js scene per visible cell could render
  the actual `.glb` to a cached canvas / texture. Visually identical to the
  drive scene; expensive at first paint and complex to invalidate.
- **Path B: ship paired top-down sprites**. Render each Kenney mesh once
  offline (Blender bake or a one-time three.js render-to-PNG), commit the
  resulting top-down sprites under `public/models/buildings/iso/` and
  `public/models/pieces/iso/`, and the editor draws sprites instead of
  colored fills. Cheap, deterministic, but nine + four sprites to maintain.

Recommend Path B for v1 (no runtime three.js in the editor; the editor stays
2D). Revisit if the sprite approach diverges from the mesh aesthetic.

Blocked-by: slices 2 and 3 at minimum (so the editor reflects the cardinals
and buildings that are already mesh-based). Slice 4 not strictly required;
this slice can ship sprites for cardinals + buildings first and pick up
smooth + advanced sprites in a follow-on.

## Approach

1. Bake top-down sprites for the four building types and the four cardinal
   pieces. Use the same iso angle the editor renders at so sprites slot in
   without re-projection.
2. Add `buildingSpriteUrlFor(type)` / `pieceSpriteUrlFor(type, rotation)`
   alongside the color helpers in `driveScene.ts` (or a new sibling
   `editorPreviewArt.ts` if separating concerns is cleaner).
3. In `SnapGridView.tsx`, render an `<image>` (SVG or canvas) per placed
   building / piece when the sprite URL is non-null; fall back to the colored
   fill otherwise.
4. Keep the placement preview ghost rendering in its current colored form for
   a clear distinction between "ghost" and "placed".

## Affected files

- `public/models/buildings/iso/*.png` (4 sprites)
- `public/models/pieces/iso/*.png` (4 cardinal sprites; smooth + advanced in
  a follow-on)
- `src/app/[slug]/driveScene.ts` (or `editorPreviewArt.ts`): sprite URL
  helpers
- `src/app/[slug]/edit/SnapGridView.tsx`: render sprite when URL is non-null
- `tests/app/edit/SnapGridView.test.tsx`: assert sprite is rendered for
  building / cardinal piece, fallback for unsupported types

## Verify

- [ ] Editor visually matches drive scene for the four buildings and four
      cardinal pieces.
- [ ] Smooth + advanced pieces still render as colored fills (until follow-on).
- [ ] Editor placement, rotation, and selection still work; sprite is just a
      visual swap, no behavior change.
- [ ] No regression in editor performance with a 200-piece city.

## Dependencies

- Slices 2 and 3: required so the cardinals + buildings are real meshes.
- Slice 4: nice-to-have so smooth + advanced sprites can ship in this slice
  rather than a follow-on.
