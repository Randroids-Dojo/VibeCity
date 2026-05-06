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
 * sim layer's mutable state. The substrate ships every bucket the
 * layer slices can grow into without changing the top-level
 * `SimState` shape.
 *
 * Layers that have not landed yet keep their bucket as
 * `.passthrough()` so a substrate-only client can carry forward
 * forward-compat data without enforcing a shape. When a layer slice
 * lands, it tightens its bucket to `.strict()` here; the substrate's
 * `applySimEvent` reducer dispatches on event type, so a layer that
 * has not landed yet means its events fall through to a no-op
 * return-state-unchanged.
 */
/**
 * Residential capacity per density step (REQ-075 slice 1 of N).
 *
 * Mirrors the SimCity 2000 organic-growth taxonomy: density 0 is
 * "zoned but nothing built" (0 residents), density 1 is a single
 * small house (4), density 2 is a mid-density block (12), density 3
 * is an apartment building (40). Numbers are tunable; playtest can
 * scale them as the citizen happiness / employment layers come
 * online and we see what feels right.
 *
 * Commercial and industrial zones do not contribute to residents
 * but DO contribute to job slots in a follow-on slice (REQ-083).
 * v1 ships only the residential capacity numbers because residents
 * are the first visible-on-the-grid sim signal.
 */
export const RESIDENTIAL_CAPACITY_BY_DENSITY: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: 4,
  2: 12,
  3: 40,
}

/**
 * Per-cell population state (REQ-075 slice 1 of N).
 *
 * `residents` is the integer count of citizens living in this cell.
 * `tripDemand` counts the pending trips this cell has generated
 * toward commercial / industrial cells; the NPC vehicle layer
 * (REQ-077, future ambient-AI dot) drains this counter by spawning
 * cars from the cell. v1 ships the field on the cell so the
 * vehicle layer has something to read; the per-tick increment
 * lands in slice 2.
 */
export const PopulationCellSchema = z
  .object({
    residents: z.number().int().min(0),
    tripDemand: z.number().int().min(0),
  })
  .strict()
export type PopulationCell = z.infer<typeof PopulationCellSchema>

/**
 * Population bucket (REQ-075 slice 1).
 *
 * `cells` is keyed by `"row,col"` matching `zoneCellKey` so a future
 * slice that joins zones with population (e.g. "render the resident
 * count on top of each residential zone cell") compares string keys
 * directly. `totalPopulation` is the sum across cells; carrying it
 * on the bucket avoids an O(N) reduce on every read in the HUD.
 * `totalTripDemand` likewise.
 */
export const PopulationBucketSchema = z
  .object({
    cells: z.record(z.string(), PopulationCellSchema),
    totalPopulation: z.number().int().min(0),
    totalTripDemand: z.number().int().min(0),
  })
  .strict()

/**
 * Zone cell state (REQ-080 zoning slice 1 of N).
 *
 * `kind` selects the zone category. `density` tracks SimCity-style
 * organic growth: 0 is an empty zoned cell that has not grown yet,
 * 1..3 are the low/medium/high density steps that the per-tick
 * growth reducer (REQ-081, follow-on slice) advances toward as
 * citizen / power / water / services demand allows.
 *
 * The spec text in `docs/gdd/15-zoning-and-business.md` REQ-084
 * originally placed zones on the existing `city.buildings` array as
 * a discriminated union. After Q-012 (event sourcing) resolved, the
 * cleaner home is `city.sim.zones.cells` because the reducer is
 * scoped to mutate sim state only; the legacy `city.buildings`
 * array stays untouched for v1 placeholder buildings (small-house
 * etc.) and a future migration slice can lift those into the zone
 * system when the visual divergence becomes a felt gap.
 */
export const ZoneKindSchema = z.enum([
  'residential',
  'commercial',
  'industrial',
])
export type ZoneKind = z.infer<typeof ZoneKindSchema>

/**
 * Density step from 0 (empty zoned cell) to 3 (max). Growth is
 * organic and gated by the per-tick growth reducer (REQ-081, follow-on
 * slice); slice 1 ships the field on the cell so place / erase events
 * can record the state at the time of placement.
 */
export const ZoneDensitySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
])
export type ZoneDensity = z.infer<typeof ZoneDensitySchema>

export const ZoneCellSchema = z
  .object({
    kind: ZoneKindSchema,
    density: ZoneDensitySchema,
  })
  .strict()
export type ZoneCell = z.infer<typeof ZoneCellSchema>

/**
 * Zones bucket (REQ-080 slice 1). Cells keyed by `"row,col"` so
 * lookup is O(1) and JSON serialization preserves the cell map.
 * Strict on the bucket and on each cell so an unknown field at
 * either level fails validation.
 */
export const ZonesBucketSchema = z
  .object({
    cells: z.record(z.string(), ZoneCellSchema),
  })
  .strict()
export type ZonesBucket = z.infer<typeof ZonesBucketSchema>

export const EMPTY_ZONES_BUCKET: ZonesBucket = Object.freeze({
  cells: Object.freeze({}) as Record<string, ZoneCell>,
}) as ZonesBucket

