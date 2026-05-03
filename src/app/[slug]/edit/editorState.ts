import type { City, Piece, PieceType, Rotation } from '@/lib/schemas'
import { cellKey, occupiedPieceCells, pieceFootprintCells } from './snapGrid'

/**
 * Editor palette and placement helpers (REQ-017, REQ-020).
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
