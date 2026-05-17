import type { Building, Piece } from '@/lib/schemas'
import { CELL_SIZE, pieceFootprintWorldCells } from './driveScene'

/**
 * Drive-mode minimap helpers (REQ-069 minimap overlay).
 *
 * Pure module: no React, no DOM, no three.js. The drive scene client
 * renders an SVG overlay on top of these helpers so a player can see
 * the city layout and the live car position from a top-down view at a
 * glance. Doing the bounds and projection math here keeps the
 * integration surface fully unit-testable.
 *
 * The minimap is the third drive overlay alongside the speed readout
 * and the controls hint (REQ-066). It hides while the pause menu is
 * open so the modal owns the click surface (REQ-039); it does not show
 * lap timers, checkpoints, or any race scoring (REQ-037 anti-feature
 * stays in force).
 */

/**
 * Edge length of the minimap viewport in CSS pixels. Square so the SVG
 * coordinate system has a uniform scale on both axes; the minimap is
 * not a stretched mirror of the city's aspect ratio because a square
 * frame reads as a "you are here" map rather than a literal floorplan.
 */
export const MINIMAP_SIZE_PX = 160

/**
 * Padding (in cells) added around the city's bounding box before
 * fitting it to the minimap viewport. Without padding a piece at the
 * far edge of the city would render at the literal edge of the
 * minimap with no margin; one cell of padding keeps the silhouette
 * readable and gives the car heading triangle room to extend past
 * the city footprint at the spawn anchor.
 */
export const MINIMAP_PADDING_CELLS = 1

/**
 * Color of a street piece cell on the minimap. Matches the v1 piece
 * brown vocabulary (`#7d6b4a` from the editor and the drive scene's
 * `DEFAULT_PIECE_COLOR`) so a player who saw the piece on the editor
 * grid recognizes the same color on the minimap.
 */
export const MINIMAP_PIECE_COLOR = '#7d6b4a'

/**
 * Color of a building cell on the minimap. Matches the editor's
 * building olive (`#6b7d4a`) so the two-color vocabulary is
 * consistent across editor / minimap / drive scene.
 */
export const MINIMAP_BUILDING_COLOR = '#6b7d4a'

/**
 * Per-zone-kind minimap fill. Mirrors the editor's zone fill palette
 * (green = residential, blue = commercial, ochre = industrial) so the
 * player driving the city sees the same color vocabulary they used to
 * zone it. Pulled out so a future tooling slice can render a legend
 * from the same constants.
 */
export const MINIMAP_ZONE_COLOR: Record<
  'residential' | 'commercial' | 'industrial',
  string
> = {
  residential: '#3a8a3a',
  commercial: '#3a6aa3',
  industrial: '#a38a3a',
}

/**
 * Background color of the minimap viewport. A muted dark fill so the
 * piece / building markers read with high contrast and the minimap
 * does not glow against the drive scene's noon lighting.
 */
export const MINIMAP_BACKGROUND_COLOR = 'rgba(20, 20, 20, 0.78)'

/**
 * Color of the minimap border. A thin pale stroke so the viewport
 * frame reads against any background color (sky blue ground, dusk).
 */
export const MINIMAP_BORDER_COLOR = '#f7f4ee'

/**
 * Color of the player car triangle on the minimap. Matches the car
 * body color (`CAR_BODY_COLOR = 0xc0392b` rendered as `#c0392b`) so
 * the player vehicle reads as the same red dot in both views.
 */
export const MINIMAP_CAR_COLOR = '#c0392b'

/**
 * Size of the player car triangle in CSS pixels (the triangle is
 * inscribed in a square of this edge length so it is always visible
 * on the minimap regardless of how far zoomed out the city bounds are).
 * Smaller than `MINIMAP_SIZE_PX / 16` so a small starter city does not
 * have a triangle that covers the whole viewport.
 */
export const MINIMAP_CAR_SIZE_PX = 10

/**
 * Result of fitting a city's footprint to the minimap viewport. The
 * minimap projects world coordinates to viewport pixels using
 * `worldToMinimap`. `null` means the city has no footprint to project
 * (zero pieces and zero buildings); the minimap renders an empty
 * viewport in that case.
 */
export type MinimapBounds = {
  /** World-space minimum x (already padded). */
  minX: number
  /** World-space maximum x (already padded). */
  maxX: number
  /** World-space minimum z (already padded). */
  minZ: number
  /** World-space maximum z (already padded). */
  maxZ: number
  /** World-space width (`maxX - minX`). Always > 0 for a valid bounds. */
  width: number
  /** World-space depth (`maxZ - minZ`). Always > 0 for a valid bounds. */
  depth: number
  /** Pixels per world unit on the larger of the two axes. */
  scale: number
  /** Pixel offset that centers the city horizontally in the viewport. */
  offsetX: number
  /** Pixel offset that centers the city vertically in the viewport. */
  offsetY: number
  /** Edge length of the viewport in CSS pixels (mirrors `MINIMAP_SIZE_PX`). */
  sizePx: number
}

