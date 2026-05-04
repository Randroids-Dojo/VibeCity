import type {
  Building,
  BuildingType,
  City,
  Piece,
  PieceType,
  Rotation,
} from '@/lib/schemas'
import {
  cellKey,
  occupiedBuildingCells,
  occupiedPieceCells,
  pieceFootprintCells,
} from './snapGrid'

/**
 * Editor palette and placement helpers (REQ-017, REQ-020, REQ-021,
 * REQ-022).
 *
 * v1 ships the cardinal-only street palette: `straight`, `left90`,
 * `right90`. The full piece taxonomy (REQ-018, REQ-019, REQ-058,
 * REQ-060, REQ-061, REQ-062) lands in follow-up slices that extend
 * this list. The palette ordering here is the source of truth for the
 * UI render.
 *
 * Placement is a pure reducer over the city: `placePiece` returns a
 * fresh `City` with the new piece appended, or the original city when
 * the target cell would overlap an already-occupied footprint cell.
 * Footprint validation (REQ-027) is applied here so the click handler
 * can rely on placement always returning a valid city.
 *
 * Erase is the dual reducer: `erasePiece(city, row, col)` removes any
 * piece whose resolved footprint covers `(row, col)` and returns a
 * fresh `City`, or the original city when no piece occupies that cell
 * (so callers can branch on identity equality the same way they do for
 * placement). Single-cell pieces dominate v1, but the helper resolves
 * the full footprint so multi-cell pieces (mega sweep, hairpin, future
 * arc45 / diagonal) erase atomically: clicking any cell of the
 * footprint removes the whole piece.
 *
 * Rotation is also a pure helper: `nextRotation` advances a `Rotation`
 * by 90 degrees, wrapping `270 -> 0`. The editor uses it to drive the
 * rotate tool (REQ-021) without importing zod.
 *
 * Module is split out from the React client so it can be unit tested
 * without a JSX runtime; matches the pattern from `parseSlugParam`.
 */

/**
 * Editor tool modes (REQ-020, REQ-022).
 *
 * `place` is the default mode: a click on a grid cell dispatches
 * `placePiece` with the currently-selected palette type. `erase` flips
 * the click handler to dispatch `erasePiece` instead. Future tool
 * modes (REQ-023 undo / redo state hookups, REQ-024 pan) live as their
 * own flags rather than extending this union; this enum is the
 * mutually-exclusive cell-click contract.
 */
export type ToolMode = 'place' | 'erase'

/**
 * Default tool mode on first render (REQ-020). The editor opens in
 * place mode so a first-time author can drop a piece without having to
 * pick a tool first.
 */
export const DEFAULT_TOOL_MODE: ToolMode = 'place'

export interface PaletteEntry {
  type: PieceType
  /** Human-readable label rendered in the palette button. */
  label: string
}

/**
 * v1 street palette (REQ-017, REQ-018, REQ-019, REQ-061, REQ-062).
 * Ordering is the render order. The first three entries are the
 * cardinal-only basics (REQ-017); the next four extend the palette
 * with single-cell sweep and S-curve pieces that share the same
 * cardinal connector pattern (REQ-018); the next entry is the 4-way
 * `intersection` (REQ-019), a single-cell piece with four cardinal
 * connectors so streets can branch; the last two entries are the
 * single-cell corner-connector pieces `arc45` (REQ-061) and
 * `diagonal` (REQ-062) per F-007. Future slices append the multi-cell
 * mega-sweep / hairpin (REQ-058 / REQ-060) pieces.
 *
 * The REQ-018 entries are placed after the REQ-017 entries so existing
 * keyboard / palette muscle memory (Straight as the first entry,
 * default selection) is unchanged. SCurve pairs sit before Sweep
 * pairs because S-curves are the more common starter shape for a
 * city loop; sweep pieces are the longer-radius variant a builder
 * reaches for after the basic shape is in place. Intersection lands
 * after the cardinal sweep / curve pairs because branching is the
 * next conceptual step after a builder has the basic shape and the
 * curves in hand. The corner-connector pieces (arc45 then diagonal)
 * land at the end so the cardinal-only block stays grouped at the
 * front of the palette; arc45 sits before diagonal because arc45 is
 * the bridge piece that introduces a corner connector at all and
 * diagonal is the run-of-corner piece a builder reaches for once
 * the bridge is in place.
 *
 * REQ-061 and REQ-062 ship the editor surface only in this slice;
 * the runtime concerns (sampled centerlines per F-003, wheel
 * contact per F-004, pace notes per F-005, difficulty scoring per
 * F-006, and the 8-direction connector validation per REQ-063) wait
 * for the drive scene scaffold (REQ-031) to land. The palette entry
 * lets a builder record a placement; the schema (PieceTypeSchema)
 * already accepts these types and `placePiece` treats them as
 * single-cell pieces (the schema entry has no `footprint`, so the
 * implicit `(row, col)` single-cell footprint applies).
 */
