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
    cityHappiness: z.number().min(0).max(100),
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

/**
 * Water layer constants (REQ-090 slice 1 of N).
 *
 * v1 ships two source types: `water-tower` (small, 50 units capacity)
 * and `pump-station` (large, 200 units). Pipes are single-cell, snap-
 * grid pieces with a `water` vs `sewage` kind so the connectivity
 * solver in slice 2 can route fresh water from sources to zones and
 * waste from zones to sewage-treatment plants.
 */
export const WaterSourceKindSchema = z.enum(['water-tower', 'pump-station'])
export type WaterSourceKind = z.infer<typeof WaterSourceKindSchema>

export const WATER_SOURCE_CAPACITY: Record<WaterSourceKind, number> = {
  'water-tower': 50,
  'pump-station': 200,
}

export const WATER_PIPE_MAINTENANCE_PER_TICK = 0.04
export const WATER_SOURCE_MAINTENANCE_PER_TICK: Record<WaterSourceKind, number> = {
  'water-tower': 0.3,
  'pump-station': 0.8,
}

export const WaterPipeKindSchema = z.enum(['water', 'sewage'])
export type WaterPipeKind = z.infer<typeof WaterPipeKindSchema>

/**
 * Sewage treatment plant capacity in waste-units drained per tick
 * (REQ-092 sewage slice 1 of N). One plant drains up to 100 cells'
 * worth of accumulated waste each tick when its sewage-pipe network
 * connects to populated cells. The constant lives here so future
 * slices (waste accumulation, happiness penalty) can reference the
 * single source of truth.
 */
export const SEWAGE_TREATMENT_CAPACITY = 100
export const SEWAGE_TREATMENT_MAINTENANCE_PER_TICK = 0.6

/**
 * Per-tick waste accumulation tunables (REQ-092 sewage slice 4).
 *
 * Every populated cell adds `WASTE_INCREMENT_PER_TICK` to its waste
 * counter each tick unless its sewage status is 'drained', in which
 * case the counter resets to 0. The counter is capped at
 * `WASTE_MAX_PER_CELL` so it does not grow unbounded; the cap also
 * keeps reducer output stable across long replays.
 */
export const WASTE_INCREMENT_PER_TICK = 1
export const WASTE_MAX_PER_CELL = 100

/**
 * City happiness defaults (REQ-092 sewage slice 5 / REQ-076 follow-on).
 *
 * Citizen happiness is a 0..100 city-wide score driven by the average
 * waste accumulation across populated cells. With 0 populated cells
 * happiness reads as `DEFAULT_CITY_HAPPINESS = 100` (no one to be
 * unhappy). Once cells exist, every populated cell contributes its
 * `wasteAccumulation` to the average; the average normalizes against
 * `WASTE_MAX_PER_CELL` so 100 average waste means 0 happiness, 0
 * average waste means 100 happiness.
 */
export const DEFAULT_CITY_HAPPINESS = 100

/**
 * One placed sewage treatment plant (REQ-092 slice 1). Single-cell
 * anchor. v1 has no per-plant tier; capacity is the uniform
 * `SEWAGE_TREATMENT_CAPACITY` constant. Treatment plants pair with
 * sewage pipes (already in the `pipes` map keyed by `"row,col"`); the
 * future slice 2 sewage solver walks (plants + sewage pipes) the same
 * way the water solver walks (sources + water pipes).
 */
export const SewageTreatmentPlantSchema = z
  .object({
    row: z.number().int(),
    col: z.number().int(),
  })
  .strict()
export type SewageTreatmentPlant = z.infer<typeof SewageTreatmentPlantSchema>

/**
 * One placed water source (REQ-090 slice 1). Single-cell anchor +
 * kind. v1 has no per-source tier; capacity is uniform per kind.
 */
export const WaterSourceSchema = z
  .object({
    kind: WaterSourceKindSchema,
    row: z.number().int(),
    col: z.number().int(),
  })
  .strict()
