# 99. Out of Scope

**Status:** done

This is the v1 fence. The autonomous loop must not scope-creep into items listed here without explicit user approval. Each entry has a one-line rationale so future-us remembers why we said no, not just that we did.

When a deferred item gets approved for inclusion, move it OUT of this file (do not delete; rewrite as its own GDD section file under `docs/gdd/<NN>-<title>.md` and add a coverage row). Leave a `Resolved:` line here with the date and the new section reference so the audit trail survives.

## SimCity-style simulation layers

These are the eventual ambition for VibeCity beyond v1. They are out of scope until the build / drive core loop is fun.

- **Power grid.** Power plants, transmission lines, household demand, brownouts. Out: the v1 city is unpowered geometry.
- **Water and sewage.** Water towers, pipes, treatment plants. Out: same reason.
- **Zoning.** Residential / commercial / industrial zones with demand curves. Out: v1 buildings are placeholder primitives, not zone instances.
- **Citizens / agents.** Pedestrians, NPC traffic, occupants. Out: v1 has the player's car and nothing else moving.
- **Economy.** Taxes, budgets, building costs, money pressure. Out: v1 is freeform free-build with no resource constraint.
- **Disasters.** Fires, floods, earthquakes, monsters. Out: same reason.
- **Services.** Police, fire, hospitals, schools, garbage. Out: v1 has no need-states to service.
- **Day / night cycle and weather affecting simulation.** Cosmetic time-of-day inherited from VibeRacer is in scope (cheap port). Driving simulation hooks (slip in rain, headlight visibility budget) are out.

## Racing layers

VibeCity reuses VibeRacer's vehicle and driving systems but is explicitly not a racing game.

- **Laps.** No closed-loop tracks, no lap timer, no lap completion event. Out: VibeCity streets are an open road network, not a circuit.
- **Checkpoints.** No checkpoint sequence, no out-of-order detection. Out: nothing to validate.
- **Leaderboards.** No submission, no rank, no PB. Out: no metric being measured.
- **Anti-cheat.** No physics replay validation, no submission signing. Out: nothing to cheat.
- **Race flow.** No countdown, no GO sequence, no race-state machine. Out: drive mode just starts driving when entered.

## Multiplayer

- **Concurrent drivers at one slug.** Only one player drives at a time per browser session. Out: multiplayer state sync is a multi-week project on its own.
- **Coop building.** Two people editing the same city simultaneously. Out: same reason.
- **Visiting other players' avatars.** Out: same reason.

## Auth and identity

- **Account wall.** No required login to visit, drive, or build. Out: violates pillar 2 ("your city, your URL"; "no account wall").
- **Social graph.** No followers, no friends, no profiles. Out: not on the roadmap.
- **Slug ownership.** VibeCity is open-edit by design. Any visitor with a builder id cookie can write to any slug (REQ-014). Out: per-slug ownership conflicts with the collaborative loop; the loop is "anyone builds, anyone drives, anyone iterates".

## Platform and polish

- **Native mobile builds.** Web-first; touch controls inherited from VibeRacer. Out: native shell adds shipping overhead with no v1 differentiation.
- **Custom 3D vehicle models.** v1 ships VibeRacer's car. Out: scope creep until the core loop is fun.
- **Custom building meshes.** v1 buildings are placeholder primitives (boxes, simple roof shapes). Out: same reason.
- **Audio polish.** Engine noise inherited from VibeRacer; ambient city audio, music, traffic SFX out of scope. Out: same reason.
- **Settings UX polish.** v1 ships VibeRacer's settings pane mostly verbatim. Custom city-builder settings (camera-orbit-on-edit-mode, building category filters) deferred until felt as gaps in playtesting.

## Anti-features (we will deliberately NOT add these)

- **Save / load buttons.** Saving is automatic on every edit; the slug IS the save slot. Out: extra UI surface for no benefit.
- **A "build then publish" gate.** No staging vs. published distinction in v1. Edits land live on the slug. Out: see above.
- **A tutorial.** Three-second on-ramp is the tutorial. Out: any tutorial that needs more than the on-ramp implies the on-ramp is broken; fix the on-ramp instead.

### Build log

- 2026-05-05: Open-edit clarified in the Auth and identity fence. The "Slug ownership transfer" line was a v1-with-owner formulation; rewrote it to "Slug ownership" with the open-edit framing so the doc names the design tenant directly instead of describing a transfer flow that does not apply. Files: `docs/gdd/99-out-of-scope.md`. PR #N.
- 2026-05-03: Out-of-scope fence drafted. Files: `docs/gdd/99-out-of-scope.md`. PR #N/A (scaffold seed).
