import { describe, it, expect } from 'vitest'
import {
  applyMonsterDamage,
  monsterDamageHash,
} from '@/lib/sim/monsterDamage'
import {
  EMPTY_POWER_BUCKET,
  EMPTY_SERVICES_BUCKET,
  EMPTY_WATER_BUCKET,
  EMPTY_ZONES_BUCKET,
  MONSTER_DAMAGE_PROBABILITY_PER_TICK,
  type Disaster,
  type DisastersBucket,
  type PowerBucket,
  type ServicesBucket,
  type WaterBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

function monsterAt(row: number, col: number): Disaster {
  return { kind: 'monster', row, col, ticksRemaining: 80 }
}

function tickWhereDamageRolls(row: number, col: number): number {
  for (let tick = 1; tick < 1000; tick++) {
    if (
      monsterDamageHash(tick, row, col) < MONSTER_DAMAGE_PROBABILITY_PER_TICK
    ) {
      return tick
    }
  }
  throw new Error('no damage tick found in 1000 trials')
}

function tickWhereDamageMisses(row: number, col: number): number {
  for (let tick = 1; tick < 1000; tick++) {
    if (
      monsterDamageHash(tick, row, col) >=
      MONSTER_DAMAGE_PROBABILITY_PER_TICK
    ) {
      return tick
    }
  }
  throw new Error('no miss tick found in 1000 trials')
}

const EMPTY_BUCKETS = {
  zones: EMPTY_ZONES_BUCKET,
  power: EMPTY_POWER_BUCKET,
  water: EMPTY_WATER_BUCKET,
  services: EMPTY_SERVICES_BUCKET,
}

describe('MONSTER_DAMAGE_PROBABILITY_PER_TICK', () => {
  it('is in (0, 1)', () => {
    expect(MONSTER_DAMAGE_PROBABILITY_PER_TICK).toBeGreaterThan(0)
    expect(MONSTER_DAMAGE_PROBABILITY_PER_TICK).toBeLessThan(1)
  })
})

describe('monsterDamageHash', () => {
  it('produces values in [0, 1) for many inputs', () => {
    for (let tick = 0; tick < 100; tick++) {
      for (let row = -3; row <= 3; row++) {
        const v = monsterDamageHash(tick, row, row)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(monsterDamageHash(42, 7, -3)).toBe(monsterDamageHash(42, 7, -3))
  })

  it('produces different values for adjacent inputs', () => {
    expect(monsterDamageHash(1, 0, 0)).not.toBe(monsterDamageHash(2, 0, 0))
  })
})

describe('applyMonsterDamage', () => {
  it('returns input buckets when there are no disasters', () => {
    const result = applyMonsterDamage(EMPTY_BUCKETS, { active: [] }, 0)
    expect(result).toBe(EMPTY_BUCKETS)
  })

  it('does not damage non-monster disasters', () => {
    const power: PowerBucket = {
      plants: [{ kind: 'coal', row: 0, col: 0 }],
      lines: { '0,0': true },
    }
    const buckets = { ...EMPTY_BUCKETS, power }
    const disasters: DisastersBucket = {
      active: [{ kind: 'fire', row: 0, col: 0, ticksRemaining: 60 }],
    }
    const result = applyMonsterDamage(buckets, disasters, 1)
    expect(result.power).toBe(power)
  })

  it('on a hit, drops zone density by 1 at the monster cell', () => {
    const zones: ZonesBucket = {
      cells: { '0,0': { kind: 'residential', density: 3 } },
    }
    const buckets = { ...EMPTY_BUCKETS, zones }
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyMonsterDamage(
      buckets,
      { active: [monsterAt(0, 0)] },
      tick,
    )
    expect(result.zones.cells['0,0']?.density).toBe(2)
  })

  it('on a hit, erases the power line and plant at the monster cell', () => {
    const power: PowerBucket = {
      plants: [{ kind: 'coal', row: 0, col: 0 }],
      lines: { '0,0': true, '0,1': true },
    }
    const buckets = { ...EMPTY_BUCKETS, power }
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyMonsterDamage(
      buckets,
      { active: [monsterAt(0, 0)] },
      tick,
    )
    expect(result.power.plants).toHaveLength(0)
    expect(result.power.lines['0,0']).toBeUndefined()
    expect(result.power.lines['0,1']).toBe(true)
  })

  it('on a hit, erases water source / pipe / treatment plant at the cell', () => {
    const water: WaterBucket = {
      sources: [{ kind: 'water-tower', row: 0, col: 0 }],
      pipes: { '0,0': 'water' },
      treatmentPlants: [{ row: 0, col: 0 }],
      wasteAccumulation: {},
    }
    const buckets = { ...EMPTY_BUCKETS, water }
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyMonsterDamage(
      buckets,
      { active: [monsterAt(0, 0)] },
      tick,
    )
    expect(result.water.sources).toHaveLength(0)
    expect(result.water.pipes['0,0']).toBeUndefined()
    expect(result.water.treatmentPlants).toHaveLength(0)
  })

  it('on a hit, erases the service building at the cell', () => {
    const services: ServicesBucket = {
      buildings: [{ kind: 'hospital', row: 0, col: 0 }],
    }
    const buckets = { ...EMPTY_BUCKETS, services }
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyMonsterDamage(
      buckets,
      { active: [monsterAt(0, 0)] },
      tick,
    )
    expect(result.services.buildings).toHaveLength(0)
  })

  it('preserves input buckets when the roll misses', () => {
    const power: PowerBucket = {
      plants: [{ kind: 'coal', row: 0, col: 0 }],
      lines: {},
    }
    const buckets = { ...EMPTY_BUCKETS, power }
    const tick = tickWhereDamageMisses(0, 0)
    const result = applyMonsterDamage(
      buckets,
      { active: [monsterAt(0, 0)] },
      tick,
    )
    expect(result).toBe(buckets)
  })

  it('two replays of the same input produce identical results', () => {
    const zones: ZonesBucket = {
      cells: { '0,0': { kind: 'residential', density: 3 } },
    }
    const power: PowerBucket = {
      plants: [{ kind: 'coal', row: 0, col: 0 }],
      lines: { '0,0': true },
    }
    const buckets = { ...EMPTY_BUCKETS, zones, power }
    const disasters: DisastersBucket = { active: [monsterAt(0, 0)] }
    let a = buckets
    let b = buckets
    for (let tick = 1; tick <= 100; tick++) {
      a = applyMonsterDamage(a, disasters, tick)
      b = applyMonsterDamage(b, disasters, tick)
    }
    expect(a).toEqual(b)
  })
})
