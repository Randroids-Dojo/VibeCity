import { describe, it, expect } from 'vitest'
import {
  POWER_DEMAND_PER_CELL_MW,
  cellPowerStatusFor,
  computePowerComponents,
  solvePowerStatus,
  type CellPowerStatus,
} from '@/lib/sim/powerSolver'
import {
  EMPTY_POWER_BUCKET,
  EMPTY_ZONES_BUCKET,
  POWER_PLANT_CAPACITY_MW,
  powerLineKey,
  zoneCellKey,
  type PowerBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

function powerWith(
  plants: Array<{ kind: 'coal' | 'solar'; row: number; col: number }>,
  lineKeys: string[],
): PowerBucket {
  const lines: Record<string, true> = {}
  for (const key of lineKeys) lines[key] = true
  return { plants, lines }
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

describe('POWER_DEMAND_PER_CELL_MW', () => {
  it('is 1 MW per cell in v1', () => {
    expect(POWER_DEMAND_PER_CELL_MW).toBe(1)
  })
})

describe('computePowerComponents', () => {
  it('returns no components on the empty bucket', () => {
    expect(computePowerComponents(EMPTY_POWER_BUCKET)).toEqual([])
  })

  it('treats a lone plant as one component with its capacity', () => {
    const power = powerWith([{ kind: 'coal', row: 0, col: 0 }], [])
    const components = computePowerComponents(power)
    expect(components).toHaveLength(1)
    expect(components[0].capacityMW).toBe(POWER_PLANT_CAPACITY_MW.coal)
    expect(components[0].plants).toHaveLength(1)
    expect(components[0].transmission.has('0,0')).toBe(true)
  })

  it('treats a lone line cell as one component with zero capacity', () => {
    const power = powerWith([], [powerLineKey(5, 5)])
    const components = computePowerComponents(power)
    expect(components).toHaveLength(1)
    expect(components[0].capacityMW).toBe(0)
    expect(components[0].plants).toHaveLength(0)
    expect(components[0].transmission.has('5,5')).toBe(true)
  })

  it('joins a plant and an adjacent line into one component', () => {
    const power = powerWith(
      [{ kind: 'solar', row: 0, col: 0 }],
      [powerLineKey(0, 1)],
    )
    const components = computePowerComponents(power)
    expect(components).toHaveLength(1)
    expect(components[0].capacityMW).toBe(POWER_PLANT_CAPACITY_MW.solar)
    expect(components[0].transmission.size).toBe(2)
  })

  it('keeps disjoint plant and line as separate components', () => {
    const power = powerWith(
      [{ kind: 'coal', row: 0, col: 0 }],
      [powerLineKey(5, 5)],
    )
    const components = computePowerComponents(power)
    expect(components).toHaveLength(2)
    // Component ordering is alphabetical on the cell key.
    const sortedKeys = components.map(
      (c) => [...c.transmission].sort()[0],
    )
    expect(sortedKeys).toEqual(['0,0', '5,5'])
  })

  it('walks a line chain through multiple cells', () => {
    const power = powerWith(
      [{ kind: 'coal', row: 0, col: 0 }],
      ['0,1', '0,2', '0,3', '0,4'].map((k) => k),
    )
    const components = computePowerComponents(power)
    expect(components).toHaveLength(1)
    expect(components[0].transmission.size).toBe(5)
  })

  it('joins two plants via a line bridge', () => {
    const power = powerWith(
      [
        { kind: 'coal', row: 0, col: 0 },
        { kind: 'solar', row: 0, col: 4 },
      ],
      ['0,1', '0,2', '0,3'],
    )
    const components = computePowerComponents(power)
    expect(components).toHaveLength(1)
    expect(components[0].capacityMW).toBe(
      POWER_PLANT_CAPACITY_MW.coal + POWER_PLANT_CAPACITY_MW.solar,
    )
    expect(components[0].plants).toHaveLength(2)
  })

  it('does not connect through diagonal adjacency (4-direction only)', () => {
    const power = powerWith(
      [{ kind: 'coal', row: 0, col: 0 }],
      [powerLineKey(1, 1)],
    )
    const components = computePowerComponents(power)
    expect(components).toHaveLength(2)
  })

  it('two replays of the same bucket produce identical components', () => {
    const power = powerWith(
      [
        { kind: 'coal', row: 0, col: 0 },
        { kind: 'solar', row: 5, col: 5 },
      ],
      ['0,1', '0,2', '5,4'],
    )
    const a = computePowerComponents(power)
    const b = computePowerComponents(power)
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].capacityMW).toBe(b[i].capacityMW)
      expect([...a[i].transmission].sort()).toEqual(
        [...b[i].transmission].sort(),
      )
    }
  })
})

