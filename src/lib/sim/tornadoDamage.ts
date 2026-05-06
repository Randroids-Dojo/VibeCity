import {
  TORNADO_DAMAGE_PROBABILITY_PER_TICK,
  powerLineKey,
  waterPipeKey,
  type DisastersBucket,
  type PowerBucket,
  type ServicesBucket,
  type WaterBucket,
} from './state'

/**
 * Deterministic tornado damage (REQ-105 slice 7).
 *
 * Each tick, every active tornado rolls a deterministic hash of
 * `(tick, row, col)` into a `[0, 1)` value. If the value is below
 * `TORNADO_DAMAGE_PROBABILITY_PER_TICK` the tornado erases every
 * piece of sim-state infrastructure at its anchor cell:
 *   - power lines + power plants whose anchor is at the cell
 *   - water sources + water pipes + sewage treatment plants
 *   - service buildings
 *
 * Determinism: hash uses different mixing constants from the other
 * disaster-damage hashes so the rolls land on independent values
 * for the same `(tick, row, col)`.
 *
 * Note: `City.pieces` (street pieces) lives outside the sim engine
 * so tornados cannot erase streets in this slice. v1 scopes to
 * sim-state infrastructure only.
 */

export function tornadoDamageHash(
  tick: number,
  row: number,
  col: number,
): number {
  let h = (tick | 0) * 0xb5297a4d
  h = (h ^ ((row | 0) * 0x68e31da4)) >>> 0
  h = (h ^ ((col | 0) * 0x1b56c4e9)) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return (h >>> 0) / 0x100000000
}

export interface TornadoDamageBuckets {
  power: PowerBucket
  water: WaterBucket
  services: ServicesBucket
}

/**
 * Compute the post-damage power / water / services buckets after
 * applying this tick's tornado damage. Returns the input buckets
 * unchanged when no tornado lands a damage hit.
 */
export function applyTornadoDamage(
  buckets: TornadoDamageBuckets,
  disasters: DisastersBucket,
  tick: number,
): TornadoDamageBuckets {
  if (disasters.active.length === 0) return buckets
  let power: PowerBucket = buckets.power
  let water: WaterBucket = buckets.water
  let services: ServicesBucket = buckets.services
  for (const disaster of disasters.active) {
    if (disaster.kind !== 'tornado') continue
    const roll = tornadoDamageHash(tick, disaster.row, disaster.col)
    if (roll >= TORNADO_DAMAGE_PROBABILITY_PER_TICK) continue
    const lineK = powerLineKey(disaster.row, disaster.col)
    const pipeK = waterPipeKey(disaster.row, disaster.col)
    // Power: erase line + plant at the cell.
    const plantsAfter = power.plants.filter(
      (p) => !(p.row === disaster.row && p.col === disaster.col),
    )
    const hadLine = power.lines[lineK] === true
    if (plantsAfter.length !== power.plants.length || hadLine) {
      const nextLines = { ...power.lines }
      if (hadLine) delete nextLines[lineK]
      power = { plants: plantsAfter, lines: nextLines }
    }
    // Water: erase source + pipe + treatment plant at the cell.
    const sourcesAfter = water.sources.filter(
      (s) => !(s.row === disaster.row && s.col === disaster.col),
    )
    const treatmentAfter = water.treatmentPlants.filter(
      (p) => !(p.row === disaster.row && p.col === disaster.col),
    )
    const hadPipe = water.pipes[pipeK] !== undefined
    if (
      sourcesAfter.length !== water.sources.length ||
      treatmentAfter.length !== water.treatmentPlants.length ||
      hadPipe
    ) {
      const nextPipes = { ...water.pipes }
      if (hadPipe) delete nextPipes[pipeK]
      water = {
        sources: sourcesAfter,
        pipes: nextPipes,
        treatmentPlants: treatmentAfter,
        wasteAccumulation: water.wasteAccumulation,
      }
    }
    // Services: erase building at the cell.
    const buildingsAfter = services.buildings.filter(
      (b) => !(b.row === disaster.row && b.col === disaster.col),
    )
    if (buildingsAfter.length !== services.buildings.length) {
      services = { buildings: buildingsAfter }
    }
  }
  if (
    power === buckets.power &&
    water === buckets.water &&
    services === buckets.services
  ) {
    return buckets
  }
  return { power, water, services }
}
