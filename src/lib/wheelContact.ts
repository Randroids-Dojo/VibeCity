import { cellKey, pieceFootprintCells } from '@/app/[slug]/edit/snapGrid'
import type { OrderedPiece, PathLocator, TrackPath } from '@/lib/trackPath'
import type { Piece } from '@/lib/schemas'

/**
 * Multi-locator wheel contact (REQ-065).
 *
 * VibeRacer's `wheelContact.ts` walks every locator candidate that the
 * track path emits for a wheel's cell, computes a distance-to-centerline
 * for each candidate piece, and picks the candidate with the smallest
 * distance. Without this multi-candidate selection, multi-cell pieces
 * (hairpin, mega sweep, future arc45 / diagonal once F-003 ships) silently
 * report on-street status against the wrong centerline mid-piece and the
 * car falls off.
 *
 * VibeCity's substrate (REQ-064) already emits one locator per footprint
 * cell of every placed piece into `path.cellToLocators`. This module is
 * the candidate-evaluation layer that future drive-mode wheel contact
 * slices (REQ-032 alongside F-004 piece centerlines) plug their per-piece
 * `distanceToCenterline` resolver into. v1 ships the candidate walker, the
 * minimum-distance picker, the `cellToOrderIdx` fallback for callers that
 * still consume the single-locator vocabulary, and an anchor-distance
 * resolver as the simplest distance function so callers can verify the
 * wiring before sampled centerlines land.
 *
 * Pure module: no three.js, no DOM. Distance functions are injected so
 * the geometry layer (sampled centerlines per F-003 / F-004) can land in
 * its own slice without churning this module.
 */

/**
 * World-cell-size that maps a world-space `(x, z)` position to the
 * integer `(row, col)` cell it falls on. Mirrors the drive-mode
 * `worldToCell` convention (`row = Math.round(z / CELL_SIZE)`,
 * `col = Math.round(x / CELL_SIZE)`) but takes the cell size as an
 * argument so this module stays free of the drive-scene module's
 * import graph (the `src/lib/` boundary is server-only / pure).
 *
 * Pass `CELL_SIZE = 4` from `src/app/[slug]/driveScene.ts` to match the
 * world units the drive scene uses.
 */
export function wheelCell(
  wheelX: number,
  wheelZ: number,
  cellSize: number,
): { row: number; col: number } {
  return {
    row: Math.round(wheelZ / cellSize),
    col: Math.round(wheelX / cellSize),
  }
}

/**
 * One candidate piece a wheel might be in contact with. The locator
 * points back into the originating segment so a future drive-mode
 * surface can read the segment id (e.g. "the wheel is on `main`" vs
 * "the wheel is on `segment-1`") without re-walking the path. The
 * `piece` is resolved up front so the caller's distance function reads
 * the piece directly without a second `city.pieces[index]` lookup.
 */
export interface WheelContactCandidate {
  locator: PathLocator
  piece: Piece
  ordered: OrderedPiece
}

/**
 * Distance from a wheel's world-space `(x, z)` position to a candidate
 * piece's centerline. The drive-mode integration injects the resolver
 * because the per-piece centerline geometry (sampled centerlines for
 * straight, sweeps, hairpin, mega sweep, arc45, diagonal, intersection)
 * lands in its own slice (F-003 / F-004 plus REQ-031 / REQ-032). v1
 * ships `pieceAnchorDistance` as the default fallback so callers can
 * wire the multi-locator selection without sampled centerlines.
 *
 * The resolver MUST return a non-negative number. NaN or Infinity is
 * reserved for "no contact"; the picker treats any non-finite distance
 * as off-piece and excludes the candidate from the closest-pick.
 */
export type DistanceToCenterlineFn = (
  ordered: OrderedPiece,
  wheelX: number,
  wheelZ: number,
) => number

