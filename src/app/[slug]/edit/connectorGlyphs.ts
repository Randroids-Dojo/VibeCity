import type { Piece } from '@/lib/schemas'
import {
  DIR_OFFSETS,
  connectorPortsOf,
  isCardinal,
  opposite,
  type Dir,
} from '@/lib/connectors'
import type { UnmatchedPort } from '@/lib/trackPath'
import { CELL_PIXELS, GRID_RADIUS, cellKey } from './snapGrid'

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
type ConnectorGlyphKind = 'cardinal' | 'corner'

/**
 * Cross-piece connector match status (REQ-019, REQ-063).
 *
 * `matched`: the port faces an opposing port on a neighbor piece, so
 * the two pieces will link as a continuous street segment.
 *
 * `open`: the port faces empty space, the grid edge, or a neighbor cell
 * that does not expose an opposing port. The author needs to add or
 * rotate a piece on the neighbor cell for the link to form.
 *
 * The classification is purely geometric: it walks each glyph's
 * neighbor cell along the compass direction and checks whether any
 * placed piece has a port at exactly that cell with `opposite(dir)`.
 * It does not gate placement, autosave, or drive-mode rendering; the
 * editor just paints matched glyphs with a sage-green stroke so the
 * author can predict link behavior at a glance.
 */
type ConnectorMatchStatus = 'matched' | 'open'

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
  /** Match status against the city's other placed pieces. */
  status: ConnectorMatchStatus
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
 * Build a port lookup keyed by `cellKey(row, col):dir`. Each entry
 * records the source piece index so a future caller can render a port
 * trace back to its piece. The map is internal; `cityConnectorGlyphs`
 * reads it once to classify every glyph's match status against every
 * other piece's ports.
 *
 * A single cell can carry multiple ports (e.g. an `intersection` has
 * four ports on one cell), so the key is `cellKey:dir` rather than
 * just `cellKey`. When two pieces somehow expose ports in the same
 * cell with the same direction (an invariant the place reducer
 * prevents but a hand-edited city could violate), the lookup keeps the
 * earlier-placed port so the match is deterministic.
 */
