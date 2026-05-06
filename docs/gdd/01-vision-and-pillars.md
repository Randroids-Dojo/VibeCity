# 1. Vision and Pillars

**Status:** done

**Pitch.** A SimCity-style city builder you can actually drive around in. Visit a slug, zone neighborhoods, run power and water, watch citizens move in and businesses open, then drop into a car and drive through the city you just simulated. Every URL is somebody's city. No login wall. Build the sim, watch it run, drive through the result.

**Design pillars.**

1. **Build the sim. Watch it run. Drive through the result.** The primary loop is sim-as-builder: zone, route infrastructure, place services, watch citizens / businesses respond. The drive view is the secondary loop, available any moment, where the player drops to street level and cruises the city the sim produced. The two loops share one persistent city; nothing lives only in drive mode and nothing lives only in sim mode.
2. **Your city, your URL.** Every slug in the domain is somebody's city. Anyone can visit, simulate it, drive it, fork it into a new slug. No account wall. The URL is the share link.
3. **Sim is the substrate.** Population, jobs, power, water, services, economy, disasters: each layer ships as a real system with persistent state on the city schema, not a cosmetic ambience. Driving feel is downstream of the sim; a city without power has dark windows when driven through, a city with crime has flashing police lights when driven past. The sim drives the visible city; cosmetic layers do not duplicate sim signals.

## What this product is

- A SimCity-style top-down sim view as the primary surface, with snap-grid zoning and infrastructure placement, modeled after the SimCity 2000 / SimCity 4 vocabulary.
- A drive mode toggle that drops the player to street level in their own car. The sim continues running while the player drives. The car is one observer of the sim, not the only thing in the world.
- A per-slug persistence layer keyed by URL slug, so a city simulated at `/<slug>` is reachable by anyone who visits that slug. The sim runs server-side or client-side per the engine substrate slice (REQ-070 series).
- A reuse of VibeRacer's vehicle integrator, wheel contact, camera rig, and input mapping for the drive view. The car shipped in v1 of VibeRacer is the car shipped in v1 of VibeCity, tuned for slow city cruising rather than racing.

## What this product is NOT (in v1)

- Not a racing game. No laps, no checkpoints, no leaderboards (per Q-009 dev override 2026-05-05). The drive mode is for inhabiting the simulated city, not competing.
- Not multiplayer. One player per slug at a time. Multiplayer is a stretch goal, not a v1 commitment.
- Not an asset showcase. Buildings and props are placeholder primitives in v1; visual polish is a P1 audit pass after each sim layer ships.
- Not a tycoon game. Money pressure exists (economy layer, REQ-095 series) but bankruptcy ends the game session, not the slug; the player can reset and rebuild without losing the URL.

## Voice and feel

- Toy-like, cartoony, snap-clicky. Same surface VibeRacer uses, scaled up to the sim layer.
- Three-second on-ramp: visit a URL, zone one block, see one citizen arrive. The bar is "see the sim respond" within three seconds, not "play SimCity well" within three seconds. The sim-as-primary view slice (REQ-110 series) carries the on-ramp design.
- Driving feel is a load-bearing slice of the player's relationship to their city. A city with traffic congestion drives badly; a city with no power drives through dark blocks. The sim is what the driver inhabits, not a backdrop.

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

See `99-out-of-scope.md` for the full fence. Headlines (post Q-009 pivot):

- Racing layers: laps, checkpoints, leaderboards, anti-cheat, lap submission.
- Multiplayer (more than one player at a slug at the same time, coop building).
- Account wall, login, social graph.
- Mobile-native build (web-first; touch controls inherited from VibeRacer).
- Save / load buttons, build-then-publish gate (saving is automatic; the slug IS the slot).

SimCity sim layers (citizens, zoning, power, water, economy, services, disasters) are now IN scope after Q-009 dev override 2026-05-05. See `docs/gdd/14-citizens.md` through `docs/gdd/20-disasters.md` for per-layer specs.