/**
 * Default distance function that approximates a piece's centerline by
 * its anchor cell's world-space center. Useful as the fallback in v1
 * before sampled centerlines land (F-003 / F-004) so a caller can wire
 * the multi-locator selection and verify it picks the closer piece on
 * a multi-locator cell. The approximation is intentionally coarse: it
 * does NOT account for piece type, rotation, or footprint extent; a
 * multi-cell piece's anchor is one corner of the footprint, so the
 * caller should swap this resolver for a per-piece sampled-centerline
 * resolver before shipping a drivable hairpin / mega sweep.
 *
 * `cellSize` is passed in so this helper stays free of the drive-scene
 * module's import graph.
 */
export function pieceAnchorDistance(
  ordered: OrderedPiece,
  wheelX: number,
  wheelZ: number,
  cellSize: number,
): number {
  const anchorX = ordered.piece.col * cellSize
  const anchorZ = ordered.piece.row * cellSize
  const dx = wheelX - anchorX
  const dz = wheelZ - anchorZ
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * Distance from a wheel's world-space `(x, z)` to the nearest footprint
 * cell center of `ordered.piece`. Strictly more accurate than
 * `pieceAnchorDistance` for multi-cell pieces (mega sweep, hairpin,
 * future arc45 / diagonal once their footprints land) because the
 * anchor of a multi-cell piece sits at one corner of the footprint, so
 * `pieceAnchorDistance` lies about how far a wheel at the far edge of
 * the footprint is from the piece. Single-cell pieces collapse to the
 * anchor distance because their only footprint cell IS the anchor.
 *
 * Reads `pieceFootprintCells(piece)` for the piece's absolute cell
 * coverage (single-cell pieces fall back to the anchor; multi-cell
 * pieces emit every cell of their canonical or explicit footprint). For
 * each cell, computes the Euclidean distance to that cell's world-space
 * center (`(col * cellSize, row * cellSize)`, mirroring the drive-mode
 * `cellToWorld` convention) and returns the minimum.
 *
 * Returns `Infinity` only when the piece has an empty footprint, which
 * is unreachable for a schema-valid `Piece` (the canonical default
 * footprint is `[{ dr: 0, dc: 0 }]` so every piece resolves to at least
 * one cell). The picker treats `Infinity` as off-piece so a future
 * caller that accidentally constructs a degenerate ordered piece does
 * not crash.
 *
 * Geometry caveat: "footprint cell center" is still a coarse stand-in
 * for the per-piece sampled centerline (F-003 / F-004). For a straight
 * piece this is faithful (the centerline runs through the cell center).
 * For a curve / sweep / hairpin / arc45 / diagonal, the true centerline
 * snakes through the footprint and is closer to the wheel than the
 * cell center on most of its arc; this resolver still picks the right
 * piece across overlap because ALL of the piece's footprint cells get
 * surveyed, but the absolute distance value is conservative. The
 * sampled-centerline resolver lands when F-003 / F-004 ship.
 */
export function pieceFootprintDistance(
  ordered: OrderedPiece,
  wheelX: number,
  wheelZ: number,
  cellSize: number,
): number {
  let best = Number.POSITIVE_INFINITY
  for (const cell of pieceFootprintCells(ordered.piece)) {
    const cx = cell.col * cellSize
    const cz = cell.row * cellSize
    const dx = wheelX - cx
    const dz = wheelZ - cz
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d < best) best = d
  }
  return best
}

/**
 * Resolve the candidate pieces a wheel might be in contact with.
 *
 * Reads `path.cellToLocators.get(cellKey)` for the multi-locator path
 * and falls back to `path.cellToOrderIdx.get(cellKey)` for cells that
 * predate the multi-locator emission (defensive; the v1 builder always
 * populates `cellToLocators` for every footprint cell, so the fallback
 * surface is reserved for callers that build a `TrackPath` by hand or
 * for a degenerate cell set produced by a future builder change).
 *
 * Returns an empty array when the cell is off the path. The order of
 * the returned array matches `cellToLocators`'s insertion order (the
 * builder walks pieces in placement order and footprint cells in
 * `pieceFootprintCells` order); callers that need a deterministic
 * candidate order can rely on it.
 *
 * Returns a fresh array on every call so callers cannot mutate cached
 * state.
 */
