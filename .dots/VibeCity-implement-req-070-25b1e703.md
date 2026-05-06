---
title: "implement: REQ-070..074 sim engine substrate (tick scheduler + event sourcing + reconcile)"
status: active
priority: 1
issue-type: task
created-at: "\"2026-05-05T22:36:02.353723-05:00\""
---

## Description

Foundation for every other sim layer AND for concurrent edit reconciliation. Ship the substrate as a single coherent slice: tick scheduler at 4Hz default, event log as the source of truth (Q-012 event sourcing), pure reducer `(state, event) -> state`, layer registration with fixed run order (power -> water -> zoning -> citizens -> economy -> services -> disasters), client-side authority with periodic event-batch flush to server (Q-010 modified), snapshotting per Q-013 (every 1000 events or 30 minutes of sim time).

## Context

Q-009 (sim pivot), Q-010 (client-side auth + server event log), Q-012 (event sourcing for concurrent reconciliation), Q-013 (snapshotting), and Q-014 (sim ticks are events) collapse into a single substrate slice because each layer above will reach into all five concerns. Shipping them piecemeal would force every per-layer slice to define its own event vocabulary, its own persistence path, and its own reconcile contract. One foundation slice; everything above plugs in.

## Affected Files

- `src/lib/simEvents.ts` (new): the event union (`SimEvent = PlaceZoneEvent | EraseZoneEvent | RunPowerLineEvent | TickEvent | SetSpeedEvent | ...`), zod schemas for each, the `applySimEvent(state, event)` pure reducer, the `reduceSimEvents(events, initialState)` helper.
- `src/lib/simState.ts` (new): the `SimState` type carrying per-layer buckets (`population`, `zones`, `power`, `water`, `economy`, `services`, `disasters`), the `EMPTY_SIM_STATE` constant, the layer registration table.
- `src/lib/simEngine.ts` (new): the per-frame tick scheduler (uses `requestAnimationFrame` for the 4Hz tick on a `setInterval(..., 250)`), event-batch buffer, idle / save flush trigger.
- `src/app/api/city/[slug]/events/route.ts` (new): POST appends event batch to the sorted set keyed by `clientReceivedAt-authorBuilderId`; GET returns the tail since a cursor; both validate the cookie shape per REQ-009.
- `src/lib/kv.ts`: extend `kvKeys` with `cityEvents(slug)`, `citySnapshot(slug, eventCursor)`, `citySnapshotIndex(slug)`. Keep the existing `cityLatest(slug)` etc. unchanged for the v1 placeholder building loadCity path during the migration window.
- `src/lib/loadCity.ts`: extend to load via snapshot + tail when the slug has an event log; fall back to the legacy state-blob path when the slug only has the v1 shape (zero events).
- `src/lib/schemas.ts`: extend `City` with optional `sim?: SimState` field (`.strict()` schema; absent on v1 cities, present on sim-pivoted cities).
- `tests/lib/simEvents.test.ts` (new): reducer cases for each event type, replay-from-empty-equals-state invariant, idempotent-tick guard, deterministic-replay guard (same events in same order produce same state).
- `tests/lib/simEngine.test.ts` (new): scheduler cases, batch-on-idle flush, snapshot-at-N-events trigger.
- `tests/app/api.cityEvents.test.ts` (new): POST appends, GET returns tail, ordering by `clientReceivedAt` with `authorBuilderId` tiebreak.

## Implementation Notes

- `clientReceivedAt` on each event is the millisecond timestamp the SERVER stamps on receipt, NOT the client's local clock; trusting client clocks would let one tab claim ordering primacy by being late. The client may send a hint timestamp (`clientCreatedAt`), but ordering uses `clientReceivedAt`.
- Snapshot computation runs server-side on a Vercel Function triggered when the event count crosses 1000 since the last snapshot. The function reads the snapshot, replays the tail, writes the new snapshot, prunes archived events.
- Event-log size is bounded by snapshotting + pruning; the sorted set never grows unboundedly.
- The flush trigger runs on three conditions: (a) the page transitions to `visibilitychange = 'hidden'`, (b) idle for 5 seconds with non-empty buffer, (c) explicit user "save" action (which the autosave code already runs). On each flush, POST the buffer; on success, clear the buffer; on failure, retain the buffer and retry on the next trigger.
- Authority is local: a client renders state derived from `local events + last server tail`. When the server returns a fresh tail, the client folds it in. There is no "client is wrong, server overrides" branch; the reducer is deterministic so every client converges to the same state.
- The migration window: cities with no event log (the v1 cities) load via the existing path. Cities with an event log load via the new path. A v1 city becomes a sim-pivoted city the first time someone interacts with the new sim view; until that moment, the city stays loadable via the legacy path.

## Verify

- [ ] `npm run type-check` / `npm run test` / `npm run build` all pass
- [ ] Two browser tabs at the same slug both edit; after each tab's flush trigger, both tabs converge on the same derived state
- [ ] Snapshotting triggers at 1000 events and at 30 minutes of sim time (test with sped-up sim time)
- [ ] Cold load of a slug with 100k events fetches the most recent snapshot + ~1000 events tail, not all 100k
- [ ] No em-dash / en-dash via grep
- [ ] Sim runs at 4Hz when speed = 1x; pauses on speed = 0; doubles on 2x; quadruples on 4x
- [ ] All five sub-questions tracked in `docs/gdd/13-sim-engine.md` are either resolved or have a Recommended default applied

## Coverage impact

Shipping this slice flips REQ-070 from `not_started` to `done` (or `partial` if some sub-REQs land in follow-on slices). Adds build log entries to `docs/gdd/13-sim-engine.md`.
