/**
 * Generic bbox-to-normalized-dots projector. Game-agnostic.
 *
 * Takes a list of grid-cell placements `(row, col, kind)` and returns
 * a normalized dot list in `[0, 1] x [0, 1]` suitable for rendering as
 * a small thumbnail SVG. Future games (e.g. a VibeRacer track preview)
 * can reuse the bbox / margin / single-placement-centering logic by
 * supplying their own placement gather.
 *
 * Behavior:
 *   - Empty input -> empty output.
 *   - Single placement (or all placements collapsed to one cell along
 *     an axis) centers that axis at 0.5 so the rendered dot reads as
 *     visible activity rather than a degenerate corner dot.
 *   - Multi-cell placements are projected linearly into
 *     `[margin, 1 - margin]` so dots near the bbox edge do not crop
 *     against the consumer's card border.
 *
 * The kind tag flows through unchanged so the caller can color each
 * dot per kind in its own render layer.
 */

export interface BboxPlacement<Kind extends string> {
  row: number
  col: number
  kind: Kind
}

export interface NormalizedDot<Kind extends string> {
  /** Normalized x in [0, 1] (column axis). */
  xNorm: number
  /** Normalized y in [0, 1] (row axis). */
  yNorm: number
  kind: Kind
}

export interface BboxNormalizedDotsOptions {
  /**
   * Margin (in normalized [0, 1] units) around the bbox so a dot
   * sitting at the edge does not crop against the card border. Dots
   * map into `[margin, 1 - margin]` rather than `[0, 1]`.
   */
  margin: number
}

/**
 * Project a placement list into a normalized dot list. See module
 * docstring for the bbox / margin / single-placement contract.
 */
export function bboxNormalizedDots<Kind extends string>(
  placements: ReadonlyArray<BboxPlacement<Kind>>,
  options: BboxNormalizedDotsOptions,
): NormalizedDot<Kind>[] {
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
  const margin = options.margin
  const usable = 1 - margin * 2

  return placements.map((p) => {
    const xNorm =
      colSpan === 0 ? 0.5 : margin + ((p.col - minCol) / colSpan) * usable
    const yNorm =
      rowSpan === 0 ? 0.5 : margin + ((p.row - minRow) / rowSpan) * usable
    return { xNorm, yNorm, kind: p.kind }
  })
}