export function wheelContactCandidates(
  wheelX: number,
  wheelZ: number,
  path: TrackPath,
  cityPieces: readonly Piece[],
  cellSize: number,
): WheelContactCandidate[] {
  const { row, col } = wheelCell(wheelX, wheelZ, cellSize)
  const key = cellKey(row, col)
  const locators = path.cellToLocators.get(key)
  if (locators && locators.length > 0) {
    return locators
      .map((locator) => resolveLocator(locator, path, cityPieces))
      .filter((c): c is WheelContactCandidate => c !== null)
  }

  const orderIdx = path.cellToOrderIdx.get(key)
  if (orderIdx === undefined) return []
  const mainSegment = path.segments[0]
  if (!mainSegment) return []
  const ordered = mainSegment.order[orderIdx]
  if (!ordered) return []
  return [
    {
      locator: { segmentId: mainSegment.id, idx: orderIdx },
      piece: ordered.piece,
      ordered,
    },
  ]
}

function resolveLocator(
  locator: PathLocator,
  path: TrackPath,
  cityPieces: readonly Piece[],
): WheelContactCandidate | null {
  const segment = path.segments.find((s) => s.id === locator.segmentId)
  if (!segment) return null
  const ordered = segment.order[locator.idx]
  if (!ordered) return null
  // The piece reference inside `ordered.piece` is already the same
  // object as `cityPieces[index]` because the builder walks the city's
  // piece list directly. We accept `cityPieces` so a future caller that
  // wants to look up the piece by its index in `city.pieces` (e.g. for
  // the off-street penalty's per-piece-type tuning) does not need to
  // re-derive the piece from the locator.
  void cityPieces
  return {
    locator,
    piece: ordered.piece,
    ordered,
  }
}

/**
 * The closest candidate piece among a candidate list, evaluated by the
 * caller's `distanceFn`. Returns `null` when the list is empty or every
 * candidate's distance is non-finite. Stable on ties: the first
 * candidate (earliest in `cellToLocators` insertion order) wins so a
 * caller can rely on a deterministic pick across re-evaluations.
 */
export interface WheelContactPick {
  candidate: WheelContactCandidate
  distance: number
}

export function pickClosestWheelContact(
  candidates: readonly WheelContactCandidate[],
  distanceFn: DistanceToCenterlineFn,
  wheelX: number,
  wheelZ: number,
): WheelContactPick | null {
  let best: WheelContactPick | null = null
  for (const candidate of candidates) {
    const distance = distanceFn(candidate.ordered, wheelX, wheelZ)
    if (!Number.isFinite(distance)) continue
    if (best === null || distance < best.distance) {
      best = { candidate, distance }
    }
  }
  return best
}

/**
 * One-shot multi-locator wheel contact: resolves the candidates, picks
 * the closest by `distanceFn`, returns `null` when the wheel is off
 * the path.
 *
 * VibeRacer's `wheelTrackContact` returns a richer record (the wheel's
 * sampled position on the centerline, the heading at that sample, etc.)
 * because its centerline geometry layer is built. VibeCity v1 ships
 * just the locator + piece + distance because the geometry layer is
 * still gated on F-003 / F-004; the future enriched record can be
 * layered on top by extending `WheelContactPick` without churning this
 * module's selection logic.
 */
export function wheelTrackContact(
  wheelX: number,
  wheelZ: number,
  path: TrackPath,
  cityPieces: readonly Piece[],
  cellSize: number,
  distanceFn: DistanceToCenterlineFn,
): WheelContactPick | null {
  const candidates = wheelContactCandidates(
    wheelX,
    wheelZ,
    path,
    cityPieces,
    cellSize,
  )
  if (candidates.length === 0) return null
  return pickClosestWheelContact(candidates, distanceFn, wheelX, wheelZ)
}
