---
title: "implement: lit-window night ambience at intersections + buildings"
status: open
priority: 3
issue-type: task
created-at: "2026-05-05T21:21:59.724035-05:00"
---

## Description

When `CityMood.timeOfDay === 'night'`, the drive scene renders buildings with emissive window panels and intersection cells with street-lamp point lights. A pure visual layer with no simulation behavior: no power grid, no time-of-day cycling, no schedules. The mood field is already on the city schema (REQ-012) and excluded from the version hash (REQ-013) so adding this is non-breaking and stays inside the GDD fence ("track-mood / time-of-day / weather presets are reusable, but optional for v1" per `01-vision-and-pillars.md`).

## Context

User direction: "find the fun" + "real SimCity-like mechanics". Night-mode is the highest-readability city-life signal that does NOT cross the pillar 3 sim fence. A driver flips a city's mood from `day` to `night` and the city instantly looks alive (the easiest visible-from-the-car payoff in the backlog).

## Affected Files

- `src/app/[slug]/cityLighting.ts` (new pure module): exports `WINDOW_GLOW_COLOR`, `STREET_LAMP_COLOR`, `STREET_LAMP_INTENSITY`, `STREET_LAMP_DISTANCE`, `windowMeshesForBuilding(building)` returning a small set of `MeshBasicMaterial` quads positioned on building faces, `streetLampForIntersection(piece)` returning a `THREE.PointLight` at the intersection center
- `src/app/[slug]/driveScene.ts`: import the lighting module; in the building render loop, attach window meshes when `city.mood?.timeOfDay === 'night'`; in the piece render loop, attach street lamps for `intersection` pieces under the same condition
- `src/app/[slug]/DriveSceneClient.tsx`: pass `city.mood?.timeOfDay` through to the scene builder (already on the city object)
- `src/lib/schemas.ts`: tighten `CityMood.timeOfDay` to a literal union (`'day' | 'night' | 'dusk'`). The existing schema accepts an open string; this slice picks an enum
- A small UI control to flip mood lives in a follow-on slice; this slice ships only the render

## Implementation Notes

- Use `MeshBasicMaterial` with emissive color for windows, not a real light per window (would tank perf with N buildings).
- Street lamps cap at 8 simultaneous lights (one per intersection, max). If the city has more than 8 intersections, fall back to ambient brightness boost only.
- Keep `mood` excluded from `hashCity` (already true).
- A future `mood: 'rain'` etc. is out of scope for this slice.

## Verify

- [ ] `npm run type-check` / `npm run test` / `npm run build` all pass
- [ ] Dev server: place a small grid + an intersection on a slug; PUT a city payload with `mood: { timeOfDay: 'night' }`; reload drive view; see emissive windows + visible street lamp glow
- [ ] Day mode (default / no mood / `timeOfDay: 'day'`) renders identically to today's drive scene (no regression)
- [ ] Mood is still excluded from `hashCity` digest
- [ ] Schema migration: any pre-existing city with an undefined `timeOfDay` reads back as `day` (not an error)
