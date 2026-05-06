import { applySimEvent, type SimEvent, type TickEvent } from './events'
import { EMPTY_SIM_STATE, type SimSpeed, type SimState } from './state'
import type { BuilderId } from '@/lib/schemas'

/**
 * Sim engine runtime helpers (REQ-070..074 substrate slice 3 of 4).
 *
 * Pure state-and-helper functions that drive the client-side sim
 * loop. The DOM and timer wiring (setInterval, visibilitychange,
 * fetch to `/api/city/[slug]/events`) lives in the React hook that
 * lands in a follow-on slice; this module ships only the pure logic
 * so the tests can exercise tick scheduling, event buffering, and
 * flush-decision math without mocking timers or the DOM.
 *
 * Concurrent edit reconciliation contract (Q-012 event sourcing):
 *
 *   1. User actions and per-tick `tick` events both go through
 *      `enqueueEvent`. The local state advances immediately
 *      (snappy feel) and the event is buffered for flush.
 *   2. The flush trigger fires on three conditions: pending count
 *      reaches `FLUSH_BATCH_MAX`, idle time since last enqueue
 *      reaches `FLUSH_IDLE_MS`, or an explicit save action calls
 *      `commitFlush` after POSTing the batch.
 *   3. After a successful POST, the server returns the new cursor;
 *      `commitFlush` clears the pending buffer and advances the
 *      local `serverCursor` to match.
 *   4. Periodically (or after a flush response includes new server
 *      events from another client), the local runtime calls
 *      `foldServerEvents` to apply the new tail to local state and
 *      advance the cursor.
 *
 * Every helper here is pure: input runtime -> output runtime. The
 * runtime holder is a plain object; the React hook in the follow-on
 * slice is responsible for storing it in a ref or state.
 */

/**
 * Base tick interval at 1x speed (REQ-070 4Hz default). Higher speeds
 * scale this down: 2x => 125ms, 4x => 62.5ms. Pause yields no tick at
 * all (`tickIntervalMs` returns null).
 */
export const TICK_INTERVAL_MS_BASE = 250

/**
 * Idle time before the engine triggers a flush even if the batch is
 * not full (REQ-074 reconcile contract). 5 seconds matches the dev's
 * 2026-05-05 answer to the broadcast-rate question (flush on idle /
 * save). Shorter intervals would burn server bandwidth on quiescent
 * sessions; longer intervals would let other clients see stale state
 * for unacceptable durations.
 */
export const FLUSH_IDLE_MS = 5000

/**
 * Maximum pending events before forcing a flush. Matches the server
 * route's `MAX_EVENTS_PER_BATCH` so a flush always succeeds in one
 * POST. A client generating events faster than the server can drain
 * would observe the buffer cap as the natural backpressure signal.
 */
export const FLUSH_BATCH_MAX = 256

/**
 * The runtime holder. Plain object so the React hook in the follow-on
 * slice can store it in a `useRef` without React noticing per-tick
 * mutations.
 *
 * - `state`: the local derived sim state (the reduction of every
 *   confirmed server event plus every locally-pending event).
 * - `pendingEvents`: events the local sim has emitted but the server
 *   has not yet confirmed.
 * - `serverCursor`: the integer index of the last server event the
 *   local runtime has folded in. Advances on flush response and on
 *   `foldServerEvents` calls.
 * - `lastEnqueueAtMs`: timestamp of the most recent enqueue, used
 *   for the idle-flush trigger. `null` when the buffer is empty.
 */
export interface EngineRuntime {
  state: SimState
  pendingEvents: ReadonlyArray<SimEvent>
  serverCursor: number
  lastEnqueueAtMs: number | null
}

/**
 * The starting runtime. Empty state, empty buffer, cursor 0.
 */
export const EMPTY_ENGINE_RUNTIME: EngineRuntime = Object.freeze({
  state: EMPTY_SIM_STATE,
  pendingEvents: Object.freeze([]),
  serverCursor: 0,
  lastEnqueueAtMs: null,
})

/**
 * Per-tick interval at the given speed. Returns null when paused so
 * the React hook knows to skip scheduling.
 *
 * Speeds 1 / 2 / 4 produce intervals 250 / 125 / 62.5 ms. The 62.5ms
 * is rounded by the React hook to 63ms (a setInterval cannot fire
 * sub-millisecond intervals reliably). The simTime advance per tick
 * uses the exact 62.5 so per-tick math stays consistent across
 * speeds.
 */
export function tickIntervalMs(speed: SimSpeed): number | null {
  if (speed === 0) return null
  return TICK_INTERVAL_MS_BASE / speed
}

/**
 * Build a `tick` event matching the runtime's current speed. Returns
 * null when paused. Caller stamps `clientCreatedAt` with the current
 * wall-clock time and the engine's builder id.
 */