describe('solvePowerStatus', () => {
  it('returns an empty record on an empty zones bucket', () => {
    expect(solvePowerStatus(EMPTY_ZONES_BUCKET, EMPTY_POWER_BUCKET)).toEqual({})
  })

  it('marks every zone unpowered when no power exists', () => {
    const zones = zonesWith([
      { row: 0, col: 0, kind: 'residential', density: 0 },
      { row: 1, col: 1, kind: 'commercial', density: 1 },
    ])
    const result = solvePowerStatus(zones, EMPTY_POWER_BUCKET)
    expect(result['0,0']).toBe('unpowered')
    expect(result['1,1']).toBe('unpowered')
  })

  it('powers a zone cell adjacent to a plant', () => {
    const power = powerWith([{ kind: 'coal', row: 0, col: 0 }], [])
    const zones = zonesWith([
      { row: 0, col: 1, kind: 'residential', density: 0 },
    ])
    const result = solvePowerStatus(zones, power)
    expect(result['0,1']).toBe('powered')
  })

  it('powers a zone cell adjacent to a line that is connected to a plant', () => {
    const power = powerWith(
      [{ kind: 'coal', row: 0, col: 0 }],
      ['0,1', '0,2'],
    )
    const zones = zonesWith([
      { row: 0, col: 3, kind: 'residential', density: 0 },
      { row: 1, col: 2, kind: 'commercial', density: 0 },
    ])
    const result = solvePowerStatus(zones, power)
    expect(result['0,3']).toBe('powered')
    expect(result['1,2']).toBe('powered')
  })

  it('marks a zone cell adjacent only to a line without a plant as unpowered (zero capacity)', () => {
    const power = powerWith([], ['0,0', '0,1'])
    const zones = zonesWith([
      { row: 0, col: 2, kind: 'residential', density: 0 },
    ])
    const result = solvePowerStatus(zones, power)
    // Adjacent to a line cell, but the component has zero capacity.
    expect(result['0,2']).toBe('brownout')
  })

  it('marks a far-away zone unpowered (not 4-adjacent to any component)', () => {
    const power = powerWith([{ kind: 'coal', row: 0, col: 0 }], [])
    const zones = zonesWith([
      { row: 5, col: 5, kind: 'residential', density: 0 },
    ])
    const result = solvePowerStatus(zones, power)
    expect(result['5,5']).toBe('unpowered')
  })

  it('does NOT power a diagonally-adjacent zone (4-direction adjacency only)', () => {
    const power = powerWith([{ kind: 'coal', row: 0, col: 0 }], [])
    const zones = zonesWith([
      { row: 1, col: 1, kind: 'residential', density: 0 },
    ])
    const result = solvePowerStatus(zones, power)
    expect(result['1,1']).toBe('unpowered')
  })

  it('powers up to capacity then browns out the excess', () => {
    // Solar plant: 30 MW capacity -> can power 30 cells.
    const lineKeys: string[] = []
    for (let i = 1; i <= 35; i++) lineKeys.push(`0,${i}`)
    const power = powerWith([{ kind: 'solar', row: 0, col: 0 }], lineKeys)
    // Place 35 zones adjacent to the line chain (one per line cell, on
    // the row above).
    const cells: Parameters<typeof zonesWith>[0] = []
    for (let i = 1; i <= 35; i++) {
      cells.push({ row: -1, col: i, kind: 'residential', density: 0 })
    }
    const zones = zonesWith(cells)
    const result = solvePowerStatus(zones, power)
    let powered = 0
    let brownout = 0
    for (const status of Object.values(result)) {
      if (status === 'powered') powered++
      if (status === 'brownout') brownout++
    }
    expect(powered).toBe(30)
    expect(brownout).toBe(5)
  })

  it('two replays of the same input produce identical brownout assignment', () => {
    const lineKeys: string[] = []
    for (let i = 1; i <= 35; i++) lineKeys.push(`0,${i}`)
    const power = powerWith([{ kind: 'solar', row: 0, col: 0 }], lineKeys)
    const cells: Parameters<typeof zonesWith>[0] = []
    for (let i = 1; i <= 35; i++) {
      cells.push({ row: -1, col: i, kind: 'residential', density: 0 })
    }
    const zones = zonesWith(cells)
    const a = solvePowerStatus(zones, power)
    const b = solvePowerStatus(zones, power)
    expect(a).toEqual(b)
  })
})

describe('cellPowerStatusFor', () => {
  it('returns unpowered for a cell that is not zoned', () => {
    const power = powerWith([{ kind: 'coal', row: 0, col: 0 }], [])
    const status: CellPowerStatus = cellPowerStatusFor(
      99,
      99,
      EMPTY_ZONES_BUCKET,
      power,
    )
    expect(status).toBe('unpowered')
  })

  it('mirrors solvePowerStatus for a zoned cell', () => {
    const power = powerWith(
      [{ kind: 'coal', row: 0, col: 0 }],
      ['0,1', '0,2'],
    )
    const zones = zonesWith([
      { row: 0, col: 3, kind: 'residential', density: 0 },
    ])
    const status = cellPowerStatusFor(0, 3, zones, power)
    expect(status).toBe('powered')
  })

  it('returns unpowered when the cell is zoned but unreachable', () => {
    const zones = zonesWith([
      { row: 5, col: 5, kind: 'residential', density: 0 },
    ])
    const status = cellPowerStatusFor(5, 5, zones, EMPTY_POWER_BUCKET)
    expect(status).toBe('unpowered')
  })
})
