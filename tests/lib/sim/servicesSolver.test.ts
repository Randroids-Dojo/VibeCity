import { describe, it, expect } from 'vitest'
import {
  cellCoverage,
  cellCoverageCountFor,
  coverageCount,
  solveServicesCoverage,
  type CellCoverage,
} from '@/lib/sim/servicesSolver'
import {
  EMPTY_SERVICES_BUCKET,
  EMPTY_ZONES_BUCKET,
  SERVICE_COVERAGE_CELLS,
  type ServiceBuilding,
  type ServicesBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

function servicesWith(
  buildings: Array<{ kind: ServiceBuilding['kind']; row: number; col: number }>,
): ServicesBucket {
  return { buildings }
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

const ZERO: CellCoverage = {
  'police-station': false,
  'fire-station': false,
  hospital: false,
  school: false,
  'garbage-depot': false,
}

describe('cellCoverage', () => {
  it('returns all-false on the empty services bucket', () => {
    expect(cellCoverage(0, 0, EMPTY_SERVICES_BUCKET)).toEqual(ZERO)
  })

  it('marks police-covered when a police station is within radius', () => {
    const services = servicesWith([
      { kind: 'police-station', row: 0, col: 0 },
    ])
    // Manhattan distance 5 from origin, police radius 6 = covered
    expect(cellCoverage(2, 3, services)['police-station']).toBe(true)
    expect(cellCoverage(2, 3, services)['hospital']).toBe(false)
  })

  it('marks not-covered when distance exceeds radius', () => {
    const services = servicesWith([
      { kind: 'school', row: 0, col: 0 },
    ])
    // School radius 5; cell at (3, 3) = manhattan 6 > 5
    expect(cellCoverage(3, 3, services)['school']).toBe(false)
  })

  it('marks covered at exactly the radius boundary', () => {
    const services = servicesWith([
      { kind: 'school', row: 0, col: 0 },
    ])
    // School radius 5; cell at (2, 3) = manhattan 5 = covered
    expect(cellCoverage(2, 3, services)['school']).toBe(true)
  })

  it('hospital reaches further than police with the same anchor', () => {
    const services = servicesWith([
      { kind: 'hospital', row: 0, col: 0 },
      { kind: 'police-station', row: 0, col: 0 },
    ])
    // Cell at (4, 3) = manhattan 7. Hospital radius 8 = covered;
    // police radius 6 = not covered.
    const cov = cellCoverage(4, 3, services)
    expect(cov.hospital).toBe(true)
    expect(cov['police-station']).toBe(false)
  })

  it('multiple of the same kind do not bias the result (boolean OR)', () => {
    const services = servicesWith([
      { kind: 'police-station', row: 0, col: 0 },
      { kind: 'police-station', row: 100, col: 100 }, // far away
    ])
    expect(cellCoverage(0, 0, services)['police-station']).toBe(true)
  })

  it('handles negative coordinates symmetrically', () => {
    const services = servicesWith([
      { kind: 'fire-station', row: 0, col: 0 },
    ])
    // Manhattan from (-3, -3) = 6 = fire radius 6 = covered
    expect(cellCoverage(-3, -3, services)['fire-station']).toBe(true)
  })

  it('returns a fresh object each call (no shared reference)', () => {
    const services = servicesWith([])
    const a = cellCoverage(0, 0, services)
    const b = cellCoverage(0, 0, services)
    expect(a).not.toBe(b)
  })
})

describe('coverageCount', () => {
  it('returns 0 for all-false coverage', () => {
    expect(coverageCount(ZERO)).toBe(0)
  })

  it('returns 1 for a single covered kind', () => {
    expect(coverageCount({ ...ZERO, 'police-station': true })).toBe(1)
  })

  it('returns 5 for all-covered', () => {
    expect(
      coverageCount({
        'police-station': true,
        'fire-station': true,
        hospital: true,
        school: true,
        'garbage-depot': true,
      }),
    ).toBe(5)
  })

  it('returns 3 for three covered kinds', () => {
    expect(
      coverageCount({
        ...ZERO,
        'police-station': true,
        hospital: true,
        school: true,
      }),
    ).toBe(3)
  })
})

describe('solveServicesCoverage', () => {
  it('returns empty record on empty zones', () => {
    expect(
      solveServicesCoverage(EMPTY_ZONES_BUCKET, EMPTY_SERVICES_BUCKET),
    ).toEqual({})
  })

  it('returns all-zero coverage for every cell when no services exist', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 0 },
      { row: 1, col: 1, kind: 'commercial', density: 0 },
    ])
    const result = solveServicesCoverage(zones, EMPTY_SERVICES_BUCKET)
    expect(result['0,0']).toEqual(ZERO)
    expect(result['1,1']).toEqual(ZERO)
  })

  it('applies coverage per-kind across multiple zones', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 0 },
      { row: 8, col: 8, kind: 'residential', density: 0 },
    ])
    const services = servicesWith([
      { kind: 'police-station', row: 0, col: 0 },
    ])
    const result = solveServicesCoverage(zones, services)
    // (0,0): police covers (manhattan 0)
    expect(result['0,0']?.['police-station']).toBe(true)
    // (8,8): manhattan 16, police radius 6 = not covered
    expect(result['8,8']?.['police-station']).toBe(false)
  })

  it('two replays of the same input produce identical results', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 0 },
      { row: 5, col: 5, kind: 'commercial', density: 1 },
    ])
    const services = servicesWith([
      { kind: 'hospital', row: 3, col: 3 },
      { kind: 'fire-station', row: 0, col: 0 },
    ])
    const a = solveServicesCoverage(zones, services)
    const b = solveServicesCoverage(zones, services)
    expect(a).toEqual(b)
  })
})

describe('cellCoverageCountFor', () => {
  it('returns 0 for an unzoned cell', () => {
    const services = servicesWith([
      { kind: 'police-station', row: 0, col: 0 },
    ])
    expect(cellCoverageCountFor(0, 0, EMPTY_ZONES_BUCKET, services)).toBe(0)
  })

  it('returns coverage count for a zoned cell within reach', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 0 },
    ])
    const services = servicesWith([
      { kind: 'police-station', row: 0, col: 0 },
      { kind: 'fire-station', row: 0, col: 0 },
    ])
    expect(cellCoverageCountFor(0, 0, zones, services)).toBe(2)
  })

  it('returns 0 for a zoned cell out of reach of all services', () => {
    const zones = zonesWith([
      { row: 100, col: 100, kind: 'residential', density: 0 },
    ])
    const services = servicesWith([
      { kind: 'police-station', row: 0, col: 0 },
    ])
    expect(cellCoverageCountFor(100, 100, zones, services)).toBe(0)
  })
})

describe('SERVICE_COVERAGE_CELLS reference values used by the solver', () => {
  it('uses the spec radii (police/fire/garbage 6, hospital 8, school 5)', () => {
    expect(SERVICE_COVERAGE_CELLS['police-station']).toBe(6)
    expect(SERVICE_COVERAGE_CELLS['fire-station']).toBe(6)
    expect(SERVICE_COVERAGE_CELLS.hospital).toBe(8)
    expect(SERVICE_COVERAGE_CELLS.school).toBe(5)
    expect(SERVICE_COVERAGE_CELLS['garbage-depot']).toBe(6)
  })
})
