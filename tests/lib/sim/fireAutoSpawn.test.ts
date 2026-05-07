import { describe, it, expect } from 'vitest'
import {
  computeFireAutoSpawn,
  countUncoveredIndustrial,
  fireAutoSpawnHash,
} from '@/lib/sim/fireAutoSpawn'
import {
  DISASTER_DEFAULT_DURATION_TICKS,
  FIRE_AUTO_SPAWN_PROBABILITY_PER_TICK,
  type DisastersBucket,
  type ServicesBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

const EMPTY_SERVICES: ServicesBucket = { buildings: [] }
const EMPTY_DISASTERS: DisastersBucket = { active: [] }

function findIgnitingTickFor(row: number, col: number): number {
  // Pick the first tick whose hash falls below the auto-spawn
  // probability so the test can assert deterministic ignition.
  for (let tick = 1; tick < 100000; tick++) {
    if (
      fireAutoSpawnHash(tick, row, col) <
      FIRE_AUTO_SPAWN_PROBABILITY_PER_TICK
    ) {
      return tick
    }
  }
  throw new Error('no igniting tick within 100000 (calibration off)')
}

describe('computeFireAutoSpawn', () => {
  it('ignites an uncovered industrial cell on a known igniting tick', () => {
    const zones: ZonesBucket = {
      cells: { '0,0': { kind: 'industrial', density: 1 } },
    }
    const igniting = findIgnitingTickFor(0, 0)
    const spawned = computeFireAutoSpawn(
      zones,
      EMPTY_SERVICES,
      EMPTY_DISASTERS,
      igniting,
    )
    expect(spawned).toEqual([
      {
        kind: 'fire',
        row: 0,
        col: 0,
        ticksRemaining: DISASTER_DEFAULT_DURATION_TICKS.fire,
      },
    ])
  })

  it('does NOT ignite a covered industrial cell at the same igniting tick', () => {
    const zones: ZonesBucket = {
      cells: { '0,0': { kind: 'industrial', density: 1 } },
    }
    const services: ServicesBucket = {
      buildings: [{ kind: 'fire-station', row: 0, col: 1 }],
    }
    const igniting = findIgnitingTickFor(0, 0)
    expect(
      computeFireAutoSpawn(zones, services, EMPTY_DISASTERS, igniting),
    ).toEqual([])
  })

  it('does NOT ignite residential or commercial cells (industrial only for v1)', () => {
    const zones: ZonesBucket = {
      cells: {
        '0,0': { kind: 'residential', density: 3 },
        '1,1': { kind: 'commercial', density: 3 },
      },
    }
    const igniting = findIgnitingTickFor(0, 0)
    expect(
      computeFireAutoSpawn(zones, EMPTY_SERVICES, EMPTY_DISASTERS, igniting),
    ).toEqual([])
  })

  it('does NOT ignite a density-0 industrial cell', () => {
    const zones: ZonesBucket = {
      cells: { '0,0': { kind: 'industrial', density: 0 } },
    }
    const igniting = findIgnitingTickFor(0, 0)
    expect(
      computeFireAutoSpawn(zones, EMPTY_SERVICES, EMPTY_DISASTERS, igniting),
    ).toEqual([])
  })

  it('does NOT double-ignite a cell that already has an active fire', () => {
    const zones: ZonesBucket = {
      cells: { '0,0': { kind: 'industrial', density: 1 } },
    }
    const disasters: DisastersBucket = {
      active: [
        {
          kind: 'fire',
          row: 0,
          col: 0,
          ticksRemaining: 50,
        },
      ],
    }
    const igniting = findIgnitingTickFor(0, 0)
    expect(
      computeFireAutoSpawn(zones, EMPTY_SERVICES, disasters, igniting),
    ).toEqual([])
  })

  it('returns an empty array when zones is empty', () => {
    const zones: ZonesBucket = { cells: {} }
    expect(
      computeFireAutoSpawn(zones, EMPTY_SERVICES, EMPTY_DISASTERS, 100),
    ).toEqual([])
  })

  it('only ignites the uncovered cell when one industrial is covered and one is not', () => {
    const zones: ZonesBucket = {
      cells: {
        '0,0': { kind: 'industrial', density: 1 },
        '5,5': { kind: 'industrial', density: 1 },
      },
    }
    const services: ServicesBucket = {
      buildings: [{ kind: 'fire-station', row: 0, col: 0 }],
    }
    const igniting = findIgnitingTickFor(5, 5)
    const spawned = computeFireAutoSpawn(
      zones,
      services,
      EMPTY_DISASTERS,
      igniting,
    )
    // 0,0 is covered; only 5,5 should ignite.
    expect(spawned.map((d) => `${d.row},${d.col}`)).toEqual(['5,5'])
  })

  it('density-3 ignites at a tick where density-1 would not (density modulation)', () => {
    // Find a tick whose hash at (10, 10) falls in the band
    // [P, 3*P): density 1 cell does NOT ignite (threshold P),
    // density 3 cell DOES (threshold 3*P).
    let bandTick = -1
    for (let t = 1; t < 200000; t++) {
      const h = fireAutoSpawnHash(t, 10, 10)
      if (
        h >= FIRE_AUTO_SPAWN_PROBABILITY_PER_TICK &&
        h < FIRE_AUTO_SPAWN_PROBABILITY_PER_TICK * 3
      ) {
        bandTick = t
        break
      }
    }
    expect(bandTick).toBeGreaterThan(-1)

    const denseZones: ZonesBucket = {
      cells: { '10,10': { kind: 'industrial', density: 3 } },
    }
    const lightZones: ZonesBucket = {
      cells: { '10,10': { kind: 'industrial', density: 1 } },
    }
    const dense = computeFireAutoSpawn(
      denseZones,
      EMPTY_SERVICES,
      EMPTY_DISASTERS,
      bandTick,
    )
    const light = computeFireAutoSpawn(
      lightZones,
      EMPTY_SERVICES,
      EMPTY_DISASTERS,
      bandTick,
    )
    expect(dense).toHaveLength(1)
    expect(light).toHaveLength(0)
  })

  describe('countUncoveredIndustrial', () => {
    it('counts industrial cells with density > 0 not covered by a fire-station', () => {
      const zones: ZonesBucket = {
        cells: {
          '0,0': { kind: 'industrial', density: 1 },
          '0,1': { kind: 'industrial', density: 0 },
          '5,5': { kind: 'industrial', density: 3 },
          '6,6': { kind: 'residential', density: 1 },
          '7,7': { kind: 'commercial', density: 1 },
        },
      }
      const services: ServicesBucket = {
        buildings: [{ kind: 'fire-station', row: 5, col: 5 }],
      }
      // 0,0 industrial density 1 uncovered = 1
      // 0,1 industrial density 0 = excluded
      // 5,5 industrial density 3 BUT covered by fire-station = excluded
      // 6,6 residential = excluded
      // 7,7 commercial = excluded
      expect(countUncoveredIndustrial(zones, services)).toBe(1)
    })

    it('returns 0 when there are no industrial zones', () => {
      const zones: ZonesBucket = {
        cells: {
          '0,0': { kind: 'residential', density: 3 },
        },
      }
      expect(countUncoveredIndustrial(zones, EMPTY_SERVICES)).toBe(0)
    })

    it('returns 0 when every industrial cell is covered by a fire-station', () => {
      const zones: ZonesBucket = {
        cells: {
          '0,0': { kind: 'industrial', density: 1 },
          '0,1': { kind: 'industrial', density: 1 },
        },
      }
      const services: ServicesBucket = {
        buildings: [{ kind: 'fire-station', row: 0, col: 0 }],
      }
      expect(countUncoveredIndustrial(zones, services)).toBe(0)
    })
  })

  it('two replays at the same tick spawn the same fires (determinism)', () => {
    const zones: ZonesBucket = {
      cells: { '7,3': { kind: 'industrial', density: 2 } },
    }
    const igniting = findIgnitingTickFor(7, 3)
    const a = computeFireAutoSpawn(zones, EMPTY_SERVICES, EMPTY_DISASTERS, igniting)
    const b = computeFireAutoSpawn(zones, EMPTY_SERVICES, EMPTY_DISASTERS, igniting)
    expect(a).toEqual(b)
    expect(a).toHaveLength(1)
  })
})
