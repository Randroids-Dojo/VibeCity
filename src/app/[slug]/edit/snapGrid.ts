import type { City, Piece, PieceFootprintCell } from '@/lib/schemas'

/**
 * Snap-grid configuration for the editor surface (REQ-016).
 *
 * The grid is a fixed-size square of cells centered on `(0, 0)`. Each
 * cell maps to one `(row, col)` coordinate in the city schema. Row
 * indices grow downward (south); column indices grow rightward (east),
 * matching VibeRacer's editor convention. Negative rows / cols are
 * legitimate cell coordinates so the grid extends in every direction
 * around the origin.
 *
 * Pixel sizing is local to the editor SVG render. The world-space
 * `CELL_SIZE` (in three.js units) used by the drive-mode scene lives
 * separately in the future scene module so the editor can size cells
 * for screen comfort without coupling to physics units.
 *
 * v1 picks `GRID_RADIUS = 8`, giving a 17 by 17 cell window (rows /
 * cols range `-8..8`). That is enough room for a small starter city
 * loop without forcing pan / zoom (REQ-024) into this slice. The
 * radius can grow without changing the schema; pieces outside the
 * visible window simply do not render in v1.
 */
export const GRID_RADIUS = 8
export const GRID_DIAMETER = GRID_RADIUS * 2 + 1
export const CELL_PIXELS = 32

export interface GridCellCoord {
  row: number
  col: number
}

/**
 * Stable map key for a cell coordinate. Mirrors VibeRacer's
 * `cellKey(row, col) = "${row},${col}"` format so any future port of
 * footprint helpers can reuse the same key shape.
 */
export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

/**
 * Default single-cell footprint used when a piece does not declare
 * its own. Mirrors the canonical default in REQ-059.
 */
const DEFAULT_FOOTPRINT: readonly PieceFootprintCell[] = [{ dr: 0, dc: 0 }]

/**
 * Resolve a piece's footprint to absolute cell coordinates on the
 * grid. Pieces with no `footprint` field expand to a single cell at
 * `(piece.row, piece.col)`.
 */
export function pieceFootprintCells(piece: Piece): GridCellCoord[] {
  const footprint = piece.footprint ?? DEFAULT_FOOTPRINT
  return footprint.map((cell) => ({
    row: piece.row + cell.dr,
    col: piece.col + cell.dc,
  }))
}

/**
 * Resolve every occupied cell across a city's pieces. Buildings are
 * not included here because v1 buildings are single-cell only (Q-004
 * default B); a future slice that wires building palette can extend
 * this helper as needed.
 *
 * Returns a `Set<string>` keyed by `cellKey` so future place / erase
 * slices can do constant-time occupancy checks (REQ-027).
 */
export function occupiedPieceCells(city: City): Set<string> {
  const out = new Set<string>()
  for (const piece of city.pieces) {
    for (const cell of pieceFootprintCells(piece)) {
      out.add(cellKey(cell.row, cell.col))
    }
  }
  return out
}

/**
 * Enumerate every cell coordinate in the visible grid window.
 * Order is row-major (top to bottom, left to right) so the SVG render
 * receives cells in a deterministic order.
 */
export function gridCells(): GridCellCoord[] {
  const out: GridCellCoord[] = []
  for (let row = -GRID_RADIUS; row <= GRID_RADIUS; row++) {
    for (let col = -GRID_RADIUS; col <= GRID_RADIUS; col++) {
      out.push({ row, col })
    }
  }
  return out
}

/**
 * Map a cell coordinate to its top-left pixel position inside the
 * SVG viewport. The viewport origin `(0, 0)` is the top-left corner
 * of the grid window, so cell `(-GRID_RADIUS, -GRID_RADIUS)` lands at
 * pixel `(0, 0)` and cell `(0, 0)` lands at the visual center.
 */
export function cellToPixel(cell: GridCellCoord): { x: number; y: number } {
  return {
    x: (cell.col + GRID_RADIUS) * CELL_PIXELS,
    y: (cell.row + GRID_RADIUS) * CELL_PIXELS,
  }
}

/**
 * The pixel size of the full grid window. Used to size the SVG
 * viewBox so the grid lines and origin marker land exactly on cell
 * boundaries.
 */
export const GRID_PIXEL_SIZE = GRID_DIAMETER * CELL_PIXELS
