import {
  SERVICE_COVERAGE_CELLS,
  zoneCellKey,
  type ServiceKind,
  type ServicesBucket,
  type ZonesBucket,
} from './state'

/**
 * Service coverage solver (REQ-101 slice 1).
 *
 * Computes which service kinds cover which zone cells. v1 uses
 * Manhattan distance because the grid is square; coverage radius
 * per kind comes from `SERVICE_COVERAGE_CELLS` (police/fire/garbage 6,
 * hospital 8, school 5). Pure function: same input always produces
 * the same output. Two clients replaying the same event log derive
 * identical coverage without persistent storage on the bucket.
 *
 * The per-kind map is used by:
 *   - REQ-102 happiness: each missing service-kind docks per-cell
 *     happiness by N points; the aggregate happiness gates zone
 *     growth (REQ-079) and trip demand patterns.
 *   - SnapGridView (REQ-100 slice 2 follow-on): renders a per-cell
 *     "coverage count" stroke on the zone overlay so a builder can
 *     see at a glance which zones are fully covered vs missing
 *     services.
 */

const SERVICE_KINDS: ReadonlyArray<ServiceKind> = [
  'police-station',
  'fire-station',
  'hospital',
  'school',
  'garbage-depot',
]

export type CellCoverage = Record<ServiceKind, boolean>

const ZERO_COVERAGE: CellCoverage = {
  'police-station': false,
  'fire-station': false,
  hospital: false,
  school: false,
  'garbage-depot': false,
}

/**
 * Manhattan distance between two cells. v1 picks Manhattan because
 * the grid is square and orthogonal-step distance maps cleanly to
 * the player's mental model of "how far does this service reach".
 * Chebyshev (max delta) reaches further per cell and reads as a
 * square radius; Manhattan reads as a diamond radius.
 */
function manhattan(
  ar: number,
  ac: number,
  br: number,
  bc: number,
): number {
  return Math.abs(ar - br) + Math.abs(ac - bc)
}

/**
 * Compute per-kind coverage for a single cell.
 *
 * Returns a Record with one boolean per service kind: `true` when
 * at least one service of that kind is within `SERVICE_COVERAGE_CELLS[kind]`
 * Manhattan-distance from `(zoneRow, zoneCol)`. The lookup is O(N)
 * on the buildings array; cities with fewer than ~256 services
 * (the v1 ceiling derived from MAX_BUILDINGS_PER_CITY) execute in
 * a few microseconds per cell.
 */
export function cellCoverage(
  zoneRow: number,
  zoneCol: number,
  services: ServicesBucket,
): CellCoverage {
  const result: CellCoverage = { ...ZERO_COVERAGE }
  for (const building of services.buildings) {
    const radius = SERVICE_COVERAGE_CELLS[building.kind]
    const distance = manhattan(zoneRow, zoneCol, building.row, building.col)
    if (distance <= radius) {
      result[building.kind] = true
    }
  }
  return result
}

/**
 * Count how many service kinds cover a given cell. 0 = no services
 * reach this cell; 5 = all five service kinds reach. Convenience
 * for the SnapGridView's coverage-count stroke.
 */
export function coverageCount(coverage: CellCoverage): number {
  let count = 0
  for (const kind of SERVICE_KINDS) {
    if (coverage[kind]) count++
  }
  return count
}

/**
 * Solve coverage for every zoned cell. Returns a Record keyed by
 * `"row,col"` (matching `zoneCellKey`) with the per-kind coverage
 * map for each. Cells without any zone do not appear in the result.
 */
export function solveServicesCoverage(
  zones: ZonesBucket,
  services: ServicesBucket,
): Record<string, CellCoverage> {
  const result: Record<string, CellCoverage> = {}
  // Cells iterate in alphabetical key order so the output is
  // deterministic across clients (the per-cell coverage is also
  // deterministic but iteration order matters when callers fold
  // the result into a Map or other ordered structure).
  const cellKeys = Object.keys(zones.cells).sort()
  if (cellKeys.length === 0) return result
  if (services.buildings.length === 0) {
    for (const key of cellKeys) result[key] = { ...ZERO_COVERAGE }
    return result
  }
  for (const key of cellKeys) {
    const [rowStr, colStr] = key.split(',')
    const row = Number(rowStr)
    const col = Number(colStr)
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      result[key] = { ...ZERO_COVERAGE }
      continue
    }
    result[key] = cellCoverage(row, col, services)
  }
  return result
}

/**
 * Convenience for the SnapGrid render path: return the coverage
 * count for a single cell. Returns 0 when the cell is not zoned.
 * Recomputes via `cellCoverage` each call; the editor's render
 * path can memoize on the services + zones references if profiling
 * reveals the recomputation as hot.
 */
export function cellCoverageCountFor(
  row: number,
  col: number,
  zones: ZonesBucket,
  services: ServicesBucket,
): number {
  const key = zoneCellKey(row, col)
  if (zones.cells[key] === undefined) return 0
  return coverageCount(cellCoverage(row, col, services))
}
