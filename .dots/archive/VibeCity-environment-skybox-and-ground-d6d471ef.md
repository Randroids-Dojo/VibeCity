---
title: "art: environment polish (skybox, ground tint, fog) (slice 6 of 6)"
status: closed
priority: 4
issue-type: task
created-at: "2026-05-08T23:50:52-05:00"
closed-at: "2026-05-10T23:30:00-05:00"
close-reason: "fog shipped in PR #217; ground was already cream from the original drive-scene scaffold (premise that it read as default three.js gray was stale); skybox + optional Kenney decorations need asset sourcing / license review and remain deferred. The originally-bundled scope is no longer a single coherent dot. Reopen with a tighter scope (specific asset, specific quality bar) when ready."
---

## Description

Final slice of the Kenney City Kit drop-in. With buildings and pieces now
rendered as Kenney meshes, the empty cells and sky read as flat gray
nothingness. Add a low-cost environment pass: skybox, tinted ground plane,
fog tuning, and a few Kenney prop sprinkles (trees, lamp posts) on empty
cells so a half-built city still looks alive.

## Context

Once meshes ship for buildings and pieces (slices 2-4), the visual gap between
mesh-rendered cells and procedural empty cells widens. A cheap environment
pass closes that gap without committing to per-cell terrain art.

Three pieces:

- **Skybox**: a single Kenney "City Kit Suburban" skybox (or a procedural
  gradient if Kenney's doesn't fit the iso camera angle).
- **Ground**: tinted ground plane with subtle grid hint where cells exist.
  Today the ground reads as default three.js gray; a soft green / brown tint
  matches the Kenney palette.
- **Fog**: distance fog already exists in `lib/render/scene.ts` defaults; tune
  the color and density to blend with the new skybox so the city horizon
  doesn't pop.
- **Optional cell decorations**: instance Kenney trees / lamp posts on empty
  cells at low density (5-10% coverage). Skip if it adds visual noise; v1 is
  low risk to defer.

## Affected files

- `public/models/environment/skybox.glb` (or `.png` cubemap, depending on
  Kenney source)
- `public/models/environment/tree.glb`, `lamp-post.glb` (optional, behind a
  feature flag)
- `src/app/[slug]/DriveSceneClient.tsx`: load skybox, set ground tint, tune
  fog
- `src/lib/render/scene.ts`: expose ground color + fog params (currently
  scene defaults are baked in)
- `tests/lib/render/scene.test.ts`: extend coverage for the new params

## Verify

- [ ] Drive an empty slug. Sky, ground, and fog read as a coherent scene
      rather than three.js defaults.
- [ ] Drive a fully-built city. Buildings sit on the tinted ground without
      z-fighting; horizon blends through fog into the skybox.
- [ ] Optional decorations (if shipped) read as scenery, not gameplay
      obstacles. Verify the player car cannot get stuck on a tree.
- [ ] No measurable framerate regression from the skybox / ground swap on a
      200-piece city.

## Dependencies

- None hard. Most useful after slices 2-4 land so the new ground / sky read
  against mesh-rendered cells.
