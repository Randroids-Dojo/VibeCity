import {
  DISASTER_DEFAULT_DURATION_TICKS,
  FIRE_AUTO_SPAWN_PROBABILITY_PER_TICK,
  SERVICE_COVERAGE_CELLS,
  type Disaster,
  type DisastersBucket,
  type ServicesBucket,
  type ZonesBucket,
} from './state'

/**
 * Deterministic fire auto-spawn (REQ-105 + REQ-100 follow-on).
 *
 * Each tick, every industrial zone cell with density > 0 that is NOT
 * covered by a fire-station rolls a deterministic hash of
 * `(tick, row, col)` (with mixing constants distinct from fire spread
 * + fire damage so the rolls are independent) into a `[0, 1)` value.
 * A roll below `FIRE_AUTO_SPAWN_PROBABILITY_PER_TICK * cell.density`
 * spawns a fresh fire at that cell, so density-3 industrial is 3x
 * more fire-prone than density-1. Cells with an existing fire at
 * the same anchor are skipped so two fires never stack via
 * auto-spawn.
 *
 * Determinism: the hash has no external state. Two clients replaying
 * the same event log compute the same `(tick, row, col)` for every
 * candidate cell and so derive identical auto-spawn behavior.
 *
 * v1 only ignites industrial cells (the loudest gameplay lever for
 * fire-station coverage). Residential and commercial cells stay
 * fire-safe in this slice; a follow-on can extend to all populated
 * cells once the calibration feels right.
 */

export function fireAutoSpawnHash(
  tick: number,
  row: number,
  col: number,
): number {
  let h = (tick | 0) * 0x27d4eb2f
  h = (h ^ ((row | 0) * 0x165667b1)) >>> 0
  h = (h ^ ((col | 0) * 0xd3a2646c)) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  h = Math.imul(h, 0xfd7046c5) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  return (h >>> 0) / 0x100000000
}

function isCoveredByFireStation(
  row: number,
  col: number,
  services: ServicesBucket,
): boolean {
  const radius = SERVICE_COVERAGE_CELLS['fire-station']
  for (const building of services.buildings) {
    if (building.kind !== 'fire-station') continue
    const distance =
      Math.abs(building.row - row) + Math.abs(building.col - col)
    if (distance <= radius) return true
  }
  return false
}

export function computeFireAutoSpawn(
  zones: ZonesBucket,
  services: ServicesBucket,
  disasters: DisastersBucket,
  tick: number,
): Disaster[] {
  const cellKeys = Object.keys(zones.cells).sort()
  if (cellKeys.length === 0) return []
  const existingFireKeys = new Set<string>()
  for (const disaster of disasters.active) {
    if (disaster.kind === 'fire') {
      existingFireKeys.add(`${disaster.row},${disaster.col}`)
    }
  }
  const spawned: Disaster[] = []
  for (const key of cellKeys) {
    const cell = zones.cells[key]
    if (cell.kind !== 'industrial') continue
    if (cell.density <= 0) continue
    const [rowStr, colStr] = key.split(',')
    const row = Number(rowStr)
    const col = Number(colStr)
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue
    if (existingFireKeys.has(key)) continue
    if (isCoveredByFireStation(row, col, services)) continue
    // Density-modulated probability: density-3 industrial is 3x
    // more fire-prone than density-1, density-2 sits at 2x. Dense
    // industrial sprawl (factories stacked on top of factories)
    // carries proportional risk; the player's gameplay lever
    // (place fire stations) scales with the threat.
    const cellProbability =
      FIRE_AUTO_SPAWN_PROBABILITY_PER_TICK * cell.density
    const roll = fireAutoSpawnHash(tick, row, col)
    if (roll >= cellProbability) continue
    existingFireKeys.add(key)
    spawned.push({
      kind: 'fire',
      row,
      col,
      ticksRemaining: DISASTER_DEFAULT_DURATION_TICKS.fire,
    })
  }
  return spawned
}
