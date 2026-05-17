import { describe, expect, it } from 'vitest'
import { cityAvgPollution, cityJobSlots } from '@/lib/sim/hudReadouts'
import {
  COMMERCIAL_JOBS_BY_DENSITY,
  EMPTY_POPULATION_BUCKET,
  EMPTY_POWER_BUCKET,
  EMPTY_ZONES_BUCKET,
  INDUSTRIAL_JOBS_BY_DENSITY,
  type PopulationBucket,
  type PowerBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

function zonesWith(cells: ZonesBucket['cells']): ZonesBucket {
  return { cells }
}

function populationWith(
  cells: PopulationBucket['cells'],
): PopulationBucket {
  let total = 0
  for (const cell of Object.values(cells)) total += cell.residents
  return {
    ...EMPTY_POPULATION_BUCKET,
    cells,
    totalPopulation: total,
  }
}

function powerWith(pollution: Record<string, number>): PowerBucket {
  return { ...EMPTY_POWER_BUCKET, pollution }
}

describe('cityJobSlots', () => {
  it('returns zero on an empty zones bucket', () => {
    expect(cityJobSlots(EMPTY_ZONES_BUCKET)).toEqual({
      commercial: 0,
      industrial: 0,
      total: 0,
    })
  })

  it('sums commercial and industrial jobs by density', () => {
    const zones = zonesWith({
      '0,0': { kind: 'commercial', density: 2 },
      '0,1': { kind: 'industrial', density: 3 },
      '0,2': { kind: 'residential', density: 3 },
    })
    const result = cityJobSlots(zones)
    expect(result.commercial).toBe(COMMERCIAL_JOBS_BY_DENSITY[2])
    expect(result.industrial).toBe(INDUSTRIAL_JOBS_BY_DENSITY[3])
    expect(result.total).toBe(result.commercial + result.industrial)
  })

  it('ignores residential zones (they host residents, not jobs)', () => {
    const zones = zonesWith({
      '0,0': { kind: 'residential', density: 3 },
      '0,1': { kind: 'residential', density: 2 },
    })
    expect(cityJobSlots(zones)).toEqual({
      commercial: 0,
      industrial: 0,
      total: 0,
    })
  })

  it('counts density-0 cells as zero jobs', () => {
    const zones = zonesWith({
      '0,0': { kind: 'commercial', density: 0 },
      '0,1': { kind: 'industrial', density: 0 },
    })
    expect(cityJobSlots(zones).total).toBe(0)
  })
})

describe('cityAvgPollution', () => {
  it('returns 0 with no populated cells', () => {
    expect(
      cityAvgPollution(powerWith({ '0,0': 8 }), EMPTY_POPULATION_BUCKET),
    ).toBe(0)
  })

  it('averages pollution across populated cells only', () => {
    // Two populated cells, one exposed to 8 units of pollution and the
    // other to none. Average is 4.
    const population = populationWith({
      '0,0': { residents: 4, tripDemand: 0 },
      '0,1': { residents: 4, tripDemand: 0 },
    })
    const power = powerWith({ '0,0': 8 })
    expect(cityAvgPollution(power, population)).toBe(4)
  })

  it('excludes cells with zero residents from the average', () => {
    // Cell (0,0) is populated and exposed; (0,1) is in the population
    // bucket with zero residents (transient post-decline state). Only
    // (0,0) feeds the average.
    const population = populationWith({
      '0,0': { residents: 4, tripDemand: 0 },
      '0,1': { residents: 0, tripDemand: 0 },
    })
    const power = powerWith({ '0,0': 8, '0,1': 8 })
    expect(cityAvgPollution(power, population)).toBe(8)
  })

  it('reads 0 for a populated cell with no pollution entry', () => {
    const population = populationWith({
      '0,0': { residents: 4, tripDemand: 0 },
    })
    expect(cityAvgPollution(powerWith({}), population)).toBe(0)
  })
})