export const STREET_PALETTE: readonly PaletteEntry[] = [
  { type: 'straight', label: 'Straight' },
  { type: 'left90', label: 'Left 90' },
  { type: 'right90', label: 'Right 90' },
  { type: 'scurve', label: 'S-Curve' },
  { type: 'scurveLeft', label: 'S-Curve Left' },
  { type: 'sweepRight', label: 'Sweep Right' },
  { type: 'sweepLeft', label: 'Sweep Left' },
  { type: 'intersection', label: 'Intersection' },
  { type: 'arc45', label: 'Arc 45' },
  { type: 'diagonal', label: 'Diagonal' },
]

/**
 * Default selected palette entry on first render.
 *
 * `straight` is the most common piece in any starter city loop, so it
 * is the lowest-friction default for first-time authors.
 */
export const DEFAULT_PALETTE_TYPE: PieceType = STREET_PALETTE[0].type

/**
 * The four allowed rotations for the editor (REQ-021). Order is the
 * cycle the rotate tool walks: `0 -> 90 -> 180 -> 270 -> 0`. Mirrors
 * `RotationSchema` literal order in `src/lib/schemas.ts`.
 */
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

/**
 * Default rotation for a freshly-selected palette entry.
 *
 * Most starter cities place pieces in their canonical orientation
 * before reaching for the rotate tool, so `0` is the lowest-friction
 * default.
 */
export const DEFAULT_ROTATION: Rotation = 0

/**
 * Advance a rotation by one 90-degree increment (REQ-021).
 *
 * Wraps from `270` back to `0` so the rotate tool cycles indefinitely
 * without the caller having to bounds-check. Pure and deterministic so
 * the editor can drive both a rotate button and the `R` keyboard
 * shortcut from the same helper.
 */
export function nextRotation(current: Rotation): Rotation {
  switch (current) {
    case 0:
      return 90
    case 90:
      return 180
    case 180:
      return 270
    case 270:
      return 0
  }
}

/**
 * Place a piece on the grid (REQ-020).
 *
 * Returns a fresh `City` with the new piece appended at `(row, col)`
 * and `rotation` (defaults to `0`). When the target piece's footprint
 * would overlap any cell already occupied by an existing piece, the
 * original city is returned unchanged so callers can branch on
 * identity equality (`next === city ? rejected : accepted`).
 *
 * Pieces are appended in placement order; deterministic ordering for
 * the persistence hash is handled by `hashCity` (REQ-013).
 */
export function placePiece(
  city: City,
  type: PieceType,
  row: number,
  col: number,
  rotation: Rotation = 0,
): City {
  const candidate: Piece = { type, row, col, rotation }
  const candidateCells = pieceFootprintCells(candidate)
  const occupied = occupiedPieceCells(city)
  for (const cell of candidateCells) {
    if (occupied.has(cellKey(cell.row, cell.col))) {
      return city
    }
  }
  return {
    ...city,
    pieces: [...city.pieces, candidate],
  }
}

/**
 * Remove the piece occupying `(row, col)` (REQ-022).
 *
 * Returns a fresh `City` with the piece whose resolved footprint
 * covers the target cell removed. When no piece occupies the cell, the
 * original city is returned unchanged so callers can branch on
 * identity equality (`next === city ? noop : erased`).
 *
 * For multi-cell pieces (REQ-059, mega sweep, hairpin, future arc45 /
 * diagonal) clicking any cell of the footprint erases the whole piece,
 * matching the atomic place / erase contract. When two pieces somehow
 * occupy the same cell (an invariant the placePiece reducer prevents
 * but a hand-edited city or future drag-import flow could violate)
 * only the first match is removed; the next click clears the next
 * match.
 *
 * Buildings are intentionally not touched here; the building dual is
 * `eraseBuilding` (REQ-029) so the editor's tool category stays the
 * source of truth for which array a click affects.
 */
