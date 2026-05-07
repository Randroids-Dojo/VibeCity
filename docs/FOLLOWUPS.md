# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

> **Critical convention.** Every followup must carry a `Priority:` tag. Three buckets:
> - `blocks-release`: cannot ship v1 without this.
> - `nice-to-have`: improves the product but does not block.
> - `polish`: post-release cleanup.

## How to add a followup

```
## F-NNN: Short title

- Priority: blocks-release | nice-to-have | polish
- Context: one or two sentences on why this came up.
- Blocker (if any): the condition that prevents working on this now.
- Unblock condition: what has to be true to start.
- PR / Dot reference (when picked up): #N or dots-N
```

Keep `F-NNN` IDs monotonically increasing. When a followup ships, leave the entry in place and append a `- Resolved: PR #N` line. Never delete.

## Blocks Release

(none yet)

## Resolved

### F-010: Stop e2e specs from polluting the production-like KV via uncovered PUTs

- Priority: nice-to-have
- Context: REQ-014's PUT route was open-edit-pivoted (Q-008) so test cookies no longer lock real-user slugs out, but the e2e Playwright editor specs still write to whatever KV the webServer points at when a test goto's `/<slug>/edit` and places a piece without registering its own `page.route` for `/api/city/<slug>`. The slug `rejection-flash-spec` ended up in production's `city:index` from a live CI run and surfaced on the home page's recently-updated cards alongside real cities.
- Blocker: none.
- Unblock condition: register a default PUT interceptor in a `test.beforeEach` so every editor spec falls back to a synthetic 200 response unless the test registers its own handler. Verify via local `playwright --grep rejection-flash-spec` that no PUT escapes to KV.
- Resolved: 2026-05-05. `e2e/editor.spec.ts` gained a `test.beforeEach` that registers a default `**/api/city/**` PUT interceptor returning a synthetic 200 with a zero-hash payload. Per-test handlers (registered inside the test body via `page.route`) still take precedence per playwright's "later handler matches first" contract; the beforeEach is the fallback for tests that did not register one. PR #N.

### F-009: Migrate VibeCity to a dedicated Upstash store

- Priority: blocks-release
- Context: PR #65 wired the `vibe-city` Vercel project to the same `upstash-kv-rose-garden` Upstash store that backs `vibe-racer`. Saving works on production, but the shared store violates AGENTS.md Rule 11 (one backing store per project), which landed in the same PR. Q-007 resolved in favor of dedicated stores. The shared state is interim until this followup migrates.
- Blocker: dedicated Upstash store provisioning lives in the Vercel marketplace UI, not the CLI. Requires a human action.
- Unblock condition: provision a fresh Upstash for Redis store on the Vercel marketplace and attach it to the `vibe-city` project. Then run `vercel env pull` to refresh `.env.local`, redeploy production, and verify a fresh slug round-trips through the new store. Once verified, run `vercel env rm` for the legacy shared-store credentials so VibeCity stops reading them. Detach the legacy resource from `vibe-city` if it shows up under `vercel integration ls` for the `vibe-city` project.
- Resolved: PR #65. 2026-05-04. Provisioned `vibecity-kv` (Upstash ID `b8ea911f-c155-4326-b116-8828d429301a`, Pay-As-You-Go plan) via `vercel integration add upstash/upstash-kv` plus the dashboard handshake (the marketplace install bounces to a browser tab for region / plan / connect-to-project setup). The connect dialog wrote `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, and `REDIS_URL` to all three environments on `vibe-city` only; the legacy shared-store values were `vercel env rm`'d before the connect step so the new vars wrote in clean. `vercel integration ls` shows `vibecity-kv` attached only to `vibe-city`. `vercel --prod` redeploy and a fresh-slug round-trip (`PUT` then `GET` on slug `dedicated-store-smoke-1777946271`) confirmed save persists end to end on the dedicated store.

## Nice To Have

### F-017: Scope `solveServicesCoverage` to populated cells in `computeCityHappiness`

