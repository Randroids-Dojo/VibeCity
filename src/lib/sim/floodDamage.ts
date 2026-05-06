import {
  FLOOD_DAMAGE_PROBABILITY_PER_TICK,
  type DisastersBucket,
  type ZoneCell,
  type ZoneDensity,
  type ZonesBucket,
} from './state'

/**
 * Deterministic flood damage (REQ-105 slice 5).
 *
 * Mirrors `applyFireDamage`: per-tick deterministic hash of `(tick,
 * row, col)` rolls a damage check on every active flood; on a hit
 * the zoned cell's density drops by 1. The probability is lower
 * than fire (`FLOOD_DAMAGE_PROBABILITY_PER_TICK`) because floods
 * are wide-area slow drains rather than fast burns; the longer
 * 120-tick default duration stretches the same expected damage
 * budget across twice as many ticks.
 *
 * Determinism: hash uses different mixing constants than the fire
 * damage / spread hashes so the rolls land on independent values
 * for the same `(tick, row, col)`.
 */

export function floodDamageHash(
  tick: number,
  row: number,
  col: number,
): number {
  let h = (tick | 0) * 0x9b1cd6e5
  h = (h ^ ((row | 0) * 0x52a48745)) >>> 0
  h = (h ^ ((col | 0) * 0xa1b56b39)) >>> 0
  h = (h ^ (h >>> 17)) >>> 0
  h = Math.imul(h, 0x6e63a3a3) >>> 0
  h = (h ^ (h >>> 14)) >>> 0
  return (h >>> 0) / 0x100000000
}

/**
 * Compute the zones bucket after applying this tick's flood damage.
 * Returns the input bucket unchanged when no flood lands a damage
 * hit on a zoned cell with density > 0.
 */
export function applyFloodDamage(
  zones: ZonesBucket,
  disasters: DisastersBucket,
  tick: number,
): ZonesBucket {
  if (disasters.active.length === 0) return zones
  let nextCells: Record<string, ZoneCell> | null = null
  for (const disaster of disasters.active) {
    if (disaster.kind !== 'flood') continue
    const key = `${disaster.row},${disaster.col}`
    const source = nextCells ?? zones.cells
    const cell = source[key]
    if (!cell) continue
    if (cell.density === 0) continue
    const roll = floodDamageHash(tick, disaster.row, disaster.col)
    if (roll >= FLOOD_DAMAGE_PROBABILITY_PER_TICK) continue
    if (nextCells === null) nextCells = { ...zones.cells }
    nextCells[key] = {
      kind: cell.kind,
      density: (cell.density - 1) as ZoneDensity,
    }
  }
  if (nextCells === null) return zones
  return { cells: nextCells }
}
