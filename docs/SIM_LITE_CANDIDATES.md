# Sim-Lite Candidate Study (Q-009 supporting analysis)

> Companion to `docs/OPEN_QUESTIONS.md` Q-009. Ranks candidate "ambient city life" features against the v1 fence (`docs/gdd/99-out-of-scope.md`) and three gate tests:
>
> 1. Visible from inside the car within 30 seconds of driving.
> 2. Zero new persisted state on `CitySchema` (no save-shape change).
> 3. Implementable in one PR-sized slice.
>
> The OOS fence is explicit. Per `docs/gdd/99-out-of-scope.md` the anti-features include:
>
> - "Citizens / agents. Pedestrians, NPC traffic, occupants. Out: v1 has the player's car and nothing else moving."
> - "Audio polish... ambient city audio, music, traffic SFX out of scope."
> - "A tutorial. Three-second on-ramp is the tutorial."
> - "Day / night cycle and weather affecting simulation. Cosmetic time-of-day inherited from VibeRacer is in scope (cheap port). Driving simulation hooks (slip in rain, headlight visibility budget) are out."
> - "Custom 3D vehicle models. v1 ships VibeRacer's car. Out: scope creep until the core loop is fun."
>
> The fence reads narrowly: "cosmetic time-of-day" is *in*; "NPC traffic" is *out*. This study respects the narrow reading and rates each candidate accordingly.

## Candidates ranked

### 1. Lit-window night ambience (REQ-012 mood-driven render)

- **Three-test rating:** PASS / PASS / PASS.
- **OOS fence:** in scope. The fence allows "Cosmetic time-of-day inherited from VibeRacer". CityMood.timeOfDay already exists on the schema.
- **Q-009 needed?** No.
- **Spec sketch:** When `city.mood?.timeOfDay === 'night'`, building cells render with emissive window quads and intersection cells get a `THREE.PointLight` street lamp. Pure render, no schema change, no logic.
- **Backlog status:** dot `implement: lit-window night ambience` already filed.

### 2. Real car model (REQ-047 fidelity bump)

