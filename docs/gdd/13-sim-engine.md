# 13. Sim Engine Substrate

**Status:** partial

The sim engine is the tick-driven simulation kernel that owns the city's mutable state between user inputs. Every other sim layer (citizens, zoning, power, water, economy, services, disasters) reads from and writes to the substrate this section defines. Without it the layers cannot coordinate; with it they layer cleanly.

## What this section covers

This file is the canonical spec for the sim engine substrate (REQ-070 through REQ-074).

- **REQ-070** Tick scheduler. The sim advances at a fixed rate (default 4 Hz, sim time != wall time so a paused tab does not lose state). Each tick: collect all pending intents, run layer steps in declared order, emit a `tick` event into the event log (Q-014 default A), persist the event flush on idle / save (Q-013).
- **REQ-071** Sim time and speed. Wall-clock decoupled. UI exposes `Pause / 1x / 2x / 4x` (SimCity standard, Q-011 recommended default), persisted as a `setSpeed` event. Pause is a first-class state, not "speed 0".
- **REQ-072** Event log and command vocabulary. Every state mutation (user action OR sim tick) is recorded as an event in an append-only log. v1 event vocabulary: `placeZone`, `eraseZone`, `runPowerLine`, `eraseLine`, `placePowerPlant`, `placeServiceBuilding`, `setSpeed`, `tick`, `setTaxRate`, `respawnDriver`, plus the placement / drive events that already exist (REQ-014 PUT). Each event carries `{ type, payload, simTime, authorBuilderId, clientReceivedAt }`. The reducer is pure: `reduce(state, event) -> state`. State is `events.reduce(reducer, EMPTY_CITY)`.
- **REQ-073** Persisted event log + snapshots (Q-012 event sourcing, Q-013 snapshotting). Server stores `city:${slug}:events` (sorted set keyed by `{serverReceivedAt}-{authorBuilderId}` for stable ordering) and `city:${slug}:snapshot:${eventCursor}` (a derived state at a specific event index). Snapshot policy per Q-013 default A: every 1000 events OR every 30 minutes of sim time, whichever comes first. Pruning: events older than the most recent snapshot move to a long-term archive key (debug only); the live log holds events from the most recent snapshot forward. Cold load: fetch most recent snapshot + tail events since.
- **REQ-074** Concurrent edit reconciliation (Q-012). Two clients on the same slug: each batches events locally on `setInterval` (default 2s) and on idle / save (Q-012 dev override 2026-05-05); on flush, POST batch to `/api/city/<slug>/events`. Server appends to the sorted set; orders concurrent events by `clientReceivedAt` with `authorBuilderId` tiebreak; broadcasts the resulting tail back to other clients via SSE OR (cheaper v1) the next client's poll-on-save returns the merged tail. Other clients fold the new events into their local state via the same reducer. The merge is silent; no conflict UI surfaces in v1.

## Out of scope for this section

- Per-layer logic. Each layer ships in its own section file (14 through 20).
- Drive-side rendering of sim state. That lives in section 11 (scene) and the sim-as-primary view (section 21).
- Multiplayer sim consistency. Multiplayer remains out of scope per `99-out-of-scope.md`.

## Open questions

- Q-010 resolved 2026-05-05: client-side sim authority with server-side event log. See `docs/OPEN_QUESTIONS.md`.
- Q-011 (open): sim speed maximum. Recommended default: Pause / 1x / 2x / 4x.
- Q-012 resolved 2026-05-05: event sourcing for concurrent slug editors. See `docs/OPEN_QUESTIONS.md`.
- Q-013 (open): snapshotting strategy. Recommended default: every 1000 events or 30 minutes of sim time, whichever comes first.
- Q-014 (open): are sim ticks themselves events. Recommended default: yes (deterministic replay).

### Build log

- 2026-05-05: REQ-070..074 substrate slice 1 of 4 landed (schema + event vocabulary + pure reducer). Files: `src/lib/sim/state.ts` (new pure module exporting `SimSpeedSchema` Pause/1x/2x/4x per Q-011 default A, `DEFAULT_SIM_SPEED = 1`, `TaxRatesSchema` with .strict() unit-fraction validation, `DEFAULT_TAX_RATES` matching REQ-095 economy slice defaults of 7%/7%/5%, per-layer `Population/Zones/Power/Water/Economy/Services/Disasters` bucket schemas as `.passthrough()` placeholders that will tighten when their owning slices land, top-level `SimStateSchema` with .strict() and `EMPTY_SIM_STATE` frozen at module load to catch accidental mutation), `src/lib/sim/events.ts` (new pure module exporting `TickEventSchema` / `SetSpeedEventSchema` / `SetTaxRateEventSchema` plus a `PlaceholderLayerEventSchema` reserving `placeZone`/`eraseZone`/`runPowerLine`/`eraseLine`/`placePowerPlant`/`placeWaterSource`/`placeServiceBuilding`/`spawnDisaster` for forward-compat, the `SimEvent` discriminated union, `applySimEvent(state, event)` pure reducer that dispatches by type and falls through to identity for layer events whose slice has not landed, and `reduceSimEvents(events, initial)` convenience helper that derives state from any event log; the reducer enforces paused-tick = no-op so a stray event-log replay does not advance a paused sim), `src/lib/schemas.ts` (extended `CitySchema` with optional `sim?: unknown` field; the strict shape lives in `src/lib/sim/state.ts` and a follow-on slice can flip the field to import the strict schema once the import shape is sorted; the indirection avoids a circular dep between schemas.ts and src/lib/sim/ which depends on `BuilderIdSchema`). Tests: `tests/lib/sim/state.test.ts` (28 cases), `tests/lib/sim/events.test.ts` (31 cases), `tests/lib/schemas.test.ts` (4 new cases for the sim field). Verified `npm run type-check`, `npm test` (1669/1669), `npm run build`, `npm run check:dashes`, `git diff --check` all green. REQ-070 flips not_started to partial. The persistence layer (slice 2: KV keys + /api/city/[slug]/events route), scheduler (slice 3: simEngine.ts client-side 4Hz tick + flush trigger), and snapshotting (slice 4: server-side function on event-count crossing) stay deferred to their own dots; the type vocabulary established here is the contract they all depend on. PR #N.
