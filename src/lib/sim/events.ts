import { z } from 'zod'
import { BuilderIdSchema } from '@/lib/schemas'
import { computeEarthquakeAutoSpawn } from './earthquakeAutoSpawn'
import { applyFireDamage } from './fireDamage'
import { computeFireAutoSpawn } from './fireAutoSpawn'
import { computeFireSpread } from './fireSpread'
import { applyFloodDamage } from './floodDamage'
import { applyMonsterDamage } from './monsterDamage'
import { cellHappiness } from './cellHappiness'
import { refreshPowerPollution } from './powerPollution'
import { solvePowerStatus, type CellPowerStatus } from './powerSolver'
import { solveSewageStatus } from './sewageSolver'
import { solveWaterStatus, type CellWaterStatus } from './waterSolver'
import { computeRciDemand } from './rciDemand'
import {
  cellCoverage,
  coverageCount,
  solveServicesCoverage,
} from './servicesSolver'
import { applyTornadoDamage } from './tornadoDamage'
import {
  ABANDONED_CELL_HAPPINESS_WEIGHT,
  POPULATION_MILESTONES,
  DEFAULT_SIM_SPEED,
  DEFAULT_TAX_RATES,
  COMMERCIAL_JOBS_BY_DENSITY,
  COVERAGE_HAPPINESS_WEIGHT,
  EARTHQUAKE_HAPPINESS_PENALTY,
  EMPTY_ECONOMY_BUCKET,
  MAX_ABANDONED_HAPPINESS_PENALTY,
  POLLUTION_HAPPINESS_WEIGHT,
  TAX_HAPPINESS_WEIGHT,
  TAX_NEUTRAL_RATE,
  WASTE_HAPPINESS_WEIGHT,
  CELL_DECLINE_HAPPINESS_THRESHOLD,
  CELL_DECLINE_TICKS_TO_LOSE_RESIDENT,
  DECLINE_HAPPINESS_THRESHOLD,
  EMPTY_SIM_STATE,
  GROWTH_HAPPINESS_THRESHOLD,
  GROWTH_INTERVAL_TICKS,
  MIN_SERVICES_FOR_GROWTH,
  TRIP_DEMAND_CAP_MULTIPLIER,
  INDUSTRIAL_JOBS_BY_DENSITY,
  LINE_MAINTENANCE_PER_TICK,
  BANKRUPTCY_THRESHOLD_TICKS,
  DISASTER_DEFAULT_DURATION_TICKS,
  DisasterKindSchema,
  PLANT_MAINTENANCE_PER_TICK,
  POWER_LINE_BUILD_COST,
  POWER_PLANT_BUILD_COST,
  PowerPlantKindSchema,
  RESIDENTIAL_CAPACITY_BY_DENSITY,
  SERVICE_BUILD_COST,
  SEWAGE_TREATMENT_BUILD_COST,
  ServiceKindSchema,
  SimSpeedSchema,
  TaxRatesSchema,
  WASTE_INCREMENT_PER_TICK,
  WASTE_MAX_PER_CELL,
  WATER_PIPE_BUILD_COST,
  WATER_SOURCE_BUILD_COST,
  WaterPipeKindSchema,
  WaterSourceKindSchema,
  ZONE_BUILD_COST,
  ZoneKindSchema,
  powerLineKey,
  waterPipeKey,
  zoneCellKey,
  type EconomyBucket,
  type PopulationBucket,
  type PopulationCell,
  type PowerBucket,
  type PowerPlant,
  type ServiceBuilding,
  type ServiceKind,
  type SimState,
  type TaxRates,
  type Disaster,
  type DisasterKind,
  type DisastersBucket,
  type ServicesBucket,
  type SewageTreatmentPlant,
  type WaterBucket,
  type WaterPipeKind,
  type WaterSource,
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
 * `placePowerPlant` event (REQ-085 power slice 1 of N). Adds a plant
 * at `(row, col)` with the given kind. v1 records the anchor cell
 * only; the 2x2 footprint resolution lands with the UI slice when
 * placement validation against pieces / buildings / lines / other
 * plants is needed. A `placePowerPlant` on a cell that already hosts
 * the same kind of plant returns identity (no-op idempotent click).
 */
export const PlacePowerPlantEventSchema = EventMetaSchema.extend({
  type: z.literal('placePowerPlant'),
  payload: z
    .object({
      kind: PowerPlantKindSchema,
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type PlacePowerPlantEvent = z.infer<typeof PlacePowerPlantEventSchema>

/**
 * `runPowerLine` event (REQ-085 power slice 1 of N). Marks `(row,
 * col)` as a power line cell. Lines are single-cell pieces; the
 * connectivity solver (REQ-087, slice 2) computes connected
 * components by walking the line cells. A `runPowerLine` on a cell
 * that already has a line returns identity.
 */
export const RunPowerLineEventSchema = EventMetaSchema.extend({
  type: z.literal('runPowerLine'),
  payload: z
    .object({
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type RunPowerLineEvent = z.infer<typeof RunPowerLineEventSchema>

/**
 * `eraseLine` event (REQ-085 power slice 1 of N). Removes the line
 * cell at `(row, col)`. No-op if the cell does not have a line.
 * Plants are erased via a future `erasePowerPlant` event (slice 3
 * along with the UI tool). v1 reducer ignores the event when the
 * cell has no line so client-side optimistic clicks can dispatch
 * without checking the local map first.
 */
export const EraseLineEventSchema = EventMetaSchema.extend({
  type: z.literal('eraseLine'),
  payload: z
    .object({
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type EraseLineEvent = z.infer<typeof EraseLineEventSchema>

/**
 * `placeServiceBuilding` event (REQ-100 slice 1 of N). Adds a
 * service building of the given kind at `(row, col)`. v1 records
 * the anchor cell only; the (currently single-cell) footprint
 * resolution lands with the UI slice when placement validation
 * against pieces / buildings / lines / plants is needed.
 * Idempotent on duplicate anchor + kind clicks.
 */
export const PlaceServiceBuildingEventSchema = EventMetaSchema.extend({
  type: z.literal('placeServiceBuilding'),
  payload: z
    .object({
      kind: ServiceKindSchema,
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type PlaceServiceBuildingEvent = z.infer<
  typeof PlaceServiceBuildingEventSchema
>

/**
 * `eraseServiceBuilding` event (REQ-100 slice 1 of N). Removes any
 * service building anchored at `(row, col)`. Identity on no-op.
 */
export const EraseServiceBuildingEventSchema = EventMetaSchema.extend({
  type: z.literal('eraseServiceBuilding'),
  payload: z
    .object({
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type EraseServiceBuildingEvent = z.infer<
  typeof EraseServiceBuildingEventSchema
>

/**
 * `placeWaterSource` event (REQ-090 slice 1). Adds a water source
 * (water-tower or pump-station) at `(row, col)`. Idempotent on
 * duplicate anchor + kind.
 */
export const PlaceWaterSourceEventSchema = EventMetaSchema.extend({
  type: z.literal('placeWaterSource'),
  payload: z
    .object({
      kind: WaterSourceKindSchema,
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type PlaceWaterSourceEvent = z.infer<
  typeof PlaceWaterSourceEventSchema
>

/**
 * `runWaterPipe` event (REQ-090 slice 1). Lays a water OR sewage
 * pipe at `(row, col)`. Identity on duplicate (same kind already
 * at the cell). Different kind on the same cell overwrites; the UI
 * slice will validate against existing pipes before dispatching.
 */
export const RunWaterPipeEventSchema = EventMetaSchema.extend({
  type: z.literal('runWaterPipe'),
  payload: z
    .object({
      kind: WaterPipeKindSchema,
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type RunWaterPipeEvent = z.infer<typeof RunWaterPipeEventSchema>

/**
 * `eraseWaterPipe` event (REQ-090 slice 1). Removes any pipe
 * (water or sewage) at the cell. Source erase ships with a future
 * eraseWaterSource event.
 */
export const EraseWaterPipeEventSchema = EventMetaSchema.extend({
  type: z.literal('eraseWaterPipe'),
  payload: z
    .object({
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type EraseWaterPipeEvent = z.infer<typeof EraseWaterPipeEventSchema>

/**
 * `placeSewageTreatmentPlant` event (REQ-092 sewage slice 1). Adds a
 * sewage treatment plant at `(row, col)`. Idempotent on duplicate
 * anchor.
 */
export const PlaceSewageTreatmentPlantEventSchema = EventMetaSchema.extend({
  type: z.literal('placeSewageTreatmentPlant'),
  payload: z
    .object({
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type PlaceSewageTreatmentPlantEvent = z.infer<
  typeof PlaceSewageTreatmentPlantEventSchema
>

/**
 * `eraseSewageTreatmentPlant` event (REQ-092 sewage slice 1). Removes
 * the plant anchored at the cell. Identity on missing.
 */
export const EraseSewageTreatmentPlantEventSchema = EventMetaSchema.extend({
  type: z.literal('eraseSewageTreatmentPlant'),
  payload: z
    .object({
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
type EraseSewageTreatmentPlantEvent = z.infer<
  typeof EraseSewageTreatmentPlantEventSchema
>

/**
 * Layer-specific event schemas reserved for forward-compat (REQ-105
 * disasters).
 *
 * Reserved in the union for forward-compat so a city built on a newer
 * sim layer can be loaded by a substrate-only client without a parse
 * failure. The reducer dispatches on `type`; unknown / not-yet-
 * implemented event types fall through to no-op return-state-unchanged
 * (see `applySimEvent` below). Each layer slice replaces its placeholder
 * schema with a strict spec when it lands.
 *
 * `placeZone` / `eraseZone` (REQ-080), `placePowerPlant` /
 * `runPowerLine` / `eraseLine` (REQ-085), `placeServiceBuilding` /
 * `eraseServiceBuilding` (REQ-100), and `placeWaterSource` /
 * `runWaterPipe` / `eraseWaterPipe` (REQ-090) all have strict schemas
 * and are routed in the union below.
 */
/**
 * `spawnDisaster` event (REQ-105 substrate slice 1). Adds an active
 * disaster of the given kind at `(row, col)` with a default
 * `ticksRemaining` from `DISASTER_DEFAULT_DURATION_TICKS[kind]`. The
 * per-tick reducer decrements `ticksRemaining` and removes the
 * entry when it hits 0. v1 has no overlap rejection: two disasters
 * at the same anchor coexist in the active array (the visible-
 * payoff slice can dedupe by kind+anchor if playtest reveals it as
 * a felt issue).
 */
export const SpawnDisasterEventSchema = EventMetaSchema.extend({
  type: z.literal('spawnDisaster'),
  payload: z
    .object({
      kind: DisasterKindSchema,
      row: z.number().int(),
      col: z.number().int(),
    })
    .strict(),
}).strict()
export type SpawnDisasterEvent = z.infer<typeof SpawnDisasterEventSchema>

/**
 * `resetBudget` event (REQ-095 slice 4). Restores treasury to
 * `INITIAL_TREASURY`, zeros `bankruptcyTickCounter`, and clears the
 * last-tick income / maintenance readouts. Player-fired when the
 * bankruptcy countdown is active and they want to bail out without
 * losing their city. Empty payload because the event has no
 * parameters.
 */
export const ResetBudgetEventSchema = EventMetaSchema.extend({
  type: z.literal('resetBudget'),
  payload: z.object({}).strict(),
}).strict()
export type ResetBudgetEvent = z.infer<typeof ResetBudgetEventSchema>

/**
 * `resetCity` event (REQ-095 slice 4). Resets the entire sim state
 * back to `EMPTY_SIM_STATE`. Player-fired when they want to start
 * over from scratch; the city's persisted street pieces and
 * buildings (in `City.pieces` / `City.buildings`) are NOT touched
 * by this event because they live outside the sim engine. The event
 * log is also untouched: replay still produces the post-reset state
 * because the reducer maps to `EMPTY_SIM_STATE`.
 */
export const ResetCityEventSchema = EventMetaSchema.extend({
  type: z.literal('resetCity'),
  payload: z.object({}).strict(),
}).strict()
export type ResetCityEvent = z.infer<typeof ResetCityEventSchema>

/**
 * The sim event union. Discriminated on `type`.
 */
export const SimEventSchema = z.discriminatedUnion('type', [
  TickEventSchema,
  SetSpeedEventSchema,
  SetTaxRateEventSchema,
  PlaceZoneEventSchema,
  EraseZoneEventSchema,
  PlacePowerPlantEventSchema,
  RunPowerLineEventSchema,
  EraseLineEventSchema,
  PlaceServiceBuildingEventSchema,
  EraseServiceBuildingEventSchema,
  PlaceWaterSourceEventSchema,
  RunWaterPipeEventSchema,
  EraseWaterPipeEventSchema,
  PlaceSewageTreatmentPlantEventSchema,
  EraseSewageTreatmentPlantEventSchema,
  SpawnDisasterEventSchema,
  ResetBudgetEventSchema,
  ResetCityEventSchema,
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
    case 'placePowerPlant':
      return applyPlacePowerPlant(state, event)
    case 'runPowerLine':
      return applyRunPowerLine(state, event)
    case 'eraseLine':
      return applyEraseLine(state, event)
    case 'placeServiceBuilding':
      return applyPlaceServiceBuilding(state, event)
    case 'eraseServiceBuilding':
      return applyEraseServiceBuilding(state, event)
    case 'placeWaterSource':
      return applyPlaceWaterSource(state, event)
    case 'runWaterPipe':
      return applyRunWaterPipe(state, event)
    case 'eraseWaterPipe':
      return applyEraseWaterPipe(state, event)
    case 'placeSewageTreatmentPlant':
      return applyPlaceSewageTreatmentPlant(state, event)
    case 'eraseSewageTreatmentPlant':
      return applyEraseSewageTreatmentPlant(state, event)
    case 'spawnDisaster':
      return applySpawnDisaster(state, event)
    case 'resetBudget':
      return applyResetBudget(state)
    case 'resetCity':
      return EMPTY_SIM_STATE
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
  // Fire + flood damage (REQ-105 slices 4 + 5). Drop density on
  // zoned cells that host an active fire / flood BEFORE growth so
  // damage on this tick is not replenished by a same-tick growth
  // advance. Flood applies after fire so a cell that hosts both
  // takes both checks; the fire-damage roll runs first because the
  // expected fire damage rate is higher.
  const fireDamagedZones = applyFireDamage(
    state.zones,
    state.disasters,
    nextTick,
  )
  const floodDamagedZones = applyFloodDamage(
    fireDamagedZones,
    state.disasters,
    nextTick,
  )
  // Power and water status feed the per-cell growth gates (REQ-081).
  // Each solver only runs when the city actually has the matching
  // infrastructure; an empty `{}` passes through `maybeGrowZones` as
  // "no gate" so a pre-electrical / pre-plumbing city grows the way
  // it did before these slices landed. Solving against the post-
  // damage zones bucket lines up the served cells with the same
  // densities `maybeGrowZones` will read.
  const hasPowerInfrastructure =
    state.power.plants.length > 0 ||
    Object.keys(state.power.lines).length > 0
  const powerStatus: Record<string, CellPowerStatus> = hasPowerInfrastructure
    ? solvePowerStatus(floodDamagedZones, state.power)
    : {}
  const hasWaterInfrastructure =
    state.water.sources.length > 0 ||
    Object.keys(state.water.pipes).length > 0
  const waterStatus: Record<string, CellWaterStatus> = hasWaterInfrastructure
    ? solveWaterStatus(floodDamagedZones, state.water)
    : {}
  // Services per-cell gate (REQ-100). The gate only fires once the
  // city has built out at least `MIN_SERVICES_FOR_GROWTH` distinct
  // service kinds. A partial network (1 or 2 kinds placed) would
  // make the gate impossible to satisfy by definition: max coverage
  // is bounded by the number of kinds in play, so every cell would
  // stall. Skipping the gate in that regime mirrors the back-compat
  // path the power and water gates use for empty infrastructure:
  // the city is still building out the system, so don't punish it.
  const distinctServiceKinds = new Set(
    state.services.buildings.map((b) => b.kind),
  )
  const servicesGateActive =
    distinctServiceKinds.size >= MIN_SERVICES_FOR_GROWTH
  const servicesCoverage = servicesGateActive
    ? solveServicesCoverage(floodDamagedZones, state.services)
    : {}
  const servicesCoverageCount: Record<string, number> = {}
  for (const [key, coverage] of Object.entries(servicesCoverage)) {
    servicesCoverageCount[key] = coverageCount(coverage)
  }
  const rciDemand = computeRciDemand(floodDamagedZones, state.population)
  const jobSlots = rciDemand.residential + state.population.totalPopulation
  const residentialEmploymentDemand =
    jobSlots > 0 ? rciDemand.residential : undefined
  const nextZones = maybeGrowZones(
    floodDamagedZones,
    nextTick,
    state.population.cityHappiness,
    powerStatus,
    waterStatus,
    servicesCoverageCount,
    residentialEmploymentDemand,
  )
  // Tornado damage (REQ-105 slice 7). Erases sim-state infrastructure
  // (power line / plant, water source / pipe / treatment plant,
  // service building) at every active tornado's anchor cell on a hit.
  // Runs BEFORE the economy reducer so the post-erase line / plant /
  // service counts feed the maintenance and income calc on the same
  // tick the erase happens.
  const tornadoDamaged = applyTornadoDamage(
    {
      power: state.power,
      water: state.water,
      services: state.services,
    },
    state.disasters,
    nextTick,
  )
  // Monster damage (REQ-105 slice 8). Combined density-drop +
  // infrastructure-erase. Runs after tornado so a cell hosting both
  // takes both checks (and the monster's density-drop reads the
  // post-flood/fire-damaged zones bucket so a cell already dropped
  // to 0 is a no-op for the monster).
  const monsterDamaged = applyMonsterDamage(
    {
      zones: nextZones,
      power: tornadoDamaged.power,
      water: tornadoDamaged.water,
      services: tornadoDamaged.services,
    },
    state.disasters,
    nextTick,
  )
  const nextPower = refreshPowerPollution(monsterDamaged.power)
  // Population follows zone density. The sync runs on every growth
  // tick so a place + grow + erase sequence cleans up the population
  // entry the next time the growth interval fires (within ~5s at
  // 1x). The helper is identity-on-no-change so a growth tick that
  // did not advance any cell AND has nothing to clean up returns
  // the same bucket reference; non-growth ticks skip the sync
  // entirely so the per-tick cost stays bounded.
  const isGrowthTick =
    nextTick > 0 && nextTick % GROWTH_INTERVAL_TICKS === 0
  // F-016 slice 2: per-cell happiness decline. Runs on growth ticks
  // before the population sync so a cell whose density just dropped
  // gets the lower residents count from the sync on the same tick.
  // Reads the post-disaster + post-power-pollution snapshot so the
  // decline sees the same inputs the heatmap renders.
  const declineResult = isGrowthTick
    ? applyHappinessDecline(
        state.population,
        monsterDamaged.zones,
        monsterDamaged.water,
        nextPower,
        monsterDamaged.services,
        state.taxRates,
        state.disasters,
      )
    : { population: state.population, zones: monsterDamaged.zones }
  const nextPopulation = isGrowthTick
    ? syncPopulationToZones(
        declineResult.population,
        declineResult.zones,
        nextTick,
      )
    : state.population
  // Economy ticks every frame (REQ-095 slice 1). Income from
  // residents * tax rate, maintenance from infrastructure cell counts.
  // Treasury accumulates each tick. The math is O(1) on the
  // already-summed `population.totalPopulation` plus O(P) on the
  // plants array length and O(L) on the line cell count, both
  // bounded by the grid so the per-tick cost is tiny.
  const nextEconomy = applyEconomyTick(
    state.economy,
    nextPopulation,
    nextPower,
    state.taxRates,
    monsterDamaged.zones,
    nextTick,
  )
  // Waste tick (REQ-092 slice 4). Populated cells accumulate waste
  // unless their sewage status is 'drained' (in which case the
  // counter resets to 0). The reducer is identity-on-no-change so a
  // tick with no populated cells AND nothing to clean up keeps the
  // same water bucket reference.
  const nextWater = applyWasteTick(
    monsterDamaged.water,
    nextPopulation,
    monsterDamaged.zones,
  )
  // Disaster lifetime tick (REQ-105 substrate slice 1). Each active
  // disaster decrements its `ticksRemaining`; entries that hit 0 are
  // removed. Identity-on-no-change short-circuits when no disasters
  // are active and when the bucket's array of remaining counts does
  // not need to shrink. The happiness reducer below reads the
  // post-decrement disasters so an expiring earthquake's penalty
  // disappears on the same tick it would have removed.
  const decrementedDisasters = applyDisasterTick(
    state.disasters,
    nextTick,
    monsterDamaged.services,
  )
  // Fire auto-spawn (REQ-105 + REQ-100 follow-on). Probabilistic
  // ignition at uncovered industrial cells. Runs AFTER disaster
  // decrement / spread so a freshly-spawned fire burns its full
  // duration on the next tick instead of immediately decrementing.
  const autoSpawnedFires = computeFireAutoSpawn(
    monsterDamaged.zones,
    monsterDamaged.services,
    decrementedDisasters,
    nextTick,
  )
  // Random earthquake auto-spawn (mass-appeal slice 2 of 5).
  // Single global per-tick roll picks a deterministic-hash zoned
  // cell. Adds replay variability flagged by the gameplay
  // analysis: an unmoderated city of identical zone placements
  // can experience different per-tick disaster sequences across
  // replays of distinct event logs.
  const autoSpawnedEarthquake = computeEarthquakeAutoSpawn(
    monsterDamaged.zones,
    decrementedDisasters,
    nextTick,
  )
  const autoSpawned = autoSpawnedEarthquake
    ? [...autoSpawnedFires, autoSpawnedEarthquake]
    : autoSpawnedFires
  const nextDisasters: typeof decrementedDisasters =
    autoSpawned.length === 0
      ? decrementedDisasters
      : { active: [...decrementedDisasters.active, ...autoSpawned] }
  // Citizen happiness (REQ-076 multi-input). Reads waste, services
  // coverage, taxes, and disasters from the post-tick state so the
  // HUD reflects this tick's drain state, freshly-erased services
  // (tornado / monster), and any expiring earthquake's penalty
  // drops off cleanly.
  const nextPopulationWithHappiness = applyHappinessTick(
    nextPopulation,
    nextWater,
    nextPower,
    nextDisasters,
    monsterDamaged.services,
    monsterDamaged.zones,
    state.taxRates,
  )
  return {
    ...state,
    tick: nextTick,
    simTimeMs: state.simTimeMs + event.payload.deltaMs,
    zones: monsterDamaged.zones,
    population: nextPopulationWithHappiness,
    economy: nextEconomy,
    power: nextPower,
    water: nextWater,
    services: monsterDamaged.services,
    disasters: nextDisasters,
  }
}

/**
 * Per-tick economy reducer (REQ-095 slice 1).
 *
 * Income: every resident contributes `residentialTaxRate` per tick to
 * the treasury. Slice 2 will add commercial / industrial revenue from
 * job slots once those land (REQ-083). Maintenance: every line cell
 * costs `LINE_MAINTENANCE_PER_TICK`, every plant
 * `PLANT_MAINTENANCE_PER_TICK`. Treasury accumulates the net delta.
 * `lastTickIncome` and `lastTickMaintenance` carry the per-tick gross
 * numbers for HUD readouts.
 *
 * Identity-on-no-change short-circuits when income, maintenance, AND
 * the resulting treasury all match the input bucket. The first tick
 * after placing a zone or plant will not short-circuit because the
 * income or maintenance changes.
 */
export function applyEconomyTick(
  economy: EconomyBucket,
  population: PopulationBucket,
  power: PowerBucket,
  taxRates: TaxRates,
  zones: ZonesBucket,
  tick: number = 0,
): EconomyBucket {
  let commercialJobs = 0
  let industrialJobs = 0
  for (const cell of Object.values(zones.cells)) {
    if (cell.kind === 'commercial') {
      commercialJobs += COMMERCIAL_JOBS_BY_DENSITY[cell.density]
    } else if (cell.kind === 'industrial') {
      industrialJobs += INDUSTRIAL_JOBS_BY_DENSITY[cell.density]
    }
  }
  const income =
    population.totalPopulation * taxRates.residential +
    commercialJobs * taxRates.commercial +
    industrialJobs * taxRates.industrial
  const lineCount = Object.keys(power.lines).length
  const plantCount = power.plants.length
  const maintenance =
    lineCount * LINE_MAINTENANCE_PER_TICK +
    plantCount * PLANT_MAINTENANCE_PER_TICK
  const nextTreasury = economy.treasury + income - maintenance
  // Bankruptcy countdown (REQ-095 slice 3). Increments while the
  // running balance is below zero; resets to 0 the moment the
  // treasury rebounds. The `Math.min(..., THRESHOLD)` keeps the
  // counter bounded; the auto-bailout branch below catches the
  // boundary case so `nextBankruptcyCounter === THRESHOLD` is
  // never observable in returned state. The HUD reads
  // `bankruptcyTickCounter > 0` to surface the warning span.
  const nextBankruptcyCounter =
    nextTreasury < 0
      ? Math.min(
          economy.bankruptcyTickCounter + 1,
          BANKRUPTCY_THRESHOLD_TICKS,
        )
      : 0
  // Auto-bankruptcy bailout (REQ-095 slice 4 follow-on). When the
  // counter would reach `BANKRUPTCY_THRESHOLD_TICKS` the economy
  // auto-resets to the same shape as a player-fired `resetBudget`:
  // treasury restored to `INITIAL_TREASURY`, counter zeroed,
  // last-tick readouts zeroed. Other layers stay untouched so the
  // player keeps their infrastructure. Closes the bankruptcy loop
  // end-to-end without requiring a manual click. The HUD has no
  // distinct auto-bailout signal in this slice (the counter
  // returns to 0 exactly the same way a normal positive-treasury
  // recovery would); a follow-on can introduce an explicit flag
  // or event if a one-tick acknowledgement is wanted.
  if (nextBankruptcyCounter === BANKRUPTCY_THRESHOLD_TICKS) {
    return { ...EMPTY_ECONOMY_BUCKET, lastAutoBailoutTick: tick }
  }
  if (
    economy.lastTickIncome === income &&
    economy.lastTickMaintenance === maintenance &&
    economy.treasury === nextTreasury &&
    economy.bankruptcyTickCounter === nextBankruptcyCounter
  ) {
    return economy
  }
  return {
    treasury: nextTreasury,
    lastTickIncome: income,
    lastTickMaintenance: maintenance,
    bankruptcyTickCounter: nextBankruptcyCounter,
    lastAutoBailoutTick: economy.lastAutoBailoutTick,
  }
}

/**
 * Sync population residents to the current zone densities (REQ-075
 * slice 1). For each residential zone cell, set residents =
 * `RESIDENTIAL_CAPACITY_BY_DENSITY[cell.density]`. Cells that drop
 * out of the zones map (eraseZone) are removed from the population
 * cells map. Commercial and industrial zones do not contribute to
 * residents in slice 1; they will contribute to job slots and trip
 * demand in a follow-on slice (REQ-083).
 *
 * Returns the input bucket unchanged when nothing changed; the
 * `applyTick` reducer relies on identity-on-no-change to avoid
 * allocating a new bucket reference per growth tick.
 */
/**
 * Compute city happiness from waste / services / taxes / pollution / earthquakes
 * (REQ-076 multi-input slice). Returns a 0..100 score from a 100
 * baseline minus four subtractive penalties:
 *   - Waste: avg-waste-ratio scaled by `WASTE_HAPPINESS_WEIGHT` (max 50).
 *   - Services coverage: `(5 - avgCoverage) * COVERAGE_HAPPINESS_WEIGHT`
 *     where avgCoverage averages per-populated-and-zoned-cell
 *     coverage counts from `cellCoverage(row, col, services)` (max
 *     20 when nothing is covered). The zones bucket is consulted
 *     only as a membership gate; populated-but-not-zoned cells
 *     (transient state after `applyEraseZone` until the next
 *     growth-tick population sync) contribute 0 coverage, matching
 *     the prior `solveServicesCoverage(zones, ...)` semantics.
 *   - Taxes: residential rate above `TAX_NEUTRAL_RATE` (10%) drags
 *     `(rate - TAX_NEUTRAL_RATE) * TAX_HAPPINESS_WEIGHT` per tick;
 *     rates at or below 10% contribute 0.
 *   - Pollution: avg populated-cell coal pollution scaled by
 *     `POLLUTION_HAPPINESS_WEIGHT`.
 *   - Earthquakes: `EARTHQUAKE_HAPPINESS_PENALTY` per active.
 *
 * With no populated cells, waste / services / tax all read 0 (no one
 * to suffer them); only earthquakes can drop happiness in that case.
 *
 * The score is clamped to [0, 100] and rounded to one decimal so HUD
 * reads stay stable under tiny per-tick deltas.
 */
export function computeCityHappiness(
  water: WaterBucket,
  population: PopulationBucket,
  power: PowerBucket,
  disasters: DisastersBucket,
  services: ServicesBucket,
  zones: ZonesBucket,
  taxRates: TaxRates,
): number {
  const populatedKeys = Object.keys(population.cells).filter(
    (key) => population.cells[key].residents > 0,
  )
  let earthquakePenalty = 0
  for (const disaster of disasters.active) {
    if (disaster.kind === 'earthquake') {
      earthquakePenalty += EARTHQUAKE_HAPPINESS_PENALTY
    }
  }
  let wastePenalty = 0
  let coveragePenalty = 0
  let taxPenalty = 0
  let pollutionPenalty = 0
  if (populatedKeys.length > 0) {
    let totalWaste = 0
    let totalPollution = 0
    for (const key of populatedKeys) {
      totalWaste += water.wasteAccumulation[key] ?? 0
      totalPollution += power.pollution[key] ?? 0
    }
    const avgWaste = totalWaste / populatedKeys.length
    wastePenalty = (avgWaste / WASTE_MAX_PER_CELL) * WASTE_HAPPINESS_WEIGHT
    const avgPollution = totalPollution / populatedKeys.length
    pollutionPenalty = avgPollution * POLLUTION_HAPPINESS_WEIGHT
    // Coverage scoped to populated cells only (F-017): cellCoverage
    // walks the services list per cell, avoiding the full-zones
    // sort + per-zone-cell solve in solveServicesCoverage. For a
    // city with R residents and S services, the cost drops from
    // O(|zones| log |zones| + |zones| * S) to O(R * S). The zones
    // membership check preserves the old solveServicesCoverage
    // behavior for the edge case where a player erases a zone but
    // population is still in the bucket until the next growth-tick
    // sync (a populated-but-not-zoned cell contributes 0 coverage,
    // matching the old `coverageMap[key] === undefined` branch).
    let totalCoverage = 0
    for (const key of populatedKeys) {
      if (zones.cells[key] === undefined) continue
      const [rowStr, colStr] = key.split(',')
      const row = Number(rowStr)
      const col = Number(colStr)
      if (!Number.isFinite(row) || !Number.isFinite(col)) continue
      totalCoverage += coverageCount(cellCoverage(row, col, services))
    }
    const avgCoverage = totalCoverage / populatedKeys.length
    coveragePenalty = (5 - avgCoverage) * COVERAGE_HAPPINESS_WEIGHT
    taxPenalty =
      Math.max(0, taxRates.residential - TAX_NEUTRAL_RATE) *
      TAX_HAPPINESS_WEIGHT
  }
  // Abandoned-cell penalty (REQ-079 follow-on; damps the
  // post-decline oscillation). A cell is abandoned when its zone
  // density dropped to 0 but the population entry survived (the
  // sync ran on the same growth tick as the decline, setting
  // residents=0). Each abandoned cell contributes
  // `ABANDONED_CELL_HAPPINESS_WEIGHT` happiness, capped at
  // `MAX_ABANDONED_HAPPINESS_PENALTY` so a city with many abandoned
  // cells stays in the stagnant band even when no other penalty
  // applies (residents=0 means waste / coverage / tax are all 0).
  let abandonedCount = 0
  for (const key of Object.keys(zones.cells)) {
    if (zones.cells[key].density !== 0) continue
    if (population.cells[key] === undefined) continue
    abandonedCount += 1
  }
  const abandonedPenalty = Math.min(
    MAX_ABANDONED_HAPPINESS_PENALTY,
    abandonedCount * ABANDONED_CELL_HAPPINESS_WEIGHT,
  )
  const score =
    100 -
    wastePenalty -
    coveragePenalty -
    taxPenalty -
    pollutionPenalty -
    earthquakePenalty -
    abandonedPenalty
  const clamped = Math.max(0, Math.min(100, score))
  return Math.round(clamped * 10) / 10
}

/**
 * Per-tick happiness reducer (REQ-076 multi-input). Recomputes
 * `cityHappiness` from the freshly-updated water bucket, coal
 * pollution, active disasters, services coverage, zones membership,
 * and tax rates.
 * `zones` is read only as a membership gate so the per-cell
 * coverage walk skips populated-but-not-zoned cells (a transient
 * state between erase and the next growth-tick sync); the per-cell
 * coverage walk itself uses `cellCoverage(row, col, services)` and
 * does not depend on the zones bucket. Identity-on-no-change
 * short-circuits when the score is unchanged.
 */
export function applyHappinessTick(
  population: PopulationBucket,
  water: WaterBucket,
  power: PowerBucket,
  disasters: DisastersBucket,
  services: ServicesBucket,
  zones: ZonesBucket,
  taxRates: TaxRates,
): PopulationBucket {
  const next = computeCityHappiness(
    water,
    population,
    power,
    disasters,
    services,
    zones,
    taxRates,
  )
  if (next === population.cityHappiness) return population
  return { ...population, cityHappiness: next }
}

/**
 * Per-tick waste reducer (REQ-092 sewage slice 4).
 *
 * For each populated cell (residents > 0):
 *   - if its sewage status is 'drained', the cell's waste counter
 *     resets to 0 (handled by the treatment plant);
 *   - otherwise (overloaded / unmanaged), the counter increments by
 *     `WASTE_INCREMENT_PER_TICK`, capped at `WASTE_MAX_PER_CELL`.
 * Entries for cells that are no longer populated are dropped so the
 * map size stays bounded by the populated-cell count.
 *
 * Identity-on-no-change short-circuits when every populated cell's
 * waste counter is unchanged AND the set of keys matches the prior
 * map. The first tick after placing a residential zone with no
 * sewage will not short-circuit because the new cell starts at 1.
 */
export function applyWasteTick(
  water: WaterBucket,
  population: PopulationBucket,
  zones: ZonesBucket,
): WaterBucket {
  const sewage = solveSewageStatus(zones, water)
  const prev = water.wasteAccumulation
  const next: Record<string, number> = {}
  let changed = false
  let populatedCount = 0
  for (const [key, cell] of Object.entries(population.cells)) {
    if (cell.residents <= 0) continue
    populatedCount += 1
    const status = sewage[key] ?? 'unmanaged'
    let nextValue: number
    if (status === 'drained') {
      nextValue = 0
    } else {
      const prevValue = prev[key] ?? 0
      nextValue = Math.min(WASTE_MAX_PER_CELL, prevValue + WASTE_INCREMENT_PER_TICK)
    }
    next[key] = nextValue
    if ((prev[key] ?? 0) !== nextValue) changed = true
  }
  // If a cell that previously had a waste entry is no longer populated,
  // drop it. This is the source of the "removes entries" behavior.
  if (Object.keys(prev).length !== populatedCount) changed = true
  if (!changed) return water
  return {
    ...water,
    wasteAccumulation: next,
  }
}

export function syncPopulationToZones(
  population: PopulationBucket,
  zones: ZonesBucket,
  tick: number = 0,
): PopulationBucket {
  const nextCells: Record<string, PopulationCell> = {}
  let totalPopulation = 0
  let totalTripDemand = 0
  let changed = false
  // Walk every zoned cell. Residential zones contribute residents.
  // Trip-demand accumulates by `residents` each growth tick (the
  // function only runs on growth ticks, gated by the call site in
  // `applyTick`). Saturate at `TRIP_DEMAND_CAP_MULTIPLIER * residents`
  // so a stagnant city without a drain layer does not accumulate
  // unbounded demand. Cells with zero residents reset trip-demand
  // to 0 because nobody is making trips from an empty cell, even if
  // the cell still carries residual demand from a prior decline.
  for (const [key, zone] of Object.entries(zones.cells)) {
    if (zone.kind !== 'residential') continue
    const targetResidents = RESIDENTIAL_CAPACITY_BY_DENSITY[zone.density]
    const existing = population.cells[key]
    const residents = targetResidents
    const previousTripDemand = existing?.tripDemand ?? 0
    const cap = residents * TRIP_DEMAND_CAP_MULTIPLIER
    const tripDemand =
      residents === 0
        ? 0
        : Math.min(previousTripDemand + residents, cap)
    if (
      !existing ||
      existing.residents !== residents ||
      existing.tripDemand !== tripDemand
    ) {
      changed = true
    }
    nextCells[key] = {
      residents,
      tripDemand,
      unhappyTicks: existing?.unhappyTicks ?? 0,
    }
    totalPopulation += residents
    totalTripDemand += tripDemand
  }
  // Detect cells that fell out of the zones map (e.g. an eraseZone or
  // a retype to commercial / industrial would remove the residential
  // entry from population).
  for (const key of Object.keys(population.cells)) {
    if (!nextCells[key]) {
      changed = true
    }
  }
  // Population milestone crossing (mass-appeal slice). Find the
  // highest threshold the city's NEW totalPopulation cleared that
  // sits above the previous highest. Only the FIRST crossing of
  // each threshold fires; subsequent visits at the same population
  // do not retrigger. Decline that drops totalPopulation back below
  // a previously-cleared threshold does NOT clear the milestone
  // record (the player keeps the achievement).
  let highestMilestoneReached = population.highestMilestoneReached
  let lastMilestoneTick = population.lastMilestoneTick
  for (const threshold of POPULATION_MILESTONES) {
    if (totalPopulation >= threshold && threshold > highestMilestoneReached) {
      highestMilestoneReached = threshold
      lastMilestoneTick = tick
    }
  }
  const milestoneChanged =
    highestMilestoneReached !== population.highestMilestoneReached ||
    lastMilestoneTick !== population.lastMilestoneTick
  if (
    !changed &&
    !milestoneChanged &&
    Object.keys(nextCells).length === Object.keys(population.cells).length
  ) {
    return population
  }
  return {
    cells: nextCells,
    totalPopulation,
    totalTripDemand,
    cityHappiness: population.cityHappiness,
    highestMilestoneReached,
    lastMilestoneTick,
  }
}

/**
 * Per-cell happiness decline reducer (F-016 slice 2). Walks every
 * zoned residential cell, computes the cell's happiness via
 * `cellHappiness`, and updates the population entry's `unhappyTicks`
 * counter:
 *
 *   - score > `CELL_DECLINE_HAPPINESS_THRESHOLD`: counter resets to 0.
 *   - score <= threshold: counter increments by 1.
 *   - counter >= `CELL_DECLINE_TICKS_TO_LOSE_RESIDENT` AND zone density
 *     > 0: zone density drops by 1, counter resets to 0 so the next
 *     decline cycle has to accumulate from scratch.
 *
 * Density drop is the actionable decline; the subsequent
 * `syncPopulationToZones` call in `applyTick` will set residents to
 * the new (lower) capacity automatically. A cell that bottoms out at
 * density 0 stops declining further; it stays in the population
 * bucket with `residents = 0` so the abandoned-cell stroke + city
 * happiness penalty continue to fire.
 *
 * Identity-on-no-change: when no cells changed `unhappyTicks` AND no
 * density drops fired, returns the same `{ population, zones }`
 * object references so consumers can short-circuit.
 *
 * Called from `applyTick` on growth ticks only (same cadence as
 * `syncPopulationToZones`) so the decline pacing matches the rest of
 * the per-cell sim. The function does NOT compute disasters,
 * waste, etc.; it reads the live `state` snapshot that
 * `applyTick` passes in.
 */
export function applyHappinessDecline(
  population: PopulationBucket,
  zones: ZonesBucket,
  water: WaterBucket,
  power: PowerBucket,
  services: ServicesBucket,
  taxRates: TaxRates,
  disasters: DisastersBucket,
): { population: PopulationBucket; zones: ZonesBucket } {
  const nextPopCells: Record<string, PopulationCell> = { ...population.cells }
  const nextZoneCells: Record<string, ZoneCell> = { ...zones.cells }
  let populationChanged = false
  let zonesChanged = false
  for (const [key, popCell] of Object.entries(population.cells)) {
    const zone = zones.cells[key]
    if (!zone || zone.kind !== 'residential') continue
    const [rowStr, colStr] = key.split(',')
    const row = Number(rowStr)
    const col = Number(colStr)
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue
    const score = cellHappiness(
      row,
      col,
      water,
      power,
      services,
      zones,
      taxRates,
      disasters,
    )
    const prevUnhappy = popCell.unhappyTicks ?? 0
    let nextUnhappy: number
    if (score > CELL_DECLINE_HAPPINESS_THRESHOLD) {
      nextUnhappy = 0
    } else {
      nextUnhappy = prevUnhappy + 1
    }
    if (
      nextUnhappy >= CELL_DECLINE_TICKS_TO_LOSE_RESIDENT &&
      zone.density > 0
    ) {
      // Decline step: drop density by 1 (clamped at 0), reset counter.
      const nextDensity = (zone.density - 1) as ZoneCell['density']
      if (nextDensity !== zone.density) {
        nextZoneCells[key] = { ...zone, density: nextDensity }
        zonesChanged = true
      }
      nextUnhappy = 0
    }
    if (nextUnhappy !== prevUnhappy) {
      nextPopCells[key] = { ...popCell, unhappyTicks: nextUnhappy }
      populationChanged = true
    }
  }
  if (!populationChanged && !zonesChanged) {
    return { population, zones }
  }
  return {
    population: populationChanged
      ? { ...population, cells: nextPopCells }
      : population,
    zones: zonesChanged ? { ...zones, cells: nextZoneCells } : zones,
  }
}

/**
 * Per-tick zone growth and decline (REQ-081 + REQ-079 follow-on).
 * Three-tier feedback loop driven by `cityHappiness`:
 *
 *   - happy band (`> GROWTH_HAPPINESS_THRESHOLD`): every density-<3
 *     cell advances by 1 unless the cell is blocked by a per-cell
 *     supply gate. A cell is blocked when:
 *     - `powerStatus[key]` is `'brownout'` or `'unpowered'`, OR
 *     - `waterStatus[key]` is `'brownout'` or `'unserved'`, OR
 *     - `servicesCoverageCount[key]` is less than
 *       `MIN_SERVICES_FOR_GROWTH` (3 of 5 service kinds), OR
 *     - residential employment demand is 0 or lower for residential
 *       cells after commercial / industrial job slots exist.
 *     Any one gate is enough to stall growth (the gates run in
 *     series as a logical AND). A missing entry (undefined) on any
 *     status / count is treated as "no gate" so a pre-electrical /
 *     pre-plumbing / pre-services city (no plants / lines / sources
 *     / pipes / fewer than `MIN_SERVICES_FOR_GROWTH` distinct
 *     service kinds) grows the way it did before the gates landed;
 *     the call site short-circuits each solve and passes an empty
 *     `{}` in those cases. The employment gate uses `undefined` for
 *     a city with zero job slots so the first residential block still
 *     grows before the player zones employment.
 *   - stagnant band (`(DECLINE_HAPPINESS_THRESHOLD, GROWTH_HAPPINESS_THRESHOLD]`):
 *     density holds; the city neither grows nor decays.
 *   - miserable band (`<= DECLINE_HAPPINESS_THRESHOLD`): every
 *     zoned cell with density > 0 steps DOWN by 1 regardless of
 *     power status, because the decline branch reads cityHappiness
 *     (which already aggregates power-related signals via the
 *     coverage / abandonment math) and dropping density is the
 *     uniform "residents leave" response.
 *
 * Returns the input bucket unchanged when this tick is not a growth
 * tick or the band's transformation is a no-op (happy + everything
 * already at max-or-unpowered, or miserable + everything already
 * at 0).
 *
 * Deterministic: replay over the same event log produces the same
 * growth / decline at the same ticks.
 */
export function maybeGrowZones(
  zones: ZonesBucket,
  tick: number,
  cityHappiness: number,
  powerStatus: Record<string, CellPowerStatus>,
  waterStatus: Record<string, CellWaterStatus>,
  servicesCoverageCount: Record<string, number>,
  residentialEmploymentDemand?: number,
): ZonesBucket {
  if (tick <= 0 || tick % GROWTH_INTERVAL_TICKS !== 0) return zones
  const cellKeys = Object.keys(zones.cells)
  if (cellKeys.length === 0) return zones
  const decline = cityHappiness <= DECLINE_HAPPINESS_THRESHOLD
  const grow =
    !decline && cityHappiness > GROWTH_HAPPINESS_THRESHOLD
  if (!decline && !grow) return zones
  let changed = false
  const nextCells: Record<string, ZoneCell> = {}
  for (const key of cellKeys) {
    const cell = zones.cells[key]
    if (decline) {
      if (cell.density <= 0) {
        nextCells[key] = cell
        continue
      }
      changed = true
      const dropped: ZoneDensity = (cell.density - 1) as ZoneDensity
      nextCells[key] = { kind: cell.kind, density: dropped }
      continue
    }
    if (cell.density >= 3) {
      nextCells[key] = cell
      continue
    }
    const power = powerStatus[key]
    if (power === 'brownout' || power === 'unpowered') {
      nextCells[key] = cell
      continue
    }
    const water = waterStatus[key]
    if (water === 'brownout' || water === 'unserved') {
      nextCells[key] = cell
      continue
    }
    const serviceCount = servicesCoverageCount[key]
    if (
      serviceCount !== undefined &&
      serviceCount < MIN_SERVICES_FOR_GROWTH
    ) {
      nextCells[key] = cell
      continue
    }
    if (
      cell.kind === 'residential' &&
      residentialEmploymentDemand !== undefined &&
      residentialEmploymentDemand <= 0
    ) {
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

/**
 * Deduct a build cost from `state.economy.treasury` (REQ-095 slice 2).
 * Treasury is allowed to go negative; the bankruptcy countdown
 * (REQ-095 slice 3) reads the running balance to fire its consequence.
 */
function chargeBuild(state: SimState, cost: number): SimState {
  if (cost === 0) return state
  return {
    ...state,
    economy: {
      ...state.economy,
      treasury: state.economy.treasury - cost,
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
  // Build cost (REQ-095 slice 2): charged on a fresh zoning AND on a
  // retype to a different kind, since the player committed treasury
  // either way. No charge on the identity-on-no-change branch above.
  const charged = chargeBuild(state, ZONE_BUILD_COST[kind])
  return {
    ...charged,
    zones: {
      cells: {
        ...charged.zones.cells,
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

function applyPlacePowerPlant(
  state: SimState,
  event: PlacePowerPlantEvent,
): SimState {
  const { kind, row, col } = event.payload
  // Idempotent on the same anchor + kind: a player clicking twice on
  // the same anchor with the same plant kind selected gets one plant,
  // not two. Different kinds at the same anchor stack (the player
  // intentionally retypes); a future slice can add explicit plant
  // overwrite semantics if playtest reveals players want it.
  const existing = state.power.plants.find(
    (plant) => plant.row === row && plant.col === col && plant.kind === kind,
  )
  if (existing) return state
  const plant: PowerPlant = { kind, row, col }
  const charged = chargeBuild(state, POWER_PLANT_BUILD_COST[kind])
  return {
    ...charged,
    power: {
      ...charged.power,
      plants: [...charged.power.plants, plant],
    },
  }
}

function applyRunPowerLine(
  state: SimState,
  event: RunPowerLineEvent,
): SimState {
  const { row, col } = event.payload
  const key = powerLineKey(row, col)
  if (state.power.lines[key] === true) return state
  const charged = chargeBuild(state, POWER_LINE_BUILD_COST)
  return {
    ...charged,
    power: {
      ...charged.power,
      lines: {
        ...charged.power.lines,
        [key]: true,
      },
    },
  }
}

function applyEraseLine(state: SimState, event: EraseLineEvent): SimState {
  const { row, col } = event.payload
  const key = powerLineKey(row, col)
  if (state.power.lines[key] !== true) return state
  const nextLines = { ...state.power.lines }
  delete nextLines[key]
  return {
    ...state,
    power: {
      ...state.power,
      lines: nextLines,
    },
  }
}

function applyPlaceServiceBuilding(
  state: SimState,
  event: PlaceServiceBuildingEvent,
): SimState {
  const { kind, row, col } = event.payload
  // Idempotent on the same anchor + kind: a player clicking twice
  // on the same anchor with the same service kind selected gets
  // one building, not two. Different kinds at the same anchor
  // stack for v1 (the UI slice will add overlap validation).
  const existing = state.services.buildings.find(
    (b) => b.row === row && b.col === col && b.kind === kind,
  )
  if (existing) return state
  const building: ServiceBuilding = { kind, row, col }
  const charged = chargeBuild(state, SERVICE_BUILD_COST[kind])
  return {
    ...charged,
    services: {
      ...charged.services,
      buildings: [...charged.services.buildings, building],
    },
  }
}

function applyEraseServiceBuilding(
  state: SimState,
  event: EraseServiceBuildingEvent,
): SimState {
  const { row, col } = event.payload
  const filtered = state.services.buildings.filter(
    (b) => !(b.row === row && b.col === col),
  )
  if (filtered.length === state.services.buildings.length) return state
  return {
    ...state,
    services: {
      ...state.services,
      buildings: filtered,
    },
  }
}

function applyPlaceWaterSource(
  state: SimState,
  event: PlaceWaterSourceEvent,
): SimState {
  const { kind, row, col } = event.payload
  const existing = state.water.sources.find(
    (s) => s.row === row && s.col === col && s.kind === kind,
  )
  if (existing) return state
  const source: WaterSource = { kind, row, col }
  const charged = chargeBuild(state, WATER_SOURCE_BUILD_COST[kind])
  return {
    ...charged,
    water: {
      ...charged.water,
      sources: [...charged.water.sources, source],
    },
  }
}

function applyRunWaterPipe(
  state: SimState,
  event: RunWaterPipeEvent,
): SimState {
  const { kind, row, col } = event.payload
  const key = waterPipeKey(row, col)
  if (state.water.pipes[key] === kind) return state
  const charged = chargeBuild(state, WATER_PIPE_BUILD_COST)
  return {
    ...charged,
    water: {
      ...charged.water,
      pipes: {
        ...charged.water.pipes,
        [key]: kind,
      },
    },
  }
}

function applyEraseWaterPipe(
  state: SimState,
  event: EraseWaterPipeEvent,
): SimState {
  const { row, col } = event.payload
  const key = waterPipeKey(row, col)
  if (state.water.pipes[key] === undefined) return state
  const nextPipes = { ...state.water.pipes }
  delete nextPipes[key]
  return {
    ...state,
    water: {
      ...state.water,
      pipes: nextPipes,
    },
  }
}

function applyPlaceSewageTreatmentPlant(
  state: SimState,
  event: PlaceSewageTreatmentPlantEvent,
): SimState {
  const { row, col } = event.payload
  const existing = state.water.treatmentPlants.find(
    (p) => p.row === row && p.col === col,
  )
  if (existing) return state
  const plant: SewageTreatmentPlant = { row, col }
  const charged = chargeBuild(state, SEWAGE_TREATMENT_BUILD_COST)
  return {
    ...charged,
    water: {
      ...charged.water,
      treatmentPlants: [...charged.water.treatmentPlants, plant],
    },
  }
}

function applyEraseSewageTreatmentPlant(
  state: SimState,
  event: EraseSewageTreatmentPlantEvent,
): SimState {
  const { row, col } = event.payload
  const next = state.water.treatmentPlants.filter(
    (p) => !(p.row === row && p.col === col),
  )
  if (next.length === state.water.treatmentPlants.length) return state
  return {
    ...state,
    water: {
      ...state.water,
      treatmentPlants: next,
    },
  }
}

function applyResetBudget(state: SimState): SimState {
  // Restore the economy bucket to its empty / fresh-treasury shape.
  // Other layers (zones, power, water, services, disasters) are
  // untouched so the player keeps their built infrastructure.
  return {
    ...state,
    economy: EMPTY_ECONOMY_BUCKET,
  }
}

function applySpawnDisaster(
  state: SimState,
  event: SpawnDisasterEvent,
): SimState {
  const { kind, row, col } = event.payload
  const disaster: Disaster = {
    kind,
    row,
    col,
    ticksRemaining: DISASTER_DEFAULT_DURATION_TICKS[kind],
  }
  return {
    ...state,
    disasters: {
      active: [...state.disasters.active, disaster],
    },
  }
}

/**
 * Per-tick disaster lifetime + spread reducer (REQ-105 slice 1 + 3).
 * Decrements `ticksRemaining` on every active disaster; entries that
 * hit 0 are removed. After the decrement, computes fire spread
 * deterministically (a hash of `(tick, row, col)` for each surviving
 * fire) and appends any new fires that pass the coverage / duplicate
 * gate. Identity-on-no-change short-circuits when the active array
 * is empty before the decrement.
 */
export function applyDisasterTick(
  disasters: DisastersBucket,
  tick: number,
  services: ServicesBucket,
): DisastersBucket {
  if (disasters.active.length === 0) return disasters
  const survivors: Disaster[] = []
  for (const disaster of disasters.active) {
    const ticksRemaining = disaster.ticksRemaining - 1
    if (ticksRemaining > 0) {
      survivors.push({ ...disaster, ticksRemaining })
    }
  }
  const spawned = computeFireSpread({ active: survivors }, tick, services)
  if (spawned.length === 0) {
    return { active: survivors }
  }
  return { active: [...survivors, ...spawned] }
}

/**
 * Re-export the defaults so callers do not have to reach across two
 * files for the substrate constants. The state module owns the
 * canonical values; this module owns the events that mutate them.
 */
export { DEFAULT_SIM_SPEED, DEFAULT_TAX_RATES, EMPTY_SIM_STATE }
