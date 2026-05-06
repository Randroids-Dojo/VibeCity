import {
  FIRE_DAMAGE_PROBABILITY_PER_TICK,
  type DisastersBucket,
  type ZoneCell,
  type ZoneDensity,
  type ZonesBucket,
} from './state'

/**
 * Deterministic fire damage (REQ-105 slice 4).
 *
 * Each tick, every active fire that lands on a zoned cell rolls a
 * deterministic hash of `(tick, row, col)` into a `[0, 1)` value.
 * If the value is below `FIRE_DAMAGE_PROBABILITY_PER_TICK` and the
 * cell's density is greater than 0, the cell's density drops by 1.
 *
 * A fire on a density-0 zone or an unzoned cell is a no-op for
 * damage; the fire keeps burning until its `ticksRemaining` runs
 * out. A density-3 cell that takes a damage hit drops to 2; a
 * density-1 cell drops to 0 ("burned out").
 *
 * Determinism: the hash has no external state. Two clients replaying
 * the same event log compute the same `(tick, row, col)` for every
 * active fire and so derive identical damage outcomes. The mixing
 * function uses different multipliers than `fireSpreadHash` so the
 * two rolls are independent.
 */

/**
 * Deterministic hash of three integers into a `[0, 1)` value. Uses
 * different mixing constants than `fireSpreadHash` so the spread and
 * damage rolls land on independent values for the same `(tick, row,
 * col)`.
 */
export function fireDamageHash(
  tick: number,
  row: number,
  col: number,
): number {
  let h = (tick | 0) * 0x27d4eb2d
  h = (h ^ ((row | 0) * 0x165667b1)) >>> 0
  h = (h ^ ((col | 0) * 0xb6e09f7d)) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  h = Math.imul(h, 0x6b8b4567) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return (h >>> 0) / 0x100000000
}

/**
 * Compute the zones bucket after applying this tick's fire damage.
 * Returns the input bucket unchanged when no fire lands a damage
 * hit on a zoned cell with density > 0.
 */
export function applyFireDamage(
  zones: ZonesBucket,
  disasters: DisastersBucket,
  tick: number,
): ZonesBucket {
  if (disasters.active.length === 0) return zones
  let nextCells: Record<string, ZoneCell> | null = null
  for (const disaster of disasters.active) {
    if (disaster.kind !== 'fire') continue
    const key = `${disaster.row},${disaster.col}`
    const source = nextCells ?? zones.cells
    const cell = source[key]
    if (!cell) continue
    if (cell.density === 0) continue
    const roll = fireDamageHash(tick, disaster.row, disaster.col)
    if (roll >= FIRE_DAMAGE_PROBABILITY_PER_TICK) continue
    if (nextCells === null) nextCells = { ...zones.cells }
    nextCells[key] = {
      kind: cell.kind,
      density: (cell.density - 1) as ZoneDensity,
    }
  }
  if (nextCells === null) return zones
  return { cells: nextCells }
}