- **Three-test rating:** PASS / PASS / PASS.
- **OOS fence:** boundary. The fence lists "Custom 3D vehicle models" but pillar 1 (`docs/gdd/01-vision-and-pillars.md`) commits to "the car shipped in v1 of VibeRacer is the car shipped in v1 of VibeCity, tuned for slow city cruising rather than racing". VibeRacer's `public/models/car.glb` is the inherited car, not a custom one.
- **Q-009 needed?** No (interpretation: porting VibeRacer's car is reuse, not custom; consistent with pillar 1).
- **Spec sketch:** Copy the GLB from `../VibeRacer/public/models/car.glb`, load via GLTFLoader on mount, replace the BoxGeometry primitives.
- **Backlog status:** dot `implement: port car.glb to drive scene` already filed.

### 3. Brake light on the player car

- **Three-test rating:** PASS / PASS / PASS (after car model lands; otherwise the rear face is ambiguous on a primitive box).
- **OOS fence:** in scope. Visual feedback on the player's own car is not "audio polish" or "NPC". It is per-car material state.
- **Q-009 needed?** No.
- **Spec sketch:** When brake key is held, swap the rear face material's `color` (or `emissive`) on the loaded car GLB to red. Off when released. Tracked in F-013 (drive-feel texture pass).

### 4. Suspension bob on the player car

- **Three-test rating:** PASS / PASS / PASS.
- **OOS fence:** in scope. Player-car visual response, not sim.
- **Q-009 needed?** No.
- **Spec sketch:** Pitch the car body slightly forward on brake events, slightly backward on throttle events; smooth via `lerp`. No physics change. Tracked in F-013.

### 5. Off-street dust particle puff

- **Three-test rating:** PASS / PASS / PASS.
- **OOS fence:** in scope. Render effect tied to existing off-street penalty signal (REQ-054).
- **Q-009 needed?** No.
- **Spec sketch:** When wheels enter off-street cells, spawn a small `THREE.Points` cluster behind the wheel, fade out over 500ms. Bounded particle count.

### 6. Tire screech audio

- **Three-test rating:** PASS / PASS / FAIL on test 2 (no schema change but introduces a third audio rig). Borderline.
- **OOS fence:** "Audio polish... ambient city audio, music, traffic SFX out of scope." Tire screech is player-car SFX, not ambient city audio. Reads as in scope under a narrow reading; reads as scope creep under a broad reading.
- **Q-009 needed?** Yes (audio-polish edge).
- **Spec sketch:** Synthesized noise burst gated on `lateral_acceleration > THRESHOLD`. One Web Audio node, no asset.

### 7. Cosmetic day/night/dusk cycle UI control

- **Three-test rating:** PASS / FAIL / PASS. FAIL because the schema's `CityMood.timeOfDay` is currently an open string; tightening it to `'day' | 'night' | 'dusk'` is a schema enum change (a write-shape change but not a hash-shape change since mood is excluded from the version hash).
- **OOS fence:** in scope under "cosmetic time-of-day".
- **Q-009 needed?** No, but the schema-tightening should be its own slice ahead of the lit-window dot or bundled with it.
- **Spec sketch:** Editor toolbar gains a small selector for `mood.timeOfDay`. PUT path already supports the field.

### 8. Cosmetic weather render (rain particles)

- **Three-test rating:** PASS / FAIL / FAIL. FAIL on test 2 (CityMood.weather is currently an open string, would tighten); FAIL on test 3 (rain particle system + atmospheric tint is more than a one-PR slice).
- **OOS fence:** "Cosmetic time-of-day inherited from VibeRacer is in scope (cheap port). Driving simulation hooks (slip in rain, headlight visibility budget) are out." Cosmetic weather is in; sim-coupled weather is out.
- **Q-009 needed?** No, but defer until after lit-window lands as the smaller proof-of-concept.

### 9. Ambient AI traffic (follower cars on segments)

- **Three-test rating:** PASS / PASS / PASS (after sampled-centerline foundation).
- **OOS fence:** OUT under the fence's narrow reading. "Citizens / agents. Pedestrians, NPC traffic, occupants. Out: v1 has the player's car and nothing else moving."
- **Q-009 needed?** YES. This is the canonical "needs an explicit pivot" candidate.
- **Spec sketch:** existing dot `implement: ambient AI traffic`; blocked on Q-009 + centerline foundation.
- **Recommended Q-009 carveout language:** "ambient cosmetic followers on placed segments do not constitute NPC traffic for v1 purposes; they are a render layer with no schema state, no path-finding, and no collision with the player." Under that carveout the candidate is in. Without that carveout the candidate stays out.

### 10. Traffic lights at intersection cells

- **Three-test rating:** PASS / PASS / PASS.
- **OOS fence:** boundary. Not a "service" (police, fire), not a "citizen", not "NPC traffic". A traffic light is street furniture. Reads as in scope under the same narrow reading that admits cosmetic mood.
- **Q-009 needed?** Borderline. The light has no effect on the player (no penalty for running it, no slowdown). Pure visual.
- **Spec sketch:** Place a small mast with three colored emissive boxes at each intersection's center. Cycle red/yellow/green on a fixed wall-clock interval. No state, no penalty, no detection.

### 11. Pedestrians on sidewalks

- **Three-test rating:** PASS / PASS / FAIL on test 3 (sidewalks do not exist as a render concept; would need to be added per piece type).
- **OOS fence:** OUT. "Pedestrians" listed by name.
- **Q-009 needed?** Yes. Defer.

### 12. Ambient city audio (birds, distant traffic, wind)

- **Three-test rating:** FAIL / PASS / PASS. FAIL on test 1 (heard but not "visible from inside the car").
- **OOS fence:** OUT. "Ambient city audio... out of scope."
- **Q-009 needed?** Yes. Defer.

## Summary table

| Rank | Candidate | OOS reading | Needs Q-009? | Already a dot? |
|------|-----------|-------------|--------------|----------------|
| 1 | Lit-window night ambience | In | No | Yes |
| 2 | Real car model | In (inherited from VibeRacer) | No | Yes |
| 3 | Brake light | In | No | F-013 |
| 4 | Suspension bob | In | No | F-013 |
| 5 | Off-street dust puff | In | No | New (consider F-013 extension) |
| 6 | Tire screech audio | Borderline | Yes | F-013 |
| 7 | Day/night/dusk UI control | In (after schema enum) | No | Implied by candidate 1 |
| 8 | Cosmetic weather (rain) | In | No | Future |
| 9 | Ambient AI traffic | Out (narrow reading) | Yes | Yes (blocked on Q-009) |
| 10 | Traffic lights at intersection | Borderline | Borderline | New |
| 11 | Pedestrians on sidewalks | Out | Yes | Future |
| 12 | Ambient city audio | Out | Yes | Future |

## Recommendation for Q-009

The narrow reading of `99-out-of-scope.md` already admits seven of the twelve candidates without a fence change. Of those seven, two are already dots (lit-window, real car), three are F-013 sub-slices (brake light, suspension bob, dust puff), and two are unfiled (day/night UI control, traffic lights at intersection). Shipping the seven uncontroversial candidates is the cheapest path to "the city feels alive" and does not require a Q-009 pivot.

Q-009 should resolve toward Recommended default B *only for the ambient-AI-traffic candidate*. The other "sim-feel" candidates do not need a pivot. Ship the seven first; reassess Q-009 after the player feedback on those seven lands.

## Out-of-scope items not on this candidate list

For completeness, the following remain explicitly out of scope under any reading of the fence and were not evaluated:

- Power grid, water/sewage, zoning, citizens/agents (beyond visual followers under a Q-009 carveout), economy (taxes, costs, money), disasters, services (police, fire, hospitals, schools, garbage).
- Laps, checkpoints, leaderboards, anti-cheat, race flow.
- Multiplayer (concurrent drivers, coop building, visiting other players' avatars).
- Account wall, social graph, slug ownership.
- Native mobile builds, custom building meshes (beyond the placeholder primitive set), settings UX polish beyond the inherited pane.
- Save / load buttons, build-then-publish gate, tutorial overlay (the on-ramp is the tutorial; F-012 reframed as on-ramp polish, not a tutorial).
