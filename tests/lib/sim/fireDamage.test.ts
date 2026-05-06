import { describe, it, expect } from 'vitest'
import { applyFireDamage, fireDamageHash } from '@/lib/sim/fireDamage'
import {
  EMPTY_ZONES_BUCKET,
  FIRE_DAMAGE_PROBABILITY_PER_TICK,
  type Disaster,
  type DisastersBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

function fireAt(row: number, col: number): Disaster {
  return { kind: 'fire', row, col, ticksRemaining: 60 }
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
  // Walk ticks until the damage hash is below the threshold so tests
  // that need a "guaranteed hit" can deterministically pick a tick.
  for (let tick = 1; tick < 1000; tick++) {
    if (fireDamageHash(tick, row, col) < FIRE_DAMAGE_PROBABILITY_PER_TICK) {
      return tick
    }
  }
  throw new Error('no damage tick found in 1000 trials')
}

function tickWhereDamageMisses(row: number, col: number): number {
  for (let tick = 1; tick < 1000; tick++) {
    if (fireDamageHash(tick, row, col) >= FIRE_DAMAGE_PROBABILITY_PER_TICK) {
      return tick
    }
  }
  throw new Error('no miss tick found in 1000 trials')
}

describe('FIRE_DAMAGE_PROBABILITY_PER_TICK', () => {
  it('is in (0, 1)', () => {
    expect(FIRE_DAMAGE_PROBABILITY_PER_TICK).toBeGreaterThan(0)
    expect(FIRE_DAMAGE_PROBABILITY_PER_TICK).toBeLessThan(1)
  })
})

describe('fireDamageHash', () => {
  it('produces values in [0, 1) for many inputs', () => {
    for (let tick = 0; tick < 100; tick++) {
      for (let row = -3; row <= 3; row++) {
        const v = fireDamageHash(tick, row, row)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(fireDamageHash(42, 7, -3)).toBe(fireDamageHash(42, 7, -3))
  })

  it('produces different values for adjacent inputs', () => {
    expect(fireDamageHash(1, 0, 0)).not.toBe(fireDamageHash(2, 0, 0))
    expect(fireDamageHash(1, 0, 0)).not.toBe(fireDamageHash(1, 1, 0))
    expect(fireDamageHash(1, 0, 0)).not.toBe(fireDamageHash(1, 0, 1))
  })
})

describe('applyFireDamage', () => {
  it('returns input bucket when there are no disasters', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 2 },
    ])
    const result = applyFireDamage(zones, { active: [] }, 0)
    expect(result).toBe(zones)
  })

  it('does not damage non-fire disasters', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 2 },
    ])
    const disasters: DisastersBucket = {
      active: [{ kind: 'flood', row: 0, col: 0, ticksRemaining: 60 }],
    }
    const result = applyFireDamage(zones, disasters, 1)
    expect(result).toBe(zones)
  })

  it('does not damage unzoned cells', () => {
    const result = applyFireDamage(
      EMPTY_ZONES_BUCKET,
      { active: [fireAt(0, 0)] },
      1,
    )
    expect(result).toBe(EMPTY_ZONES_BUCKET)
  })

  it('does not damage density-0 cells', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 0 },
    ])
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyFireDamage(zones, { active: [fireAt(0, 0)] }, tick)
    expect(result).toBe(zones)
  })

  it('drops density by 1 on a hit', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 3 },
    ])
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyFireDamage(zones, { active: [fireAt(0, 0)] }, tick)
    expect(result.cells['0,0']?.density).toBe(2)
  })

  it('preserves the input bucket when the roll misses', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 2 },
    ])
    const tick = tickWhereDamageMisses(0, 0)
    const result = applyFireDamage(zones, { active: [fireAt(0, 0)] }, tick)
    expect(result).toBe(zones)
  })

  it('two replays of the same input produce identical results', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 3 },
      { row: 0, col: 1, kind: 'commercial', density: 2 },
      { row: 0, col: 2, kind: 'industrial', density: 1 },
    ])
    const disasters: DisastersBucket = {
      active: [fireAt(0, 0), fireAt(0, 1), fireAt(0, 2)],
    }
    let a = zones
    let b = zones
    for (let tick = 1; tick <= 200; tick++) {
      a = applyFireDamage(a, disasters, tick)
      b = applyFireDamage(b, disasters, tick)
    }
    expect(a).toEqual(b)
  })

  it('drops a density-1 cell to 0 ("burned out") on a hit', () => {
    const zones = zonesWith([
      { row: 5, col: 5, kind: 'residential', density: 1 },
    ])
    const tick = tickWhereDamageRolls(5, 5)
    const result = applyFireDamage(zones, { active: [fireAt(5, 5)] }, tick)
    expect(result.cells['5,5']?.density).toBe(0)
  })
})