export type WaterSource = z.infer<typeof WaterSourceSchema>

/**
 * Water bucket (REQ-090 slice 1, extended in REQ-092 slice 1).
 * `sources` array preserves placement order; the connectivity solver
 * walks it. `pipes` is keyed by `"row,col"` with the kind
 * discriminator so a single cell holds either a water pipe OR a
 * sewage pipe (one cell, one kind; an attempt to overlay water +
 * sewage at the same cell overwrites). `treatmentPlants` carries the
 * REQ-092 sewage plant anchors; the slice 2 sewage solver walks
 * (treatmentPlants + sewage pipes) for the drain-side connectivity.
 */
export const WaterBucketSchema = z
  .object({
    sources: z.array(WaterSourceSchema),
    pipes: z.record(z.string(), WaterPipeKindSchema),
    treatmentPlants: z.array(SewageTreatmentPlantSchema),
    wasteAccumulation: z.record(z.string(), z.number().min(0)),
  })
  .strict()

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
 * Build costs deducted from `economy.treasury` on placement
 * (REQ-095 slice 2). Numbers are SimCity-2000 shaped so the v1
 * starter treasury (`INITIAL_TREASURY = 20000`) can buy a small
 * starter loop (coal plant, half a dozen residential zones, a few
 * line cells) without immediately bankrupting the player. Treasury
 * is allowed to go negative on a placement that exceeds the balance;
 * the bankruptcy countdown (REQ-095 slice 3) is the consequence.
 */
export const POWER_PLANT_BUILD_COST: Record<PowerPlantKind, number> = {
  coal: 4000,
  solar: 2500,
}

/**
 * Bankruptcy threshold (REQ-095 slice 3). The economy reducer counts
 * consecutive ticks where `treasury < 0` and the HUD warning fires
 * once the counter is positive. The threshold names the deadline:
 * after `BANKRUPTCY_THRESHOLD_TICKS` consecutive deficit ticks the
 * city is bankrupt and the player is offered reset-budget /
 * reset-city (slice 4 lands those reset events). At the default 4Hz
 * tick rate, 240 ticks = 60 seconds; long enough for the player to
 * react after the warning fires, short enough to be a real pressure.
 */
export const BANKRUPTCY_THRESHOLD_TICKS = 240
export const POWER_LINE_BUILD_COST = 5
export const ZONE_BUILD_COST: Record<'residential' | 'commercial' | 'industrial', number> = {
  residential: 50,
  commercial: 75,
  industrial: 100,
}
export const WATER_SOURCE_BUILD_COST: Record<WaterSourceKind, number> = {
  'water-tower': 400,
  'pump-station': 1500,
}
export const WATER_PIPE_BUILD_COST = 5
export const SEWAGE_TREATMENT_BUILD_COST = 2500

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
    bankruptcyTickCounter: z.number().int().min(0),
  })
  .strict()
export type EconomyBucket = z.infer<typeof EconomyBucketSchema>