- Priority: nice-to-have
- Context: REQ-076 multi-input happiness calls `solveServicesCoverage(zones, services)` every tick, which sorts and walks all zoned cells even when only `populatedKeys` need a coverage count. On large cities the per-tick cost is `O(|zones| log |zones| + |zones| * |services|)`. Surfaced by Copilot review on PR #130.
- Blocker: none.
- Unblock condition: add a solver API (e.g. `solveServicesCoverageForKeys(keys, services)` or a per-key `cellCoverage(row, col, services)` shortcut already exported from `servicesSolver.ts`) and switch `computeCityHappiness` to compute coverage only for the populated subset. Verify happiness values stay numerically identical to the current full-zones implementation.
- Resolved: PR #136. Switched both `computeCityHappiness` and `applyHappinessTick` to call the per-key `cellCoverage(row, col, services)` helper. Public signatures keep the `zones` parameter as a cheap membership gate so populated-but-not-zoned cells (transient state between `applyEraseZone` and the next growth-tick population sync) contribute 0 coverage, matching the prior `solveServicesCoverage(zones, ...)[key] === undefined` semantics. Per-tick cost is now `O(R * |services|)`. Regression test for the orphan-populated edge case (residential + treatment plant + fire-station in range, eraseZone mid-cycle, assert happiness stays at 80 rather than the no-gate 84) added in PR #139.

### F-016: Resident abandonment when cell happiness drops below threshold

- Priority: nice-to-have
- Context: REQ-076 multi-input happiness reduces `cityHappiness` to a single 0..100 average but does not yet act on it. The natural follow-on (REQ-079 spec text) is per-cell decline: when a cell's local happiness stays below a threshold for N ticks, residents leave (density steps down or `residents` count drops toward 0). This closes the citizen growth-and-decline feedback loop.
- Blocker: per-cell happiness is not yet tracked; only `cityHappiness` city-wide is exposed. A per-cell happiness reducer is a prerequisite, or the city-wide score has to suffice as the first cut (less satisfying because every cell loses residents at once).
- Unblock condition: pick one of (a) extend the happiness layer to per-cell (cheap if the four-input formula is just localized: waste per cell, coverage per cell, tax flat, earthquakes per cell), or (b) ship a city-wide abandonment first (simpler, less fun) and split-iterate from there.

### F-015: Per-cell happiness heatmap overlay in editor

- Priority: nice-to-have
- Context: REQ-076 multi-input happiness now reads four signals (waste, coverage, taxes, earthquakes), but the HUD only shows the city-wide average. A heatmap overlay (similar to REQ-101 zone coverage stroke) would let the player see which neighborhoods are underserved and why. Surfaced as a polish followup after REQ-076 happiness landed.
- Blocker: depends on F-016 / a per-cell happiness reducer landing. The editor cannot render per-cell happiness it does not yet compute.
- Unblock condition: per-cell happiness state lands. Heatmap then renders four palette tabs (waste / coverage / tax / earthquake) so the player can inspect the contributing penalty.

### F-014: Pedestrian sprite render proxies (REQ-076 spec text)

- Priority: nice-to-have
- Context: REQ-076's GDD bullet covers "Citizen pedestrians: sidewalk-adjacent residential and commercial cells spawn ambient pedestrian sprites that walk between cells. Pedestrians are pure render; they have no goals, no schedule, no path-finding. Density mirrors population." The 2026-05-06 multi-input happiness slice took the REQ-076 ID but only addressed the citizen-happiness model; the pedestrian render proxies remain.
- Blocker: none in principle. The drive scene already loads a Three.js scene per slug and the existing ambient traffic helper (`src/app/[slug]/ambientTraffic.ts`) is a near-template for sidewalk pedestrian motion.
- Unblock condition: port the ambient traffic pattern to a sidewalk-pedestrian variant. Spawn density mirrors `population.totalPopulation`; despawn at any other zone cell. No goals, no schedule.
- Resolved: PR #140. Shipped a stripped-down version: static-anchor box meshes per populated cell capped at 4 figures, with deterministic per-mesh bob via the existing animation loop. Per-cell motion / sprite art / per-zone-kind variation stay deferred under F-NEW followups in PROGRESS_LOG.

