import { pieceFootprintCells } from '@/app/[slug]/edit/snapGrid'
import type { City } from './schemas'
import {
  bboxNormalizedDots,
  type BboxPlacement,
  type NormalizedDot,
} from './render/thumbnail'

/**
 * VibeCity-specific thumbnail dot projection (F-011, REQ-050). Walks
 * the city's pieces (with footprints) and buildings to gather a
 * placement list, then delegates the bbox-to-normalized projection to
 * the generic `bboxNormalizedDots` helper in `@/lib/render/thumbnail`.
 *
 * The home page recent-cards (`src/app/page.tsx`) consume the result
 * to render the small SVG thumbnail next to each slug.
 */

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

export type ThumbnailDot = NormalizedDot<ThumbnailDotKind>

/**
 * Project a city's pieces and buildings into a normalized [0, 1] x
 * [0, 1] dot list for thumbnail rendering. Empty city returns an empty
 * list. A single placement collapses the bbox to a point and centers
 * the dot at (0.5, 0.5) so a one-piece city still reads as visible
 * activity rather than a degenerate corner dot.
 *
 * Each piece emits one dot per footprint cell via `pieceFootprintCells`,
 * so a multi-cell piece (mega sweep, hairpin) reads as the road shape it
 * actually covers rather than a single anchor dot. Buildings emit one
 * dot at their anchor cell (v1 buildings have no footprint field).
 */
export function cityThumbnailDots(city: City): ThumbnailDot[] {
  const placements: BboxPlacement<ThumbnailDotKind>[] = []
  for (const piece of city.pieces) {
    for (const cell of pieceFootprintCells(piece)) {
      placements.push({ row: cell.row, col: cell.col, kind: 'piece' })
    }
  }
  for (const building of city.buildings) {
    placements.push({
      row: building.row,
      col: building.col,
      kind: 'building',
    })
  }
  return bboxNormalizedDots(placements, { margin: THUMBNAIL_MARGIN })
}
