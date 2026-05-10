import type { Building } from '@/lib/schemas'
import { CELL_SIZE } from './driveScene'
import type { VehicleState } from './driveControls'
import { cellKey } from '@/lib/render/grid'

/**
 * Drive-mode building collision (REQ-030, Q-005 default A).
 *
 * Cell-level binary penalty: when the car's center cell coincides with
 * a building cell, the car is treated as off-street and an immediate
 * speed cap plus extra drag pulls it back to a slow crawl. There is no
 * hard wall and no bounce-back impulse in v1; the penalty alone is
 * enough to discourage driving through buildings without inventing a
 * new physics layer.
 *
 * v1 scope:
 *   - Buildings are single-cell (Q-004 default B), so the building
 *     cell set is just one entry per `city.buildings` row.
 *   - The "car cell" is derived from the vehicle's center position via
 *     `worldToCell`. The wheel-contact port (REQ-032) will refine this
 *     to a per-wheel evaluation; v1 uses the cheapest version that
 *     observably penalizes building drives.
 *   - Off-grid driving (no street piece under the wheels) is REQ-054
 *     and lives in its own slice. This module only penalizes building
 *     cells.
 *
 * Pure module: no three.js, no DOM. The drive scene client calls
 * `applyBuildingPenalty` after `applyDriveStep` each frame so the
 * integration math stays fully unit-testable.
 */

/**
 * Maximum forward speed allowed while the car center is on a building
 * cell. Picked to be slow enough that running into a building feels
 * like a clear penalty (about a quarter of the on-street top speed)
 * without locking the car so hard that a brushing pass through a corner
 * cell bounces the player into a wall feel.
 */
export const BUILDING_PENALTY_MAX_SPEED = CELL_SIZE * 0.3

/**
 * Maximum reverse speed allowed while on a building cell. Reverse caps
 * proportionally so a player who clipped a building cannot rocket out
 * of it backward.
 */
export const BUILDING_PENALTY_MAX_REVERSE_SPEED = CELL_SIZE * 0.15

/**
 * Extra drag applied per second while the car is on a building cell.
 * Pulls the speed magnitude back toward zero on top of any normal
 * coast drag, so even a player holding throttle on a building cell
 * sees the speed sag back to the cap quickly.
 */
export const BUILDING_PENALTY_DRAG = CELL_SIZE * 12

/**
 * Convert a world-space `(x, z)` position to the integer `(row, col)`
 * cell it falls on under `cellToWorld(row, col) = (col * CELL_SIZE,
 * row * CELL_SIZE)`. Uses `Math.round` so the cell boundary is at
 * half-cell offsets from the cell center, matching the editor's
 * "click the cell center to place" convention.
 */
export function worldToCell(
  x: number,
  z: number,
): { row: number; col: number } {
  return {
    row: Math.round(z / CELL_SIZE),
    col: Math.round(x / CELL_SIZE),
  }
}

/**
 * Build a `Set<string>` of the cells covered by every building in the
 * city. v1 buildings are single-cell (Q-004 default B); when multi-cell
 * footprints land (Q-004 option C) this helper expands to iterate the
 * footprint just like the editor's `occupiedBuildingCells`.
 */
export function buildingCellSet(
  buildings: readonly Building[],
): Set<string> {
  const out = new Set<string>()
  for (const building of buildings) {
    out.add(cellKey(building.row, building.col))
  }
  return out
}

/**
 * Test whether a world-space `(x, z)` position falls on a cell that is
 * occupied by a building. Constant time given the prebuilt cell set.
 */
export function isOnBuildingCell(
  x: number,
  z: number,
  buildingCells: ReadonlySet<string>,
): boolean {
  if (buildingCells.size === 0) return false
  const { row, col } = worldToCell(x, z)
  return buildingCells.has(cellKey(row, col))
}

/**
 * Apply the building-cell penalty to a vehicle state for one frame.
 *
 * When `onBuildingCell` is `false` the state passes through unchanged
 * so the on-street path is allocation-free.
 *
 * When `onBuildingCell` is `true` the speed is pulled toward zero by
 * `BUILDING_PENALTY_DRAG * dt` (in addition to the coast drag the main
 * integrator already applied) and clamped to the building penalty
 * max-speed range so a held throttle cannot push the car past the cap
 * while inside a building cell.
 *
 * `dt` is interpreted as seconds and is clamped to a small positive
 * range so a stale or NaN delta cannot teleport the speed past zero.
 */
export function applyBuildingPenalty(
  state: VehicleState,
  onBuildingCell: boolean,
  dt: number,
): VehicleState {
  if (!onBuildingCell) return state
  if (!Number.isFinite(dt) || dt <= 0) return state

  let speed = state.speed
  // Extra drag in addition to the integrator's coast drag. Mirrors the
  // sign-aware drag so reverse motion also bleeds toward zero.
  if (speed > 0) {
    speed -= BUILDING_PENALTY_DRAG * dt
    if (speed < 0) speed = 0
  } else if (speed < 0) {
    speed += BUILDING_PENALTY_DRAG * dt
    if (speed > 0) speed = 0
  }

  if (speed > BUILDING_PENALTY_MAX_SPEED) speed = BUILDING_PENALTY_MAX_SPEED
  if (speed < -BUILDING_PENALTY_MAX_REVERSE_SPEED) {
    speed = -BUILDING_PENALTY_MAX_REVERSE_SPEED
  }

  return {
    x: state.x,
    z: state.z,
    heading: state.heading,
    speed,
  }
}