### F-008: Seed a non-empty city in playwright so visible-movement assertions land

- Priority: nice-to-have
- Context: REQ-034 (keyboard controls) and REQ-031 (kinematic vehicle integrator) shipped as a slice. The drive scene's car only mounts when `city.pieces.length > 0`, so the playwright e2e specs that verify driving must observe a non-empty city. The current playwright webServer runs `next start` without KV configured, which means `loadCity` always returns the empty city; the e2e specs assert `data-controls-active="false"` instead of pressing keys and observing the car move. Unit tests cover the integration math in full but a true black-box assertion that pressing a key moves the car would close the loop.
- Blocker: the playwright webServer has no KV configured so `loadCity` always returns the empty city. Editor autosave PUTs go nowhere and the next page load reads the same empty city back.
- Unblock condition: pick one of: (a) wire a Playwright fixture that injects an in-memory KV via an environment variable the webServer reads, (b) add a Next.js route handler under `/api/test/seed-city/<slug>` that writes a city payload to an in-memory store the page reads on the same process, or (c) wait for the chase camera (REQ-033) and visible-movement assertions can replace the data-attribute mirror entirely with a screenshot diff. Pick (a) or (b) once the chase camera lands so the assertion has both the car and the camera follow path to verify.

- Priority: nice-to-have
- Context: REQ-061 (`arc45`) and REQ-062 (`diagonal`) have schema entries (`PieceTypeSchema`) but no editor surface in VibeCity yet because the editor itself has not landed (REQ-016 onward are still `not_started`). When the editor palette is wired (REQ-017 / REQ-018 / REQ-058 / REQ-060 / REQ-019), the palette must include arc45 and diagonal glyphs and rotation handling so authors can place and rotate them.
- Blocker: REQ-016 (snap grid render) and the early editor palette slices (REQ-017, REQ-018) are prerequisite. Until the editor exists there is no palette to add to.
- Unblock condition: editor palette landing slice is in flight; add arc45 and diagonal entries alongside the v1 cardinal-only palette. Mirror VibeRacer's `mirroredPieceType()` handling: arc45 rotates / mirrors via the standard rotation handle, and diagonal mirrors via rotation.
- Resolved: 2026-05-04. Editor palette extended with single-cell `arc45` (label "Arc 45") and `diagonal` (label "Diagonal") entries appended after the REQ-019 intersection so the corner-connector block stays grouped at the trailing edge of the palette. Both pieces use the existing `placePiece` / `erasePiece` reducer paths with the implicit single-cell footprint and the existing rotate tool (REQ-021) cycles their rotation through the standard 0 / 90 / 180 / 270 cycle. Runtime concerns (sampled centerlines per F-003, wheel contact per F-004, pace notes per F-005, difficulty scoring per F-006, 8-direction connector validation per REQ-063) stay deferred to the drive scene scaffold (REQ-031). PR #N.

### F-006: Difficulty scoring contribution for arc45 and diagonal pieces

- Priority: nice-to-have
- Context: VibeRacer's track difficulty scorer assigns a difficulty contribution per piece type (see `src/game/trackDifficulty.ts`). arc45 and diagonal each carry their own contribution. VibeCity does not have a difficulty model in v1 because the city is not raced; if a "drive challenge" mode lands later that scores routes, the same per-piece contribution should be ported.
- Blocker: VibeCity has no difficulty surface yet (no laps, no race scoring; REQ-037 explicitly forbids them). This followup is gated on a future challenge / score mode being added in scope.
- Unblock condition: VibeCity adds a route-scoring or challenge surface that needs a per-piece weight.

### F-005: Pace notes coverage for arc45 and diagonal pieces

