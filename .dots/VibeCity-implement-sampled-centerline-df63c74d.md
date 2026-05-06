---
title: "implement: sampled centerline geometry layer for trackPath"
status: open
priority: 4
issue-type: task
created-at: "2026-05-05T21:21:54.350863-05:00"
---

## Description

Port VibeRacer's `SampledPoint` / `OrderedPiece.samples` / `arcCenter` shape into `src/lib/trackPath.ts` so each cell in the path exposes centerline geometry (`x`, `z`, `heading`, parameterized `t` in `[0, 1]` from entry to exit). Today `OrderedPiece` only carries `entryDir` / `exitDir`. There is no per-piece geometry, which is why REQ-032 wheel contact landed as cell-locator-binary instead of centerline-distance-scored.

## Context

This is the foundation slice for three downstream wins:

1. **F-003 / F-004** (arc45 + diagonal sampled geometry + wheel contact) cannot land without it.
2. **Per-wheel distance-to-centerline scoring** would let the off-street penalty grade smoothly instead of flipping at cell boundaries (meaningfully better drive feel).
3. **Ambient AI traffic** (downstream dot) needs a continuous parameter to advance follower cars along the street.

VibeRacer's reference implementation lives at `../VibeRacer/src/game/trackPath.ts`. The existing VibeCity port already has the connectivity layer and the `cellToLocators` map; this slice adds the geometry that those locators were always supposed to expose.

## Affected Files

- `src/lib/trackPath.ts`: extend `OrderedPiece` with `center` / `entry` / `exit` / `arcCenter` / `samples` fields; add `STRAIGHT_LOCAL_SAMPLES`, `LEFT90_LOCAL_SAMPLES`, `RIGHT90_LOCAL_SAMPLES`, `SWEEP_LEFT_LOCAL_SAMPLES`, `SWEEP_RIGHT_LOCAL_SAMPLES`, `MEGA_SWEEP_LEFT_LOCAL_SAMPLES`, `MEGA_SWEEP_RIGHT_LOCAL_SAMPLES`, `HAIRPIN_LOCAL_SAMPLES`, `SCURVE_LOCAL_SAMPLES` constants; add `sampledPointsForPiece(piece)` resolver
- `tests/lib/trackPath.test.ts`: add cases for each piece type's sample set (entry-equal-first-sample, exit-equal-last-sample, monotonic `t`, heading-tangent-to-direction, fresh-array contract)

## Implementation Notes

- arc45 and diagonal samples are out of scope for this slice. They land in the follow-on (F-003 / F-004) so this slice stays reviewable. The resolver returns `null` for those types this slice.
- The intersection piece samples one straight per arm (4 sample arrays, indexed by which arm); for v1, return only the pass-through-by-entry-port arm so the existing intersection walker behavior stays unchanged.
- Do NOT rewrite the connectivity layer. This slice adds geometry on top of the existing `OrderedPiece` shape, it does not refactor the walker.

### VibeRacer reference pattern

`../VibeRacer/src/game/trackPath.ts` is the reference. Key shape to mirror:

```ts
const SCURVE_LOCAL_SAMPLES = sampleScurveLocal()
const SCURVE_LEFT_LOCAL_SAMPLES = sampleScurveLeftLocal()
const SWEEP_RIGHT_LOCAL_SAMPLES = sampleSweepRightLocal()
const SWEEP_LEFT_LOCAL_SAMPLES = mirrorSweepSamples(SWEEP_RIGHT_LOCAL_SAMPLES)
const MEGA_SWEEP_RIGHT_LOCAL_SAMPLES = sampleMegaSweepRightLocal()
const MEGA_SWEEP_LEFT_LOCAL_SAMPLES = mirrorSweepSamples(MEGA_SWEEP_RIGHT_LOCAL_SAMPLES)
const HAIRPIN_LOCAL_SAMPLES = sampleHairpinLocal()
```

Mirror helpers (`mirrorSweepSamples`) flip a right-handed sample set into the left-handed counterpart to halve the per-piece sampling code. Adopt the same pattern.

The resolver in VibeRacer is split: `sweepLocalSamplesFor(piece)` for the sweep family (one big if-cascade), and a separate `buildScurveSamples(piece, entryDir)` for the scurve family because scurves carry an `entryDir`-dependent reversal. The reversal trick (lines around 800-820 in VibeRacer's trackPath.ts):

```ts
const reversed = entryDir !== baseEntryAfterRotation
const transformed = localSamples.map((s) => transformSample(s, transform))
if (!reversed) return transformed
const out = transformed.slice().reverse()
return out.map((s) => ({ x: s.x, z: s.z, heading: s.heading + Math.PI }))
```

The reversal-with-heading-flip is the load-bearing detail. When the path walker enters a piece from the opposite end, the local samples reverse AND every heading rotates 180deg so headings still face the direction of travel. Drop this and the chase camera will look backward through every reversed segment.

VibeRacer ships more piece types than VibeCity (wideArc45Right/Left, diagonalSweepRight/Left, kinkRight/Left, offsetStraightRight/Left, grandSweepRight/Left, hairpinTight, hairpinWide, arc45Left, flexStraight). Port only the types that are in `PieceTypeSchema` today. Do NOT introduce new piece types this slice.

## Verify

- [ ] `npm run type-check` passes
- [ ] `npm run test` passes; new test cases cover every supported piece type
- [ ] No em-dash / en-dash via grep
- [ ] `validateConnections` still returns the same results for every existing test case (no regression on the connectivity layer)
- [ ] Existing `summarizeTrackPath` and `cellToLocators` consumers continue to work without changes

## Coverage impact

Shipping this slice should flip `REQ-064` (segment-based path) from `partial` to `done` in `docs/GDD_COVERAGE.json` (the geometry layer was the named missing piece). It also advances:

- `REQ-032` (drive mode wheel contact) toward `done` once `offStreetPenalty.ts` adopts the per-wheel distance-to-centerline scoring (could be a follow-on slice or part of the arc45-diagonal sister slice).
- `REQ-060` (hairpin) toward `done` (geometry is the missing piece for full drivability).
- Unblocks the arc45-diagonal sister slice, which closes `REQ-061` and `REQ-062`.

Append a build log entry to `docs/gdd/06-city-schema.md` per the GDD build-log discipline (paths-scoped rule loads when editing GDD section files).
