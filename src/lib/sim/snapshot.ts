import { SimEventSchema, reduceSimEvents, type SimEvent } from './events'
import { EMPTY_SIM_STATE, type SimState } from './state'

/**
 * Sim event log snapshotting (REQ-070..074 substrate slice 4 of 5,
 * Q-013 snapshotting strategy).
 *
 * Cold load of a long-running slug is `O(N)` in the event count
 * without snapshotting. A 4Hz sim accumulating 14400 events per hour
 * would cost the cold-load path 14400 reducer calls per hour of
 * sim runtime. Snapshots cap that cost: every N events the server
 * folds the tail into a derived `SimState`, writes it under
 * `city:${slug}:snapshot`, and records the cursor that snapshot
 * incorporates under `city:${slug}:snapshot:cursor`. Cold load reads
 * snapshot + tail-since-snapshot, bounding replay cost to N events.
 *
 * Q-013 default A: every 1000 events. The 30-minute-sim-time half of
 * the OR is deferred to a follow-on slice (it requires reducing the
 * tail to know simTimeMs, which is cheaper to do at the count
 * threshold anyway; the time threshold matters only in a
 * "running-but-quiet" scenario which v1 rarely hits).
 *
 * Pruning: this slice does NOT prune events older than the snapshot
 * from the live list. Cursor advancement on the client is index-based
 * (see slice 2's GET endpoint) and pruning would invalidate live
 * cursors. Storage growth is bounded by event-rate * session-length;
 * a v1.1 follow-on can add archival to a separate key when storage
 * pressure is observed.
 */

/**
 * Snapshot trigger: write a new snapshot whenever the event log has
 * grown by this many events since the last snapshot (or since
 * inception, if no snapshot yet exists).
 */
export const SNAPSHOT_EVERY_N_EVENTS = 1000

/**
 * Pure decision: should we write a new snapshot now?
 *
 * Returns true iff the unsnapshotted-event count (`currentLength
 * - snapshotCursor`) has reached or exceeded `SNAPSHOT_EVERY_N_EVENTS`.
 * Inputs below zero (defensive against KV-returned NaN cursors) treat
 * snapshotCursor as 0.
 */
export function shouldSnapshot(
  currentLength: number,
  snapshotCursor: number,
): boolean {
  if (!Number.isFinite(currentLength) || currentLength < 0) return false
  const cursor =
    Number.isFinite(snapshotCursor) && snapshotCursor > 0 ? snapshotCursor : 0
  return currentLength - cursor >= SNAPSHOT_EVERY_N_EVENTS
}

/**
 * Pure: derive the new snapshot state by folding the tail events into
 * the previous snapshot (or `EMPTY_SIM_STATE` when no prior snapshot
 * exists).
 *
 * Caller is responsible for parsing the raw KV strings into `SimEvent`
 * objects (validation may drop malformed entries silently per the
 * slice-2 read path; the snapshot writer mirrors that contract via
 * `parseEventStrings` below).
 */
export function buildSnapshot(
  previous: SimState | null,
  tailEvents: ReadonlyArray<SimEvent>,
): SimState {
  const start = previous ?? EMPTY_SIM_STATE
  return reduceSimEvents(tailEvents, start)
}

/**
 * Parse and validate a list of raw event strings (the JSON-encoded
 * shape stored in `city:${slug}:events`). Drops malformed or
 * unknown-typed entries silently per the slice-2 read-path
 * convention; the snapshot writer cannot recover from a bad event
 * either, and replaying it would diverge state.
 *
 * Returns the parsed events in the order they appeared in the input.
 */
export function parseEventStrings(
  raws: ReadonlyArray<string>,
): SimEvent[] {
  const events: SimEvent[] = []
  for (const raw of raws) {
    try {
      const obj = JSON.parse(raw) as unknown
      const validated = SimEventSchema.safeParse(obj)
      if (validated.success) events.push(validated.data)
    } catch {
      // ignore parse errors; the bad entry is permanently in the log
    }
  }
  return events
}
