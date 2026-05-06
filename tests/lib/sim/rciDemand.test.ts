import { describe, it, expect } from 'vitest'
import { computeRciDemand } from '@/lib/sim/rciDemand'
import {
  EMPTY_POPULATION_BUCKET,
  EMPTY_ZONES_BUCKET,
  type PopulationBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

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

function populationWith(total: number): PopulationBucket {
  return { ...EMPTY_POPULATION_BUCKET, totalPopulation: total }
}

describe('computeRciDemand', () => {
  it('returns zeros for an empty city', () => {
    expect(computeRciDemand(EMPTY_ZONES_BUCKET, EMPTY_POPULATION_BUCKET)).toEqual({
      residential: 0,
      commercial: 0,
      industrial: 0,
    })
  })

  it('positive residential demand when jobs exceed residents', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'commercial', density: 1 }, // 3 jobs
      { row: 0, col: 1, kind: 'industrial', density: 1 }, // 4 jobs
    ])
    const result = computeRciDemand(zones, EMPTY_POPULATION_BUCKET)
    expect(result.residential).toBe(7) // 7 jobs - 0 residents
  })

  it('negative residential demand when residents exceed jobs', () => {
    const result = computeRciDemand(EMPTY_ZONES_BUCKET, populationWith(40))
    expect(result.residential).toBe(-40)
  })

  it('positive commercial demand when residents exceed commercial jobs', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'commercial', density: 1 }, // 3 jobs
    ])
    const result = computeRciDemand(zones, populationWith(10))
    expect(result.commercial).toBe(7)
  })

  it('positive industrial demand when residents exceed industrial jobs', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'industrial', density: 1 }, // 4 jobs
    ])
    const result = computeRciDemand(zones, populationWith(10))
    expect(result.industrial).toBe(6)
  })

  it('residential zone density does not feed jobs', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 3 }, // 0 jobs
    ])
    const result = computeRciDemand(zones, populationWith(40))
    expect(result.residential).toBe(-40)
  })

  it('high-density commercial / industrial scales jobs by the density table', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'commercial', density: 3 }, // 30 jobs
      { row: 0, col: 1, kind: 'industrial', density: 3 }, // 35 jobs
    ])
    const result = computeRciDemand(zones, populationWith(0))
    expect(result.residential).toBe(65)
    expect(result.commercial).toBe(-30)
    expect(result.industrial).toBe(-35)
  })

  it('two replays of the same input produce identical results', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'commercial', density: 2 },
      { row: 0, col: 1, kind: 'industrial', density: 1 },
    ])
    const population = populationWith(15)
    const a = computeRciDemand(zones, population)
    const b = computeRciDemand(zones, population)
    expect(a).toEqual(b)
  })
})