/**
 * Fit the city's footprint to the minimap viewport. Returns `null` for
 * an empty city so the caller can skip rendering the silhouette and
 * the car layer.
 *
 * The bounds expand to a square aspect with the longer axis driving
 * the scale so the city's silhouette is letterboxed inside the square
 * viewport. This keeps the world-space car position projecting to the
 * same on-screen position whether the city is wide or tall, which a
 * stretched fit would not.
 *
 * `paddingCells` defaults to `MINIMAP_PADDING_CELLS`; an override is
 * exposed so a future settings slice can tighten or loosen the frame.
 * `sizePx` defaults to `MINIMAP_SIZE_PX`; the override exists so a
 * larger or smaller minimap (e.g. an expanded view) can reuse the
 * same projection math.
 */
export function minimapBoundsForCity(
  pieces: readonly Piece[],
  buildings: readonly Building[],
  paddingCells: number = MINIMAP_PADDING_CELLS,
  sizePx: number = MINIMAP_SIZE_PX,
): MinimapBounds | null {
  if (sizePx <= 0 || !Number.isFinite(sizePx)) return null
  const safePadding = Math.max(0, Number.isFinite(paddingCells) ? paddingCells : 0)
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let saw = false
  const inflate = (x: number, z: number) => {
    saw = true
    const half = CELL_SIZE / 2
    if (x - half < minX) minX = x - half
    if (x + half > maxX) maxX = x + half
    if (z - half < minZ) minZ = z - half
    if (z + half > maxZ) maxZ = z + half
  }
  for (const piece of pieces) {
    for (const cell of pieceFootprintWorldCells(piece)) {
      inflate(cell.x, cell.z)
    }
  }
  for (const building of buildings) {
    inflate(building.col * CELL_SIZE, building.row * CELL_SIZE)
  }
  if (!saw) return null
  const padding = safePadding * CELL_SIZE
  minX -= padding
  maxX += padding
  minZ -= padding
  maxZ += padding
  const width = maxX - minX
  const depth = maxZ - minZ
  // Letterbox: the longer axis fills the viewport; the shorter axis is
  // centered with even padding on both sides so a tall city does not
  // squash horizontally and a wide city does not squash vertically.
  const longest = Math.max(width, depth)
  if (longest <= 0) return null
  const scale = sizePx / longest
  const offsetX = (sizePx - width * scale) / 2
  const offsetY = (sizePx - depth * scale) / 2
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    scale,
    offsetX,
    offsetY,
    sizePx,
  }
}

/**
 * Project a world-space position to minimap viewport pixels. The
 * minimap uses SVG coordinates (origin top-left, y axis grows down);
 * the world's `+z` axis is south so a larger world `z` maps to a
 * larger viewport `y`, which means north stays at the top of the
 * minimap and the player's mental map is consistent with the editor's
 * grid orientation.
 *
 * Returns `{ x: NaN, y: NaN }` for a non-finite input so a tuning bug
 * cannot leak `NaN` into the SVG transform; the SVG layer treats NaN
 * coords as "skip this draw" so the minimap never paints garbage.
 */
export function worldToMinimap(
  worldX: number,
  worldZ: number,
  bounds: MinimapBounds,
): { x: number; y: number } {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
    return { x: Number.NaN, y: Number.NaN }
  }
  const x = bounds.offsetX + (worldX - bounds.minX) * bounds.scale
  const y = bounds.offsetY + (worldZ - bounds.minZ) * bounds.scale
  return { x, y }
}

/**
 * Convert the integrator's heading (radians, where 0 = car points
 * north, +y axis convention is `forward = (sin h, -cos h)` per
 * `applyDriveStep`) to CSS rotation degrees suitable for SVG
 * `transform="rotate(...)"`. The SVG coordinate system has y growing
 * down so a CSS rotation of 0 keeps the triangle pointing up; that
 * matches the world heading 0 ("north") so the projection is direct.
 *
 * Non-finite inputs collapse to `0` so the triangle stays pointing
 * north when the integrator state is missing.
 */
export function headingToMinimapDegrees(headingRadians: number): number {
  if (!Number.isFinite(headingRadians)) return 0
  return (headingRadians * 180) / Math.PI
}
