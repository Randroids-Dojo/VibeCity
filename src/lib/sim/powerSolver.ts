import {
  POWER_PLANT_CAPACITY_MW,
  powerLineKey,
  zoneCellKey,
  type PowerBucket,
  type PowerPlant,
  type ZonesBucket,
} from './state'

/**
 * Power connectivity solver (REQ-087 slice 3 of N).
 *
 * Computes which zone cells receive power, given the current
 * `PowerBucket` (plants + lines) and `ZonesBucket` (demand). Pure
 * function: same input always produces the same output. Two clients
 * replaying the same event log derive identical power status without
 * any persistent storage on the bucket.
 *
 * Algorithm:
 *
 *   1. Build connected components by BFS over (plants ∪ line cells).
 *      Adjacency is 4-direction orthogonal. Plants are treated as
 *      single-cell anchors per the slice 1 contract; the 2x2
 *      footprint resolution lands when the UI slice validates plant
 *      placement against neighbors. A plant cell adjacent to a line
 *      cell is in the same component as the line.
 *   2. For each component, sum plant capacity in MW.
 *   3. Iterate every zoned cell. A zone cell DEMANDS power from a
 *      component if it is 4-adjacent to any cell in that component
 *      (a plant cell OR a line cell). The cell consumes
 *      `POWER_DEMAND_PER_CELL_MW` from the component's capacity
 *      budget. Demand-key iteration order is alphabetical on the
 *      cell key so ordering is deterministic across clients.
 *   4. If total demand on a component does not exceed its capacity,
 *      every demanding cell is 'powered'. If total demand exceeds
 *      capacity, cells beyond the budget are 'brownout' (assigned
 *      by stable iteration order). Cells not adjacent to any
 *      component are 'unpowered'.
 *
 * Per-cell demand is 1 MW in v1. A 100 MW coal plant can power up
 * to 100 cells; a 30 MW solar plant up to 30. If a residential zone
 * spans more cells than capacity, the excess cells brown out.
 */

/**
 * Power demand each populated zone cell pulls from the grid. v1
 * uniform 1 MW per cell so capacity reads as "this plant powers N
 * cells". Future slices can scale demand by zone density (a density-3
 * mid-rise pulls more than a density-1 single-family) without
 * changing the solver shape.
 */
export const POWER_DEMAND_PER_CELL_MW = 1

export type CellPowerStatus = 'powered' | 'brownout' | 'unpowered'

/**
 * One connected component of the power grid. The transmission set
 * carries every cell key (plants + lines) reachable by 4-direction
 * BFS from any of the component's seeds. Capacity is the sum of
 * plant capacities in this component; a component with no plants
 * has zero capacity (lines without a plant feed nothing).
 */
export interface PowerComponent {
  /** Cell keys (plants + lines) reachable from one seed via BFS. */
  transmission: Set<string>
  /** Plants in this component. */
  plants: PowerPlant[]
  /** Sum of plant capacities in MW. */
  capacityMW: number
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
 * Build the connected components of the power grid. Each plant
 * anchor and each line cell becomes a node; orthogonal adjacency
 * connects them. Returns one entry per discovered component, with
 * the transmission set of cell keys, the plant list, and the
 * capacity sum.
 */
export function computePowerComponents(
  power: PowerBucket,
): PowerComponent[] {
  // Seed the cell-to-plant lookup so a BFS reaching a cell can know
  // whether it is a plant anchor (and which kind for capacity sum).
  const plantsByKey = new Map<string, PowerPlant>()
  for (const plant of power.plants) {
    plantsByKey.set(powerLineKey(plant.row, plant.col), plant)
  }

  // Every key that is part of the transmission graph. Plants count
  // as transmission cells (a zone adjacent to a plant is powered
  // even without an intervening line cell).
  const transmissionKeys = new Set<string>()
  for (const key of plantsByKey.keys()) transmissionKeys.add(key)
  for (const key of Object.keys(power.lines)) {
    if (power.lines[key] === true) transmissionKeys.add(key)
  }

  const visited = new Set<string>()
  const components: PowerComponent[] = []

  // Sort the seeds for deterministic component-discovery order so
  // replays produce identical output.
  const sortedKeys = [...transmissionKeys].sort()
  for (const seed of sortedKeys) {
    if (visited.has(seed)) continue
    const componentTransmission = new Set<string>()
    const componentPlants: PowerPlant[] = []
    let capacityMW = 0
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
        capacityMW += POWER_PLANT_CAPACITY_MW[plant.kind]
      }
      const cell = parseCellKey(key)
      if (cell === null) continue
      for (const [dr, dc] of NEIGHBORS) {
        const neighborKey = powerLineKey(cell.row + dr, cell.col + dc)
        if (transmissionKeys.has(neighborKey) && !visited.has(neighborKey)) {
          queue.push(neighborKey)
        }
      }
    }
    components.push({
      transmission: componentTransmission,
      plants: componentPlants,
      capacityMW,
    })
  }
  return components
}

