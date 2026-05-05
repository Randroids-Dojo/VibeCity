import type { City, PieceType, Rotation } from '@/lib/schemas'
import {
  cellKey,
  defaultFootprintForPiece,
  occupiedBuildingCells,
  occupiedPieceCells,
  pieceFootprintCells,
} from './snapGrid'
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
 * Multi-cell preview (REQ-059): the legacy `previewKindFor` helper
 * resolves a single hovered cell. Multi-cell street pieces (mega
 * sweep, hairpin) need every footprint cell of the candidate
 * placement to render a ghost so the author sees the full reach of
 * the piece before clicking. The companion helper `previewCellsFor`
 * resolves the full footprint and returns one `PreviewCell` per cell;
 * `previewKindFor` stays the canonical anchor-cell resolver so the
 * existing data attribute mirrors and reducer-aligned single-cell
 * tests continue to read off it.
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

/**
 * Input shape for the multi-cell preview resolver (REQ-059).
 *
 * `activePieceType` and `activeRotation` describe the currently-selected
 * street piece in the palette. The resolver projects the piece's
 * canonical footprint at the rotation onto the hovered anchor cell so
 * the editor surfaces the full reach of a mega sweep / hairpin / future
 * arc45 / diagonal placement before the click lands.
 *
 * The fields are optional so a caller (the building category, or a
 * future caller that wants the legacy single-cell ghost) can pass only
 * the anchor data and get the single-cell behavior back. When both are
 * undefined, the resolver collapses to a single-cell ghost matching
 * `previewKindFor`'s output.
 */
export interface PreviewCellsInput extends PreviewCellInput {
  activePieceType?: PieceType
  activeRotation?: Rotation
}

/**
 * Resolve every preview cell the next click would touch (REQ-059).
 *
 * Multi-cell street pieces (mega sweep, hairpin, future arc45 /
 * diagonal multi-cell variants) project their canonical rotated
 * footprint onto the hovered anchor cell so the ghost reads out the
 * full reach of a placement. Erase mode in the street category expands
 * to the matched piece's full footprint so a hover on any cell of a
 * multi-cell piece highlights the whole piece that the click would
 * remove. Building category and erase-empty cases collapse to a single
 * cell matching the legacy `previewKindFor` shape.
 *
 * Place-mode multi-cell behavior: every cell of the candidate footprint
 * is checked against the city's occupied piece and building cells. If
 * any cell is already occupied, every cell of the candidate footprint
 * reads `place-invalid` so the rejection is visually consistent across
 * the whole footprint. Otherwise every cell reads `place-valid`.
 *
 * Erase-mode multi-cell behavior: when the hovered cell carries a piece
 * in street category, the matched piece's footprint cells are returned
 * with `erase-target`. When the hovered cell is empty (or carries
 * content the active category cannot erase), the result collapses to a
 * single `erase-empty` cell.
 *
 * Returns a fresh array on every call so callers cannot mutate cached
 * state. The first cell of the array is always the hovered anchor cell
 * (matches the legacy `previewKindFor` resolver) so callers that mirror
 * `data-preview-row` / `data-preview-col` for the SVG root do not need
 * to track the anchor separately.
 */
export function previewCellsFor(input: PreviewCellsInput): PreviewCell[] {
  const { city, category, toolMode, row, col, activePieceType, activeRotation } =
    input
  const anchorKind = previewKindFor({ city, category, toolMode, row, col })

  // Erase mode in street category expands to the matched piece's full
  // footprint when the click would erase a multi-cell piece.
  if (toolMode === 'erase' && category === 'street' && anchorKind === 'erase-target') {
    const target = cellKey(row, col)
    const match = city.pieces.find((piece) => {
      for (const cell of pieceFootprintCells(piece)) {
        if (cellKey(cell.row, cell.col) === target) return true
      }
      return false
    })
    if (match) {
      const cells = pieceFootprintCells(match)
      return reorderAnchorFirst(
        cells.map((cell) => ({
          row: cell.row,
          col: cell.col,
          kind: 'erase-target' as PreviewKind,
        })),
        row,
        col,
      )
    }
  }

  // Place mode in street category with a multi-cell piece selected
  // expands to the candidate piece's rotated footprint.
  if (
    toolMode === 'place' &&
    category === 'street' &&
    activePieceType !== undefined &&
    activeRotation !== undefined
  ) {
    const candidate = {
      type: activePieceType,
      rotation: activeRotation,
    }
    const footprint = defaultFootprintForPiece(candidate)
    if (footprint.length > 1) {
      const candidateCells = footprint.map((c) => ({
        row: row + c.dr,
        col: col + c.dc,
      }))
      const occupiedPieces = occupiedPieceCells(city)
      const occupiedBuildings = occupiedBuildingCells(city)
      const collides = candidateCells.some((cell) => {
        const key = cellKey(cell.row, cell.col)
        return occupiedPieces.has(key) || occupiedBuildings.has(key)
      })
      const cellKind: PreviewKind = collides ? 'place-invalid' : 'place-valid'
      return reorderAnchorFirst(
        candidateCells.map((cell) => ({
          row: cell.row,
          col: cell.col,
          kind: cellKind,
        })),
        row,
        col,
      )
    }
  }

  // Default: single-cell ghost matching the legacy resolver.
  return [{ row, col, kind: anchorKind }]
}

/**
 * Move the cell that matches `(anchorRow, anchorCol)` to the head of
 * the array so the first element is always the hovered cell. Stable
 * order across calls (matches the input order for everything else) so
 * a caller can rely on the array shape for diff display or testing.
 */
function reorderAnchorFirst(
  cells: PreviewCell[],
  anchorRow: number,
  anchorCol: number,
): PreviewCell[] {
  const idx = cells.findIndex(
    (cell) => cell.row === anchorRow && cell.col === anchorCol,
  )
  if (idx <= 0) return cells
  const out = [...cells]
  const [anchor] = out.splice(idx, 1)
  out.unshift(anchor)
  return out
}
