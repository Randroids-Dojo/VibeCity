---
title: "art: source and inventory Kenney City Kit assets (slice 1 of 6)"
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:50:52-05:00"
---

## Description

First slice of the Kenney City Kit drop-in art pass. Assets only, no code.
Download the three relevant Kenney kits, pick the specific meshes that map to
each `BuildingType` and `PieceType`, normalize them, and land them under
`public/models/` with refreshed license bookkeeping. Subsequent slices wire
them into the drive scene and editor.

## Context

Today the drive scene renders buildings and street pieces as `BoxGeometry` with
hardcoded color tables (`buildingColorFor`, `pieceColorFor` in
`src/app/[slug]/driveScene.ts`). The only real mesh is `public/models/car.glb`
(Kenney Car Kit 3.1, CC0). The chosen art direction is a Kenney drop-in so the
buildings and street pieces match the existing car aesthetic.

Source kits (all CC0):

- Kenney City Kit (Suburban): https://kenney.nl/assets/city-kit-suburban
- Kenney City Kit (Commercial): https://kenney.nl/assets/city-kit-commercial
- Kenney City Kit (Roads): https://kenney.nl/assets/city-kit-roads

## Mesh selection

Pick exactly one mesh per slot for v1; variants come later.

Buildings (4 slots, from BuildingTypeSchema):

- `small-house`: Suburban kit, single-story house with garage.
- `mid-house`: Suburban kit, two-story house.
- `shop`: Commercial kit, low-rise shopfront.
- `factory`: Commercial kit, warehouse / industrial block.

Street pieces (cardinal: 4 slots, from PieceTypeSchema):

- `straight`: Roads kit, straight road (single cell).
- `left90`: Roads kit, 90deg turn (left).
- `right90`: Roads kit, 90deg turn (right).
- `intersection`: Roads kit, 4-way intersection.

Smooth and advanced pieces (9 slots: scurve, scurveLeft, sweepRight,
sweepLeft, megaSweepRight, megaSweepLeft, hairpin, arc45, diagonal): mostly
not in the Kenney roads kit. Defer mesh selection to slice 4 of this art pass,
which decides per-piece between (a) compositing from straight + turn primitives
or (b) shipping a per-piece custom mesh in the same flat-color aesthetic.

## Normalization

Per asset before commit:

- Origin at the cell center, sitting on `y = 0`.
- Units in scene-meters such that one cell footprint matches `CELL_SIZE`.
  Verify against the existing car (which already sits at the right scale).
- +Z forward for street pieces (so rotation 0 means "extending along the world
  +Z axis"). Match the existing piece-frame convention used by `editorPreview`.
- Single mesh per `.glb` file. No animations, no extra cameras, no lights.
- Keep each kit's `Textures/colormap.png` alongside its exported GLBs in
  the kit's own subdirectory. Each Kenney City Kit ships a different
  palette under the same relative `Textures/colormap.png` URI, so they
  cannot share one folder. The car kit's existing
  `public/models/Textures/colormap.png` stays where it is for the car;
  the new kit textures land at
  `public/models/buildings/{suburban,commercial}/Textures/colormap.png`
  and `public/models/pieces/Textures/colormap.png`.

## Affected files

- `public/models/buildings/suburban/small-house.glb`,
  `public/models/buildings/suburban/mid-house.glb`,
  `public/models/buildings/commercial/shop.glb`,
  `public/models/buildings/commercial/factory.glb`
- `public/models/pieces/straight.glb`, `left90.glb`, `right90.glb`,
  `intersection.glb`
- `public/models/buildings/suburban/Textures/colormap.png`,
  `public/models/buildings/commercial/Textures/colormap.png`,
  `public/models/pieces/Textures/colormap.png` (each kit ships its own
  palette under the same `Textures/colormap.png` relative URI, so the
  textures live in the kit's subdirectory rather than a single shared
  `public/models/Textures/`)
- `public/models/KENNEY-LICENSE.txt`: append the three new kit credits
- `src/lib/README.md`: art credits section refresh

## Verify

- [ ] Each new `.glb` opens in Blender / a glb viewer at the right scale
- [ ] No mesh exceeds 2k tris (Kenney kits are well under this; sanity-check)
- [ ] Total `public/models/` size still under 2 MB after compression
- [ ] License file lists all three new kits with original Kenney URLs and CC0
- [ ] No code changes in this slice (the wiring lands in the next dot)

## Dependencies

None. Asset-only slice. Unblocks slice 2 (mesh cache + building swap).