export function buildTickEvent(
  runtime: EngineRuntime,
  builderId: BuilderId,
  nowMs: number,
): TickEvent | null {
  const interval = tickIntervalMs(runtime.state.speed)
  if (interval === null) return null
  return {
    type: 'tick',
    payload: { deltaMs: interval },
    clientCreatedAt: nowMs,
    authorBuilderId: builderId,
  }
}

/**
 * Enqueue an event onto the runtime. Advances local state via the
 * pure reducer and appends the event to the pending buffer.
 *
 * No-op short-circuit when the reducer returns the same state: the
 * event still goes into the buffer (so the server log records it for
 * other clients) but the lastEnqueueAtMs still advances so the idle
 * trigger fires correctly. The reducer's identity-on-no-change short
 * circuit applies to the local state; the buffered event is still
 * shipped because another client's reduction may differ (e.g. it has
 * a different speed and the setSpeed event matters there).
 */
export function enqueueEvent(
  runtime: EngineRuntime,
  event: SimEvent,
  nowMs: number,
): EngineRuntime {
  return {
    ...runtime,
    state: applySimEvent(runtime.state, event),
    pendingEvents: [...runtime.pendingEvents, event],
    lastEnqueueAtMs: nowMs,
  }
}

/**
 * Decide whether the runtime should flush right now.
 *
 * Returns true on three conditions per the reconcile contract:
 *   - pending count >= `FLUSH_BATCH_MAX` (forced flush)
 *   - idle since `lastEnqueueAtMs` >= `FLUSH_IDLE_MS`
 *
 * Explicit save actions bypass this helper and call `commitFlush`
 * directly with the server response. The `visibilitychange='hidden'`
 * trigger also bypasses this helper (the React hook reads
 * `pendingEvents.length > 0` directly and POSTs).
 */
export function shouldFlush(runtime: EngineRuntime, nowMs: number): boolean {
  if (runtime.pendingEvents.length === 0) return false
  if (runtime.pendingEvents.length >= FLUSH_BATCH_MAX) return true
  if (runtime.lastEnqueueAtMs === null) return false
  return nowMs - runtime.lastEnqueueAtMs >= FLUSH_IDLE_MS
}

/**
 * Commit a successful flush: clear the pending buffer and advance
 * the server cursor to the value returned by the server.
 *
 * Caller is responsible for actually POSTing the events; this helper
 * only updates the runtime after a confirmed success.
 *
 * Idempotent: a `commitFlush` with the same cursor as the current
 * runtime returns identity. A `commitFlush` with a cursor LOWER than
 * the current is a server bug (cursor only advances); the helper
 * silently ignores it rather than rolling back state.
 */
export function commitFlush(
  runtime: EngineRuntime,
  newServerCursor: number,
): EngineRuntime {
  if (newServerCursor < runtime.serverCursor) return runtime
  if (
    runtime.pendingEvents.length === 0 &&
    newServerCursor === runtime.serverCursor
  ) {
    return runtime
  }
  return {
    ...runtime,
    pendingEvents: [],
    serverCursor: newServerCursor,
    lastEnqueueAtMs: null,
  }
}

/**
 * Fold a tail of server events into the local runtime. Called when
 * the GET endpoint returns events from another client (or the
 * client's own events that landed via a different cursor on the
 * server). Advances local state via the same pure reducer and
 * advances the local serverCursor.
 *
 * The serverEvents must be in canonical server order (the GET
 * endpoint guarantees this; the route returns events in list-index
 * order). The newServerCursor must equal the GET response's
 * `nextCursor`.
 *
 * No-op short-circuit when the events array is empty.
 */
export function foldServerEvents(
  runtime: EngineRuntime,
  serverEvents: ReadonlyArray<SimEvent>,
  newServerCursor: number,
): EngineRuntime {
  if (serverEvents.length === 0) return runtime
  let nextState = runtime.state
  for (const event of serverEvents) {
    nextState = applySimEvent(nextState, event)
  }
  return {
    ...runtime,
    state: nextState,
    serverCursor: newServerCursor,
  }
}

/**
 * Convenience for the React hook's cold-load path: take a snapshot
 * (from the GET endpoint), then fold any tail events on top, and
 * return the resulting runtime with `serverCursor` set to the cold
 * load endpoint's `nextCursor`.
 *
 * Snapshot is unknown-typed because the SimStateSchema validation
 * lives in the consumer; this helper trusts the caller to pass a
 * valid SimState (or `null` for no snapshot).
 */
export function loadFromColdResponse(
  snapshot: SimState | null,
  tailEvents: ReadonlyArray<SimEvent>,
  serverCursor: number,
): EngineRuntime {
  const baseState = snapshot ?? EMPTY_SIM_STATE
  let nextState = baseState
  for (const event of tailEvents) {
    nextState = applySimEvent(nextState, event)
  }
  return {
    state: nextState,
    pendingEvents: [],
    serverCursor,
    lastEnqueueAtMs: null,
  }
}
