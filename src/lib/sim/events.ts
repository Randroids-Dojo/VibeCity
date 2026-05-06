import { z } from 'zod'
import { BuilderIdSchema } from '@/lib/schemas'
import {
  DEFAULT_SIM_SPEED,
  DEFAULT_TAX_RATES,
  EMPTY_SIM_STATE,
  SimSpeedSchema,
  TaxRatesSchema,
  type SimState,
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
 * Layer-specific event schemas (REQ-075 through REQ-105).
 *
 * Reserved in the union for forward-compat so a city built on a newer
 * sim layer can be loaded by a substrate-only client without a parse
 * failure. The reducer dispatches on `type`; unknown / not-yet-
 * implemented event types fall through to no-op return-state-unchanged
 * (see `applySimEvent` below). Each layer slice replaces its placeholder
 * schema with a strict spec when it lands.
 */
const PlaceholderLayerEventSchema = EventMetaSchema.extend({
  type: z.enum([
    'placeZone',
    'eraseZone',
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
  return {
    ...state,
    tick: state.tick + 1,
    simTimeMs: state.simTimeMs + event.payload.deltaMs,
  }
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

/**
 * Re-export the defaults so callers do not have to reach across two
 * files for the substrate constants. The state module owns the
 * canonical values; this module owns the events that mutate them.
 */
export { DEFAULT_SIM_SPEED, DEFAULT_TAX_RATES, EMPTY_SIM_STATE }
