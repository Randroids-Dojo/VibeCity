import type { Piece } from '@/lib/schemas'
import type { TrackPath } from '@/lib/trackPath'
import {
  pieceFootprintDistance,
  wheelContactCandidates,
  wheelTrackContact,
  type WheelContactPick,
} from '@/lib/wheelContact'
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

/**
 * One wheel offset in the car's local frame (REQ-032). `x` is the
 * lateral offset (positive = right side of the car when facing forward),
 * `z` is the longitudinal offset (negative = front axle, positive =
 * rear axle) per the convention `carWheelOffsets()` in `driveScene.ts`
 * already follows. The pure helper accepts the offset shape directly
 * so it can be unit-tested without mounting the drive scene.
 */
export interface WheelLocalOffset {
  x: number
  z: number
}

/**
 * Transform a wheel's local offset into a world-space `(x, z)` pair
 * given the vehicle's center pose. The car's local `+x` axis points
 * to the right of the heading; the local `-z` axis points forward.
 * The rotation matches the placed car mesh (`car.rotation.y =
 * vehicle.heading`) so the four wheels track the car as it turns.
 *
 * Pure: returns a fresh object on every call so callers cannot mutate
 * cached state.
 */
export function wheelWorldPosition(
  vehicle: Pick<VehicleState, 'x' | 'z' | 'heading'>,
  offset: WheelLocalOffset,
): { x: number; z: number } {
  const cos = Math.cos(vehicle.heading)
  const sin = Math.sin(vehicle.heading)
  // Apply a Y-axis rotation that matches `car.rotation.y = heading`:
  // a local point (lx, lz) maps to world (cos*lx + sin*lz, -sin*lx + cos*lz).
  const lx = offset.x
  const lz = offset.z
  return {
    x: vehicle.x + cos * lx + sin * lz,
    z: vehicle.z + -sin * lx + cos * lz,
  }
}

/**
 * Per-wheel on-street test (REQ-032).
 *
 * For each wheel offset, transforms the wheel into world space, asks
 * the multi-locator substrate (REQ-064 + REQ-065) whether the wheel's
 * cell has any candidate piece, and returns true as soon as one wheel
 * does. The car is treated as on-street when at least one wheel is on
 * a street piece's footprint cell, which matches the player's
 * expectation that a tire on the road keeps the car planted while a
 * tire hanging off the road does not flip the whole car off-street.
 *
 * Returns false when the path has no segments (an empty city) so an
 * empty city reports every position as off-street, mirroring the
 * `isOnStreetCell` contract on the empty path.
 *
 * The helper builds zero per-call allocation beyond what
 * `wheelContactCandidates` returns; the candidate list is read for
 * its length only and is not retained, so a per-frame call site is
 * safe to invoke without churn.
 */
export function wheelOnStreet(
  vehicle: Pick<VehicleState, 'x' | 'z' | 'heading'>,
  wheelOffsets: readonly WheelLocalOffset[],
  path: TrackPath,
  cityPieces: readonly Piece[],
  cellSize: number,
): boolean {
  if (path.segments.length === 0) return false
  for (const offset of wheelOffsets) {
    const world = wheelWorldPosition(vehicle, offset)
    const candidates = wheelContactCandidates(
      world.x,
      world.z,
      path,
      cityPieces,
      cellSize,
    )
    if (candidates.length > 0) return true
  }
  return false
}

/**
 * Closest-piece resolution for the vehicle (REQ-032 / REQ-065).
 *
 * Picked field shape:
 *   - `pieceIndex`: index into `cityPieces` of the closest piece. Useful
 *     for a future per-piece-type off-street tuning that needs to look
 *     up the closest piece by its city-array position.
 *   - `pieceType`: the closest piece's `type` so a debug HUD can read
 *     the piece category without re-deriving it from the index.
 *   - `segmentId`: the segment id the locator points back to (`'main'`,
 *     `'segment-1'`, etc.) so a future drive surface can branch on
 *     which connected component the wheel is in contact with.
 *   - `idx`: position in that segment's `order` array.
 *   - `distance`: world-space distance from the picking wheel to the
 *     closest piece's footprint cell center (the resolver `pieceFootprintDistance`
 *     uses; coarse vs a sampled centerline per F-003 / F-004 but
 *     monotonically correct for the closest-piece pick because every
 *     footprint cell of every candidate is surveyed).
 *   - `wheelIndex`: index into `wheelOffsets` of the wheel that picked
 *     the closest piece. Useful for visualizing per-wheel contact in a
 *     future debug HUD.
 */
export interface ClosestStreetPiece {
  pieceIndex: number
  pieceType: Piece['type']
  segmentId: string
  idx: number
  distance: number
  wheelIndex: number
}

/**
 * Walk every wheel through `wheelTrackContact` with `pieceFootprintDistance`,
 * pick the global minimum distance across all four wheels, and return
 * the closest piece. Returns `null` when the path is empty, the wheel
 * offset list is empty, or no wheel has any candidate (every wheel is
 * off the path).
 *
 * Tie-breaking: when two wheels report the same finite distance, the
 * earlier wheel in `wheelOffsets` wins. This mirrors `pickClosestWheelContact`'s
 * insertion-order tie-break (the picker walks candidates in
 * `cellToLocators` insertion order on the per-wheel pick) so the
 * cross-wheel pick is also deterministic across re-evaluations.
 *
 * The helper allocates only the picked record (and a short-lived
 * `WheelContactPick` per wheel via `wheelTrackContact`); per-frame call
 * sites are safe to invoke without churn.
 */
export function closestStreetPiece(
  vehicle: Pick<VehicleState, 'x' | 'z' | 'heading'>,
  wheelOffsets: readonly WheelLocalOffset[],
  path: TrackPath,
  cityPieces: readonly Piece[],
  cellSize: number,
): ClosestStreetPiece | null {
  if (path.segments.length === 0) return null

  let best: { pick: WheelContactPick; wheelIndex: number } | null = null
  for (let i = 0; i < wheelOffsets.length; i += 1) {
    const offset = wheelOffsets[i]
    const world = wheelWorldPosition(vehicle, offset)
    const pick = wheelTrackContact(
      world.x,
      world.z,
      path,
      cityPieces,
      cellSize,
      (ordered, x, z) => pieceFootprintDistance(ordered, x, z, cellSize),
    )
    if (pick === null) continue
    if (best === null || pick.distance < best.pick.distance) {
      best = { pick, wheelIndex: i }
    }
  }
  if (best === null) return null

  // Resolve the piece's index in the source city pieces array. The
  // OrderedPiece carries the same `Piece` reference as `cityPieces[index]`
  // because the substrate walks the city's piece list directly. A
  // reference search is O(N) over the city pieces; the bounded
  // `MAX_PIECES_PER_CITY = 256` keeps a worst-case wheel pick at four
  // ~256-element scans which is far below a frame budget.
  const pieceIndex = cityPieces.indexOf(best.pick.candidate.piece)
  if (pieceIndex === -1) return null

  return {
    pieceIndex,
    pieceType: best.pick.candidate.piece.type,
    segmentId: best.pick.candidate.locator.segmentId,
    idx: best.pick.candidate.locator.idx,
    distance: best.pick.distance,
    wheelIndex: best.wheelIndex,
  }
}
