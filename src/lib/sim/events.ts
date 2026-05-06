import { z } from 'zod'
import { BuilderIdSchema } from '@/lib/schemas'
import {
  DEFAULT_SIM_SPEED,
  DEFAULT_TAX_RATES,
  EMPTY_SIM_STATE,
  GROWTH_INTERVAL_TICKS,
  SimSpeedSchema,
  TaxRatesSchema,
  ZoneKindSchema,
  zoneCellKey,
  type SimState,
  type ZoneCell,
  type ZoneDensity,
  type ZonesBucket,
} from './state'

/**
 * Sim event log entries (REQ-072 substrate slice 1).
 *
 * Every state mutation is an event recorded in an append-only log.
 * State is the deterministic reduction of the log:
 * `events.reduce(applySimEvent, EMPTY_SIM_STATE)`. Q-014 default A
 * (sim ticks ARE events) means even per-tick advances are events,
 * so two clients deriving state from the same log derive identical
 * state. This is the load-bearing property of the concurrent-edit
 * reconciliation under Q-012 event sourcing.
 *
 * Slice 1 ships only the engine-level events (`tick`, `setSpeed`,
 * `setTaxRate`). Layer-specific events (`placeZone`, `runPowerLine`,
 * `placePowerPlant`, `placeServiceBuilding`, etc.) are reserved in
 * the union but reduce to no-op return-state-unchanged until their
 * owning layer slice lands and extends the dispatch.
 *
 * Event ordering: every event carries `clientCreatedAt` (millisecond
 * timestamp the client stamped when the user action fired) AND the
 * server stamps `clientReceivedAt` on receipt. The canonical
 * ordering is by `clientReceivedAt` (server-stamped, untrusted client
 * clocks cannot bid for ordering primacy by being late). Replay uses
 * server order. The slice that ships the persistence layer
 * (`/api/city/[slug]/events`) enforces the server-stamp; this slice
 * defines the schema only.
 */

/**
 * Common metadata on every event. Every event carries who fired it
 * (REQ-009 builder cookie) and when (both client-stamped and the
 * server-stamped receive time). `clientReceivedAt` is optional in the
 * schema because a fresh, in-flight event on the client side has not
 * yet been stamped; the persistence layer adds it on POST.
 */
const EventMetaSchema = z.object({
  clientCreatedAt: z.number().int().min(0),
  clientReceivedAt: z.number().int().min(0).optional(),
  authorBuilderId: BuilderIdSchema,
})

/**
 * `tick` event. Advance simulation by one tick (REQ-070). Carries the
 * sim-time millisecond delta this tick advances. Q-014 default A
 * makes ticks events so replay is deterministic.
 */
export const TickEventSchema = EventMetaSchema.extend({
  type: z.literal('tick'),
  payload: z
    .object({
      deltaMs: z.number().int().min(0),
    })
    .strict(),
}).strict()
export type TickEvent = z.infer<typeof TickEventSchema>

/**
 * `setSpeed` event. Change the sim speed (Q-011 Pause / 1x / 2x / 4x).
 * Pause is a first-class state, not "speed 0" arithmetic; the engine
 * checks `speed === 0` to decide whether to enqueue the next tick.
 */
export const SetSpeedEventSchema = EventMetaSchema.extend({
  type: z.literal('setSpeed'),
  payload: z
    .object({
      speed: SimSpeedSchema,
    })
    .strict(),
}).strict()
export type SetSpeedEvent = z.infer<typeof SetSpeedEventSchema>

/**
 * `setTaxRate` event. Adjust the tax rate slider for one zone type.
 * The economy slice (REQ-095) consumes this in the per-tick revenue
 * math; substrate slice 1 only stores the value.
 */
export const SetTaxRateEventSchema = EventMetaSchema.extend({
  type: z.literal('setTaxRate'),
  payload: z
    .object({
      kind: z.enum(['residential', 'commercial', 'industrial']),
      rate: z.number().min(0).max(1),
    })
    .strict(),
}).strict()
export type SetTaxRateEvent = z.infer<typeof SetTaxRateEventSchema>