- Priority: nice-to-have
- Context: VibeRacer's pace-notes module emits turn callouts (left, right, sweep, hairpin, etc.). It calls out arc45 transitions and diagonal runs. VibeCity has no pace-notes surface yet because there is no race driving with a co-driver. If VibeCity later adds a tour mode or guided drive, pace notes should already understand the new piece geometry.
- Blocker: pace notes module not ported to VibeCity. No race / co-driver surface exists.
- Unblock condition: a VibeCity slice ports pace notes (e.g. for an optional tour-guide or radio-DJ feature). At that point, port the arc45 / diagonal handling alongside.

### F-004: Wheel contact handling for arc45 and diagonal pieces

- Priority: nice-to-have
- Context: VibeRacer's `wheelContact.ts` reports on-track / off-track per wheel by sampling the centerline of each piece under the wheel. arc45 and diagonal use sampled centerlines (`ARC45_LOCAL_SAMPLES`, `DIAGONAL_LOCAL_SAMPLES`) just like sweeps and hairpins, so the same wheel-contact logic applies. VibeCity does not have driving yet (REQ-031 onward are `not_started`), so wheel contact for arc45 / diagonal is deferred to the drive-mode slice.
- Blocker: REQ-031 (vehicle physics) and REQ-032 (wheel contact port) have not landed. The drive surface does not exist yet.
- Unblock condition: REQ-032 ships. The port should include arc45 and diagonal centerline sampling so the car stays on-street through the new piece geometries. REQ-065 (multi-locator candidate evaluation) is the related drive-side concern for multi-cell pieces.

### F-003: Sampled path geometry for arc45 and diagonal pieces

- Priority: nice-to-have
- Context: arc45 and diagonal both rely on sampled local centerlines in VibeRacer (`ARC45_LOCAL_SAMPLES`, `DIAGONAL_LOCAL_SAMPLES` in `src/game/trackPath.ts`) so the road geometry, wheel contact, and any path-following systems can place the road correctly. VibeCity v1 has no path / geometry module yet; the schema entry alone does not produce a drivable road through these pieces. When VibeCity ports `trackPath.ts` (REQ-064 segment-based path), the sample sets for arc45 / diagonal must be ported alongside so saved cities containing these pieces render and drive correctly.
- Blocker: REQ-064 (segment-based path with cellToLocators) has not landed. Without the path module there is no geometry layer to sample into.
- Unblock condition: REQ-064 ships. Include the arc45 and diagonal local sample sets in the port. The corresponding 8-direction connector validation (REQ-063) should also recognize arc45's mixed cardinal / corner connector pair.

### F-002: Track upstream VibeRacer track-piece additions

- Priority: nice-to-have
- Context: VibeRacer is mid-flight on a multi-phase track-piece roadmap (`../VibeRacer/docs/TRACK_FEATURES_PLAN.md`). Phase 0 plumbing has shipped, Phase 1a (mega sweep) is in PR #80, Phase 1b/c/d (hairpin, 45-arc, diagonal) and Phase 3 (junction) are queued upstream. VibeCity copy-ports the editor; we want to pick up upstream piece additions at our own cadence per Q-006.
- Blocker: none for the watcher task itself. Each adoption slice is gated by whether the piece adds city value (Q-006 default B).
- Unblock condition: a VibeRacer PR ships a new piece that the dev believes makes a city more fun to drive. Open a VibeCity slice with REQ-NNN row for the port.
- Watch list:
  - VibeRacer PR #75 / #76 / #77 / #78 / #79: Phase 0 plumbing (track width, segment-based path, multi-cell footprint, 8-direction connectors, hash canonicalization). Status: merged upstream 2026-05-03. Adoption: REQ-059, REQ-063, REQ-064. Confirmed in VibeCity v1 scope.
  - VibeRacer PR #80: megaSweepRight / megaSweepLeft (3x3, 90deg). Status: merged upstream 2026-05-03. Adoption: REQ-058. Confirmed in VibeCity v1 scope.
  - VibeRacer PR #81: hairpin (2x3 implicit footprint, 180deg, 65-sample centerline, rotated connector ports, wheel contact via footprint locators). Status: merged upstream 2026-05-03. Adoption: REQ-060. Confirmed in VibeCity v1 scope.
  - VibeRacer Phase 1c: arc45 (cardinal-to-corner bridge). Status: merged upstream 2026-05-03. Adoption: REQ-061. Schema-level port landed in VibeCity (PieceTypeSchema entry); runtime concerns deferred to F-003 (sampled path), F-004 (wheel contact), F-005 (pace notes), F-006 (difficulty scoring), F-007 (editor palette).
  - VibeRacer Phase 1d: diagonal (1x1, corner-to-corner). Status: merged upstream 2026-05-03. Adoption: REQ-062. Schema-level port landed in VibeCity (PieceTypeSchema entry); runtime concerns deferred to the same followups as arc45.
  - VibeRacer Phase 3a: junction (1x1, three connectors). Status: not started upstream. Relevant to REQ-019 (VibeCity 4-way intersection extends this pattern). Auto-in scope once upstream PR merges.

