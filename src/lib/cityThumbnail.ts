import type { City } from './schemas'

/**
 * Rendered thumbnail size in pixels (square). Drives both the SVG
 * `viewBox` and the consumer's CSS `width` / `height`. The home page
 * recent-card thumbnail (F-011) renders at this size so the cards stay
 * compact alongside the slug + relative-time labels.
 */
export const THUMBNAIL_SIZE_PX = 60

/**
 * Margin (in normalized [0, 1] units) around the thumbnail so a piece
 * sitting at the bbox edge does not crop against the card border. The
 * dots map into `[MARGIN, 1 - MARGIN]` rather than `[0, 1]`.
 */
export const THUMBNAIL_MARGIN = 0.08

/**
 * Per-dot radius in normalized units. Chosen so a typical 4x4 block
 * city reads as four distinct dots rather than blurring together.
 */
export const THUMBNAIL_DOT_RADIUS = 0.05

/** Distinguishes piece dots (streets) from building dots so consumers can color them differently. */
export type ThumbnailDotKind = 'piece' | 'building'

export interface ThumbnailDot {
  /** Normalized x in [0, 1] (column axis). */
  xNorm: number
  /** Normalized y in [0, 1] (row axis). */
  yNorm: number
  kind: ThumbnailDotKind
}

/**
 * Project a city's pieces and buildings into a normalized [0, 1] x
 * [0, 1] dot list for thumbnail rendering. Empty city returns an empty
 * list. A single placement collapses the bbox to a point and centers
 * the dot at (0.5, 0.5) so a one-piece city still reads as visible
 * activity rather than a degenerate corner dot.
 *
 * The mapping uses each placement's anchor cell only; multi-cell
 * footprints (mega sweep, hairpin) project as a single dot to keep
 * the thumbnail at-a-glance simple. A future polish slice can extend
 * this to walk every footprint cell.
 */
export function cityThumbnailDots(city: City): ThumbnailDot[] {
  const placements: { row: number; col: number; kind: ThumbnailDotKind }[] = []
  for (const piece of city.pieces) {
    placements.push({ row: piece.row, col: piece.col, kind: 'piece' })
  }
  for (const building of city.buildings) {
    placements.push({
      row: building.row,
      col: building.col,
      kind: 'building',
    })
  }
  if (placements.length === 0) return []

  let minRow = placements[0].row
  let maxRow = placements[0].row
  let minCol = placements[0].col
  let maxCol = placements[0].col
  for (const p of placements) {
    if (p.row < minRow) minRow = p.row
    if (p.row > maxRow) maxRow = p.row
    if (p.col < minCol) minCol = p.col
    if (p.col > maxCol) maxCol = p.col
  }
  const rowSpan = maxRow - minRow
  const colSpan = maxCol - minCol
  const usable = 1 - THUMBNAIL_MARGIN * 2

  return placements.map((p) => {
    const xNorm =
      colSpan === 0
        ? 0.5
        : THUMBNAIL_MARGIN + ((p.col - minCol) / colSpan) * usable
    const yNorm =
      rowSpan === 0
        ? 0.5
        : THUMBNAIL_MARGIN + ((p.row - minRow) / rowSpan) * usable
    return { xNorm, yNorm, kind: p.kind }
  })
}
