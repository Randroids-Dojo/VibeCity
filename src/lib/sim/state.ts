import { z } from 'zod'

/**
 * Sim engine state (REQ-070, REQ-072 substrate slice 1).
 *
 * The sim engine owns the city's mutable simulation state between user
 * inputs. State is the deterministic reduction of the city's event log
 * (`SimEvent[]`, see `./events.ts`). Each per-layer bucket starts empty
 * and is populated by per-layer reducers as future slices land
 * (population by REQ-075, zones by REQ-080, power by REQ-085, etc.).
 *
 * Slice 1 ships only the engine-level fields (`tick`, `simTimeMs`,
 * `speed`, `taxRates`) plus the empty per-layer buckets. The bucket
 * schemas use `.passthrough()` until their owning slices replace them
 * with `.strict()` schemas; the substrate must not enforce shape on a
 * layer that has not landed yet.
 */

/**
 * Sim speed multiplier (Q-011 default: Pause / 1x / 2x / 4x).
 *
 * `0` is paused (a first-class state, not just "no advance"); `1` /
 * `2` / `4` are wall-time multipliers. The substrate exposes only this
 * enum; the UI control lives in the sim-as-primary view slice (REQ-110).
 */
export const SimSpeedSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(4),
])
export type SimSpeed = z.infer<typeof SimSpeedSchema>

export const DEFAULT_SIM_SPEED: SimSpeed = 1

/**
 * Per-zone-type tax rate (REQ-095 economy slice). Stored as a unit
 * fraction (`0.07` for 7%) so per-tick revenue math reads as
 * `population * rate` without unit conversion. Substrate slice 1
 * carries the field; the economy slice fills in the per-tick reducer.
 */
export const TaxRatesSchema = z
  .object({
    residential: z.number().min(0).max(1),
    commercial: z.number().min(0).max(1),
    industrial: z.number().min(0).max(1),
  })
  .strict()
export type TaxRates = z.infer<typeof TaxRatesSchema>

export const DEFAULT_TAX_RATES: TaxRates = {
  residential: 0.07,
  commercial: 0.07,
  industrial: 0.05,
}

/**
 * Per-layer state buckets. Each bucket is the canonical home for one
 * sim layer's mutable state. Slice 1 ships every bucket as an empty
 * object so the layer slices can grow into them without changing the
 * top-level `SimState` shape.
 *
 * Each bucket schema is `.passthrough()` (NOT `.strict()`) so an
 * in-flight layer can write to its bucket without the substrate
 * having to ship the layer's schema first. When a layer slice lands,
 * it replaces its bucket schema with a `.strict()` version; the
 * substrate's `applySimEvent` reducer dispatches on event type, so
 * a layer that has not landed yet means its events fall through to
 * a no-op return-state-unchanged.
 */
export const PopulationBucketSchema = z.object({}).passthrough()
export const ZonesBucketSchema = z.object({}).passthrough()
export const PowerBucketSchema = z.object({}).passthrough()
export const WaterBucketSchema = z.object({}).passthrough()
export const EconomyBucketSchema = z.object({}).passthrough()
export const ServicesBucketSchema = z.object({}).passthrough()
export const DisastersBucketSchema = z.object({}).passthrough()

export type PopulationBucket = z.infer<typeof PopulationBucketSchema>
export type ZonesBucket = z.infer<typeof ZonesBucketSchema>
export type PowerBucket = z.infer<typeof PowerBucketSchema>
export type WaterBucket = z.infer<typeof WaterBucketSchema>
export type EconomyBucket = z.infer<typeof EconomyBucketSchema>
export type ServicesBucket = z.infer<typeof ServicesBucketSchema>
export type DisastersBucket = z.infer<typeof DisastersBucketSchema>

/**
 * Top-level sim state. Stored on `City.sim` (optional; absent on
 * pre-pivot v1 cities, present after the first sim event fires).
 *
 * Strict on unknown fields so a future bucket addition forces a
 * schema bump rather than silently extending the shape.
 */
export const SimStateSchema = z
  .object({
    tick: z.number().int().min(0),
    simTimeMs: z.number().int().min(0),
    speed: SimSpeedSchema,
    taxRates: TaxRatesSchema,
    population: PopulationBucketSchema,
    zones: ZonesBucketSchema,
    power: PowerBucketSchema,
    water: WaterBucketSchema,
    economy: EconomyBucketSchema,
    services: ServicesBucketSchema,
    disasters: DisastersBucketSchema,
  })
  .strict()
export type SimState = z.infer<typeof SimStateSchema>

/**
 * The empty sim state. Exported so callers (the substrate's first
 * tick, the `applySimEvent` reducer's initial accumulator) can return
 * a known-good payload without reconstructing it.
 *
 * Frozen at module load to catch any accidental mutation; the reducer
 * contract is pure (input -> output), so direct mutation of the
 * exported constant is always a bug.
 */
export const EMPTY_SIM_STATE: SimState = Object.freeze({
  tick: 0,
  simTimeMs: 0,
  speed: DEFAULT_SIM_SPEED,
  taxRates: DEFAULT_TAX_RATES,
  population: Object.freeze({}) as PopulationBucket,
  zones: Object.freeze({}) as ZonesBucket,
  power: Object.freeze({}) as PowerBucket,
  water: Object.freeze({}) as WaterBucket,
  economy: Object.freeze({}) as EconomyBucket,
  services: Object.freeze({}) as ServicesBucket,
  disasters: Object.freeze({}) as DisastersBucket,
}) as SimState
