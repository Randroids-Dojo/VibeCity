import {
  DISASTER_DEFAULT_DURATION_TICKS,
  EARTHQUAKE_AUTO_SPAWN_PROBABILITY_PER_TICK,
  type Disaster,
  type DisastersBucket,
  type ZonesBucket,
} from './state'

/**
 * Deterministic random earthquake auto-spawn (REQ-105 + mass-appeal
 * slice 2 of 5).
 *
 * Each tick rolls once for the whole city. If the per-tick hash is
 * below `EARTHQUAKE_AUTO_SPAWN_PROBABILITY_PER_TICK` AND the city
 * has at least one zoned cell AND no earthquake is already active,
 * a fresh earthquake is spawned at a deterministic-hash-picked
 * zoned cell. The "no concurrent earthquake" rule keeps a streak
 * of unlucky hashes from compounding into an earthquake swarm
 * that would feel oppressive rather than incidental.
 *
 * Determinism: the hash has no external state. Two clients
 * replaying the same event log compute the same `(tick)` for the
 * single global roll and the same `(tick, cellCount)` for the
 * cell pick, so two replays diverge identically (or not).
 *
 * Mixing constants are distinct from fire spread / fire damage /
 * fire auto-spawn so the earthquake roll is independent.
 */

export function earthquakeAutoSpawnHash(tick: number): number {
  let h = Math.imul(tick | 0, 0x9b9773e9) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  h = Math.imul(h, 0x6a5d39eb) >>> 0
  h = (h ^ (h >>> 14)) >>> 0
  return (h >>> 0) / 0x100000000
}

export function earthquakeCellPickHash(tick: number, cellCount: number): number {
  if (cellCount <= 0) return 0
  let h = Math.imul(tick | 0, 0x39b9c47b) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 0x4f9af23f) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return (h >>> 0) % cellCount
}

export function computeEarthquakeAutoSpawn(
  zones: ZonesBucket,
  disasters: DisastersBucket,
  tick: number,
): Disaster | null {
  if (disasters.active.some((d) => d.kind === 'earthquake')) return null
  // Roll the global per-tick hash FIRST so the common-case
  // (~99.8% of ticks at default probability) bails out before
  // any O(N) work on the zones bucket. Sorting + enumerating
  // keys is only paid on the rare tick that triggers a pass.
  const roll = earthquakeAutoSpawnHash(tick)
  if (roll >= EARTHQUAKE_AUTO_SPAWN_PROBABILITY_PER_TICK) return null
  const cellKeys = Object.keys(zones.cells).sort()
  if (cellKeys.length === 0) return null
  const pick = earthquakeCellPickHash(tick, cellKeys.length)
  const key = cellKeys[pick]
  const [rowStr, colStr] = key.split(',')
  const row = Number(rowStr)
  const col = Number(colStr)
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null
  return {
    kind: 'earthquake',
    row,
    col,
    ticksRemaining: DISASTER_DEFAULT_DURATION_TICKS.earthquake,
  }
}