### F-001: Draft first GDD section

- Priority: nice-to-have
- Context: scaffold landed; the seed `docs/gdd/01-vision-and-pillars.md` has not been drafted yet.
- Blocker: none.
- Unblock condition: dev provides one paragraph of vision text or approves a draft.
- Resolved: 2026-05-03. Drafted `docs/gdd/01-vision-and-pillars.md` plus `docs/gdd/99-out-of-scope.md`; coverage seeded with 57 atomic rows. See PROGRESS_LOG.md entry "Vision and Coverage Seeded".

### F-013: Drive-feel texture pass (tire screech, suspension bob, brake light)

- Priority: nice-to-have
- Context: Surfaced in the 2026-05-05 fun-factor audit (`docs/FUN_FACTOR_AUDIT.md`). The drive surface today has engine pitch (REQ-068) but nothing else; mid and expert players see no skill expression because the kinematic integrator does not reward line choice with audio or visual feedback. The smallest slice: tire-screech SFX gated on lateral-acceleration above a threshold, suspension bob on the car body keyed to throttle / brake events, and a brake-light material on the car's rear faces that switches color when brake is pressed.
- Blocker: best landed AFTER the real car model dot (so the brake light has a stable rear face to attach to).
- Unblock condition: `implement: port car.glb to drive scene (REQ-047 fidelity bump)` lands.

### F-012: First-session on-ramp polish (NOT a tutorial)

- Priority: nice-to-have
- Context: Surfaced in the 2026-05-05 fun-factor audit. The editor currently presents a snap-grid SVG and a palette with no first-session hint. A brand-new player with no city-builder vocabulary may not realize the palette tile must be selected before the cell click. The OOS fence (`docs/gdd/99-out-of-scope.md`) explicitly forbids tutorials ("any tutorial that needs more than the on-ramp implies the on-ramp is broken; fix the on-ramp instead"). This followup is framed as on-ramp polish, not tutorial: a one-time pulsing outline on the first palette tile and the first empty cell when a slug has zero pieces, dismissed after the first successful piece placement. No multi-step walkthrough, no skip button, no instruction text beyond what the existing CTA copy already says.
- Blocker: none.
- Unblock condition: pick a dismissal storage mechanism (the absence-of-pieces in the city payload is the natural gate; no cookie or flag needed because the hint disappears the moment the first piece lands).

### F-011: Home page recent-card thumbnail (city preview SVG)

- Priority: nice-to-have
- Context: Surfaced in the 2026-05-05 fun-factor audit. The home page lists recent cities as text-only slug links (`src/app/page.tsx`). A first-time visitor cannot tell which slug is interesting from the list. Smallest slice: render a small SVG preview of each recent city's pieces (reuse `src/app/[slug]/edit/SnapGridView.tsx` rendering at a smaller scale) inline in each `home-recent-link` card. The city payload is already loaded for the recent-cities list in principle; if the index does not currently include the city payload, extend `recentCities()` to fetch each `city:${slug}:latest` payload (capped at the 12 most recent so the parallel fan-out is bounded).
- Blocker: depends on whether `recentCities()` already loads city payloads or just slug + updatedAt.
- Unblock condition: extend `recentCities()` if needed; render SVG preview in each card.

## Polish

(none yet)