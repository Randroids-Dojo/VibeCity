import { describe, it, expect } from 'vitest'
import {
  computeEarthquakeAutoSpawn,
  earthquakeAutoSpawnHash,
  earthquakeCellPickHash,
} from '@/lib/sim/earthquakeAutoSpawn'
import {
  DISASTER_DEFAULT_DURATION_TICKS,
  EARTHQUAKE_AUTO_SPAWN_PROBABILITY_PER_TICK,
  type DisastersBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

const EMPTY_DISASTERS: DisastersBucket = { active: [] }

function findIgnitingTick(): number {
  for (let tick = 1; tick < 1000000; tick++) {
    if (
      earthquakeAutoSpawnHash(tick) <
      EARTHQUAKE_AUTO_SPAWN_PROBABILITY_PER_TICK
    ) {
      return tick
    }
  }
  throw new Error('no igniting tick within 1M (calibration off)')
}

const SINGLE_RES: ZonesBucket = {
  cells: { '0,0': { kind: 'residential', density: 1 } },
}

describe('earthquakeAutoSpawnHash', () => {
  it('returns values in [0, 1)', () => {
    for (let t = 0; t < 100; t++) {
      const v = earthquakeAutoSpawnHash(t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is deterministic across calls', () => {
    expect(earthquakeAutoSpawnHash(42)).toBe(earthquakeAutoSpawnHash(42))
  })

  it('produces different values for adjacent ticks', () => {
    const a = earthquakeAutoSpawnHash(100)
    const b = earthquakeAutoSpawnHash(101)
    expect(a).not.toBe(b)
  })
})

describe('earthquakeCellPickHash', () => {
  it('returns 0 for cellCount=0', () => {
    expect(earthquakeCellPickHash(42, 0)).toBe(0)
  })

  it('returns indices in [0, cellCount)', () => {
    for (let t = 0; t < 100; t++) {
      const i = earthquakeCellPickHash(t, 5)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(5)
    }
  })
})

describe('computeEarthquakeAutoSpawn', () => {
  it('returns null when there are no zoned cells', () => {
    expect(
      computeEarthquakeAutoSpawn({ cells: {} }, EMPTY_DISASTERS, 100),
    ).toBeNull()
  })

  it('returns null when an earthquake is already active (no swarm)', () => {
    const igniting = findIgnitingTick()
    const disasters: DisastersBucket = {
      active: [{ kind: 'earthquake', row: 5, col: 5, ticksRemaining: 10 }],
    }
    expect(
      computeEarthquakeAutoSpawn(SINGLE_RES, disasters, igniting),
    ).toBeNull()
  })

  it('returns null on a tick whose hash is at or above probability', () => {
    // Find a tick whose hash is comfortably above the probability.
    let nonIgniting = -1
    for (let t = 1; t < 100; t++) {
      if (
        earthquakeAutoSpawnHash(t) >=
        EARTHQUAKE_AUTO_SPAWN_PROBABILITY_PER_TICK
      ) {
        nonIgniting = t
        break
      }
    }
    expect(nonIgniting).toBeGreaterThan(-1)
    expect(
      computeEarthquakeAutoSpawn(SINGLE_RES, EMPTY_DISASTERS, nonIgniting),
    ).toBeNull()
  })

  it('spawns an earthquake at a zoned cell on a known igniting tick', () => {
    const igniting = findIgnitingTick()
    const result = computeEarthquakeAutoSpawn(
      SINGLE_RES,
      EMPTY_DISASTERS,
      igniting,
    )
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('earthquake')
    expect(result?.row).toBe(0)
    expect(result?.col).toBe(0)
    expect(result?.ticksRemaining).toBe(
      DISASTER_DEFAULT_DURATION_TICKS.earthquake,
    )
  })

  it('two replays at the same tick spawn the same earthquake (determinism)', () => {
    const zones: ZonesBucket = {
      cells: {
        '0,0': { kind: 'residential', density: 1 },
        '5,5': { kind: 'commercial', density: 1 },
        '7,3': { kind: 'industrial', density: 1 },
      },
    }
    const igniting = findIgnitingTick()
    const a = computeEarthquakeAutoSpawn(zones, EMPTY_DISASTERS, igniting)
    const b = computeEarthquakeAutoSpawn(zones, EMPTY_DISASTERS, igniting)
    expect(a).toEqual(b)
  })
})
