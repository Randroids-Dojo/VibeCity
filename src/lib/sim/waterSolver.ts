import {
  WATER_SOURCE_CAPACITY,
  waterPipeKey,
  zoneCellKey,
  type WaterBucket,
  type WaterSource,
  type ZonesBucket,
} from './state'

/**
 * Water connectivity solver (REQ-093 slice 1).
 *
 * Mirrors `powerSolver.ts` shape: BFS over the union of source
 * anchors and water-pipe cells, 4-direction orthogonal adjacency,
 * per-component capacity sum (sum of `WATER_SOURCE_CAPACITY[kind]`),
 * per-zone-cell served / unserved classification.
 *
 * Sewage pipes are NOT part of the water-supply transmission graph.
 * The sewage layer (REQ-092 follow-on) uses its own connectivity
 * walk over sewage pipes that ends at sewage-treatment plants; this
 * solver scopes to fresh-water supply only.
 *
 * Per-cell demand is uniform 1 unit per zoned cell in v1 so a 50-unit
 * water-tower serves up to 50 cells; a 200-unit pump-station up to 200.
 * Demand-key iteration order is alphabetical so two clients replaying
 * the same state derive identical brownout assignment when demand
 * exceeds capacity.
 */

export const WATER_DEMAND_PER_CELL = 1

export type CellWaterStatus = 'served' | 'brownout' | 'unserved'

export interface WaterComponent {
  /** Cell keys (sources + water pipes) reachable from one seed via BFS. */
  transmission: Set<string>
  /** Sources in this component. */
  sources: WaterSource[]
  /** Sum of source capacities. */
  capacity: number
}

const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

function parseCellKey(key: string): { row: number; col: number } | null {
  const [rowStr, colStr] = key.split(',')
  const row = Number(rowStr)
  const col = Number(colStr)
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null
  return { row, col }
}

/**
 * Build the connected components of the water grid. Sewage pipes
 * are excluded; only sources + water pipes form the supply graph.
 */
export function computeWaterComponents(water: WaterBucket): WaterComponent[] {
  const sourcesByKey = new Map<string, WaterSource>()
  for (const source of water.sources) {
    sourcesByKey.set(waterPipeKey(source.row, source.col), source)
  }

  const transmissionKeys = new Set<string>()
  for (const key of sourcesByKey.keys()) transmissionKeys.add(key)
  for (const [key, kind] of Object.entries(water.pipes)) {
    if (kind === 'water') transmissionKeys.add(key)
  }

  const visited = new Set<string>()
  const components: WaterComponent[] = []

  const sortedKeys = [...transmissionKeys].sort()
  for (const seed of sortedKeys) {
    if (visited.has(seed)) continue
    const componentTransmission = new Set<string>()
    const componentSources: WaterSource[] = []
    let capacity = 0
    const queue: string[] = [seed]
    while (queue.length > 0) {
      const key = queue.shift()
      if (key === undefined) break
      if (visited.has(key)) continue
      visited.add(key)
      componentTransmission.add(key)
      const source = sourcesByKey.get(key)
      if (source) {
        componentSources.push(source)
        capacity += WATER_SOURCE_CAPACITY[source.kind]
      }
      const cell = parseCellKey(key)
      if (cell === null) continue
      for (const [dr, dc] of NEIGHBORS) {
        const neighborKey = waterPipeKey(cell.row + dr, cell.col + dc)
        if (transmissionKeys.has(neighborKey) && !visited.has(neighborKey)) {
          queue.push(neighborKey)
        }
      }
    }
    components.push({
      transmission: componentTransmission,
      sources: componentSources,
      capacity,
    })
  }
  return components
}

function adjacentComponentIndex(
  zoneRow: number,
  zoneCol: number,
  components: WaterComponent[],
): number {
  for (const [dr, dc] of NEIGHBORS) {
    const key = waterPipeKey(zoneRow + dr, zoneCol + dc)
    for (let i = 0; i < components.length; i++) {
      if (components[i].transmission.has(key)) return i
    }
  }
  return -1
}

/**
 * Solve water status for every zoned cell.
 *
 * 'served': adjacent to a component AND within its capacity budget.
 * 'brownout': adjacent to a component but the component is over capacity.
 * 'unserved': not adjacent to any water component.
 */
export function solveWaterStatus(
  zones: ZonesBucket,
  water: WaterBucket,
): Record<string, CellWaterStatus> {
  const result: Record<string, CellWaterStatus> = {}
  const cellKeys = Object.keys(zones.cells).sort()
  if (cellKeys.length === 0) return result
  const components = computeWaterComponents(water)
  const remaining: number[] = components.map((c) => c.capacity)
  for (const key of cellKeys) {
    const cell = parseCellKey(key)
    if (cell === null) {
      result[key] = 'unserved'
      continue
    }
    const componentIndex = adjacentComponentIndex(
      cell.row,
      cell.col,
      components,
    )
    if (componentIndex === -1) {
      result[key] = 'unserved'
      continue
    }
    if (remaining[componentIndex] >= WATER_DEMAND_PER_CELL) {
      remaining[componentIndex] -= WATER_DEMAND_PER_CELL
      result[key] = 'served'
    } else {
      result[key] = 'brownout'
    }
  }
  return result
}

/**
 * Convenience for the SnapGrid render path: read the status for a
 * single cell. Returns 'unserved' when the cell is not zoned.
 */
export function cellWaterStatusFor(
  row: number,
  col: number,
  zones: ZonesBucket,
  water: WaterBucket,
): CellWaterStatus {
  const key = zoneCellKey(row, col)
  if (zones.cells[key] === undefined) return 'unserved'
  const all = solveWaterStatus(zones, water)
  return all[key] ?? 'unserved'
}
