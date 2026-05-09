---
title: "art: explore sidewalks + intersection details + signage that blend with buildings"
status: open
priority: 4
issue-type: research
created-at: "2026-05-09T11:39:35-05:00"
---

## Description

Open exploration. Once VibeRacer's procedural road ribbon ships
(`VibeCity-port-viberacer-procedural-roads-bcee89d0.md`), the road
surface is a clean colored strip. That reads "racetrack" more than
"city street." Layer in the urban detail that bridges the road and
the Kenney City Kit buildings:

- **Sidewalks**: a slightly-raised strip running parallel to the road
  edge on both sides. Two candidate approaches: a second triangle strip
  offset outward from the road surface, or a per-cell quad anchored to
  the building side of the cell. The exploration picks one.
- **Intersection details**: crosswalk markings (parallel white stripes
  at intersection arms), stop lines, optionally a traffic-light pole.
- **Signage**: street-name signs, stop signs at intersection arms,
  no-parking signs along straights. Procedural text on canvas
  textures (mirrors VibeRacer's racing-number plate pattern in
  `sceneBuilder.ts`).

This is research, not implementation. Output: a recommended approach
plus the implementation slice(s) it spawns.

## Open questions

- **Sidewalk geometry**: extra triangle strip offset from the road
  ribbon? Or per-cell anchored quads keyed to the building side?
  Kenney's road-side.glb is the visual reference.
- **Sidewalks at intersection cells**: how do four intersecting
  sidewalks meet at the corner? VibeRacer skips this entirely; cities
  notice it.
- **Crosswalk asset source**: bake one canvas texture (procedural,
  reusable across intersections) or a small Kenney-style decal asset?
- **Signage density**: every intersection arm? Every Nth cell? Author
  control, or always-on?
- **Lit at night**: signage and crosswalk markings should pick up the
  existing time-of-day palette; figure out whether to fade them with
  ambient or keep them at full intensity for legibility.
- **Performance**: every intersection adding 4 sidewalk corners + 4
  crosswalks + N signs scales linearly with intersection count. At
  what city size does the per-frame cost matter?

## Reference points

- `../VibeRacer/src/game/sceneBuilder.ts:1204` `KerbLayer`: VibeRacer's
  inside-corner kerb tile pattern. Same general approach (per-cell
  quads laid along the curve) could repurpose for sidewalk corners.
- `../VibeRacer/src/game/sceneBuilder.ts:497-602` racing-number canvas
  pattern: how to bake procedural text into a texture without shipping
  per-string assets.
- Kenney City Kit Roads has unused assets that could donate visual
  language (sidewalks, crosswalks, traffic lights, street signs)
  without us modeling from scratch. Inventory them when the slice
  starts:
  - `road-side.glb`, `road-bend-sidewalk.glb`,
    `road-curve-pavement.glb` (sidewalk variants of the road meshes)
  - `light-curved.glb`, `light-square.glb` (street lamps with arms)
  - the Roads kit ships various traffic signs / cones

## Deliverable

Write the implementation dot (or dots) once the open questions
resolve. Recommended-default each open question per AGENTS.md Rule 7
so the implementation slice can ship under the documented assumption.

Stays open until the procedural road ribbon lands (slice B in the
sister dot); blocked by that.

## Dependencies

- Blocked by slice B in `VibeCity-port-viberacer-procedural-roads-bcee89d0.md`.
- Independent of the other art-pass dots (buildings, environment,
  iso editor parity).
