import type { Piece } from '@/lib/schemas'
import { CELL_SIZE } from './driveScene'
import { worldToCell } from './buildingCollision'
import { pieceFootprintCells } from './edit/snapGrid'
import type { VehicleState } from './driveControls'

/**
 * Drive-mode off-street penalty (REQ-054).
 *
 * Cell-level binary penalty: when the car's center cell is NOT covered
 * by any street piece footprint, the car is treated as off-street and
 * an immediate speed cap plus extra drag pulls it back to a slow
 * crawl. Mirrors the building-cell penalty (REQ-030, Q-005 default A)
 * so a player who veers off the road feels the same bleed as one who
 * drives into a building. There is no hard wall and no bounce-back
 * impulse in v1; the penalty alone is enough to reward staying on the
 * placed streets without inventing a new physics layer.
 *
 * v1 scope:
 *   - Pieces respect the shared `pieceFootprintCells` helper from the
 *     editor's `snapGrid.ts`; multi-cell pieces (mega sweep, hairpin,
 *     future arc45 / diagonal once REQ-059 lands) expand to their full
 *     footprint, single-cell pieces fall back to `(piece.row,
 *     piece.col)`.
 *   - The "car cell" is derived from the vehicle's center position via
 *     `worldToCell` from `buildingCollision.ts`. The wheel-contact port
 *     (REQ-032) will refine this to a per-wheel evaluation; v1 uses
 *     the cheapest version that observably penalizes off-street drives.
 *   - Building-cell collision (REQ-030) lives in its own module
 *     because the two penalties stack at the same per-frame call site:
 *     a player who drives into a building cell is BOTH off-street and
 *     on-building, so the integration loop applies both penalties in
 *     order and the more aggressive of the two wins.
 *
 * Pure module: no three.js, no DOM. The drive scene client calls
 * `applyOffStreetPenalty` after `applyDriveStep` each frame so the
 * integration math stays fully unit-testable.
 */

/**
 * Maximum forward speed allowed while the car center is off any street
 * piece. Picked to be a noticeable cut from the on-street top speed
 * (`MAX_SPEED = CELL_SIZE * 8` in `driveControls.ts`) without locking
 * the car so hard that briefly clipping a corner during a turn feels
 * like a wall. Stays slightly above the building-cell cap so a player
 * who drives off-road but not into a building still has more headroom.
 */
export const OFF_STREET_PENALTY_MAX_SPEED = CELL_SIZE * 3

/**
 * Maximum reverse speed allowed while off-street. Reverse caps
 * proportionally so a player who reversed off the road cannot rocket
 * backward across the grid.
 */
export const OFF_STREET_PENALTY_MAX_REVERSE_SPEED = CELL_SIZE * 1.5

/**
 * Extra drag applied per second while the car is off-street. Pulls the
 * speed magnitude back toward zero on top of any normal coast drag, so
 * even a player holding throttle off the road sees the speed sag back
 * to the cap quickly. Lighter than the building-cell drag so the
 * "I drifted off the road" feel is more forgiving than the
 * "I drove into a building" feel.
 */
export const OFF_STREET_PENALTY_DRAG = CELL_SIZE * 8

/**
 * Stable map key for a cell coordinate. Mirrors the `cellKey` private
 * helpers in `buildingCollision.ts` and `edit/snapGrid.ts` so a future
 * shared lookup table can use the same key format.
 */
function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

/**
 * Build a `Set<string>` of every cell covered by a street piece in
 * the city. Multi-cell pieces (mega sweep, hairpin) expand to their
 * full footprint via `pieceFootprintCells`; single-cell pieces
 * collapse to one entry at `(piece.row, piece.col)`.
 */
export function streetCellSet(pieces: readonly Piece[]): Set<string> {
  const out = new Set<string>()
  for (const piece of pieces) {
    for (const cell of pieceFootprintCells(piece)) {
      out.add(cellKey(cell.row, cell.col))
    }
  }
  return out
}

/**
 * Test whether a world-space `(x, z)` position falls on a cell that is
 * covered by any street piece. Constant time given the prebuilt cell
 * set. Returns `false` when the cell set is empty so a city with no
 * pieces reports every position as off-street (the integration loop is
 * gated on at least one piece existing, so this branch covers a
 * defensive-empty city scenario only).
 */
export function isOnStreetCell(
  x: number,
  z: number,
  streetCells: ReadonlySet<string>,
): boolean {
  if (streetCells.size === 0) return false
  const { row, col } = worldToCell(x, z)
  return streetCells.has(cellKey(row, col))
}

/**
 * Apply the off-street penalty to a vehicle state for one frame.
 *
 * When `onStreetCell` is `true` the state passes through unchanged so
 * the on-street path is allocation-free.
 *
 * When `onStreetCell` is `false` the speed is pulled toward zero by
 * `OFF_STREET_PENALTY_DRAG * dt` (in addition to the coast drag the
 * main integrator already applied) and clamped to the off-street
 * max-speed range so a held throttle off the road cannot push the car
 * past the cap.
 *
 * `dt` is interpreted as seconds and is clamped to a small positive
 * range so a stale or NaN delta cannot teleport the speed past zero.
 */
export function applyOffStreetPenalty(
  state: VehicleState,
  onStreetCell: boolean,
  dt: number,
): VehicleState {
  if (onStreetCell) return state
  if (!Number.isFinite(dt) || dt <= 0) return state

  let speed = state.speed
  if (speed > 0) {
    speed -= OFF_STREET_PENALTY_DRAG * dt
    if (speed < 0) speed = 0
  } else if (speed < 0) {
    speed += OFF_STREET_PENALTY_DRAG * dt
    if (speed > 0) speed = 0
  }

  if (speed > OFF_STREET_PENALTY_MAX_SPEED) {
    speed = OFF_STREET_PENALTY_MAX_SPEED
  }
  if (speed < -OFF_STREET_PENALTY_MAX_REVERSE_SPEED) {
    speed = -OFF_STREET_PENALTY_MAX_REVERSE_SPEED
  }

  return {
    x: state.x,
    z: state.z,
    heading: state.heading,
    speed,
  }
}