function cityPortIndex(
  pieces: readonly Piece[],
): Map<string, number> {
  const out = new Map<string, number>()
  pieces.forEach((piece, index) => {
    for (const port of connectorPortsOf(piece)) {
      const cellRow = piece.row + port.dr
      const cellCol = piece.col + port.dc
      const key = `${cellKey(cellRow, cellCol)}:${port.dir}`
      if (!out.has(key)) {
        out.set(key, index)
      }
    }
  })
  return out
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
 * The match status is computed against the optional `cityPorts` index.
 * When omitted (the single-piece preview path), every glyph is
 * classified `open`. When provided, a port is `matched` iff the
 * neighbor cell along the compass direction exposes a port in the
 * opposite direction sourced from a different piece.
 *
 * Returns a fresh array on every call so callers cannot mutate cached
 * glyph state.
 */
export function pieceConnectorGlyphs(
  piece: Piece,
  pieceIndex: number,
  cityPorts?: Map<string, number>,
): ConnectorGlyph[] {
  const ports = connectorPortsOf(piece)
  return ports.map((port) => {
    const cellRow = piece.row + port.dr
    const cellCol = piece.col + port.dc
    const center = cellCenterPixel(cellRow, cellCol)
    const offset = DIR_OFFSETS[port.dir]
    let status: ConnectorMatchStatus = 'open'
    if (cityPorts) {
      const neighborRow = cellRow + offset.dr
      const neighborCol = cellCol + offset.dc
      const neighborKey = `${cellKey(neighborRow, neighborCol)}:${opposite(port.dir)}`
      const neighborOwner = cityPorts.get(neighborKey)
      if (neighborOwner !== undefined && neighborOwner !== pieceIndex) {
        status = 'matched'
      }
    }
    return {
      x: center.x + offset.dc * CELL_HALF_PIXELS,
      y: center.y + offset.dr * CELL_HALF_PIXELS,
      dir: port.dir,
      kind: isCardinal(port.dir) ? 'cardinal' : 'corner',
      pieceIndex,
      cellRow,
      cellCol,
      status,
    }
  })
}

/**
 * Resolve every connector glyph across an entire city. Pieces are
 * walked in placement order and each glyph carries its source piece
 * index so the renderer can attach a stable React key. The whole-city
 * port index is built once and threaded through `pieceConnectorGlyphs`
 * so the match-status classification stays O(N) over the total port
 * count instead of O(N^2) over all piece pairs.
 */
export function cityConnectorGlyphs(pieces: readonly Piece[]): ConnectorGlyph[] {
  const cityPorts = cityPortIndex(pieces)
  const out: ConnectorGlyph[] = []
  pieces.forEach((piece, index) => {
    for (const glyph of pieceConnectorGlyphs(piece, index, cityPorts)) {
      out.push(glyph)
    }
  })
  return out
}

/**
 * Count the number of `matched` glyphs in a glyph list. The toolbar
 * surfaces this count alongside the existing piece count so the author
 * can see at a glance how many connector pairs link versus how many
 * remain open.
 */
export function countMatchedGlyphs(glyphs: readonly ConnectorGlyph[]): number {
  let n = 0
  for (const g of glyphs) {
    if (g.status === 'matched') n++
  }
  return n
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

/**
 * Half a cell width plus a small outward offset in pixels. Each open-end
 * arrow anchors at the cell center plus this step along its compass
 * direction so the arrow tip sits just past the cell edge in the
 * direction the missing neighbor needs to go. Tuned to land outside the
 * connector glyph circle (`GLYPH_RADIUS_PIXELS`) so the arrow reads as
 * a separate "this side is open" marker rather than overlapping the
 * connector dot.
 */
export const OPEN_END_ARROW_REACH_PIXELS = CELL_PIXELS / 2 + CELL_PIXELS / 12

/**
 * Half-edge length of the open-end arrow triangle in pixels. The
 * triangle is inscribed in a square of `2 * OPEN_END_ARROW_HALF_PIXELS`
 * so it stays small enough to read alongside the connector glyph at the
 * same cell edge without crowding the cell tile.
 */
export const OPEN_END_ARROW_HALF_PIXELS = CELL_PIXELS / 8

/**
 * One open-end arrow glyph (REQ-019, REQ-064).
 *
 * Pure pixel-space shape: the SnapGridView renders one `<polygon>` per
 * entry as a small triangle pointing outward in the direction of the
 * unmatched connector port so a builder reads "this side of this cell
 * still needs a neighbor" at a glance instead of scanning per-glyph
 * stroke colors. The shape stays substrate-flavored: no React, no DOM,
 * no styling decisions. The renderer owns fill / stroke; this helper
 * owns geometry only.
 *
 * `points` is the SVG-pixel coordinate list for the triangle vertices in
 * `tip, leftBase, rightBase` order so the polygon `points` attribute
 * reads as a clean three-vertex string with the tip carrying the open
 * direction.
 *
 * `pieceIndex`, `cellRow`, `cellCol`, `dir` are mirrored from the source
 * `UnmatchedPort` so the renderer can attach a stable React key and
 * tests can read the per-port mapping without re-walking the substrate.
 */
export interface OpenEndArrowGlyph {
  /** Pixel x position of the triangle tip inside the SVG viewBox. */
  tipX: number
  /** Pixel y position of the triangle tip inside the SVG viewBox. */
  tipY: number
  /** SVG `points` attribute string covering all three triangle vertices. */
  points: string
  /** Compass direction the open port faces (REQ-063 `Dir` 0..7). */
  dir: Dir
  /** Source piece's index inside the city's `pieces` array. */
  pieceIndex: number
  /** Absolute row of the footprint cell the open port lives on. */
  cellRow: number
  /** Absolute column of the footprint cell the open port lives on. */
  cellCol: number
}

/**
 * Resolve every open-end arrow glyph for a city's unmatched ports
 * (REQ-019, REQ-064).
 *
 * Each `UnmatchedPort` from `validateConnections` becomes one outward-
 * pointing triangle anchored at the cell center plus a half-cell-plus-
 * a-step along the port's compass direction. The triangle's tip sits at
 * `cellCenter + reach * dirVec`, and the two base vertices sit at
 * `tip - half * dirVec +/- half * perpVec` so the triangle reads as a
 * chevron pointing in the open direction. The chevron base is centered
 * on the cell edge midpoint (cardinal) or cell corner (corner) along
 * the port's direction, mirroring the connector glyph anchor convention.
 *
 * Walked in the order of the source `UnmatchedPort[]` so two ports on
 * the same cell (e.g. an isolated straight reports both N and S as
 * unmatched) emit two distinct arrows in placement order. Returns a
 * fresh array on every call so callers cannot mutate cached state.
 */
export function unmatchedPortGlyphs(
  unmatchedPorts: readonly UnmatchedPort[],
): OpenEndArrowGlyph[] {
  return unmatchedPorts.map((port) => {
    const center = cellCenterPixel(port.cellRow, port.cellCol)
    const offset = DIR_OFFSETS[port.dir]
    // The DIR_OFFSETS unit vectors are axis-aligned (cardinal) or 45deg
    // diagonal (corner) with magnitude 1 or sqrt(2). Reusing them as-is
    // keeps the arrow reach consistent with the existing connector glyph
    // anchor math without introducing a normalization step the chevron
    // does not need.
    const tipX = center.x + offset.dc * OPEN_END_ARROW_REACH_PIXELS
    const tipY = center.y + offset.dr * OPEN_END_ARROW_REACH_PIXELS
    // Step backward from the tip by half the chevron's reach so the
    // base midpoint sits at the cell edge midpoint (cardinal) or corner
    // (corner). The perpendicular axis is the +90deg clockwise rotation
    // of the direction vector: `(dr, dc) -> (dc, -dr)` mirrors the same
    // 90deg step the editor's rotation math uses (REQ-021).
    const baseX = tipX - offset.dc * OPEN_END_ARROW_HALF_PIXELS
    const baseY = tipY - offset.dr * OPEN_END_ARROW_HALF_PIXELS
    const perpX = offset.dr
    const perpY = -offset.dc
    const leftX = baseX + perpX * OPEN_END_ARROW_HALF_PIXELS
    const leftY = baseY + perpY * OPEN_END_ARROW_HALF_PIXELS
    const rightX = baseX - perpX * OPEN_END_ARROW_HALF_PIXELS
    const rightY = baseY - perpY * OPEN_END_ARROW_HALF_PIXELS
    const points = `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`
    return {
      tipX,
      tipY,
      points,
      dir: port.dir,
      pieceIndex: port.pieceIndex,
      cellRow: port.cellRow,
      cellCol: port.cellCol,
    }
  })
}