/**
 * `placeZone` event (REQ-080 zoning slice 1 of N). Zones a single
 * cell. The cell starts at density 0; the per-tick growth reducer
 * (REQ-081, follow-on slice) will advance it as demand allows. A
 * `placeZone` on a cell that is already zoned overwrites the kind
 * but keeps the existing density (the player paints over an
 * existing zone to retype it without resetting growth; if the player
 * wants to wipe and start over, they `eraseZone` first then
 * `placeZone`).
 */
export const PlaceZoneEventSchema = EventMetaSchema.extend({
  type: z.literal('placeZone'),
  payload: z
    .object({
      kind: ZoneKindSchema,
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type PlaceZoneEvent = z.infer<typeof PlaceZoneEventSchema>

/**
 * `eraseZone` event (REQ-080 slice 1 of N). Removes a zoned cell.
 * No-op if the cell is not zoned (the reducer returns identity); the
 * client may dispatch `eraseZone` for any clicked cell without
 * checking the local map first.
 */
export const EraseZoneEventSchema = EventMetaSchema.extend({
  type: z.literal('eraseZone'),
  payload: z
    .object({
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type EraseZoneEvent = z.infer<typeof EraseZoneEventSchema>

/**
 * Layer-specific event schemas reserved for forward-compat (REQ-085
 * through REQ-105).
 *
 * Reserved in the union for forward-compat so a city built on a newer
 * sim layer can be loaded by a substrate-only client without a parse
 * failure. The reducer dispatches on `type`; unknown / not-yet-
 * implemented event types fall through to no-op return-state-unchanged
 * (see `applySimEvent` below). Each layer slice replaces its placeholder
 * schema with a strict spec when it lands.
 *
 * `placeZone` and `eraseZone` are NOT in this list because REQ-080
 * slice 1 ships their strict schemas; the discriminated union below
 * routes them to their typed variants.
 */
const PlaceholderLayerEventSchema = EventMetaSchema.extend({
  type: z.enum([
    'runPowerLine',
    'eraseLine',
    'placePowerPlant',
    'placeWaterSource',
    'placeServiceBuilding',
    'spawnDisaster',
  ]),
  payload: z.unknown(),
}).strict()
export type PlaceholderLayerEvent = z.infer<typeof PlaceholderLayerEventSchema>

/**
 * The sim event union. Discriminated on `type`.
 */
export const SimEventSchema = z.discriminatedUnion('type', [
  TickEventSchema,
  SetSpeedEventSchema,
  SetTaxRateEventSchema,
  PlaceZoneEventSchema,
  EraseZoneEventSchema,
  PlaceholderLayerEventSchema,
])
export type SimEvent = z.infer<typeof SimEventSchema>

/**
 * The pure sim event reducer. Input state is treated as immutable:
 * the function returns either the input state unchanged (no-op) or
 * a fresh state object (mutation).
 *
 * Determinism: for any sequence `[e1, e2, ..., eN]` and any starting
 * `state0`, `events.reduce(applySimEvent, state0)` always produces
 * the same final state. This is the property the concurrent-edit
 * reconciliation under Q-012 relies on: two clients with the same
 * event log converge to the same state without per-field merge
 * logic.
 */
export function applySimEvent(state: SimState, event: SimEvent): SimState {
  switch (event.type) {
    case 'tick':
      return applyTick(state, event)
    case 'setSpeed':
      return applySetSpeed(state, event)
    case 'setTaxRate':
      return applySetTaxRate(state, event)
    case 'placeZone':
      return applyPlaceZone(state, event)
    case 'eraseZone':
      return applyEraseZone(state, event)
    default:
      // Layer-specific events fall through to no-op until their slice
      // lands and extends the dispatch.
      return state
  }
}

/**
 * Convenience helper: derive state by replaying every event from a
 * starting accumulator. The starting accumulator defaults to
 * `EMPTY_SIM_STATE`.
 */
export function reduceSimEvents(
  events: ReadonlyArray<SimEvent>,
  state: SimState = EMPTY_SIM_STATE,
): SimState {
  let acc = state
  for (const event of events) {
    acc = applySimEvent(acc, event)
  }
  return acc
}

function applyTick(state: SimState, event: TickEvent): SimState {
  // Paused sim ignores tick events. The substrate ignores them at the
  // reducer; the scheduler is also expected to skip enqueueing them
  // while paused (REQ-070), but the reducer is the source of truth so
  // a stray paused-tick event does not advance state.
  if (state.speed === 0) return state
  const nextTick = state.tick + 1
  const nextZones = maybeGrowZones(state.zones, nextTick)
  return {
    ...state,
    tick: nextTick,
    simTimeMs: state.simTimeMs + event.payload.deltaMs,
    zones: nextZones,
  }
}

/**
 * Per-tick zone growth (REQ-081 slice 1). Returns the input bucket
 * unchanged when this tick is not a growth tick OR every zoned cell
 * is already at max density. Otherwise returns a fresh bucket with
 * every density-<3 cell advanced by 1.
 *
 * Deterministic: replay over the same event log produces the same
 * growth at the same ticks. v1 advances unconditionally; the
 * follow-on slice gates growth on per-cell supply / demand from the
 * citizens (REQ-075), power (REQ-085), water (REQ-090), and services
 * (REQ-100) layers.
 */
export function maybeGrowZones(
  zones: ZonesBucket,
  tick: number,
): ZonesBucket {
  if (tick <= 0 || tick % GROWTH_INTERVAL_TICKS !== 0) return zones
  const cellKeys = Object.keys(zones.cells)
  if (cellKeys.length === 0) return zones
  let changed = false
  const nextCells: Record<string, ZoneCell> = {}
  for (const key of cellKeys) {
    const cell = zones.cells[key]
    if (cell.density >= 3) {
      nextCells[key] = cell
      continue
    }
    changed = true
    const advanced: ZoneDensity = (cell.density + 1) as ZoneDensity
    nextCells[key] = { kind: cell.kind, density: advanced }
  }
  if (!changed) return zones
  return { cells: nextCells }
}

function applySetSpeed(state: SimState, event: SetSpeedEvent): SimState {
  if (state.speed === event.payload.speed) return state
  return {
    ...state,
    speed: event.payload.speed,
  }
}

function applySetTaxRate(
  state: SimState,
  event: SetTaxRateEvent,
): SimState {
  const { kind, rate } = event.payload
  if (state.taxRates[kind] === rate) return state
  return {
    ...state,
    taxRates: {
      ...state.taxRates,
      [kind]: rate,
    },
  }
}

function applyPlaceZone(state: SimState, event: PlaceZoneEvent): SimState {
  const { kind, row, col } = event.payload
  const key = zoneCellKey(row, col)
  const existing = state.zones.cells[key]
  // Painting the same kind on the same cell is a no-op (player
  // clicked twice on the same already-zoned cell). The reducer
  // returns identity so the engine sees the event was processed
  // without a state change.
  if (existing && existing.kind === kind) return state
  // Preserve existing density when retyping a zoned cell so the
  // player can paint over without resetting growth. A first-time
  // zoning lands at density 0 and the per-tick growth reducer
  // advances it (REQ-081, follow-on slice).
  const next: ZoneCell = {
    kind,
    density: existing?.density ?? 0,
  }
  return {
    ...state,
    zones: {
      cells: {
        ...state.zones.cells,
        [key]: next,
      },
    },
  }
}

function applyEraseZone(state: SimState, event: EraseZoneEvent): SimState {
  const { row, col } = event.payload
  const key = zoneCellKey(row, col)
  if (state.zones.cells[key] === undefined) return state
  const nextCells = { ...state.zones.cells }
  delete nextCells[key]
  return {
    ...state,
    zones: { cells: nextCells },
  }
}

/**
 * Re-export the defaults so callers do not have to reach across two
 * files for the substrate constants. The state module owns the
 * canonical values; this module owns the events that mutate them.
 */
export { DEFAULT_SIM_SPEED, DEFAULT_TAX_RATES, EMPTY_SIM_STATE }
