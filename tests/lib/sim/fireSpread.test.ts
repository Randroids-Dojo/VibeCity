import { describe, it, expect } from 'vitest'
import {
  computeFireSpread,
  fireSpreadHash,
} from '@/lib/sim/fireSpread'
import {
  EMPTY_SERVICES_BUCKET,
  FIRE_SPREAD_PROBABILITY_PER_TICK,
  type DisastersBucket,
  type ServicesBucket,
} from '@/lib/sim/state'

function fireAt(row: number, col: number, ticksRemaining = 60): {
  kind: 'fire'
  row: number
  col: number
  ticksRemaining: number
} {
  return { kind: 'fire' as const, row, col, ticksRemaining }
}

describe('FIRE_SPREAD_PROBABILITY_PER_TICK', () => {
  it('is greater than 0 and less than 1', () => {
    expect(FIRE_SPREAD_PROBABILITY_PER_TICK).toBeGreaterThan(0)
    expect(FIRE_SPREAD_PROBABILITY_PER_TICK).toBeLessThan(1)
  })
})

describe('fireSpreadHash', () => {
  it('produces values in [0, 1)', () => {
    for (let tick = 0; tick < 100; tick++) {
      for (let row = -3; row <= 3; row++) {
        const v = fireSpreadHash(tick, row, row)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(fireSpreadHash(42, 7, -3)).toBe(fireSpreadHash(42, 7, -3))
  })

  it('produces different values for adjacent inputs', () => {
    expect(fireSpreadHash(1, 0, 0)).not.toBe(fireSpreadHash(2, 0, 0))
    expect(fireSpreadHash(1, 0, 0)).not.toBe(fireSpreadHash(1, 1, 0))
    expect(fireSpreadHash(1, 0, 0)).not.toBe(fireSpreadHash(1, 0, 1))
  })
})

describe('computeFireSpread', () => {
  it('returns no spawns when there are no active disasters', () => {
    const result = computeFireSpread(
      { active: [] },
      0,
      EMPTY_SERVICES_BUCKET,
    )
    expect(result).toEqual([])
  })

  it('does not spread non-fire disasters', () => {
    const disasters: DisastersBucket = {
      active: [
        { kind: 'flood', row: 0, col: 0, ticksRemaining: 60 },
        { kind: 'tornado', row: 1, col: 1, ticksRemaining: 60 },
      ],
    }
    const result = computeFireSpread(disasters, 0, EMPTY_SERVICES_BUCKET)
    expect(result).toEqual([])
  })

  it('produces at least one spread fire over many ticks for a single fire', () => {
    // Walk 200 ticks with the same fire and confirm the rng produces
    // a hit at least once at the 5% probability rate.
    let hits = 0
    for (let tick = 0; tick < 200; tick++) {
      const result = computeFireSpread(
        { active: [fireAt(0, 0)] },
        tick,
        EMPTY_SERVICES_BUCKET,
      )
      if (result.length > 0) hits += 1
    }
    expect(hits).toBeGreaterThan(0)
  })

  it('two replays of the same inputs produce identical spawned fires', () => {
    let aTotal = 0
    let bTotal = 0
    for (let tick = 0; tick < 200; tick++) {
      const a = computeFireSpread(
        { active: [fireAt(2, 3)] },
        tick,
        EMPTY_SERVICES_BUCKET,
      )
      const b = computeFireSpread(
        { active: [fireAt(2, 3)] },
        tick,
        EMPTY_SERVICES_BUCKET,
      )
      expect(a).toEqual(b)
      aTotal += a.length
      bTotal += b.length
    }
    expect(aTotal).toBe(bTotal)
  })

  it('does not spread to cells that already have a fire', () => {
    // Two adjacent fires at (0, 0) and (0, 1): a spread from (0, 0)
    // toward (0, 1) is blocked.
    const disasters: DisastersBucket = {
      active: [fireAt(0, 0), fireAt(0, 1)],
    }
    // Walk many ticks; every spawned fire must be at a cell other
    // than the existing two.
    for (let tick = 0; tick < 400; tick++) {
      const result = computeFireSpread(
        disasters,
        tick,
        EMPTY_SERVICES_BUCKET,
      )
      for (const fire of result) {
        const isExisting =
          (fire.row === 0 && fire.col === 0) ||
          (fire.row === 0 && fire.col === 1)
        expect(isExisting).toBe(false)
      }
    }
  })

  it('does not spread onto cells covered by a fire-station', () => {
    const services: ServicesBucket = {
      buildings: [{ kind: 'fire-station', row: 0, col: 0 }],
    }
    // A fire at (0, 6) is just outside the fire-station's coverage
    // radius (= 6). All four neighbors of (0, 6) (= (-1, 6), (1, 6),
    // (0, 5), (0, 7)) are AT or WITHIN coverage at distances 7/7/5/7
    // respectively, so spreads toward (0, 5) at distance 5 are
    // blocked.
    const blockedKey = '0,5'
    for (let tick = 0; tick < 400; tick++) {
      const result = computeFireSpread(
        { active: [fireAt(0, 6)] },
        tick,
        services,
      )
      for (const fire of result) {
        expect(`${fire.row},${fire.col}`).not.toBe(blockedKey)
      }
    }
  })

  it('spawned fires carry the per-kind default duration', () => {
    let foundOne = false
    for (let tick = 0; tick < 200; tick++) {
      const result = computeFireSpread(
        { active: [fireAt(0, 0)] },
        tick,
        EMPTY_SERVICES_BUCKET,
      )
      if (result.length > 0) {
        foundOne = true
        expect(result[0].kind).toBe('fire')
        expect(result[0].ticksRemaining).toBe(60)
        break
      }
    }
    expect(foundOne).toBe(true)
  })
})
