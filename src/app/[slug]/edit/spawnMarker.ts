import type { City, Piece, Rotation } from '@/lib/schemas'
import { CELL_PIXELS, GRID_RADIUS } from './snapGrid'

/**
 * Editor spawn-anchor marker (REQ-019, REQ-036).
 *
 * The drive scene spawns the player's car at the first placed piece's
 * cell with a heading derived from that piece's rotation
 * (`respawnVehicle` in `src/app/[slug]/respawn.ts`,
 * `spawnAnchor` in `src/app/[slug]/driveScene.ts`). Until this slice the
 * editor offered no visible cue for where the car would spawn or which
 * way it would face, so a builder placing a closed-loop city had to
 * count cells from the origin or click Drive to find out. This module
 * resolves the substrate-level spawn-anchor pose into pixel-space
 * geometry the editor SVG can render as a static marker plus a heading
 * arrow.
 *
 * Pure pixel-space helper: no React, no DOM. Coordinate space matches
 * the editor SVG (top-left origin, `+x` rightward, `+y` downward) so
 * positions compose with `cellToPixel` from `snapGrid.ts`. The renderer
 * owns fill / stroke; this helper owns geometry only.
 *
 * Cardinal-arrow convention: the spawn arrow tip extends outward from
 * the cell center toward the heading direction, mirroring the open-end
 * arrow geometry vocabulary already used by `unmatchedPortGlyphs` in
 * `connectorGlyphs.ts`. Reusing the same chevron base / perpendicular
 * math keeps the editor's directional vocabulary one channel across the
 * spawn marker, the open-end arrows, and the connector glyphs.
 */

/**
 * Half a cell width in pixels. The spawn marker ring fills the cell
 * minus a small inset so the placed piece's brown fill stays visible
 * around the marker outline; the heading arrow tip extends from the
 * cell center outward to a point near the cell edge.
 */
export const SPAWN_MARKER_HALF_PIXELS = CELL_PIXELS / 2

/**
 * Inset in pixels for the spawn marker ring. The ring is rendered as a
 * non-interactive overlay rect inset by this amount on every side so it
 * sits inside the cell border without overlapping neighbor cell strokes.
 */
export const SPAWN_MARKER_INSET_PIXELS = 3

/**
 * Reach in pixels from the cell center to the spawn-arrow tip. Sized
 * just inside the cell edge (`CELL_PIXELS / 2`) minus a small margin so
 * the chevron tip does not touch the ring stroke.
 */
export const SPAWN_ARROW_REACH_PIXELS = CELL_PIXELS / 2 - 4

/**
 * Half-edge length of the spawn-arrow chevron in pixels. Sized larger
 * than `OPEN_END_ARROW_HALF_PIXELS` (which is `CELL_PIXELS / 8`) so the
 * spawn arrow reads as the dominant directional cue inside the marker
 * ring; the open-end arrows are the secondary "this side is open" cue
 * outside the cell tile.
 */
export const SPAWN_ARROW_HALF_PIXELS = CELL_PIXELS / 5

/**
 * Compass labels used for the spawn arrow's `data-spawn-direction`
 * attribute and for readable test assertions. The labels match the
 * cardinal vocabulary used by `CONNECTOR_DIR_LABEL` so the editor's
 * directional vocabulary stays consistent.
 */
export type SpawnDirectionLabel = 'N' | 'E' | 'S' | 'W'

/**
 * Long-form compass label per `SpawnDirectionLabel` so the editor
 * toolbar readout reads as a full English word ("North", "East",
 * "South", "West") rather than the single-letter compass attribute. The
 * single-letter form stays on the SVG `data-spawn-marker-direction`
 * attribute so a Playwright locator can pin orientation by short
 * compass code; the full word lands in the visible toolbar text so a
 * builder reads "Spawn: (0, 0) facing North" without having to translate
 * the compass letter in their head.
 */
export const SPAWN_DIRECTION_LONG_LABEL: Record<SpawnDirectionLabel, string> =
  {
    N: 'North',
    E: 'East',
    S: 'South',
    W: 'West',
  }

/**
 * Direction unit vector in editor SVG pixel space (`+x` rightward, `+y`
 * downward) per `Rotation` value. Mirrors the heading convention used
 * by `applyDriveStep` in `driveControls.ts` (heading 0 advances along
 * world `-z`, heading PI/2 advances along world `+x`). Editor rows map
 * to SVG `+y` and cols map to SVG `+x`, so:
 *
 *   - rotation 0   -> faces N -> SVG `(-y)`
 *   - rotation 90  -> faces E -> SVG `(+x)`
 *   - rotation 180 -> faces S -> SVG `(+y)`
 *   - rotation 270 -> faces W -> SVG `(-x)`
 *
 * The map is exposed so the renderer can resolve an arrow direction
 * without re-deriving the trigonometry.
 */
export const SPAWN_DIRECTION_VECTOR: Record<
  Rotation,
  { x: number; y: number; label: SpawnDirectionLabel }
> = {
  0: { x: 0, y: -1, label: 'N' },
  90: { x: 1, y: 0, label: 'E' },
  180: { x: 0, y: 1, label: 'S' },
  270: { x: -1, y: 0, label: 'W' },
}

/**
 * One spawn-anchor marker shape ready for the editor SVG to render
 * (REQ-019, REQ-036).
 *
 * `cellRow` / `cellCol` mirror the spawn-anchor cell. `ringX` / `ringY`
 * / `ringSize` describe the inset ring overlay rect; the renderer
 * applies a stroke and a transparent fill so the underlying piece tile
 * stays visible. `tipX` / `tipY` carry the heading-arrow tip position;
 * `points` is the SVG `points` attribute for the chevron polygon in
 * `tip, leftBase, rightBase` order so the polygon reads as a clean
 * three-vertex string with the tip carrying the spawn direction.
 * `direction` is the cardinal label so a test can assert orientation
 * by readable string rather than by tip coordinates.
 */
