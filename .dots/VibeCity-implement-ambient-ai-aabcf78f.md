---
title: "implement: ambient AI traffic - cars driving the placed streets"
status: open
priority: 3
issue-type: task
created-at: "2026-05-05T21:22:12.501514-05:00"
---

## Description

Spawn N ambient cars (default 3, capped at 6) on `path.segments[0]`. Each follower advances along the segment by parameter `t` at a constant world-units-per-second rate, reads its world position from `sampledPointsForPiece`, and despawns when it reaches the segment end. A new follower respawns at the segment start after a small jitter delay. Pure follower behavior: no path-finding, no collision avoidance, no traffic AI.

## Context

Highest-leverage "city is alive" feature that is purely visual and does NOT touch the city schema. Reuses the sampled-centerline geometry foundation. Per pillar 3, this still requires Q-009 resolution before landing because "ambient cars driving" is one step closer to traffic-AI than the GDD currently fences in.

## Blocked By

- `implement: sampled centerline geometry layer for trackPath` (this slice cannot start without `sampledPointsForPiece`)
- Q-009 resolution (sim-mechanic scope). If Q-009 resolves toward "no sim mechanics until v1.1", this slice gets deferred to v1.1; if Q-009 resolves toward "ambient visual layers in scope", this slice unblocks immediately

## Affected Files

- `src/app/[slug]/ambientTraffic.ts` (new pure module): exports `AMBIENT_TRAFFIC_DEFAULT_COUNT = 3`, `AMBIENT_TRAFFIC_MAX_COUNT = 6`, `AMBIENT_TRAFFIC_SPEED = CELL_SIZE * 4`, `AMBIENT_TRAFFIC_RESPAWN_JITTER_MS = 1500`, `AmbientCar` type carrying `{ t, segmentIndex, color }`, `advanceAmbientCar(car, dt, segmentLength)` returning the next state, `ambientCarWorldPose(car, segments)` returning `{ x, z, heading }` from the segment samples
- `src/app/[slug]/DriveSceneClient.tsx`: spawn N ambient car groups (each a small primitive box, NOT the GLB to keep render cost bounded), advance them in the per-frame integration tick after `applyDriveStep`, write per-car positions to the scene each frame
- `tests/app/ambientTraffic.test.ts`: cases for advancement, respawn, segment-end behavior, fresh-state contract

## Implementation Notes

- Ambient cars do NOT collide with the player car. The player drives through them with no penalty. Adding collision is a follow-on slice, not this one.
- Ambient cars use the same primitive `BoxGeometry` body that the player car had pre-fidelity-bump. Consistent and cheap.
- Cap on N is a perf guard, not a design statement. Bump the cap if playtest reveals it as a fun blocker.

## Verify

- [ ] All foundation slice verifications pass
- [ ] Dev server: drive a city with one segment; observe 3 ambient cars cruising the segment in the same direction
- [ ] No regression on framerate at the chase camera under 6 ambient cars
- [ ] Empty city renders zero ambient cars
- [ ] Player car can drive through ambient cars (no blocking, no penalty)
