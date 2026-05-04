import type { Piece } from '@/lib/schemas'
import {
  DIR_OFFSETS,
  connectorPortsOf,
  isCardinal,
  type Dir,
} from '@/lib/connectors'
import { CELL_PIXELS, GRID_RADIUS } from './snapGrid'

/**
 * Connector glyph helpers for the editor SVG (REQ-019, REQ-063).
 *
 * Each placed piece has one or more connector ports (REQ-063). A glyph
 * is the on-screen marker that shows where that port is and which
 * compass direction it faces, so an author can predict whether two
 * adjacent pieces will link before placing the second piece.
 *
 * Pure pixel-space helpers so the SnapGridView can render the markers
 * without re-deriving the math, and the unit tests can assert against
 * raw numbers without a JSX runtime. Coordinate space is the editor
 * SVG (top-left origin, +x rightward, +y downward) so positions
 * compose with `cellToPixel` from `snapGrid.ts`.
 *
 * The `kind` field exposes whether a connector is cardinal (N / E / S
 * / W) or corner (NE / SE / SW / NW) so the renderer can swap glyph
 * styles. v1 renders cardinal connectors as small triangles pointing
 * outward at the cell-edge midpoint and corner connectors as small
 * diamonds at the cell-edge corner; both share the same outward-along-
 * direction position.
 */

/**
 * Half a cell width in pixels. Cardinal connectors anchor at the
 * edge-midpoint of their footprint cell and corner connectors anchor
 * at the corner; both offsets reach `CELL_HALF_PIXELS` from the cell
 * center along the compass direction.
 */
export const CELL_HALF_PIXELS = CELL_PIXELS / 2

/**
 * Glyph radius in pixels. Half a cell would crowd the cell so v1 picks
 * a third of a cell which leaves the cell glyph (the brown fill)
 * dominant while still rendering clearly at the default zoom.
 */
export const GLYPH_RADIUS_PIXELS = CELL_PIXELS / 6

/**
 * Glyph kind. Cardinal connectors face N / E / S / W and live at the
 * edge midpoint of their footprint cell; corner connectors face the
 * four diagonals and live at the cell corner.
 */
export type ConnectorGlyphKind = 'cardinal' | 'corner'

export interface ConnectorGlyph {
  /** Pixel x position of the glyph center inside the SVG viewBox. */
  x: number
  /** Pixel y position of the glyph center inside the SVG viewBox. */
  y: number
  /** Compass direction the connector faces (REQ-063 `Dir` 0..7). */
  dir: Dir
  /** Cardinal vs corner classification. */
  kind: ConnectorGlyphKind
  /** Source piece's index inside the city's `pieces` array. */
  pieceIndex: number
  /** Footprint cell offset the port lives on. */
  cellRow: number
  /** Footprint cell offset the port lives on. */
  cellCol: number
}

/**
 * Map an absolute cell coordinate to its SVG-pixel center. The cell
 * top-left is at `(col + GRID_RADIUS) * CELL_PIXELS`, so the center is
 * half a cell further along each axis.
 */
function cellCenterPixel(row: number, col: number): { x: number; y: number } {
  return {
    x: (col + GRID_RADIUS) * CELL_PIXELS + CELL_HALF_PIXELS,
    y: (row + GRID_RADIUS) * CELL_PIXELS + CELL_HALF_PIXELS,
  }
}

/**
 * Resolve every connector glyph for a single placed piece.
 *
 * The piece's anchor cell `(piece.row, piece.col)` plus each port's
 * footprint offset `(dr, dc)` resolves the absolute cell the port
 * lives on. The glyph center sits at the cell center plus a half-cell
 * step along the compass direction so the marker reads as "this edge"
 * rather than "this cell".
 *
 * Returns a fresh array on every call so callers cannot mutate cached
 * glyph state.
 */
export function pieceConnectorGlyphs(
  piece: Piece,
  pieceIndex: number,
): ConnectorGlyph[] {
  const ports = connectorPortsOf(piece)
  return ports.map((port) => {
    const cellRow = piece.row + port.dr
    const cellCol = piece.col + port.dc
    const center = cellCenterPixel(cellRow, cellCol)
    const offset = DIR_OFFSETS[port.dir]
    return {
      x: center.x + offset.dc * CELL_HALF_PIXELS,
      y: center.y + offset.dr * CELL_HALF_PIXELS,
      dir: port.dir,
      kind: isCardinal(port.dir) ? 'cardinal' : 'corner',
      pieceIndex,
      cellRow,
      cellCol,
    }
  })
}

/**
 * Resolve every connector glyph across an entire city. Pieces are
 * walked in placement order and each glyph carries its source piece
 * index so the renderer can attach a stable React key.
 */
export function cityConnectorGlyphs(pieces: readonly Piece[]): ConnectorGlyph[] {
  const out: ConnectorGlyph[] = []
  pieces.forEach((piece, index) => {
    for (const glyph of pieceConnectorGlyphs(piece, index)) {
      out.push(glyph)
    }
  })
  return out
}

/**
 * Compass label per direction. Used by the renderer for the glyph's
 * `data-connector-dir` attribute and by tests for readable assertions.
 */
export const CONNECTOR_DIR_LABEL: Record<Dir, string> = {
  0: 'N',
  1: 'NE',
  2: 'E',
  3: 'SE',
  4: 'S',
  5: 'SW',
  6: 'W',
  7: 'NW',
}
