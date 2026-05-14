import { describe, it, expect } from 'vitest'
import {
  applyTornadoDamage,
  tornadoDamageHash,
} from '@/lib/sim/tornadoDamage'
import {
  EMPTY_POWER_BUCKET,
  EMPTY_SERVICES_BUCKET,
  EMPTY_WATER_BUCKET,
  TORNADO_DAMAGE_PROBABILITY_PER_TICK,
  type Disaster,
  type DisastersBucket,
  type PowerBucket,
  type ServicesBucket,
  type WaterBucket,
} from '@/lib/sim/state'

function tornadoAt(row: number, col: number): Disaster {
  return { kind: 'tornado', row, col, ticksRemaining: 40 }
}

function tickWhereDamageRolls(row: number, col: number): number {
  for (let tick = 1; tick < 1000; tick++) {
    if (
      tornadoDamageHash(tick, row, col) < TORNADO_DAMAGE_PROBABILITY_PER_TICK
    ) {
      return tick
    }
  }
  throw new Error('no damage tick found in 1000 trials')
}

function tickWhereDamageMisses(row: number, col: number): number {
  for (let tick = 1; tick < 1000; tick++) {
    if (
      tornadoDamageHash(tick, row, col) >=
      TORNADO_DAMAGE_PROBABILITY_PER_TICK
    ) {
      return tick
    }
  }
  throw new Error('no miss tick found in 1000 trials')
}

const EMPTY_BUCKETS = {
  power: EMPTY_POWER_BUCKET,
  water: EMPTY_WATER_BUCKET,
  services: EMPTY_SERVICES_BUCKET,
}

describe('TORNADO_DAMAGE_PROBABILITY_PER_TICK', () => {
  it('is in (0, 1)', () => {
    expect(TORNADO_DAMAGE_PROBABILITY_PER_TICK).toBeGreaterThan(0)
    expect(TORNADO_DAMAGE_PROBABILITY_PER_TICK).toBeLessThan(1)
  })

  it('is higher than fire damage probability (short-lived but punchy)', () => {
    expect(TORNADO_DAMAGE_PROBABILITY_PER_TICK).toBeGreaterThan(0.05)
  })
})

describe('tornadoDamageHash', () => {
  it('produces values in [0, 1) for many inputs', () => {
    for (let tick = 0; tick < 100; tick++) {
      for (let row = -3; row <= 3; row++) {
        const v = tornadoDamageHash(tick, row, row)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(tornadoDamageHash(42, 7, -3)).toBe(tornadoDamageHash(42, 7, -3))
  })

  it('produces different values for adjacent inputs', () => {
    expect(tornadoDamageHash(1, 0, 0)).not.toBe(tornadoDamageHash(2, 0, 0))
  })
})

describe('applyTornadoDamage', () => {
  it('returns input buckets when there are no disasters', () => {
    const result = applyTornadoDamage(EMPTY_BUCKETS, { active: [] }, 0)
    expect(result).toBe(EMPTY_BUCKETS)
  })

  it('does not damage non-tornado disasters', () => {
    const power: PowerBucket = {
      plants: [{ kind: 'coal', row: 0, col: 0 }],
      lines: { '0,0': true },
      pollution: {},
    }
    const buckets = { ...EMPTY_BUCKETS, power }
    const disasters: DisastersBucket = {
      active: [{ kind: 'fire', row: 0, col: 0, ticksRemaining: 60 }],
    }
    const result = applyTornadoDamage(buckets, disasters, 1)
    expect(result.power).toBe(power)
  })

  it('on a hit, erases the power line at the tornado cell', () => {
    const power: PowerBucket = {
      plants: [],
      lines: { '0,0': true, '0,1': true },
      pollution: {},
    }
    const buckets = { ...EMPTY_BUCKETS, power }
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyTornadoDamage(
      buckets,
      { active: [tornadoAt(0, 0)] },
      tick,
    )
    expect(result.power.lines['0,0']).toBeUndefined()
    expect(result.power.lines['0,1']).toBe(true)
  })

  it('on a hit, erases the power plant at the tornado cell', () => {
    const power: PowerBucket = {
      plants: [
        { kind: 'coal', row: 0, col: 0 },
        { kind: 'solar', row: 5, col: 5 },
      ],
      lines: {},
      pollution: {},
    }
    const buckets = { ...EMPTY_BUCKETS, power }
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyTornadoDamage(
      buckets,
      { active: [tornadoAt(0, 0)] },
      tick,
    )
    expect(result.power.plants).toHaveLength(1)
    expect(result.power.plants[0].kind).toBe('solar')
  })

  it('on a hit, erases the water source + pipe + treatment plant at the tornado cell', () => {
    const water: WaterBucket = {
      sources: [{ kind: 'water-tower', row: 0, col: 0 }],
      pipes: { '0,0': 'water', '0,1': 'sewage' },
      treatmentPlants: [
        { row: 0, col: 0 },
        { row: 5, col: 5 },
      ],
      wasteAccumulation: {},
    }
    const buckets = { ...EMPTY_BUCKETS, water }
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyTornadoDamage(
      buckets,
      { active: [tornadoAt(0, 0)] },
      tick,
    )
    expect(result.water.sources).toHaveLength(0)
    expect(result.water.pipes['0,0']).toBeUndefined()
    expect(result.water.pipes['0,1']).toBe('sewage')
    expect(result.water.treatmentPlants).toHaveLength(1)
    expect(result.water.treatmentPlants[0]).toEqual({ row: 5, col: 5 })
  })

  it('on a hit, erases the service building at the tornado cell', () => {
    const services: ServicesBucket = {
      buildings: [
        { kind: 'hospital', row: 0, col: 0 },
        { kind: 'fire-station', row: 5, col: 5 },
      ],
    }
    const buckets = { ...EMPTY_BUCKETS, services }
    const tick = tickWhereDamageRolls(0, 0)
    const result = applyTornadoDamage(
      buckets,
      { active: [tornadoAt(0, 0)] },
      tick,
    )
    expect(result.services.buildings).toHaveLength(1)
    expect(result.services.buildings[0].kind).toBe('fire-station')
  })

  it('preserves input buckets when the roll misses', () => {
    const power: PowerBucket = {
      plants: [{ kind: 'coal', row: 0, col: 0 }],
      lines: {},
      pollution: {},
    }
    const buckets = { ...EMPTY_BUCKETS, power }
    const tick = tickWhereDamageMisses(0, 0)
    const result = applyTornadoDamage(
      buckets,
      { active: [tornadoAt(0, 0)] },
      tick,
    )
    expect(result).toBe(buckets)
  })

  it('two replays of the same input produce identical results', () => {
    const power: PowerBucket = {
      plants: [{ kind: 'coal', row: 0, col: 0 }],
      lines: { '0,0': true },
      pollution: {},
    }
    const buckets = { ...EMPTY_BUCKETS, power }
    const disasters: DisastersBucket = { active: [tornadoAt(0, 0)] }
    let a = buckets
    let b = buckets
    for (let tick = 1; tick <= 100; tick++) {
      a = applyTornadoDamage(a, disasters, tick)
      b = applyTornadoDamage(b, disasters, tick)
    }
    expect(a).toEqual(b)
  })
})