export interface SpawnAnchorMarker {
  cellRow: number
  cellCol: number
  ringX: number
  ringY: number
  ringSize: number
  tipX: number
  tipY: number
  points: string
  direction: SpawnDirectionLabel
  rotation: Rotation
}

/**
 * Map an absolute cell coordinate to its SVG-pixel top-left. Mirrors the
 * private `cellCenterPixel` helper in `connectorGlyphs.ts` but returns
 * the top-left so the ring rect can be inset by a fixed pixel margin.
 */
function cellTopLeftPixel(
  row: number,
  col: number,
): { x: number; y: number } {
  return {
    x: (col + GRID_RADIUS) * CELL_PIXELS,
    y: (row + GRID_RADIUS) * CELL_PIXELS,
  }
}

/**
 * Resolve the spawn-anchor marker shape for a city's first placed
 * piece. Returns `null` when the city has zero pieces (the drive scene
 * never mounts the car on an empty city per `DriveSceneClient.tsx`, so
 * the editor has nothing to mark) so the renderer can skip the overlay
 * entirely. Returns a fresh object on every call so callers cannot
 * mutate cached state.
 *
 * The spawn anchor is always `pieces[0]` because `spawnAnchor` in
 * `src/app/[slug]/driveScene.ts` reads the first placed piece, and
 * `respawnVehicle` derives the spawn heading from `pieces[0].rotation`.
 * This helper mirrors that contract exactly so the editor cue agrees
 * with the live drive-scene behavior; if the spawn-anchor contract
 * changes (e.g. a future slice picks the closest piece to a saved spawn
 * cell), this resolver should change in the same slice.
 */
export function spawnAnchorMarker(city: City): SpawnAnchorMarker | null {
  const first: Piece | undefined = city.pieces[0]
  if (!first) return null
  const topLeft = cellTopLeftPixel(first.row, first.col)
  const ringX = topLeft.x + SPAWN_MARKER_INSET_PIXELS
  const ringY = topLeft.y + SPAWN_MARKER_INSET_PIXELS
  const ringSize = CELL_PIXELS - SPAWN_MARKER_INSET_PIXELS * 2
  const centerX = topLeft.x + SPAWN_MARKER_HALF_PIXELS
  const centerY = topLeft.y + SPAWN_MARKER_HALF_PIXELS
  const dir = SPAWN_DIRECTION_VECTOR[first.rotation]
  const tipX = centerX + dir.x * SPAWN_ARROW_REACH_PIXELS
  const tipY = centerY + dir.y * SPAWN_ARROW_REACH_PIXELS
  // Step backward from the tip to the chevron base midpoint, then offset
  // perpendicular to the heading by the chevron half-width to land the
  // two base vertices. The perpendicular vector is the +90deg clockwise
  // rotation of the heading vector in SVG space: `(x, y) -> (-y, x)`
  // mirrors the same 90deg step the editor's open-end arrow math uses
  // (`unmatchedPortGlyphs` in `connectorGlyphs.ts`).
  const baseX = tipX - dir.x * SPAWN_ARROW_HALF_PIXELS
  const baseY = tipY - dir.y * SPAWN_ARROW_HALF_PIXELS
  const perpX = -dir.y
  const perpY = dir.x
  const leftX = baseX + perpX * SPAWN_ARROW_HALF_PIXELS
  const leftY = baseY + perpY * SPAWN_ARROW_HALF_PIXELS
  const rightX = baseX - perpX * SPAWN_ARROW_HALF_PIXELS
  const rightY = baseY - perpY * SPAWN_ARROW_HALF_PIXELS
  const points = `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`
  return {
    cellRow: first.row,
    cellCol: first.col,
    ringX,
    ringY,
    ringSize,
    tipX,
    tipY,
    points,
    direction: dir.label,
    rotation: first.rotation,
  }
}

/**
 * One spawn-anchor toolbar readout ready for the editor toolbar to
 * render (REQ-019, REQ-036).
 *
 * `cellRow` / `cellCol` mirror the spawn-anchor cell (matching
 * `spawnAnchorMarker`'s returned cell so a test can cross-check the two
 * surfaces). `direction` carries the short compass label ('N' / 'E' /
 * 'S' / 'W') so a test can pin the value by readable string. `text` is
 * the full toolbar string ("Spawn: (row, col) facing North") rendered
 * in the readout paragraph.
 */
export interface SpawnAnchorReadout {
  cellRow: number
  cellCol: number
  direction: SpawnDirectionLabel
  text: string
}

/**
 * Resolve the spawn-anchor toolbar readout for a city's first placed
 * piece. Returns `null` when the city has zero pieces (mirrors
 * `spawnAnchorMarker`'s null contract: the drive scene never mounts the
 * car on an empty grid, so the editor toolbar has nothing to read out).
 * The cell coordinates and direction match `spawnAnchorMarker(city)`
 * exactly so the visible marker on the grid agrees with the visible
 * readout in the toolbar; if the substrate `spawnAnchor` contract
 * changes, both helpers update in the same slice. Returns a fresh
 * object on every call so callers cannot mutate cached state.
 */
export function spawnAnchorReadout(city: City): SpawnAnchorReadout | null {
  const first: Piece | undefined = city.pieces[0]
  if (!first) return null
  const dir = SPAWN_DIRECTION_VECTOR[first.rotation]
  const longLabel = SPAWN_DIRECTION_LONG_LABEL[dir.label]
  return {
    cellRow: first.row,
    cellCol: first.col,
    direction: dir.label,
    text: `Spawn: (${first.row}, ${first.col}) facing ${longLabel}`,
  }
}
