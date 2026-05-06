import { describe, it, expect } from 'vitest'
import {
  SEWAGE_DEMAND_PER_CELL,
  cellSewageStatusFor,
  computeSewageComponents,
  solveSewageStatus,
} from '@/lib/sim/sewageSolver'
import {
  EMPTY_WATER_BUCKET,
  EMPTY_ZONES_BUCKET,
  SEWAGE_TREATMENT_CAPACITY,
  waterPipeKey,
  zoneCellKey,
  type SewageTreatmentPlant,
  type WaterBucket,
  type WaterPipeKind,
  type ZonesBucket,
} from '@/lib/sim/state'

function sewageWith(
  plants: Array<{ row: number; col: number }>,
  pipes: Array<{ kind: WaterPipeKind; row: number; col: number }>,
): WaterBucket {
  const pipeMap: Record<string, WaterPipeKind> = {}
  for (const pipe of pipes) {
    pipeMap[waterPipeKey(pipe.row, pipe.col)] = pipe.kind
  }
  const treatmentPlants: SewageTreatmentPlant[] = plants.map((p) => ({
    row: p.row,
    col: p.col,
  }))
  return { sources: [], pipes: pipeMap, treatmentPlants }
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
    map[zoneCellKey(cell.row, cell.col)] = {
      kind: cell.kind,
      density: cell.density,
    }
  }
  return { cells: map }
}

describe('SEWAGE_DEMAND_PER_CELL', () => {
  it('is 1 waste unit per cell in v1', () => {
    expect(SEWAGE_DEMAND_PER_CELL).toBe(1)
  })
})

describe('computeSewageComponents', () => {
  it('returns no components on empty bucket', () => {
    expect(computeSewageComponents(EMPTY_WATER_BUCKET)).toEqual([])
  })

  it('treats a lone treatment plant as one component with its capacity', () => {
    const water = sewageWith([{ row: 0, col: 0 }], [])
    const components = computeSewageComponents(water)
    expect(components).toHaveLength(1)
    expect(components[0].plants).toHaveLength(1)
    expect(components[0].capacity).toBe(SEWAGE_TREATMENT_CAPACITY)
  })

  it('treats a lone sewage pipe as one component with zero capacity', () => {
    const water = sewageWith([], [{ kind: 'sewage', row: 0, col: 0 }])
    const components = computeSewageComponents(water)
    expect(components).toHaveLength(1)
    expect(components[0].plants).toHaveLength(0)
    expect(components[0].capacity).toBe(0)
  })

  it('joins a treatment plant and an adjacent sewage pipe into one component', () => {
    const water = sewageWith(
      [{ row: 0, col: 0 }],
      [{ kind: 'sewage', row: 0, col: 1 }],
    )
    const components = computeSewageComponents(water)
    expect(components).toHaveLength(1)
    expect(components[0].plants).toHaveLength(1)
    expect(components[0].transmission.has('0,0')).toBe(true)
    expect(components[0].transmission.has('0,1')).toBe(true)
  })

  it('does NOT include water pipes in the drain transmission graph', () => {
    const water = sewageWith(
      [{ row: 0, col: 0 }],
      [
        { kind: 'water', row: 0, col: 1 },
        { kind: 'sewage', row: 0, col: 2 },
      ],
    )
    const components = computeSewageComponents(water)
    expect(components).toHaveLength(2)
    const planted = components.find((c) => c.plants.length === 1)
    expect(planted).toBeDefined()
    expect(planted!.transmission.has('0,1')).toBe(false)
    expect(planted!.transmission.has('0,2')).toBe(false)
  })

  it('walks a sewage pipe chain through multiple cells', () => {
    const water = sewageWith(
      [{ row: 0, col: 0 }],
      [
        { kind: 'sewage', row: 0, col: 1 },
        { kind: 'sewage', row: 0, col: 2 },
        { kind: 'sewage', row: 0, col: 3 },
      ],
    )
    const components = computeSewageComponents(water)
    expect(components).toHaveLength(1)
    expect(components[0].transmission.size).toBe(4)
  })

  it('does not connect through diagonal adjacency', () => {
    const water = sewageWith(
      [{ row: 0, col: 0 }],
      [{ kind: 'sewage', row: 1, col: 1 }],
    )
    const components = computeSewageComponents(water)
    expect(components).toHaveLength(2)
  })

  it('two replays of the same bucket produce identical components', () => {
    const water = sewageWith(
      [{ row: 0, col: 0 }],
      [{ kind: 'sewage', row: 0, col: 1 }],
    )
    const a = computeSewageComponents(water)
    const b = computeSewageComponents(water)
    expect(a).toEqual(b)
  })
})