/**
 * Return the index of the first component (in `components` order)
 * that is 4-adjacent to the given zone cell, or -1 when no
 * component is adjacent. The "first" tiebreak is a non-issue in
 * practice because two adjacent components would themselves be one
 * connected component; this guard exists for the degenerate case of
 * a zone cell wedged between two disconnected components on opposite
 * sides.
 */
function adjacentComponentIndex(
  zoneRow: number,
  zoneCol: number,
  components: PowerComponent[],
): number {
  for (const [dr, dc] of NEIGHBORS) {
    const key = powerLineKey(zoneRow + dr, zoneCol + dc)
    for (let i = 0; i < components.length; i++) {
      if (components[i].transmission.has(key)) return i
    }
  }
  return -1
}

/**
 * Solve power status for every zoned cell.
 *
 * Returns a Record keyed by zone cell key with the resolved status:
 *   - `'powered'`: 4-adjacent to a component AND within its capacity budget
 *   - `'brownout'`: 4-adjacent to a component but the component is over capacity
 *   - `'unpowered'`: not 4-adjacent to any component
 *
 * Capacity is consumed in stable iteration order (alphabetical on
 * the cell key) so two clients replaying the same state derive
 * identical brownout assignment for the cells beyond the budget.
 *
 * Returns an empty Record when there are no zones; the caller
 * branches on `Object.keys(result).length === 0` if it cares about
 * the "no zones" vs "everything unpowered" distinction.
 */
export function solvePowerStatus(
  zones: ZonesBucket,
  power: PowerBucket,
): Record<string, CellPowerStatus> {
  const result: Record<string, CellPowerStatus> = {}
  const cellKeys = Object.keys(zones.cells).sort()
  if (cellKeys.length === 0) return result
  const components = computePowerComponents(power)
  // Track remaining capacity per component (mutable copy so we can
  // decrement as we assign cells). Component zero is at index 0; we
  // index by position in the components array.
  const remaining: number[] = components.map((c) => c.capacityMW)
  for (const key of cellKeys) {
    const cell = parseCellKey(key)
    if (cell === null) {
      result[key] = 'unpowered'
      continue
    }
    const componentIndex = adjacentComponentIndex(
      cell.row,
      cell.col,
      components,
    )
    if (componentIndex === -1) {
      result[key] = 'unpowered'
      continue
    }
    if (remaining[componentIndex] >= POWER_DEMAND_PER_CELL_MW) {
      remaining[componentIndex] -= POWER_DEMAND_PER_CELL_MW
      result[key] = 'powered'
    } else {
      result[key] = 'brownout'
    }
  }
  return result
}

/**
 * Convenience helper for the SnapGrid render path: read the status
 * for a single cell. Returns `'unpowered'` when the cell is not in
 * the zones bucket. Recomputes the full solver each call; the
 * editor's render path can memoize the result if profiling reveals
 * the recomputation is hot.
 */
export function cellPowerStatusFor(
  row: number,
  col: number,
  zones: ZonesBucket,
  power: PowerBucket,
): CellPowerStatus {
  const key = zoneCellKey(row, col)
  if (zones.cells[key] === undefined) return 'unpowered'
  const all = solvePowerStatus(zones, power)
  return all[key] ?? 'unpowered'
}