/**
 * Tick interval for per-tick zone growth (REQ-081). Every GROWTH_INTERVAL_TICKS
 * ticks, every zoned cell with density < 3 advances by 1.
 *
 * 20 ticks at the 4Hz default speed = 5 seconds of wall time per
 * density step at 1x; a fresh zone reaches max density 3 in ~15 seconds.
 * 2x and 4x speeds compress proportionally because each tick advances
 * the engine identically; the speed setting changes the wall-clock
 * pace, not the per-tick math.
 *
 * Slice 1 of REQ-081: deterministic growth (every Nth tick advances
 * every <3-density cell). The follow-on slice gates growth on
 * supply / demand (citizens REQ-075, power REQ-085, water REQ-090,
 * services REQ-100 coverage); v1 ships unconditional growth so the
 * player sees the system advance immediately.
 */
export const GROWTH_INTERVAL_TICKS = 20

/**
 * Compose a stable cell key from a `(row, col)` coordinate. Mirrors
 * the existing `"row,col"` convention used by `streetCellSet` and
 * `buildingCellSet` so the zoning layer integrates cleanly with the
 * existing cell-based collision and lookup helpers.
 */
export function zoneCellKey(row: number, col: number): string {
  return `${row},${col}`
}

/**
 * Power plant kind (REQ-085 slice 1 of N).
 *
 * v1 ships two plant types: `coal` (cheap, dirty, 100 MW capacity)
 * and `solar` (expensive, clean, 30 MW). Pollution effects (REQ-089)
 * and per-cell capacity allocation (REQ-087 connectivity solver)
 * land in slice 2 / 3 once the connectivity solver is in place.
 */
export const PowerPlantKindSchema = z.enum(['coal', 'solar'])
export type PowerPlantKind = z.infer<typeof PowerPlantKindSchema>

/**
 * Per-plant capacity in megawatts (REQ-085 slice 1). The connectivity
 * solver in slice 2 sums capacity across the connected component a
 * cell sits in, then divides among demanding cells; the per-cell
 * powered / browned-out / unpowered classification (REQ-087) reads
 * these numbers.
 *
 * v1 numbers are SimCity-2000-shaped and can tune in playtest:
 * coal at 100 MW serves a small grid, solar at 30 MW is the clean
 * starter. A future slice can add wind / nuclear / hydro plant
 * types.
 */
export const POWER_PLANT_CAPACITY_MW: Record<PowerPlantKind, number> = {
  coal: 100,
  solar: 30,
}

/**
 * One power plant placed on the city grid (REQ-085 slice 1).
 *
 * Plants are 2x2 multi-cell footprints in the spec text (REQ-085).
 * Slice 1 records the anchor cell only; the multi-cell footprint
 * resolution lands with the UI slice (REQ-085 slice 3) which needs
 * to know plant footprint when validating placement against existing
 * pieces / buildings / lines / other plants.
 */
export const PowerPlantSchema = z
  .object({
    kind: PowerPlantKindSchema,
    row: z.number().int(),
    col: z.number().int(),
  })
  .strict()
export type PowerPlant = z.infer<typeof PowerPlantSchema>

/**
 * Power grid bucket (REQ-085 slice 1).
 *
 * `plants` is an ordered array so placement order is preserved (the
 * connectivity solver does not depend on order, but the array is
 * the natural shape for "list of placed plants" iteration).
 *
 * `lines` is a `Record<"row,col", true>` so cell membership is O(1)
 * and JSON-roundtrips cleanly. `true` is the only meaningful value
 * (a cell is either a line or it is not); a future slice can extend
 * the value to per-line metadata if voltage / damage / age becomes
 * a felt gap.
 */
export const PowerBucketSchema = z
  .object({
    plants: z.array(PowerPlantSchema),
    lines: z.record(z.string(), z.literal(true)),
  })
  .strict()
export type PowerBucket = z.infer<typeof PowerBucketSchema>

export const EMPTY_POWER_BUCKET: PowerBucket = Object.freeze({
  plants: Object.freeze([] as PowerPlant[]) as PowerPlant[],
  lines: Object.freeze({}) as Record<string, true>,
}) as PowerBucket

/**
 * Compose a stable line key from a `(row, col)` coordinate. Mirrors
 * `zoneCellKey` so the zoning layer and the power layer share the
 * same convention; a future slice that checks "is this cell a zone
 * AND a line" compares string keys directly.
 */
export function powerLineKey(row: number, col: number): string {
  return `${row},${col}`
}

export const WaterBucketSchema = z.object({}).passthrough()

/**
 * Economy layer constants (REQ-095 slice 1 of N).
 *
 * Treasury starts at `INITIAL_TREASURY = 20000` (SimCity 2000 small-
 * map default scaled to the v1 grid). Per-tick income from a
 * residential cell is `residents * stateTaxRates.residential` (default
 * 7%); maintenance per line cell is `LINE_MAINTENANCE_PER_TICK`,
 * per plant `PLANT_MAINTENANCE_PER_TICK`. Numbers are tunable; the
 * goal in slice 1 is "treasury moves visibly within the first 30
 * seconds of placing a residential zone with power" so a player
 * sees the loop tick over.
 */