describe('solveSewageStatus', () => {
  it('returns empty record on empty zones', () => {
    expect(solveSewageStatus(EMPTY_ZONES_BUCKET, EMPTY_WATER_BUCKET)).toEqual(
      {},
    )
  })

  it('marks every zone unmanaged when no sewage exists', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 1 },
    ])
    const result = solveSewageStatus(zones, EMPTY_WATER_BUCKET)
    expect(result['0,0']).toBe('unmanaged')
  })

  it('drains a zone cell adjacent to a treatment plant', () => {
    const zones = zonesWith([
      { row: 0, col: 1, kind: 'residential', density: 1 },
    ])
    const water = sewageWith([{ row: 0, col: 0 }], [])
    const result = solveSewageStatus(zones, water)
    expect(result['0,1']).toBe('drained')
  })

  it('drains a zone cell adjacent to a sewage pipe connected to a plant', () => {
    const zones = zonesWith([
      { row: 0, col: 2, kind: 'residential', density: 1 },
    ])
    const water = sewageWith(
      [{ row: 0, col: 0 }],
      [{ kind: 'sewage', row: 0, col: 1 }],
    )
    const result = solveSewageStatus(zones, water)
    expect(result['0,2']).toBe('drained')
  })

  it('marks a zone cell adjacent to a water pipe as unmanaged (water is not drain)', () => {
    const zones = zonesWith([
      { row: 0, col: 1, kind: 'residential', density: 1 },
    ])
    const water = sewageWith([], [{ kind: 'water', row: 0, col: 0 }])
    const result = solveSewageStatus(zones, water)
    expect(result['0,1']).toBe('unmanaged')
  })

  it('marks a zone adjacent to plantless sewage pipes as unmanaged', () => {
    const zones = zonesWith([
      { row: 0, col: 1, kind: 'residential', density: 1 },
    ])
    const water = sewageWith([], [{ kind: 'sewage', row: 0, col: 0 }])
    const result = solveSewageStatus(zones, water)
    expect(result['0,1']).toBe('unmanaged')
  })

  it('caps at capacity then overloads the excess (one plant 100 cap)', () => {
    // 100 cells of residential along a sewage pipe row, all 4-adjacent to the pipe.
    // SEWAGE_TREATMENT_CAPACITY = 100; the 101st cell overloads.
    const cells = Array.from({ length: 101 }, (_, col) => ({
      row: 1,
      col,
      kind: 'residential' as const,
      density: 1 as const,
    }))
    const zones = zonesWith(cells)
    const pipes = Array.from({ length: 101 }, (_, col) => ({
      kind: 'sewage' as const,
      row: 0,
      col,
    }))
    const water = sewageWith([{ row: 0, col: 0 }], pipes)
    const result = solveSewageStatus(zones, water)
    const drained = Object.values(result).filter((s) => s === 'drained').length
    const overloaded = Object.values(result).filter(
      (s) => s === 'overloaded',
    ).length
    expect(drained).toBe(100)
    expect(overloaded).toBe(1)
  })

  it('two replays of the same input produce identical results', () => {
    const zones = zonesWith([
      { row: 0, col: 1, kind: 'residential', density: 1 },
      { row: 0, col: 3, kind: 'commercial', density: 2 },
    ])
    const water = sewageWith(
      [{ row: 0, col: 0 }],
      [
        { kind: 'sewage', row: 0, col: 2 },
        { kind: 'sewage', row: 0, col: 4 },
      ],
    )
    const a = solveSewageStatus(zones, water)
    const b = solveSewageStatus(zones, water)
    expect(a).toEqual(b)
  })
})

describe('cellSewageStatusFor', () => {
  it('returns unmanaged for an unzoned cell', () => {
    expect(
      cellSewageStatusFor(0, 0, EMPTY_ZONES_BUCKET, EMPTY_WATER_BUCKET),
    ).toBe('unmanaged')
  })

  it('mirrors solveSewageStatus for a zoned cell', () => {
    const zones = zonesWith([
      { row: 0, col: 1, kind: 'residential', density: 1 },
    ])
    const water = sewageWith([{ row: 0, col: 0 }], [])
    expect(cellSewageStatusFor(0, 1, zones, water)).toBe('drained')
  })
})
