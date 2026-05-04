import type { City } from '@/lib/schemas'
import { cellKey, occupiedBuildingCells, occupiedPieceCells } from './snapGrid'
import type { PaletteCategory, ToolMode } from './editorState'

/**
 * Editor rejection-flash helper (REQ-027).
 *
 * Pure module that classifies a click as accepted or rejected against
 * the live city, palette category, and tool mode, and produces a
 * `RejectionFlash` value the SnapGridView paints as a brief overlay so
 * an author who clicked a no-op cell sees an immediate visible signal
 * that the click did nothing.
 *
 * The hover preview ghost (REQ-024 partial, `editorPreview.ts`) reads
 * the same occupancy rules ahead of the click; the rejection flash is
 * the post-click signal for the case where the author committed the
 * click anyway. The two helpers stay independent because the preview
 * ghost is per-cell and per-hover while the rejection flash needs an
 * id for the React key (so two consecutive rejections on the same cell
 * still re-trigger the animation).
 *
 * Two rejection kinds:
 *
 * - `place-occupied`: place mode click on a cell already occupied by a
 *   piece or a building. The reducer (`placePiece` / `placeBuilding`)
 *   returns the original city by identity equality. This is the REQ-027
 *   overlap rejection the spec calls out.
 * - `erase-empty`: erase mode click on a cell that holds no content the
 *   active palette category would erase. The reducer (`erasePiece` /
 *   `eraseBuilding`) returns the original city by identity equality.
 *   This mirrors the place-occupied case for the erase tool.
 *
 * The classifier reads the active palette category to mirror the
 * editor's two-array model (street vs building). A click on a cell that
 * carries a building while the active category is `street` is NOT a
 * rejection in the sense REQ-027 names: place mode would still reject
 * (both layers compete for the same cell), and erase mode would just be
 * a no-op for the street category. The classifier reports both
 * scenarios under the matching kind so the visible feedback is
 * consistent.
 */

/**
 * Time the rejection flash overlay stays visible. Short enough to not
 * delay the next click, long enough to read as a deliberate signal.
 */
export const REJECTION_FLASH_DURATION_MS = 350

/**
 * Fill color matches the place-invalid preview ghost (`#a3372a`) and
 * the active Erase button background so the rejection signal reads as
 * "the same color the editor uses for the no-go state".
 */
export const REJECTION_FLASH_FILL = '#a3372a'

/**
 * Stroke is a darker shade of the fill so the overlay's outline is
 * still visible on top of an already-filled occupied cell.
 */
export const REJECTION_FLASH_STROKE = '#7a2a20'

/**
 * Initial fill opacity at the start of the flash. The CSS animation
 * fades from this value to zero over `REJECTION_FLASH_DURATION_MS`.
 */
export const REJECTION_FLASH_FILL_OPACITY = 0.6

export type RejectionKind = 'place-occupied' | 'erase-empty'

export interface RejectionFlash {
  row: number
  col: number
  kind: RejectionKind
  /**
   * Monotonically increasing id so a fresh rejection on the same cell
   * produces a different React key, retriggering the CSS animation.
   * Wraps via `Number.MAX_SAFE_INTEGER` so a long editing session does
   * not run out of ids.
   */
  id: number
}

export interface RejectionInput {
  city: City
  category: PaletteCategory
  toolMode: ToolMode
  row: number
  col: number
}

/**
 * Resolve the rejection kind for a click against the live city, palette
 * category, and tool mode. Returns `null` when the click would be
 * accepted by the matching reducer (so the caller skips the flash).
 *
 * Pure function. No DOM, no randomness.
 */
export function rejectionKindForClick(
  input: RejectionInput,
): RejectionKind | null {
  const { city, category, toolMode, row, col } = input
  const target = cellKey(row, col)
  const pieces = occupiedPieceCells(city)
  const buildings = occupiedBuildingCells(city)
  if (toolMode === 'erase') {
    if (category === 'building') {
      return buildings.has(target) ? null : 'erase-empty'
    }
    return pieces.has(target) ? null : 'erase-empty'
  }
  if (pieces.has(target) || buildings.has(target)) {
    return 'place-occupied'
  }
  return null
}

/**
 * Compute the next monotonic id for a rejection flash. The wrap at
 * `Number.MAX_SAFE_INTEGER` keeps the value safe for use as a React
 * key over an arbitrarily long editing session.
 */
export function nextRejectionId(prev: number): number {
  if (!Number.isFinite(prev) || prev < 0) return 1
  if (prev >= Number.MAX_SAFE_INTEGER) return 1
  return prev + 1
}

/**
 * Build a `RejectionFlash` from a click input plus the previous id.
 * Returns `null` when the click would be accepted.
 */
export function rejectionFlashFromClick(
  input: RejectionInput,
  prevId: number,
): RejectionFlash | null {
  const kind = rejectionKindForClick(input)
  if (kind === null) return null
  return {
    row: input.row,
    col: input.col,
    kind,
    id: nextRejectionId(prevId),
  }
}