export const INITIAL_TREASURY = 20000
export const LINE_MAINTENANCE_PER_TICK = 0.05
export const PLANT_MAINTENANCE_PER_TICK = 0.5

/**
 * Economy bucket (REQ-095 slice 1).
 *
 * `treasury` is the running cash balance. `lastTickIncome` and
 * `lastTickMaintenance` are surfaced for HUD readouts so the player
 * can see what tax revenue and infra cost were on the most recent
 * tick without recomputing them. Slice 2 lands the build-cost
 * deduction on placement and the bankruptcy countdown.
 */
export const EconomyBucketSchema = z
  .object({
    treasury: z.number(),
    lastTickIncome: z.number().min(0),
    lastTickMaintenance: z.number().min(0),
  })
  .strict()
export type EconomyBucket = z.infer<typeof EconomyBucketSchema>

export const EMPTY_ECONOMY_BUCKET: EconomyBucket = Object.freeze({
  treasury: INITIAL_TREASURY,
  lastTickIncome: 0,
  lastTickMaintenance: 0,
}) as EconomyBucket
/**
 * Service buildings (REQ-100 slice 1 of N).
 *
 * v1 ships five service kinds matching the section spec: police,
 * fire, hospital, school, and garbage. Each is a single-cell
 * footprint anchored at `(row, col)`. Per-kind coverage radius
 * (`SERVICE_COVERAGE_CELLS`) and per-tick maintenance cost
 * (`SERVICE_MAINTENANCE_PER_TICK`) constants live alongside.
 */
export const ServiceKindSchema = z.enum([
  'police-station',
  'fire-station',
  'hospital',
  'school',
  'garbage-depot',
])
export type ServiceKind = z.infer<typeof ServiceKindSchema>

/**
 * Per-kind coverage radius in grid cells (REQ-101 solver, slice 2).
 * The solver counts a populated cell as "covered" by service kind X
 * when at least one X service building's anchor is within the radius
 * (4-direction Chebyshev or L1; v1 picks Manhattan distance for
 * simplicity since the grid is square). Numbers are tunable; the
 * ratios reflect the spec's "hospital is the largest, school is the
 * smallest" intuition.
 */
export const SERVICE_COVERAGE_CELLS: Record<ServiceKind, number> = {
  'police-station': 6,
  'fire-station': 6,
  hospital: 8,
  school: 5,
  'garbage-depot': 6,
}

/**
 * Per-tick maintenance cost per service (REQ-095 + REQ-100). Services
 * are more expensive than power infrastructure because they bring a
 * coverage benefit; the economy layer pulls these numbers in slice 2
 * once `applyEconomyTick` reads from `state.services`.
 */
export const SERVICE_MAINTENANCE_PER_TICK: Record<ServiceKind, number> = {
  'police-station': 1.0,
  'fire-station': 1.0,
  hospital: 1.5,
  school: 0.8,
  'garbage-depot': 0.6,
}

/**
 * One placed service building (REQ-100 slice 1). Single-cell anchor
 * + kind. v1 has no per-building tier (clinic vs hospital); the
 * coverage radius is uniform per kind. A future slice can extend
 * with funding sliders or service quality.
 */
export const ServiceBuildingSchema = z
  .object({
    kind: ServiceKindSchema,
    row: z.number().int(),
    col: z.number().int(),
  })
  .strict()
export type ServiceBuilding = z.infer<typeof ServiceBuildingSchema>

/**
 * Services bucket (REQ-100 slice 1). Buildings array preserves
 * placement order; the per-tick coverage solver (slice 2) walks the
 * array. A future denser-grid optimization can add a per-cell index.
 */
export const ServicesBucketSchema = z
  .object({
    buildings: z.array(ServiceBuildingSchema),
  })
  .strict()

export const DisastersBucketSchema = z.object({}).passthrough()

export type PopulationBucket = z.infer<typeof PopulationBucketSchema>

export const EMPTY_POPULATION_BUCKET: PopulationBucket = Object.freeze({
  cells: Object.freeze({}) as Record<string, PopulationCell>,
  totalPopulation: 0,
  totalTripDemand: 0,
}) as PopulationBucket
export type WaterBucket = z.infer<typeof WaterBucketSchema>
export type ServicesBucket = z.infer<typeof ServicesBucketSchema>

export const EMPTY_SERVICES_BUCKET: ServicesBucket = Object.freeze({
  buildings: Object.freeze([] as ServiceBuilding[]) as ServiceBuilding[],
}) as ServicesBucket
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
  population: EMPTY_POPULATION_BUCKET,
  zones: EMPTY_ZONES_BUCKET,
  power: EMPTY_POWER_BUCKET,
  water: Object.freeze({}) as WaterBucket,
  economy: EMPTY_ECONOMY_BUCKET,
  services: EMPTY_SERVICES_BUCKET,
  disasters: Object.freeze({}) as DisastersBucket,
}) as SimState
