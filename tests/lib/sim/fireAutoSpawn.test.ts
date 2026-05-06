import { describe, it, expect } from 'vitest'
import {
  computeFireAutoSpawn,
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
