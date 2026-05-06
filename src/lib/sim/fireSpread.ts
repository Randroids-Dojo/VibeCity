import {
  DISASTER_DEFAULT_DURATION_TICKS,
  FIRE_SPREAD_PROBABILITY_PER_TICK,
  SERVICE_COVERAGE_CELLS,
  type Disaster,
  type DisastersBucket,
  type ServicesBucket,
} from './state'

/**
 * Deterministic fire spread (REQ-105 slice 3).
 *
 * Each tick, every active fire rolls a deterministic hash of
 * `(tick, row, col)` into a `[0, 1)` value. If the value is below
 * `FIRE_SPREAD_PROBABILITY_PER_TICK` the fire spawns a fresh fire on
 * a 4-adjacent cell selected by the same hash. The new fire starts
 * with the per-kind default duration.
 *
 * Determinism: the rng has no external state. Two clients replaying
 * the same event log compute the same `(tick, row, col)` for every
 * active fire and so derive identical spread behavior.
 *
 * Coverage gating: a fire-station that includes the candidate spread
 * cell within its `SERVICE_COVERAGE_CELLS['fire-station']` Manhattan
 * radius blocks the spread. The new fire is dropped silently; the
 * source fire continues to burn until its `ticksRemaining` expires.
 *
 * Duplicate gating: an existing fire at the candidate cell blocks
 * the spread. Two fires never stack at the same anchor via spread;
 * a player-spawned `spawnDisaster` event can still create stacked
 * disasters because the substrate slice deliberately allows it.
 */

const NEIGHBORS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
] as const

/**
 * Deterministic hash of three integers into a `[0, 1)` value. Uses
 * a 32-bit mixing function so small input deltas (e.g., adjacent
 * ticks or adjacent cells) produce well-distributed outputs.
 */
export function fireSpreadHash(
  tick: number,
  row: number,
  col: number,
): number {
  let h = (tick | 0) * 0x9e3779b1
  h = (h ^ ((row | 0) * 0x85ebca6b)) >>> 0
  h = (h ^ ((col | 0) * 0xc2b2ae35)) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  h = Math.imul(h, 0x7feb352d) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
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

/**
 * Compute the additional fires spawned by the spread mechanic on
 * this tick. Returns an empty array if no spread fires; the caller
 * appends them to `disasters.active`.
 */
export function computeFireSpread(
  disasters: DisastersBucket,
  tick: number,
  services: ServicesBucket,
): Disaster[] {
  if (disasters.active.length === 0) return []
  const existingKeys = new Set<string>()
  for (const disaster of disasters.active) {
    if (disaster.kind === 'fire') {
      existingKeys.add(`${disaster.row},${disaster.col}`)
    }
  }
  const spawned: Disaster[] = []
  for (const disaster of disasters.active) {
    if (disaster.kind !== 'fire') continue
    const roll = fireSpreadHash(tick, disaster.row, disaster.col)
    if (roll >= FIRE_SPREAD_PROBABILITY_PER_TICK) continue
    // Pick one of the four neighbors using a second deterministic
    // bin from the same roll (multiply by 4 and floor).
    const neighborIndex =
      Math.floor((roll / FIRE_SPREAD_PROBABILITY_PER_TICK) * 4) % 4
    const { dr, dc } = NEIGHBORS[neighborIndex]
    const candidateRow = disaster.row + dr
    const candidateCol = disaster.col + dc
    const key = `${candidateRow},${candidateCol}`
    if (existingKeys.has(key)) continue
    if (isCoveredByFireStation(candidateRow, candidateCol, services)) continue
    existingKeys.add(key)
    spawned.push({
      kind: 'fire',
      row: candidateRow,
      col: candidateCol,
      ticksRemaining: DISASTER_DEFAULT_DURATION_TICKS.fire,
    })
  }
  return spawned
}