export const EMPTY_ECONOMY_BUCKET: EconomyBucket = Object.freeze({
  treasury: INITIAL_TREASURY,
  lastTickIncome: 0,
  lastTickMaintenance: 0,
  bankruptcyTickCounter: 0,
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
 * Per-kind service build cost (REQ-095 slice 2). The hospital is the
 * largest investment; the garbage depot is the cheapest. Treasury
 * is allowed to go negative on placement; the bankruptcy countdown
 * (REQ-095 slice 3) handles the consequence.
 */
export const SERVICE_BUILD_COST: Record<ServiceKind, number> = {
  'police-station': 500,
  'fire-station': 500,
  hospital: 1500,
  school: 750,
  'garbage-depot': 400,
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

/**
 * Disaster layer (REQ-105 substrate slice 1 of N).
 *
 * v1 ships five disaster kinds matching the spec: fire, flood,
 * tornado, earthquake, monster. Each is anchored at a single cell
 * and carries a `ticksRemaining` counter that the per-tick reducer
 * decrements until it hits 0 (the disaster ends and the entry is
 * removed). The substrate slice ships only the place / despawn
 * events and the per-tick decrement; the visible payoff (damage
 * application, mesh visualization, audio) lands in follow-on slices.
 */
export const DisasterKindSchema = z.enum([
  'fire',
  'flood',
  'tornado',
  'earthquake',
  'monster',
])
export type DisasterKind = z.infer<typeof DisasterKindSchema>

/**
 * Default duration per disaster kind (in ticks). At the default 4Hz
 * tick rate, 60 ticks = 15 seconds; long enough for the player to
 * react and short enough that the disaster does not stretch into
 * tedium. Numbers are tunable; playtest will scale them as the
 * damage / repair / insurance loops come online.
 */
export const DISASTER_DEFAULT_DURATION_TICKS: Record<DisasterKind, number> = {
  fire: 60,
  flood: 120,
  tornado: 40,
  earthquake: 20,
  monster: 80,
}

/**
 * Per-tick fire spread probability (REQ-105 slice 3). Each active
 * fire rolls once per tick; on a hit, the fire spawns a fresh fire
 * at a random 4-adjacent cell. The probability is intentionally low
 * so a single fire is a slow burn rather than instant pandemonium;
 * the player has time to build fire stations or wait it out. Fire
 * stations within their coverage radius prevent new fires from
 * landing on covered cells.
 *
 * The "rng" is a deterministic hash of `(tick, row, col)` so the
 * event log replays bit-for-bit identically across clients.
 */
export const FIRE_SPREAD_PROBABILITY_PER_TICK = 0.05

export const DisasterSchema = z
  .object({
    kind: DisasterKindSchema,
    row: z.number().int(),
    col: z.number().int(),
    ticksRemaining: z.number().int().min(0),
  })
  .strict()
export type Disaster = z.infer<typeof DisasterSchema>

export const DisastersBucketSchema = z
  .object({
    active: z.array(DisasterSchema),
  })
  .strict()

export type PopulationBucket = z.infer<typeof PopulationBucketSchema>

export const EMPTY_POPULATION_BUCKET: PopulationBucket = Object.freeze({
  cells: Object.freeze({}) as Record<string, PopulationCell>,
  totalPopulation: 0,
  totalTripDemand: 0,
  cityHappiness: DEFAULT_CITY_HAPPINESS,
}) as PopulationBucket
export type WaterBucket = z.infer<typeof WaterBucketSchema>

export const EMPTY_WATER_BUCKET: WaterBucket = Object.freeze({
  sources: Object.freeze([] as WaterSource[]) as WaterSource[],
  pipes: Object.freeze({}) as Record<string, WaterPipeKind>,
  treatmentPlants: Object.freeze(
    [] as SewageTreatmentPlant[],
  ) as SewageTreatmentPlant[],
  wasteAccumulation: Object.freeze({}) as Record<string, number>,
}) as WaterBucket

/** Compose a stable pipe key matching `zoneCellKey` / `powerLineKey`. */
export function waterPipeKey(row: number, col: number): string {
  return `${row},${col}`
}
export type ServicesBucket = z.infer<typeof ServicesBucketSchema>

export const EMPTY_SERVICES_BUCKET: ServicesBucket = Object.freeze({
  buildings: Object.freeze([] as ServiceBuilding[]) as ServiceBuilding[],
}) as ServicesBucket
export type DisastersBucket = z.infer<typeof DisastersBucketSchema>

export const EMPTY_DISASTERS_BUCKET: DisastersBucket = Object.freeze({
  active: Object.freeze([] as Disaster[]) as Disaster[],
}) as DisastersBucket

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
  water: EMPTY_WATER_BUCKET,
  economy: EMPTY_ECONOMY_BUCKET,
  services: EMPTY_SERVICES_BUCKET,
  disasters: EMPTY_DISASTERS_BUCKET,
}) as SimState
