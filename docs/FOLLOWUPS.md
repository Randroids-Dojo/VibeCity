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

### F-002: Track upstream VibeRacer track-piece additions

- Priority: nice-to-have
- Context: VibeRacer is mid-flight on a multi-phase track-piece roadmap (`../VibeRacer/docs/TRACK_FEATURES_PLAN.md`). Phase 0 plumbing has shipped, Phase 1a (mega sweep) is in PR #80, Phase 1b/c/d (hairpin, 45-arc, diagonal) and Phase 3 (junction) are queued upstream. VibeCity copy-ports the editor; we want to pick up upstream piece additions at our own cadence per Q-006.
- Blocker: none for the watcher task itself. Each adoption slice is gated by whether the piece adds city value (Q-006 default B).
- Unblock condition: a VibeRacer PR ships a new piece that the dev believes makes a city more fun to drive. Open a VibeCity slice with REQ-NNN row for the port.
- Watch list:
  - VibeRacer PR #75 / #76 / #77 / #78 / #79: Phase 0 plumbing (track width, segment-based path, multi-cell footprint, 8-direction connectors, hash canonicalization). Status: merged upstream 2026-05-03. Adoption: REQ-059, REQ-063, REQ-064. Confirmed in VibeCity v1 scope.
  - VibeRacer PR #80: megaSweepRight / megaSweepLeft (3x3, 90deg). Status: merged upstream 2026-05-03. Adoption: REQ-058. Confirmed in VibeCity v1 scope.
  - VibeRacer PR #81: hairpin (2x3 implicit footprint, 180deg, 65-sample centerline, rotated connector ports, wheel contact via footprint locators). Status: merged upstream 2026-05-03. Adoption: REQ-060. Confirmed in VibeCity v1 scope.
  - VibeRacer Phase 1c: arc45 (2x2, cardinal-to-corner). Status: not started upstream. Adoption: REQ-061. Auto-in scope once upstream PR merges.
  - VibeRacer Phase 1d: diagonal (1x1, corner-to-corner). Status: not started upstream. Adoption: REQ-062. Auto-in scope once upstream PR merges.
  - VibeRacer Phase 3a: junction (1x1, three connectors). Status: not started upstream. Relevant to REQ-019 (VibeCity 4-way intersection extends this pattern). Auto-in scope once upstream PR merges.

### F-001: Draft first GDD section

- Priority: nice-to-have
- Context: scaffold landed; the seed `docs/gdd/01-vision-and-pillars.md` has not been drafted yet.
- Blocker: none.
- Unblock condition: dev provides one paragraph of vision text or approves a draft.
- Resolved: 2026-05-03. Drafted `docs/gdd/01-vision-and-pillars.md` plus `docs/gdd/99-out-of-scope.md`; coverage seeded with 57 atomic rows. See PROGRESS_LOG.md entry "Vision and Coverage Seeded".

## Polish

(none yet)