import { describe, expect, it } from 'vitest'
import {
  refreshPowerPollution,
  solveCoalPollution,
} from '@/lib/sim/powerPollution'
import {
  COAL_POLLUTION_PER_TICK,
  type PowerBucket,
} from '@/lib/sim/state'

function powerWith(plants: PowerBucket['plants']): PowerBucket {
  return { plants, lines: {}, pollution: {} }
}

describe('solveCoalPollution (REQ-089)', () => {
  it('emits into the four orthogonally adjacent cells for a coal plant', () => {
    const pollution = solveCoalPollution(
      powerWith([{ kind: 'coal', row: 0, col: 0 }]),
    )
    expect(pollution).toEqual({
      '-1,0': COAL_POLLUTION_PER_TICK,
      '0,-1': COAL_POLLUTION_PER_TICK,
      '0,1': COAL_POLLUTION_PER_TICK,
      '1,0': COAL_POLLUTION_PER_TICK,
    })
  })

  it('does not emit from solar plants', () => {
    const pollution = solveCoalPollution(
      powerWith([{ kind: 'solar', row: 0, col: 0 }]),
    )
    expect(pollution).toEqual({})
  })

  it('stacks exposure when coal plant adjacency overlaps', () => {
    const pollution = solveCoalPollution(
      powerWith([
        { kind: 'coal', row: 0, col: 0 },
        { kind: 'coal', row: 0, col: 2 },
      ]),
    )
    expect(pollution['0,1']).toBe(COAL_POLLUTION_PER_TICK * 2)
  })
})

describe('refreshPowerPollution (REQ-089)', () => {
  it('returns identity when the existing pollution map is current', () => {
    const power: PowerBucket = {
      plants: [{ kind: 'coal', row: 0, col: 0 }],
      lines: {},
      pollution: solveCoalPollution(
        powerWith([{ kind: 'coal', row: 0, col: 0 }]),
      ),
    }
    expect(refreshPowerPollution(power)).toBe(power)
  })

  it('replaces stale pollution with the current exposure map', () => {
    const power: PowerBucket = {
      plants: [{ kind: 'solar', row: 0, col: 0 }],
      lines: {},
      pollution: { '0,1': COAL_POLLUTION_PER_TICK },
    }
    expect(refreshPowerPollution(power)).toEqual({
      plants: [{ kind: 'solar', row: 0, col: 0 }],
      lines: {},
      pollution: {},
    })
  })
})
