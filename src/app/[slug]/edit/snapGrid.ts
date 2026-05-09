import type { City, Piece, PieceFootprintCell, Rotation } from '@/lib/schemas'
import { cellKey, type GridCellCoord } from '@/lib/render/grid'

// Re-export the generic cell-coord type and stable map-key helper so
// downstream modules that already import them from this file do not
// have to learn the new lib path.
export { cellKey, type GridCellCoord }

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

/**
 * Default single-cell footprint used when a piece does not declare
 * its own and its `type` does not carry a multi-cell default. Mirrors
 * the canonical default in REQ-059.
 */
const DEFAULT_FOOTPRINT: readonly PieceFootprintCell[] = [{ dr: 0, dc: 0 }]

/**
 * Canonical footprint for `megaSweepRight` at rotation 0 (REQ-058).
 *
 * The mega sweep occupies a 2x2 block of cells. The anchor cell is the
 * bottom-right of the block, so the offsets reach back and up to fill
 * the 2x2 footprint while the connectors hang off the south and east
 * edges (the `S -> E` connector pattern from VibeRacer's track entry).
 * Ported from VibeRacer's `MEGA_SWEEP_RIGHT_FOOTPRINT` (PR #80).
 */
export const MEGA_SWEEP_RIGHT_FOOTPRINT: readonly PieceFootprintCell[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 0 },
]

/**
 * Canonical footprint for `megaSweepLeft` at rotation 0 (REQ-058).
 *
 * Mirror of `MEGA_SWEEP_RIGHT_FOOTPRINT` across the north-south axis.
 * The anchor cell is the bottom-left of the 2x2 block, so the offsets
 * reach back and right to fill the 2x2 footprint while the connectors
 * hang off the south and east edges (the `S -> W` connector pattern
 * from VibeRacer's track entry). Ported from VibeRacer's
 * `MEGA_SWEEP_LEFT_FOOTPRINT` (PR #80).
 */
export const MEGA_SWEEP_LEFT_FOOTPRINT: readonly PieceFootprintCell[] = [
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: 0 },
  { dr: 0, dc: 1 },
]

/**
 * Canonical footprint for `hairpin` at rotation 0 (REQ-060).
 *
 * The hairpin is a 180deg U-turn that occupies a 2x3 block of cells. The
 * anchor cell sits at the middle row of the block's left column so the
 * canonical port pair `(dr: -1, dc: 0)` and `(dr: 1, dc: 0)` (both facing
 * west, see `connectorPortsOf` in `src/lib/connectors.ts`) hangs off the
 * top-left and bottom-left footprint cells. The block reaches one row
 * up, one row down, and one column right of the anchor so a hairpin at
 * `(row, col)` covers cells
 * `{ (row - 1, col), (row - 1, col + 1), (row, col), (row, col + 1),
 *   (row + 1, col), (row + 1, col + 1) }`. Ported from VibeRacer's
 * `HAIRPIN_FOOTPRINT` (PR #81).
 */
export const HAIRPIN_FOOTPRINT: readonly PieceFootprintCell[] = [
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
]

/**
 * Rotate a footprint clockwise by `rotation` degrees around the anchor
 * cell. Rotation is in 90deg increments; non-cardinal values would
 * mean the schema accepted an invalid `Rotation` and that is a bug
 * upstream so this helper is allowed to walk the canonical cycle.
 *
 * Mirrors VibeRacer's `rotateFootprintByRotation` (trackFootprint.ts).
 * The 90deg clockwise step `(dr, dc) -> (dc, -dr)` matches the
 * editor's canonical clockwise rotation direction so the visual
 * footprint after a 90deg rotate-tool press lines up with the visible
 * piece glyph. `-0` collapses to `0` so two pieces that resolve to the
 * same footprint always produce equal cell objects.
 */
function rotateFootprint(
  footprint: readonly PieceFootprintCell[],
  rotation: Rotation,
): PieceFootprintCell[] {
  let cells = footprint.map((c) => ({ dr: c.dr, dc: c.dc }))
  const steps = rotation / 90
  for (let i = 0; i < steps; i++) {
    cells = cells.map((cell) => ({
      dr: cell.dc,
      dc: -cell.dr,
    }))
  }
  return cells.map((cell) => ({
    dr: Object.is(cell.dr, -0) ? 0 : cell.dr,
    dc: Object.is(cell.dc, -0) ? 0 : cell.dc,
  }))
}

/**
 * Resolve a piece's canonical default footprint from its `type` and
 * `rotation` (REQ-058, REQ-059, REQ-060).
 *
 * Used by `pieceFootprintCells` when a piece has no explicit
 * `footprint` field. Multi-cell pieces (`megaSweepRight` /
 * `megaSweepLeft`, `hairpin`) return their canonical offsets rotated
 * by the piece's `rotation`. Single-cell pieces return the canonical
 * single `[{ dr: 0, dc: 0 }]` so a hand-edited or future-imported city
 * with the field omitted continues to be treated as a single anchor
 * cell.
 *
 * Future multi-cell pieces extend this resolver rather than the schema;
 * the schema's `footprint` field is the override path for hand-authored
 * or imported cities that want to record a non-canonical shape.
 */
export function defaultFootprintForPiece(
  piece: Pick<Piece, 'type' | 'rotation'>,
): readonly PieceFootprintCell[] {
  switch (piece.type) {
    case 'megaSweepRight':
      return rotateFootprint(MEGA_SWEEP_RIGHT_FOOTPRINT, piece.rotation)
    case 'megaSweepLeft':
      return rotateFootprint(MEGA_SWEEP_LEFT_FOOTPRINT, piece.rotation)
    case 'hairpin':
      return rotateFootprint(HAIRPIN_FOOTPRINT, piece.rotation)
    default:
      return DEFAULT_FOOTPRINT
  }
}

/**
 * Resolve a piece's footprint to absolute cell coordinates on the
 * grid. Pieces with no `footprint` field fall back to the type-driven
 * default from `defaultFootprintForPiece`; single-cell types resolve
 * to a single anchor cell, multi-cell types (mega sweep, hairpin)
 * resolve to their canonical rotated footprint.
 */
export function pieceFootprintCells(piece: Piece): GridCellCoord[] {
  const footprint = piece.footprint ?? defaultFootprintForPiece(piece)
  return footprint.map((cell) => ({
    row: piece.row + cell.dr,
    col: piece.col + cell.dc,
  }))
}

/**
 * Resolve every occupied cell across a city's pieces. Buildings live
 * in the parallel `occupiedBuildingCells` helper because the editor
 * renders them with a distinct visual treatment and the place / erase
 * reducers gate on which array the active palette category is
 * mutating.
 *
 * Returns a `Set<string>` keyed by `cellKey` so the place / erase
 * reducers can do constant-time occupancy checks (REQ-027).
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
 * Resolve every occupied cell across a city's buildings (REQ-028,
 * REQ-029). v1 buildings are single-cell (Q-004 default B), so the
 * cell key is just `(row, col)` for each building. Returned as a
 * `Set<string>` keyed by `cellKey` for the same constant-time
 * occupancy lookups that `occupiedPieceCells` supports.
 */
export function occupiedBuildingCells(city: City): Set<string> {
  const out = new Set<string>()
  for (const building of city.buildings) {
    out.add(cellKey(building.row, building.col))
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
