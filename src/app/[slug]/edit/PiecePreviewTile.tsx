import type { PieceType, Rotation } from '@/lib/schemas'
import { CELL_PIXELS, defaultFootprintForPiece } from './snapGrid'
import { PieceGlyph } from './PieceGlyph'

/**
 * Small SVG preview of an armed piece at its current rotation.
 *
 * Renders the piece's actual gray-road SVG glyph (via `<PieceGlyph />`)
 * scaled into a fixed `sizePx` square so a builder picking from the
 * palette sees the real piece shape and orientation before they hover
 * or click anywhere on the grid. Multi-cell pieces (mega sweep,
 * hairpin) grow the viewBox to cover the canonical footprint so the
 * shape fits the tile at the same scale as the snap-grid placement
 * render.
 *
 * Pure presentational: takes a piece type + rotation, computes a
 * footprint-driven viewBox, and delegates to `<PieceGlyph />` for the
 * actual path data. Reusing `<PieceGlyph />` keeps the tile in
 * lockstep with the snap-grid rendering.
 */
export interface PiecePreviewTileProps {
  type: PieceType
  rotation: Rotation
  /** Square pixel size of the rendered SVG. Defaults to 56. */
  sizePx?: number
}

const DEFAULT_SIZE_PX = 56

export function PiecePreviewTile({
  type,
  rotation,
  sizePx = DEFAULT_SIZE_PX,
}: PiecePreviewTileProps) {
  const piece = { type, rotation, row: 0, col: 0 }
  const footprint = defaultFootprintForPiece(piece)

  // ViewBox covers the bounding box of the canonical footprint cells
  // (each cell is CELL_PIXELS x CELL_PIXELS at the cell's top-left).
  // Multi-cell pieces grow the box; single-cell pieces stay at one
  // CELL_PIXELS box. A small margin lets paths that overshoot the
  // anchor cell (e.g. mega-sweep control points) render without clip.
  const drs = footprint.map((cell) => cell.dr)
  const dcs = footprint.map((cell) => cell.dc)
  const minDr = Math.min(...drs)
  const maxDr = Math.max(...drs)
  const minDc = Math.min(...dcs)
  const maxDc = Math.max(...dcs)

  const margin = CELL_PIXELS * 0.25
  const minX = minDc * CELL_PIXELS - margin
  const minY = minDr * CELL_PIXELS - margin
  const w = (maxDc - minDc + 1) * CELL_PIXELS + margin * 2
  const h = (maxDr - minDr + 1) * CELL_PIXELS + margin * 2

  return (
    <svg
      data-testid="editor-armed-piece-preview"
      data-armed-piece-type={type}
      data-rotation={rotation}
      width={sizePx}
      height={sizePx}
      viewBox={`${minX} ${minY} ${w} ${h}`}
      role="img"
      aria-label={`Armed piece: ${type} at ${rotation} degrees`}
      style={{ display: 'block' }}
    >
      <PieceGlyph type={type} rotation={rotation} />
    </svg>
  )
}
