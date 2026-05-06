import { describe, it, expect } from 'vitest'
import {
  WATER_DEMAND_PER_CELL,
  cellWaterStatusFor,
  computeWaterComponents,
  solveWaterStatus,
} from '@/lib/sim/waterSolver'
import {
  EMPTY_WATER_BUCKET,
  EMPTY_ZONES_BUCKET,
  WATER_SOURCE_CAPACITY,
  waterPipeKey,
  zoneCellKey,
  type WaterBucket,
  type WaterPipeKind,
  type ZonesBucket,
} from '@/lib/sim/state'

function waterWith(
  sources: Array<{
    kind: 'water-tower' | 'pump-station'
    row: number
    col: number
  }>,
  pipes: Array<{ kind: WaterPipeKind; row: number; col: number }>,
): WaterBucket {
  const pipeMap: Record<string, WaterPipeKind> = {}
  for (const pipe of pipes) {
    pipeMap[waterPipeKey(pipe.row, pipe.col)] = pipe.kind
  }
  return { sources, pipes: pipeMap, treatmentPlants: [], wasteAccumulation: {} }
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

describe('WATER_DEMAND_PER_CELL', () => {
  it('is 1 unit per cell in v1', () => {
    expect(WATER_DEMAND_PER_CELL).toBe(1)
  })
})

describe('computeWaterComponents', () => {
  it('returns no components on empty bucket', () => {
    expect(computeWaterComponents(EMPTY_WATER_BUCKET)).toEqual([])
  })

  it('treats a lone water tower as one component with its capacity', () => {
    const water = waterWith([{ kind: 'water-tower', row: 0, col: 0 }], [])
    const components = computeWaterComponents(water)
    expect(components).toHaveLength(1)
    expect(components[0].capacity).toBe(WATER_SOURCE_CAPACITY['water-tower'])
  })

  it('treats a lone water pipe as one component with zero capacity', () => {
    const water = waterWith([], [{ kind: 'water', row: 5, col: 5 }])
    const components = computeWaterComponents(water)
    expect(components).toHaveLength(1)
    expect(components[0].capacity).toBe(0)
  })

  it('joins a source and an adjacent water pipe into one component', () => {
    const water = waterWith(
      [{ kind: 'pump-station', row: 0, col: 0 }],
      [{ kind: 'water', row: 0, col: 1 }],
    )
    const components = computeWaterComponents(water)
    expect(components).toHaveLength(1)
    expect(components[0].capacity).toBe(WATER_SOURCE_CAPACITY['pump-station'])
    expect(components[0].transmission.size).toBe(2)
  })

  it('does NOT include sewage pipes in the supply transmission graph', () => {
    const water = waterWith(
      [{ kind: 'water-tower', row: 0, col: 0 }],
      [
        { kind: 'sewage', row: 0, col: 1 },
        { kind: 'water', row: 0, col: 2 },
      ],
    )
    const components = computeWaterComponents(water)
    // Component 1: water-tower at (0,0) alone (sewage at (0,1) blocks).
    // Component 2: water pipe at (0,2) alone.
    expect(components).toHaveLength(2)
    // The water-tower component should NOT include the sewage cell.
    const towerComp = components.find((c) => c.transmission.has('0,0'))
    expect(towerComp?.transmission.has('0,1')).toBe(false)
  })

  it('walks a water pipe chain through multiple cells', () => {
    const water = waterWith(
      [{ kind: 'water-tower', row: 0, col: 0 }],
      [
        { kind: 'water', row: 0, col: 1 },
        { kind: 'water', row: 0, col: 2 },
        { kind: 'water', row: 0, col: 3 },
      ],
    )
    const components = computeWaterComponents(water)
    expect(components).toHaveLength(1)
    expect(components[0].transmission.size).toBe(4)
  })

  it('does not connect through diagonal adjacency', () => {
    const water = waterWith(
      [{ kind: 'water-tower', row: 0, col: 0 }],
      [{ kind: 'water', row: 1, col: 1 }],
    )
    const components = computeWaterComponents(water)
    expect(components).toHaveLength(2)
  })

  it('two replays of the same bucket produce identical components', () => {
    const water = waterWith(
      [{ kind: 'water-tower', row: 0, col: 0 }],
      [
        { kind: 'water', row: 0, col: 1 },
        { kind: 'water', row: 0, col: 2 },
        { kind: 'sewage', row: 5, col: 5 },
      ],
    )
    const a = computeWaterComponents(water)
    const b = computeWaterComponents(water)
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].capacity).toBe(b[i].capacity)
    }
  })
})

