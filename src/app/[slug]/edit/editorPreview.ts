import type { City } from '@/lib/schemas'
import { cellKey, occupiedBuildingCells, occupiedPieceCells } from './snapGrid'
import type { PaletteCategory, ToolMode } from './editorState'

/**
 * Editor hover preview helper.
 *
 * Computes a `PreviewKind` for a hovered cell so the snap-grid can
 * render a ghost overlay communicating what would happen on a click
 * before the click lands. Pure module so the React client can consume
 * it without coupling to JSX or DOM events.
 *
 * The preview kinds map directly onto the cell-click contract enforced
 * by the place / erase reducers in `editorState.ts`:
 *
 * - `place-valid`: place mode. The hovered cell is empty so the next
 *   click would call `placePiece` / `placeBuilding` and the reducer
 *   would return a fresh city. Renders the ghost in the active palette
 *   color.
 * - `place-invalid`: place mode. The hovered cell is already occupied
 *   by either a piece or a building (under either palette category) so
 *   the reducer would short-circuit and return the original city. The
 *   ghost renders in a warning color so the author sees the rejection
 *   ahead of the click.
 * - `erase-target`: erase mode. The hovered cell carries content the
 *   active palette category would erase (a piece in street mode, a
 *   building in building mode). Click would remove that content. The
 *   ghost renders in the erase-warning color so the author sees the
 *   pending removal.
 * - `erase-empty`: erase mode. The hovered cell carries no content the
 *   active category would erase (or carries content owned by the other
 *   category). Click would be a no-op. The ghost renders in a muted
 *   "no change" color so the author sees the click would not do
 *   anything.
 *
 * Multi-cell footprint validation (REQ-059) lives outside this module.
 * v1's palette ships single-cell pieces only; when multi-cell pieces
 * land, this helper grows to accept the candidate footprint and
 * return a per-cell map. Until then a single hovered cell is enough.
 */
export type PreviewKind =
  | 'place-valid'
  | 'place-invalid'
  | 'erase-target'
  | 'erase-empty'

export interface PreviewCellInput {
  city: City
  category: PaletteCategory
  toolMode: ToolMode
  row: number
  col: number
}

export interface PreviewCell {
  row: number
  col: number
  kind: PreviewKind
}

/**
 * Resolve the `PreviewKind` for a hovered cell against the active
 * city, palette category, and tool mode. Pure function: no DOM, no
 * randomness.
 */
export function previewKindFor(input: PreviewCellInput): PreviewKind {
  const { city, category, toolMode, row, col } = input
  const target = cellKey(row, col)
  const pieces = occupiedPieceCells(city)
  const buildings = occupiedBuildingCells(city)
  if (toolMode === 'erase') {
    if (category === 'building') {
      return buildings.has(target) ? 'erase-target' : 'erase-empty'
    }
    return pieces.has(target) ? 'erase-target' : 'erase-empty'
  }
  // place mode: any cell already occupied by piece or building blocks
  // both street and building placement (the reducers enforce the same
  // rule). The ghost mirrors that rule so the visual feedback never
  // disagrees with the reducer's accept / reject decision.
  if (pieces.has(target) || buildings.has(target)) {
    return 'place-invalid'
  }
  return 'place-valid'
}

/**
 * Stable fill color for the preview ghost. The colors are chosen to
 * sit between the existing piece (`#7d6b4a`) and building (`#6b7d4a`)
 * fills so the ghost reads as a translucent layer rather than a solid
 * occupied cell. Erase target uses a muted red close to the active
 * Erase button background for obvious visual continuity.
 */
export const PREVIEW_FILL: Record<PreviewKind, string> = {
  'place-valid': '#7d6b4a',
  'place-invalid': '#a3372a',
  'erase-target': '#a3372a',
  'erase-empty': '#9a9a9a',
}

/**
 * Stroke color for the preview ghost outline. Slightly darker than
 * the fill so the ghost reads at the cell boundary even on top of an
 * already-filled occupied cell.
 */
export const PREVIEW_STROKE: Record<PreviewKind, string> = {
  'place-valid': '#5e4f33',
  'place-invalid': '#7a2a20',
  'erase-target': '#7a2a20',
  'erase-empty': '#6f6f6f',
}

/**
 * Fill opacity for the preview ghost. Translucent so the underlying
 * cell color (origin highlight, occupied piece, or empty) still reads
 * through the ghost. The erase-empty kind is more transparent because
 * a no-op should feel softer than a pending mutation.
 */
export const PREVIEW_FILL_OPACITY: Record<PreviewKind, number> = {
  'place-valid': 0.45,
  'place-invalid': 0.45,
  'erase-target': 0.5,
  'erase-empty': 0.25,
}
