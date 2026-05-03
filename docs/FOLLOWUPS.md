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

## Nice To Have

### F-007: Editor palette UI for arc45 and diagonal pieces

- Priority: nice-to-have
- Context: REQ-061 (`arc45`) and REQ-062 (`diagonal`) have schema entries (`PieceTypeSchema`) but no editor surface in VibeCity yet because the editor itself has not landed (REQ-016 onward are still `not_started`). When the editor palette is wired (REQ-017 / REQ-018 / REQ-058 / REQ-060 / REQ-019), the palette must include arc45 and diagonal glyphs and rotation handling so authors can place and rotate them.
- Blocker: REQ-016 (snap grid render) and the early editor palette slices (REQ-017, REQ-018) are prerequisite. Until the editor exists there is no palette to add to.
- Unblock condition: editor palette landing slice is in flight; add arc45 and diagonal entries alongside the v1 cardinal-only palette. Mirror VibeRacer's `mirroredPieceType()` handling: arc45 rotates / mirrors via the standard rotation handle, and diagonal mirrors via rotation.

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

## Polish

(none yet)