describe('solveWaterStatus', () => {
  it('returns empty record on empty zones', () => {
    expect(solveWaterStatus(EMPTY_ZONES_BUCKET, EMPTY_WATER_BUCKET)).toEqual({})
  })

  it('marks every zone unserved when no water exists', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 0 },
    ])
    const result = solveWaterStatus(zones, EMPTY_WATER_BUCKET)
    expect(result['0,0']).toBe('unserved')
  })

  it('serves a zone cell adjacent to a water source', () => {
    const water = waterWith([{ kind: 'water-tower', row: 0, col: 0 }], [])
    const zones = zonesWith([
      { row: 0, col: 1, kind: 'residential', density: 0 },
    ])
    const result = solveWaterStatus(zones, water)
    expect(result['0,1']).toBe('served')
  })

  it('serves a zone cell adjacent to a water pipe connected to a source', () => {
    const water = waterWith(
      [{ kind: 'pump-station', row: 0, col: 0 }],
      [
        { kind: 'water', row: 0, col: 1 },
        { kind: 'water', row: 0, col: 2 },
      ],
    )
    const zones = zonesWith([
      { row: 0, col: 3, kind: 'residential', density: 0 },
    ])
    const result = solveWaterStatus(zones, water)
    expect(result['0,3']).toBe('served')
  })

  it('marks a zone cell adjacent to a sewage pipe as unserved (sewage is not supply)', () => {
    const water = waterWith(
      [{ kind: 'water-tower', row: 0, col: 0 }],
      [{ kind: 'sewage', row: 0, col: 1 }],
    )
    const zones = zonesWith([
      { row: 0, col: 2, kind: 'residential', density: 0 },
    ])
    const result = solveWaterStatus(zones, water)
    expect(result['0,2']).toBe('unserved')
  })

  it('caps at capacity then browns out the excess (water-tower 50 cap)', () => {
    const pipes: Array<{ kind: 'water'; row: number; col: number }> = []
    for (let i = 1; i <= 55; i++) {
      pipes.push({ kind: 'water', row: 0, col: i })
    }
    const water = waterWith(
      [{ kind: 'water-tower', row: 0, col: 0 }],
      pipes,
    )
    const cells: Parameters<typeof zonesWith>[0] = []
    for (let i = 1; i <= 55; i++) {
      cells.push({ row: -1, col: i, kind: 'residential', density: 0 })
    }
    const zones = zonesWith(cells)
    const result = solveWaterStatus(zones, water)
    let served = 0
    let brownout = 0
    for (const status of Object.values(result)) {
      if (status === 'served') served++
      if (status === 'brownout') brownout++
    }
    expect(served).toBe(50)
    expect(brownout).toBe(5)
  })

  it('two replays of the same input produce identical results', () => {
    const water = waterWith(
      [{ kind: 'water-tower', row: 0, col: 0 }],
      [{ kind: 'water', row: 0, col: 1 }],
    )
    const zones = zonesWith([
      { row: 0, col: 2, kind: 'residential', density: 0 },
    ])
    const a = solveWaterStatus(zones, water)
    const b = solveWaterStatus(zones, water)
    expect(a).toEqual(b)
  })
})

describe('cellWaterStatusFor', () => {
  it('returns unserved for an unzoned cell', () => {
    const water = waterWith([{ kind: 'water-tower', row: 0, col: 0 }], [])
    expect(cellWaterStatusFor(99, 99, EMPTY_ZONES_BUCKET, water)).toBe(
      'unserved',
    )
  })

  it('mirrors solveWaterStatus for a zoned cell', () => {
    const water = waterWith([{ kind: 'water-tower', row: 0, col: 0 }], [])
    const zones = zonesWith([
      { row: 0, col: 1, kind: 'residential', density: 0 },
    ])
    expect(cellWaterStatusFor(0, 1, zones, water)).toBe('served')
  })
})
