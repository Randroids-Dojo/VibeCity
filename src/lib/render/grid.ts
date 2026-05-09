/**
 * Generic grid-cell primitives. Game-agnostic.
 *
 * The cell coordinate type and the stable map-key encoder are
 * reused everywhere a 2D grid of `(row, col)` cells needs a hash:
 * snap-grid editor, building collision, off-street penalty,
 * connector glyph lookup. Centralizing the helpers here lets every
 * surface agree on the same `${row},${col}` shape and lets future
 * games (or future grid surfaces in this game) avoid re-deriving
 * the type.
 */

/** Integer cell coordinate inside a 2D grid. Row + col can be negative. */
export interface GridCellCoord {
  row: number
  col: number
}

/**
 * Stable map key for a cell coordinate. Format: `${row},${col}`.
 * Mirrors VibeRacer's `cellKey` shape so any future port of
 * footprint helpers can reuse the same key.
 */
export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}
