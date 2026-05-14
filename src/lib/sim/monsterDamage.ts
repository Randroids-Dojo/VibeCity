import {
  MONSTER_DAMAGE_PROBABILITY_PER_TICK,
  powerLineKey,
  waterPipeKey,
  type DisastersBucket,
  type PowerBucket,
  type ServicesBucket,
  type WaterBucket,
  type ZoneCell,
  type ZoneDensity,
  type ZonesBucket,
} from './state'

/**
 * Deterministic monster damage (REQ-105 slice 8).
 *
 * Each tick, every active monster rolls a deterministic hash of
 * `(tick, row, col)` into a `[0, 1)` value. If the value is below
 * `MONSTER_DAMAGE_PROBABILITY_PER_TICK` the monster does double
 * damage at its anchor cell:
 *   - Drop the zone density by 1 (if zoned and density > 0).
 *   - Erase sim-state infrastructure at the cell: power line +
 *     plant, water source + pipe + treatment plant, service
 *     building.
 *
 * Determinism: hash uses different mixing constants from the other
 * disaster-damage hashes so the rolls land on independent values
 * for the same `(tick, row, col)`.
 */

export function monsterDamageHash(
  tick: number,
  row: number,
  col: number,
): number {
  let h = (tick | 0) * 0x9e370001
  h = (h ^ ((row | 0) * 0x4d8a3573)) >>> 0
  h = (h ^ ((col | 0) * 0xa1b56b39)) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 0xc2b2ae3d) >>> 0
  h = (h ^ (h >>> 17)) >>> 0
  return (h >>> 0) / 0x100000000
}

export interface MonsterDamageBuckets {
  zones: ZonesBucket
  power: PowerBucket
  water: WaterBucket
  services: ServicesBucket
}

/**
 * Compute the post-damage zones / power / water / services buckets
 * after applying this tick's monster damage. Returns the input
 * buckets unchanged when no monster lands a damage hit.
 */
export function applyMonsterDamage(
  buckets: MonsterDamageBuckets,
  disasters: DisastersBucket,
  tick: number,
): MonsterDamageBuckets {
  if (disasters.active.length === 0) return buckets
  let zones: ZonesBucket = buckets.zones
  let power: PowerBucket = buckets.power
  let water: WaterBucket = buckets.water
  let services: ServicesBucket = buckets.services
  for (const disaster of disasters.active) {
    if (disaster.kind !== 'monster') continue
    const roll = monsterDamageHash(tick, disaster.row, disaster.col)
    if (roll >= MONSTER_DAMAGE_PROBABILITY_PER_TICK) continue
    const lineK = powerLineKey(disaster.row, disaster.col)
    const pipeK = waterPipeKey(disaster.row, disaster.col)
    // Zone density drop.
    const cell = zones.cells[`${disaster.row},${disaster.col}`]
    if (cell && cell.density > 0) {
      const nextCells: Record<string, ZoneCell> = { ...zones.cells }
      nextCells[`${disaster.row},${disaster.col}`] = {
        kind: cell.kind,
        density: (cell.density - 1) as ZoneDensity,
      }
      zones = { cells: nextCells }
    }
    // Power: erase line + plant at the cell.
    const plantsAfter = power.plants.filter(
      (p) => !(p.row === disaster.row && p.col === disaster.col),
    )
    const hadLine = power.lines[lineK] === true
    if (plantsAfter.length !== power.plants.length || hadLine) {
      const nextLines = { ...power.lines }
      if (hadLine) delete nextLines[lineK]
      power = { plants: plantsAfter, lines: nextLines, pollution: power.pollution }
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
    zones === buckets.zones &&
    power === buckets.power &&
    water === buckets.water &&
    services === buckets.services
  ) {
    return buckets
  }
  return { zones, power, water, services }
}
