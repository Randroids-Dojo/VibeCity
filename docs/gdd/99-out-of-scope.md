# 99. Out of Scope

**Status:** done

This is the v1 fence. The autonomous loop must not scope-creep into items listed here without explicit user approval. Each entry has a one-line rationale so future-us remembers why we said no, not just that we did.

When a deferred item gets approved for inclusion, move it OUT of this file (do not delete; rewrite as its own GDD section file under `docs/gdd/<NN>-<title>.md` and add a coverage row). Leave a `Resolved:` line here with the date and the new section reference so the audit trail survives.

## SimCity-style simulation layers

Q-009 resolved 2026-05-05 toward C: the full sim layer is now in scope as the primary loop. Items previously fenced out moved to their own GDD section files. The remaining items in this section stay out per the same dev override.

- **Power grid.** Resolved: 2026-05-05 by Q-009. Moved to `docs/gdd/16-power-grid.md` (REQ-085 series).
- **Water and sewage.** Resolved: 2026-05-05 by Q-009. Moved to `docs/gdd/17-water-and-sewage.md` (REQ-090 series).
- **Zoning.** Resolved: 2026-05-05 by Q-009. Moved to `docs/gdd/15-zoning-and-business.md` (REQ-080 series).
- **Citizens / agents.** Resolved: 2026-05-05 by Q-009. Moved to `docs/gdd/14-citizens.md` (REQ-075 series).
- **Economy.** Resolved: 2026-05-05 by Q-009. Moved to `docs/gdd/18-economy.md` (REQ-095 series).
- **Disasters.** Resolved: 2026-05-05 by Q-009. Moved to `docs/gdd/20-disasters.md` (REQ-105 series).
- **Services.** Resolved: 2026-05-05 by Q-009. Moved to `docs/gdd/19-services.md` (REQ-100 series). Schools and garbage included.
- **Day / night cycle and weather affecting simulation.** Cosmetic time-of-day inherited from VibeRacer is in scope (cheap port). Driving simulation hooks (slip in rain, headlight visibility budget) stay out. Sim-side weather effects (drought hurting crop production, storm damage triggering disaster responses) move into scope under the disasters and economy layers.

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
- **Custom 3D vehicle models.** v1 ships VibeRacer's car for the player. Citizen vehicle render reuses the same asset with material variations until a fleet of vehicle types becomes a felt gap.
- **Custom building meshes.** v1 buildings are placeholder primitives (boxes, simple roof shapes). Out: same reason.
- **Audio polish.** Engine noise inherited from VibeRacer; ambient city audio, music, traffic SFX out of scope. Out: same reason.
- **Settings UX polish.** v1 ships VibeRacer's settings pane mostly verbatim. Custom city-builder settings (camera-orbit-on-edit-mode, building category filters) deferred until felt as gaps in playtesting.

## Anti-features (we will deliberately NOT add these)

- **Save / load buttons.** Saving is automatic on every edit; the slug IS the save slot. Out: extra UI surface for no benefit.
- **A "build then publish" gate.** No staging vs. published distinction in v1. Edits land live on the slug. Out: see above.
- **A tutorial.** Three-second on-ramp is the tutorial. Out: any tutorial that needs more than the on-ramp implies the on-ramp is broken; fix the on-ramp instead. Note: the sim-layer pivot (Q-009) raises the bar on what the on-ramp must teach. Whether the on-ramp can still carry the new scope without becoming a tutorial is an open question for the sim-as-primary view slice (REQ-110 series).

### Build log

- 2026-05-05: Q-009 resolved toward C (full sim pivot). Moved seven sim layers OUT of the fence with `Resolved:` lines pointing to new GDD section files: power grid (16-power-grid.md), water and sewage (17-water-and-sewage.md), zoning (15-zoning-and-business.md), citizens (14-citizens.md), economy (18-economy.md), disasters (20-disasters.md), services (19-services.md). Custom-vehicle-model line softened (citizens use the same car asset with material variations). Tutorial anti-feature line gained a note about the on-ramp bar rising under the sim pivot. Racing layers, multiplayer, account wall, native mobile builds, and the save-button anti-feature stay out per the same dev override. Files: `docs/gdd/99-out-of-scope.md`. PR #N.
- 2026-05-05: Open-edit clarified in the Auth and identity fence. The "Slug ownership transfer" line was a v1-with-owner formulation; rewrote it to "Slug ownership" with the open-edit framing so the doc names the design tenet directly instead of describing a transfer flow that does not apply. Files: `docs/gdd/99-out-of-scope.md`. PR #N.
- 2026-05-03: Out-of-scope fence drafted. Files: `docs/gdd/99-out-of-scope.md`. PR #N/A (scaffold seed).
