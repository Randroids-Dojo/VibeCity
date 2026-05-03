# 1. Vision and Pillars

**Status:** done

**Pitch.** A toy-feeling city builder you can actually drive around in. Visit a slug, place streets and buildings on a snap grid, then flip to drive mode and cruise the city you just made. Every URL is somebody's city. No login wall. Build a little, drive a little, build some more.

**Design pillars.**

1. **Build it. Drive it. Build more.** The build / drive toggle is the entire game. The bar to feel a placement decision is one click, not a save and reload round trip. If a road feels wrong, you flip back, fix it, flip again, in seconds.
2. **Your city, your URL.** Every slug in the domain is somebody's city. Anyone can visit, drive it, fork it into a new slug. No account wall. The URL is the share link.
3. **Core first, sim later.** v1 is freeform city-shaped roads you can place and drive on. Power, water, zoning, citizens, traffic AI, taxes, demand curves, disasters live in `99-out-of-scope.md` until the core build / drive loop is fun. Layered ambition stays out of v1 by contract.

## What this product is

- A snap-grid editor for streets and buildings, modeled on VibeRacer's track editor.
- A drive mode that spawns the player's car onto the placed streets and lets them roam. No laps, no checkpoints, no objective.
- A per-slug persistence layer keyed by URL slug, so a city built at `/<slug>` is reachable by anyone who visits that slug.
- A reuse of VibeRacer's vehicle integrator, wheel contact, camera rig, and input mapping. The car shipped in v1 of VibeRacer is the car shipped in v1 of VibeCity, tuned for slow city cruising rather than racing.

## What this product is NOT (in v1)

- Not a SimCity clone. No power, water, zoning, citizens, traffic AI, taxes, demand curves, disasters, or economy in v1. These belong in `99-out-of-scope.md` until the core build / drive loop is fun.
- Not a racing game. No laps, no checkpoints, no leaderboards. The drive mode is for cruising and feeling the city, not competing.
- Not multiplayer. One car, one driver, one URL. Multiplayer is a stretch goal, not a v1 commitment.
- Not an asset showcase. Buildings and props are placeholder primitives in v1. Visual polish is a P1 audit pass after the core loop is fun, not a precondition.

## Voice and feel

- Toy-like, cartoony, snap-clicky. Same surface VibeRacer uses.
- Three-second on-ramp: visit a URL, place a road, drive on it. If a new player cannot do that without reading anything, the on-ramp is broken.
- Driving feel is a load-bearing pillar of the build phase. A road that drives badly is a road the player will rebuild. The editor exists to make rebuilding cheap.

## Reuse from VibeRacer

The port is not a fork. VibeCity ships its own copy of these modules so future divergence (vehicles tuned for slow city cruising, cameras tuned for orbit-around-the-city) does not break VibeRacer.

- **Vehicle physics:** `src/game/physics.ts` (planar arcade integrator with throttle, brake, steer, friction, reverse).
- **Wheel contact:** `src/game/wheelContact.ts` (per-wheel grid surface lookup, on-track / off-track penalty model). VibeCity reuses this verbatim with streets as the on-surface grid.
- **Camera rig:** `src/game/sceneBuilder.ts` (`initCameraRig`, `updateCameraRig`, the six camera presets in `src/lib/cameraPresets.ts`).
- **Input mapping:** `src/hooks/useKeyboard.ts`, `src/hooks/useTouchControls.ts`, `src/lib/controlSettings.ts`.
- **Snap-grid editor model:** `src/components/TrackEditor.tsx` placement, rotation, footprint, and selection shape; `src/lib/schemas.ts` piece + footprint structure; `src/game/editorHistory.ts` undo / redo.
- **Phase 0 piece plumbing:** VibeRacer's track system has just landed `src/game/trackFootprint.ts` (multi-cell footprints), `src/game/trackPath.ts` (segment-based path with `cellToLocators`), and 8-direction connectors in `src/game/track.ts`. VibeCity inherits this plumbing on day one because the building palette and the eventual 4-way intersection both need multi-cell footprints and segment-aware paths.
- **Phase 1 piece taxonomy:** VibeRacer is rolling out long-turn pieces in PR-sized phases. Mega Sweep (3x3, 90deg) is shipping in PR #80 and is in scope for VibeCity v1. Hairpin (2x3, 180deg), 45-arc (2x2, cardinal-to-corner bridge), and diagonal (1x1, corner-to-corner) are planned upstream and will be adopted in VibeCity as they ship. See `docs/OPEN_QUESTIONS.md#Q-006` for the adoption-cadence policy.
- **Phase 3 junction pattern:** VibeRacer's planned `junction` piece type (3 open connectors, single cell) is the upstream precedent for VibeCity's required 4-way intersection. VibeCity extends the pattern with a fourth connector; VibeCity's intersection is a superset of VibeRacer's junction.
- **Slug routing and persistence:** `src/app/[slug]/page.tsx`, `src/app/[slug]/edit/page.tsx`, the `track:${slug}:*` Redis key shape adapted to `city:${slug}:*`.
- **Settings pane and racer ID cookie:** `src/components/SettingsPane.tsx`, `src/lib/racerId.ts`, `src/lib/initials.ts`.

What VibeCity does NOT reuse from VibeRacer:

- Lap detection, checkpoint validation, leaderboard submit, anti-cheat (`src/game/tick.ts` lap logic, `src/lib/validateLap.ts`, leaderboard API routes). The drive mode in VibeCity has no laps.
- The race-flow countdown and HUD chrome.
- The track-mood / time-of-day / weather presets are reusable, but optional for v1.

## Out of scope, indexed

See `99-out-of-scope.md` for the full fence. Headlines:

- SimCity layers: power, water, zoning, citizens, traffic AI, economy, disasters.
- Racing layers: laps, checkpoints, leaderboards, anti-cheat, lap submission.
- Multiplayer (more than one car at a slug at the same time).
- Account wall, login, social graph.
- Mobile-native build (web-first; touch controls inherited from VibeRacer).
- Asset polish (custom car models, custom buildings, music) until the core loop ships.

The loop must not scope-creep into items listed there without explicit user approval.

### Build log

- 2026-05-03: Reuse map sharpened to track VibeRacer's Phase 0 piece plumbing (multi-cell footprint, segment-based path, 8-direction connectors) and the Phase 1 piece taxonomy roadmap (mega sweep merging in VibeRacer PR #80; hairpin / 45-arc / diagonal upcoming). Phase 3 junction noted as the upstream precedent for VibeCity's 4-way intersection. Files: `docs/gdd/01-vision-and-pillars.md`. PR #N/A (scaffold seed).
- 2026-05-03: Vision and pillars drafted. Files: `docs/gdd/01-vision-and-pillars.md`, `docs/gdd/99-out-of-scope.md`. PR #N/A (scaffold seed).
