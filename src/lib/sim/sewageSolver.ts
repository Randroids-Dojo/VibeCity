import {
  SEWAGE_TREATMENT_CAPACITY,
  waterPipeKey,
  zoneCellKey,
  type SewageTreatmentPlant,
  type WaterBucket,
  type ZonesBucket,
} from './state'

/**
 * Sewage connectivity solver (REQ-092 sewage slice 3).
 *
 * Mirrors `waterSolver.ts` shape: BFS over the union of treatment
 * plant anchors and sewage-pipe cells, 4-direction orthogonal
 * adjacency, per-component capacity sum (sum of plant capacities,
 * each `SEWAGE_TREATMENT_CAPACITY` waste-units / tick), per-zone-cell
 * drained / overloaded / unmanaged classification.
 *
 * Water (fresh-supply) pipes are NOT part of the sewage-drain graph.
 * Sources + water pipes scope to the REQ-093 fresh-water solver; this
 * solver scopes to drain-side connectivity only.
 *
 * Per-cell waste demand is uniform 1 unit per zoned cell in v1 so a
 * 100-unit treatment plant drains up to 100 cells. Demand-key
 * iteration order is alphabetical so two clients replaying the same
 * state derive identical overload assignment when waste exceeds
 * treatment capacity.
 */

export const SEWAGE_DEMAND_PER_CELL = 1

export type CellSewageStatus = 'drained' | 'overloaded' | 'unmanaged'

export interface SewageComponent {
  /** Cell keys (plants + sewage pipes) reachable from one seed via BFS. */
  transmission: Set<string>
  /** Treatment plants in this component. */
  plants: SewageTreatmentPlant[]
  /** Sum of plant capacities. */
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
 * Build the connected components of the sewage grid. Water pipes are
 * excluded; only treatment plants + sewage pipes form the drain graph.
 */
export function computeSewageComponents(
  water: WaterBucket,
): SewageComponent[] {
  const plantsByKey = new Map<string, SewageTreatmentPlant>()
  for (const plant of water.treatmentPlants) {
    plantsByKey.set(waterPipeKey(plant.row, plant.col), plant)
  }

  const transmissionKeys = new Set<string>()
  for (const key of plantsByKey.keys()) transmissionKeys.add(key)
  for (const [key, kind] of Object.entries(water.pipes)) {
    if (kind === 'sewage') transmissionKeys.add(key)
  }

  const visited = new Set<string>()
  const components: SewageComponent[] = []

  const sortedKeys = [...transmissionKeys].sort()
  for (const seed of sortedKeys) {
    if (visited.has(seed)) continue
    const componentTransmission = new Set<string>()
    const componentPlants: SewageTreatmentPlant[] = []
    let capacity = 0
    const queue: string[] = [seed]
    while (queue.length > 0) {
      const key = queue.shift()
      if (key === undefined) break
      if (visited.has(key)) continue
      visited.add(key)
      componentTransmission.add(key)
      const plant = plantsByKey.get(key)
      if (plant) {
        componentPlants.push(plant)
        capacity += SEWAGE_TREATMENT_CAPACITY
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
      plants: componentPlants,
      capacity,
    })
  }
  return components
}

function adjacentComponentIndex(
  zoneRow: number,
  zoneCol: number,
  components: SewageComponent[],
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
 * Solve sewage status for every zoned cell.
 *
 * 'drained': adjacent to a component that has a treatment plant AND
 *   within its capacity budget.
 * 'overloaded': adjacent to such a component but the component's
 *   plant capacity is exhausted.
 * 'unmanaged': not adjacent to any sewage component, OR adjacent to
 *   a sewage-pipe component with no treatment plant.
 */
export function solveSewageStatus(
  zones: ZonesBucket,
  water: WaterBucket,
): Record<string, CellSewageStatus> {
  const result: Record<string, CellSewageStatus> = {}
  const cellKeys = Object.keys(zones.cells).sort()
  if (cellKeys.length === 0) return result
  const components = computeSewageComponents(water)
  const remaining: number[] = components.map((c) => c.capacity)
  for (const key of cellKeys) {
    const cell = parseCellKey(key)
    if (cell === null) {
      result[key] = 'unmanaged'
      continue
    }
    const componentIndex = adjacentComponentIndex(
      cell.row,
      cell.col,
      components,
    )
    if (componentIndex === -1) {
      result[key] = 'unmanaged'
      continue
    }
    if (components[componentIndex].plants.length === 0) {
      result[key] = 'unmanaged'
      continue
    }
    if (remaining[componentIndex] >= SEWAGE_DEMAND_PER_CELL) {
      remaining[componentIndex] -= SEWAGE_DEMAND_PER_CELL
      result[key] = 'drained'
    } else {
      result[key] = 'overloaded'
    }
  }
  return result
}

/**
 * Convenience for the SnapGrid render path: read the status for a
 * single cell. Returns 'unmanaged' when the cell is not zoned.
 */
export function cellSewageStatusFor(
  row: number,
  col: number,
  zones: ZonesBucket,
  water: WaterBucket,
): CellSewageStatus {
  const key = zoneCellKey(row, col)
  if (zones.cells[key] === undefined) return 'unmanaged'
  const all = solveSewageStatus(zones, water)
  return all[key] ?? 'unmanaged'
}
