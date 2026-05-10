import type { PieceType, Rotation } from '@/lib/schemas'
import {
  CELL_HALF_PIXELS,
  GLYPH_RADIUS_PIXELS,
  pieceConnectorGlyphs,
} from './connectorGlyphs'
import { CELL_PIXELS, defaultFootprintForPiece } from './snapGrid'

/**
 * Small SVG preview of an armed piece at its current rotation.
 *
 * Renders the piece's footprint cells as faint outlines plus its
 * connector glyphs (cardinal vs corner) so a builder picking from the
 * palette sees the actual shape and orientation of the piece they have
 * armed before they hover or click anywhere on the grid.
 *
 * Pure presentational: takes a piece type + rotation, computes a
 * bounding-box viewBox from `pieceConnectorGlyphs` plus the canonical
 * footprint, and renders. Reuses the same connector geometry as the
 * snap-grid so the preview stays in lockstep with the placement
 * rendering.
 *
 * Multi-cell pieces (mega sweep, hairpin) read at the same scale as
 * single-cell pieces because the viewBox grows with the footprint;
 * the consuming `<svg width=... height=...>` attributes pin the
 * on-screen size.
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
  const glyphs = pieceConnectorGlyphs(piece, -1)

  const cellPixelCenters = footprint.map((cell) => ({
    x: (cell.dc + 0) * CELL_PIXELS + CELL_HALF_PIXELS,
    y: (cell.dr + 0) * CELL_PIXELS + CELL_HALF_PIXELS,
  }))

  // Translate `pieceConnectorGlyphs` output into the same local frame
  // (it adds `GRID_RADIUS * CELL_PIXELS` because it expects to live on
  // the snap grid; the preview tile lives on its own).
  const GRID_OFFSET_PX = -((0 + 8) * CELL_PIXELS) // GRID_RADIUS = 8
  const glyphPoints = glyphs.map((glyph) => ({
    x: glyph.x + GRID_OFFSET_PX,
    y: glyph.y + GRID_OFFSET_PX,
    kind: glyph.kind,
  }))

  const points = [...cellPixelCenters, ...glyphPoints]
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs) - CELL_HALF_PIXELS
  const minY = Math.min(...ys) - CELL_HALF_PIXELS
  const maxX = Math.max(...xs) + CELL_HALF_PIXELS
  const maxY = Math.max(...ys) + CELL_HALF_PIXELS
  const w = maxX - minX
  const h = maxY - minY

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
      {cellPixelCenters.map((cell, i) => (
        <rect
          key={`cell-${i}`}
          x={cell.x - CELL_HALF_PIXELS}
          y={cell.y - CELL_HALF_PIXELS}
          width={CELL_PIXELS}
          height={CELL_PIXELS}
          fill="#f5deb3"
          fillOpacity={0.35}
          stroke="#5a4a2a"
          strokeWidth={1}
        />
      ))}
      {glyphPoints.map((glyph, i) => (
        <circle
          key={`glyph-${i}`}
          cx={glyph.x}
          cy={glyph.y}
          r={GLYPH_RADIUS_PIXELS}
          fill={glyph.kind === 'cardinal' ? '#f5deb3' : '#ffe4b5'}
          stroke="#5a4a2a"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  )
}