The loop must not scope-creep into items still listed in `99-out-of-scope.md` without explicit user approval.

### Build log

- 2026-05-05: Q-009 resolved toward C (full sim pivot) by dev override. Pitch rewritten from "city builder you can drive around in" to "SimCity-style city builder you can drive around in"; the previous toy-feeling drive-first framing reads as v1 history. Pillar 1 rewrites from "Build it. Drive it. Build more." to "Build the sim. Watch it run. Drive through the result." (sim as primary loop, drive as secondary loop, both sharing one persistent city). Pillar 2 unchanged. Pillar 3 rewrites from "Core first, sim later" to "Sim is the substrate" (sim drives the visible city; cosmetic layers do not duplicate sim signals). The "What this product is" / "is NOT" sections rewrite to admit the sim layer, drop the "Not a SimCity clone" line, and add "Not a tycoon game" to clarify the bankruptcy-ends-session-not-slug stance. Voice and feel section rewrites the three-second on-ramp from "place a road, drive on it" to "zone one block, see one citizen arrive". Out of scope index reflects the seven layers moved out of `99-out-of-scope.md`. Files: `docs/gdd/01-vision-and-pillars.md`, `docs/gdd/99-out-of-scope.md`, `docs/OPEN_QUESTIONS.md`. PR #N.
- 2026-05-04: REQ-055 build / drive transition curtain landed. Pillar 1 (Build it. Drive it. Build more.) gets a per-Link curtain that paints during navigation so the toggle reads as a sub-200 ms flicker rather than a save and reload round trip. `src/app/[slug]/sceneTransition.ts` ships pure constants (`SCENE_TRANSITION_BACKGROUND` matching the drive scene clear color, `SCENE_TRANSITION_FOREGROUND` matching the HUD cream, `SCENE_TRANSITION_FADE_MS = 180`, `SCENE_TRANSITION_Z_INDEX = 100` above the pause menu, `SCENE_TRANSITION_LABEL` per `SceneTransitionTarget`, plus `sceneTransitionTestid` / `sceneTransitionLabel` helpers). `src/app/[slug]/SceneTransitionCurtain.tsx` is a `'use client'` component that calls `useLinkStatus()` from `next/link` to read the in-flight pending flag and renders a fixed full-viewport overlay only while pending is true. `src/app/[slug]/edit/EditorClient.tsx` wraps the toolbar Drive CTA with `target='drive'`; `src/app/[slug]/DriveSceneClient.tsx` wraps the top-right Edit CTA, the empty-state CTA, and the pause-menu Edit CTA with `target='edit'`. `tests/app/sceneTransition.test.ts` ships 20 cases. The new playwright assertions cover the dormant contract on both routes. Files: `src/app/[slug]/sceneTransition.ts`, `src/app/[slug]/SceneTransitionCurtain.tsx`, `src/app/[slug]/edit/EditorClient.tsx`, `src/app/[slug]/DriveSceneClient.tsx`, `tests/app/sceneTransition.test.ts`, `e2e/editor.spec.ts`, `e2e/drive.spec.ts`, `docs/gdd/01-vision-and-pillars.md`. PR #N.
- 2026-05-03: Reuse map sharpened to track VibeRacer's Phase 0 piece plumbing (multi-cell footprint, segment-based path, 8-direction connectors) and the Phase 1 piece taxonomy roadmap (mega sweep merging in VibeRacer PR #80; hairpin / 45-arc / diagonal upcoming). Phase 3 junction noted as the upstream precedent for VibeCity's 4-way intersection. Files: `docs/gdd/01-vision-and-pillars.md`. PR #N/A (scaffold seed).
- 2026-05-03: Vision and pillars drafted. Files: `docs/gdd/01-vision-and-pillars.md`, `docs/gdd/99-out-of-scope.md`. PR #N/A (scaffold seed).
