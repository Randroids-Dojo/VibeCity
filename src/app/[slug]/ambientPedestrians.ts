import type { PopulationBucket } from '@/lib/sim/state'

/**
 * Ambient pedestrians (REQ-076 spec text follow-on; F-014).
 *
 * Visible life at populated zone cells: every cell with `residents > 0`
 * gets up to `PEDESTRIANS_PER_CELL_CAP` small render proxies in the
 * drive scene. Pedestrians have no goals, no schedule, no
 * path-finding; each is a static anchor with a per-mesh bob offset
 * computed from its index so cells with many residents look busier
 * than empty cells.
 *
 * The module is pure so the anchor list is unit-testable without a
 * three.js scene. The caller (DriveSceneClient) owns the mesh group
 * lifecycle and reads `{x, z, count}` per anchor each render.
 */

export const PEDESTRIANS_PER_CELL_CAP = 4

/**
 * Residents-to-pedestrian-count tier table. Maps residents to a
 * visible figure count so the player can read density at a glance:
 *
 *   - 0          -> 0 figures (skip; cell not populated)
 *   - 1..4       -> 1 figure   (density 1: small house = 4 residents)
 *   - 5..12      -> 2 figures  (density 2: mid house = 12 residents)
 *   - 13+        -> 4 figures  (density 3: apartment = 40 residents, capped)
 *
 * The tiers map cleanly to the residential density ladder so each
 * step in density is visually distinguishable.
 */
export function pedestrianCountForResidents(residents: number): number {
  if (residents <= 0) return 0
  if (residents <= 4) return 1
  if (residents <= 12) return 2
  return PEDESTRIANS_PER_CELL_CAP
}

export interface PedestrianAnchor {
  x: number
  z: number
  cellRow: number
  cellCol: number
  count: number
}

export function pedestrianAnchors(
  population: PopulationBucket,
  cellToWorld: (row: number, col: number) => { x: number; z: number },
): PedestrianAnchor[] {
  const anchors: PedestrianAnchor[] = []
  for (const key of Object.keys(population.cells).sort()) {
    const cell = population.cells[key]
    if (cell.residents <= 0) continue
    const [rowStr, colStr] = key.split(',')
    const row = Number(rowStr)
    const col = Number(colStr)
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue
    const { x, z } = cellToWorld(row, col)
    anchors.push({
      x,
      z,
      cellRow: row,
      cellCol: col,
      count: pedestrianCountForResidents(cell.residents),
    })
  }
  return anchors
}

/**
 * Per-pedestrian-within-cell offset. v1 lays them out on the four
 * corners of a small square inside the cell so a count-4 cell shows
 * a little crowd without overlapping geometry. Cell index is the
 * zero-based ordinal within the cell (0..3).
 */
export function pedestrianOffsetWithinCell(
  withinCellIndex: number,
  cellSize: number,
): { dx: number; dz: number } {
  const radius = cellSize * 0.18
  switch (withinCellIndex % 4) {
    case 0:
      return { dx: -radius, dz: -radius }
    case 1:
      return { dx: radius, dz: -radius }
    case 2:
      return { dx: -radius, dz: radius }
    default:
      return { dx: radius, dz: radius }
  }
}
