import type { City, Piece, PieceType, Rotation } from '@/lib/schemas'
import { cellKey, occupiedPieceCells, pieceFootprintCells } from './snapGrid'

/**
 * Editor palette and placement helpers (REQ-017, REQ-020, REQ-021).
 *
 * v1 ships the cardinal-only street palette: `straight`, `left90`,
 * `right90`. The full piece taxonomy (REQ-018, REQ-019, REQ-058,
 * REQ-060, REQ-061, REQ-062) lands in follow-up slices that extend
 * this list. The palette ordering here is the source of truth for the
 * UI render.
 *
 * Placement is a pure reducer over the city: `placePiece` returns a
 * fresh `City` with the new piece appended, or the original city when
 * the target cell would overlap an already-occupied footprint cell.
 * Footprint validation (REQ-027) is applied here so the click handler
 * can rely on placement always returning a valid city.
 *
 * Rotation is also a pure helper: `nextRotation` advances a `Rotation`
 * by 90 degrees, wrapping `270 -> 0`. The editor uses it to drive the
 * rotate tool (REQ-021) without importing zod.
 *
 * Module is split out from the React client so it can be unit tested
 * without a JSX runtime; matches the pattern from `parseSlugParam`.
 */

export interface PaletteEntry {
  type: PieceType
  /** Human-readable label rendered in the palette button. */
  label: string
}

/**
 * v1 cardinal-only street palette (REQ-017). Ordering is the render
 * order. Future slices append `scurve` / `sweepRight` / etc as they
 * land (REQ-018), and the `intersection` / multi-cell / corner-connector
 * pieces in their own slices.
 */
export const STREET_PALETTE: readonly PaletteEntry[] = [
  { type: 'straight', label: 'Straight' },
  { type: 'left90', label: 'Left 90' },
  { type: 'right90', label: 'Right 90' },
]

/**
 * Default selected palette entry on first render.
 *
 * `straight` is the most common piece in any starter city loop, so it
 * is the lowest-friction default for first-time authors.
 */
export const DEFAULT_PALETTE_TYPE: PieceType = STREET_PALETTE[0].type

/**
 * The four allowed rotations for the editor (REQ-021). Order is the
 * cycle the rotate tool walks: `0 -> 90 -> 180 -> 270 -> 0`. Mirrors
 * `RotationSchema` literal order in `src/lib/schemas.ts`.
 */
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

/**
 * Default rotation for a freshly-selected palette entry.
 *
 * Most starter cities place pieces in their canonical orientation
 * before reaching for the rotate tool, so `0` is the lowest-friction
 * default.
 */
export const DEFAULT_ROTATION: Rotation = 0

/**
 * Advance a rotation by one 90-degree increment (REQ-021).
 *
 * Wraps from `270` back to `0` so the rotate tool cycles indefinitely
 * without the caller having to bounds-check. Pure and deterministic so
 * the editor can drive both a rotate button and the `R` keyboard
 * shortcut from the same helper.
 */
export function nextRotation(current: Rotation): Rotation {
  switch (current) {
    case 0:
      return 90
    case 90:
      return 180
    case 180:
      return 270
    case 270:
      return 0
  }
}

/**
 * Place a piece on the grid (REQ-020).
 *
 * Returns a fresh `City` with the new piece appended at `(row, col)`
 * and `rotation` (defaults to `0`). When the target piece's footprint
 * would overlap any cell already occupied by an existing piece, the
 * original city is returned unchanged so callers can branch on
 * identity equality (`next === city ? rejected : accepted`).
 *
 * Pieces are appended in placement order; deterministic ordering for
 * the persistence hash is handled by `hashCity` (REQ-013).
 */
export function placePiece(
  city: City,
  type: PieceType,
  row: number,
  col: number,
  rotation: Rotation = 0,
): City {
  const candidate: Piece = { type, row, col, rotation }
  const candidateCells = pieceFootprintCells(candidate)
  const occupied = occupiedPieceCells(city)
  for (const cell of candidateCells) {
    if (occupied.has(cellKey(cell.row, cell.col))) {
      return city
    }
  }
  return {
    ...city,
    pieces: [...city.pieces, candidate],
  }
}
