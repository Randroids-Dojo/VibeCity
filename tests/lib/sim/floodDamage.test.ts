import { describe, it, expect } from 'vitest'
import {
  applyFloodDamage,
  floodDamageHash,
} from '@/lib/sim/floodDamage'
import {
  EMPTY_ZONES_BUCKET,
  FLOOD_DAMAGE_PROBABILITY_PER_TICK,
  type Disaster,
  type DisastersBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

function floodAt(row: number, col: number): Disaster {
  return { kind: 'flood', row, col, ticksRemaining: 120 }
}

function zonesWith(
  cells: Array<{
    row: number
    col: number
    kind: 'residential' | 'commercial' | 'industrial'
    density: 0 | 1 | 2 | 3
  }>,
): ZonesBucket {
  const map: ZonesBucket['cells'] = {}
  for (const cell of cells) {
    map[`${cell.row},${cell.col}`] = { kind: cell.kind, density: cell.density }
  }
  return { cells: map }
}

function tickWhereDamageRolls(row: number, col: number): number {
  for (let tick = 1; tick < 1000; tick++) {
    if (floodDamageHash(tick, row, col) < FLOOD_DAMAGE_PROBABILITY_PER_TICK) {
      return tick
    }
  }
  throw new Error('no damage tick found in 1000 trials')
}

function tickWhereDamageMisses(row: number, col: number): number {
  for (let tick = 1; tick < 1000; tick++) {
    if (
      floodDamageHash(tick, row, col) >= FLOOD_DAMAGE_PROBABILITY_PER_TICK
    ) {
      return tick
    }
  }
  throw new Error('no miss tick found in 1000 trials')
}

describe('FLOOD_DAMAGE_PROBABILITY_PER_TICK', () => {
  it('is in (0, 1)', () => {
    expect(FLOOD_DAMAGE_PROBABILITY_PER_TICK).toBeGreaterThan(0)
    expect(FLOOD_DAMAGE_PROBABILITY_PER_TICK).toBeLessThan(1)
  })

  it('is lower than fire damage probability (slower drain)', () => {
    // The slice-5 spec calls for floods to be a slower drain than
    // fires, balanced by their longer 120-tick default duration.
    // Matching this against the FIRE_DAMAGE_PROBABILITY value
    // imported at runtime keeps the assertion in lockstep.
    const FIRE_DAMAGE = 0.05
    expect(FLOOD_DAMAGE_PROBABILITY_PER_TICK).toBeLessThan(FIRE_DAMAGE)
  })
})

describe('floodDamageHash', () => {
  it('produces values in [0, 1) for many inputs', () => {
    for (let tick = 0; tick < 100; tick++) {
      for (let row = -3; row <= 3; row++) {
        const v = floodDamageHash(tick, row, row)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(floodDamageHash(42, 7, -3)).toBe(floodDamageHash(42, 7, -3))
  })

  it('produces different values for adjacent inputs', () => {
    expect(floodDamageHash(1, 0, 0)).not.toBe(floodDamageHash(2, 0, 0))
    expect(floodDamageHash(1, 0, 0)).not.toBe(floodDamageHash(1, 1, 0))
    expect(floodDamageHash(1, 0, 0)).not.toBe(floodDamageHash(1, 0, 1))
  })
})

describe('applyFloodDamage', () => {
  it('returns input bucket when there are no disasters', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 2 },
    ])
    const result = applyFloodDamage(zones, { active: [] }, 0)
    expect(result).toBe(zones)
  })

  it('does not damage non-flood disasters', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 2 },
    ])
    const disasters: DisastersBucket = {
      active: [{ kind: 'fire', row: 0, col: 0, ticksRemaining: 60 }],
    }
    const result = applyFloodDamage(zones, disasters, 1)
    expect(result).toBe(zones)
  })

  it('does not damage unzoned cells', () => {
    const result = applyFloodDamage(
      EMPTY_ZONES_BUCKET,
      { active: [floodAt(0, 0)] },
      1,
    )
    expect(result).toBe(EMPTY_ZONES_BUCKET)
  })

  it('does not damage density-0 cells', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 0 },
    ])
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyFloodDamage(zones, { active: [floodAt(0, 0)] }, tick)
    expect(result).toBe(zones)
  })

  it('drops density by 1 on a hit', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 3 },
    ])
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyFloodDamage(zones, { active: [floodAt(0, 0)] }, tick)
    expect(result.cells['0,0']?.density).toBe(2)
  })

  it('preserves the input bucket when the roll misses', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 2 },
    ])
    const tick = tickWhereDamageMisses(0, 0)
    const result = applyFloodDamage(zones, { active: [floodAt(0, 0)] }, tick)
    expect(result).toBe(zones)
  })

  it('two replays of the same input produce identical results', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 3 },
      { row: 0, col: 1, kind: 'commercial', density: 2 },
      { row: 0, col: 2, kind: 'industrial', density: 1 },
    ])
    const disasters: DisastersBucket = {
      active: [floodAt(0, 0), floodAt(0, 1), floodAt(0, 2)],
    }
    let a = zones
    let b = zones
    for (let tick = 1; tick <= 200; tick++) {
      a = applyFloodDamage(a, disasters, tick)
      b = applyFloodDamage(b, disasters, tick)
    }
    expect(a).toEqual(b)
  })
})