export function erasePiece(city: City, row: number, col: number): City {
  const targetKey = cellKey(row, col)
  const matchIndex = city.pieces.findIndex((piece) => {
    for (const cell of pieceFootprintCells(piece)) {
      if (cellKey(cell.row, cell.col) === targetKey) {
        return true
      }
    }
    return false
  })
  if (matchIndex === -1) {
    return city
  }
  return {
    ...city,
    pieces: [
      ...city.pieces.slice(0, matchIndex),
      ...city.pieces.slice(matchIndex + 1),
    ],
  }
}

/**
 * Editor palette category (REQ-028, REQ-029).
 *
 * `street` selects pieces from `STREET_PALETTE`; `building` selects
 * buildings from `BUILDING_PALETTE`. The category gates which array a
 * click mutates so a placed building never accidentally lands in the
 * pieces array (and vice versa). The erase tool (REQ-022, REQ-029)
 * also follows the active category: erasing in street mode removes a
 * piece, erasing in building mode removes a building.
 */
export type PaletteCategory = 'street' | 'building'

/**
 * Default palette category on first render (REQ-028).
 *
 * Streets are the editor's primary affordance because the build /
 * drive loop turns on a placed road, so the editor opens with the
 * street category active. A first-time author can place a road
 * without first picking a category.
 */
export const DEFAULT_PALETTE_CATEGORY: PaletteCategory = 'street'

export interface BuildingPaletteEntry {
  type: BuildingType
  /** Human-readable label rendered in the palette button. */
  label: string
}

/**
 * v1 building palette (REQ-028, Q-004 default B).
 *
 * Four placeholder primitive types render as colored cells on the
 * editor grid (REQ-046 will turn them into extruded boxes for the
 * drive scene). Ordering matches the "smaller to larger" mental model
 * a first-time author expects: house, then mid-house, then shop, then
 * factory. Multi-cell footprints (Q-004 default C) stay out of v1.
 */
export const BUILDING_PALETTE: readonly BuildingPaletteEntry[] = [
  { type: 'small-house', label: 'Small House' },
  { type: 'mid-house', label: 'Mid House' },
  { type: 'shop', label: 'Shop' },
  { type: 'factory', label: 'Factory' },
]

/**
 * Default selected building entry on first render (REQ-028).
 *
 * `small-house` is the lowest-friction default: it is the smallest
 * primitive and the one a first-time author is most likely to drop
 * along a street to test the build / drive loop.
 */
export const DEFAULT_BUILDING_TYPE: BuildingType = BUILDING_PALETTE[0].type

/**
 * Place a building on the grid (REQ-028, REQ-029).
 *
 * Returns a fresh `City` with the new building appended at `(row,
 * col)` and `rotation` (defaults to `0`). v1 buildings are single-cell
 * (Q-004 default B) so the overlap check is a single-cell lookup
 * against the union of street piece footprint cells and existing
 * building cells. When the target cell is already occupied by either
 * a piece or another building, the original city is returned
 * unchanged so callers can branch on identity equality
 * (`next === city ? rejected : accepted`), matching the `placePiece`
 * contract.
 *
 * Buildings are appended in placement order; deterministic ordering
 * for the persistence hash is handled by `hashCity` (REQ-013).
 */
export function placeBuilding(
  city: City,
  type: BuildingType,
  row: number,
  col: number,
  rotation: Rotation = 0,
): City {
  const targetKey = cellKey(row, col)
  const occupiedPieces = occupiedPieceCells(city)
  if (occupiedPieces.has(targetKey)) {
    return city
  }
  const occupiedBuildings = occupiedBuildingCells(city)
  if (occupiedBuildings.has(targetKey)) {
    return city
  }
  const candidate: Building = { type, row, col, rotation }
  return {
    ...city,
    buildings: [...city.buildings, candidate],
  }
}

/**
 * Remove the building occupying `(row, col)` (REQ-029).
 *
 * Returns a fresh `City` with the building at the target cell
 * removed. When no building occupies the cell, the original city is
 * returned unchanged so callers can branch on identity equality
 * (`next === city ? noop : erased`), matching the `erasePiece`
 * contract.
 *
 * Pieces are intentionally not touched here; the piece dual is
 * `erasePiece`. The editor's palette category gates which dual the
 * cell-click handler dispatches.
 */
export function eraseBuilding(city: City, row: number, col: number): City {
  const matchIndex = city.buildings.findIndex(
    (building) => building.row === row && building.col === col,
  )
  if (matchIndex === -1) {
    return city
  }
  return {
    ...city,
    buildings: [
      ...city.buildings.slice(0, matchIndex),
      ...city.buildings.slice(matchIndex + 1),
    ],
  }
}
