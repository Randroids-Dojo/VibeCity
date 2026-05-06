---
title: "implement: arc45 + diagonal sampled geometry + per-wheel contact (F-003, F-004)"
status: open
priority: 2
issue-type: task
created-at: "2026-05-05T21:21:56.674489-05:00"
---

## Description

Once the sampled centerline foundation lands (sister dot `implement: sampled centerline geometry layer`), port `ARC45_LOCAL_SAMPLES` and `DIAGONAL_LOCAL_SAMPLES` from `../VibeRacer/src/game/trackPath.ts`. Wire wheel contact in `src/app/[slug]/offStreetPenalty.ts` to score per-wheel distance-to-centerline for both piece types instead of the current cell-binary fallback. Closes F-003 (sampled path geometry) and F-004 (wheel contact).

## Context

arc45 and diagonal already have `PieceTypeSchema` entries (REQ-061, REQ-062) and editor palette entries (resolved follow-on to F-007), but their geometry is missing. A saved city with these pieces renders only the cell anchor and the on-street test treats their footprint as on-street binary. With the centerline foundation in place, this slice adds the sample sets and the per-wheel scoring path so cars handle correctly through cardinal-corner transitions.

## Affected Files

- `src/lib/trackPath.ts`: add `ARC45_LOCAL_SAMPLES`, `DIAGONAL_LOCAL_SAMPLES` constants; extend `sampledPointsForPiece` to return them
- `src/app/[slug]/offStreetPenalty.ts`: extend `wheelOnStreet` to use a per-wheel distance-to-nearest-sample threshold for arc45 / diagonal cells (still falls back to the cell-binary check for other piece types this slice)
- `tests/lib/trackPath.test.ts`: arc45 and diagonal sample-set cases
- `tests/app/offStreetPenalty.test.ts`: wheel-contact cases driving through arc45 and diagonal placements

## Implementation Notes

- Sample density should mirror VibeRacer (`ARC45_LOCAL_SAMPLES` 30 samples, `DIAGONAL_LOCAL_SAMPLES` 30 samples per VibeRacer source; verify before porting).
- Per-wheel threshold defaults to half the lane width; expose as a constant.
- The blocked-by here is the centerline foundation slice; do not start until that ships and merges.

## Verify

- [ ] All sister-slice verifications still pass
- [ ] arc45 and diagonal pieces drivable end-to-end with car staying on-street through the curves
- [ ] F-003 and F-004 entries in `docs/FOLLOWUPS.md` get a `Resolved: PR #N` line appended (append-only)
- [ ] GDD coverage rows for REQ-061 and REQ-062 may flip from `partial` to `done` if the spec's geometry expectation is met
