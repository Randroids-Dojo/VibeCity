import type { Building, BuildingType, Piece, PieceType } from '@/lib/schemas'

/**
 * Drive-scene scaffold helpers (REQ-044, REQ-045, REQ-046).
 *
 * Pure module: no three.js types in here so vitest can run the tests
 * under a Node environment without dragging WebGL into the suite.
 * The three.js scene module (`DriveSceneClient.tsx`) imports these
 * helpers and converts world coordinates / colors into actual scene
 * objects.
 *
 * v1 scope: aerial / orbit camera over a flat ground plane. Street
 * pieces render as flat colored quads on the grid (REQ-045). Buildings
 * render as extruded boxes (REQ-046). Per-piece geometry (sampled
 * centerlines, multi-cell footprints, connector glyphs) lands with the
 * drivable scene slices (REQ-031 onward) once the segment-based path
 * (REQ-064) and multi-cell footprint plumbing (REQ-059) ship.
 */

/**
 * World-space size of one grid cell in three.js units. Editor pixel
 * sizing (`CELL_PIXELS = 32`) is decoupled from this so the editor
 * can size cells for screen comfort without coupling to physics units.
 *
 * 4 units matches VibeRacer's `CELL_SIZE` so a future port of physics
 * (REQ-031) and wheel contact (REQ-032) inherits the same world-space
 * unit and a saved city is reusable across both projects.
 */
export const CELL_SIZE = 4

/**
 * Sky-color clear used by the renderer. A muted blue noon palette
 * matching the GDD default (REQ-044). Picked to read clearly behind
 * both the brown / olive piece colors and the placeholder building
 * colors without inventing a sky dome mesh in v1.
 */
export const SKY_COLOR = 0xbfd9e8

/**
 * Ground-plane fill color. A warm sand / cream that matches the
 * editor's `#fdfaf2` snap-grid background so the drive view feels
 * like the same world the editor draws.
 */
export const GROUND_COLOR = 0xf2ecd9

/**
 * Lighting defaults (REQ-044). Ambient keeps the unlit faces of the
 * extruded buildings from going pure black; the directional light
 * casts a noon-style key light from above and slightly south-east so
 * extrusions read with depth.
 */
export const AMBIENT_LIGHT_INTENSITY = 0.6
export const DIRECTIONAL_LIGHT_INTENSITY = 0.9
export const DIRECTIONAL_LIGHT_POSITION: readonly [number, number, number] = [
  60, 100, 40,
]

/**
 * Camera defaults for the v1 aerial / orbit view. The camera is fixed
 * (no chase, no orbit input) so this slice does not pull in the
 * VibeRacer chase rig (REQ-033) or input modules (REQ-034 / REQ-035).
 * The camera tilts down at the city center from a height proportional
 * to the cell size so a small starter city fits in frame on first load.
 */
export const CAMERA_FOV = 50
export const CAMERA_NEAR = 0.1
export const CAMERA_FAR = 1000
export const CAMERA_HEIGHT = CELL_SIZE * 24
export const CAMERA_DISTANCE = CELL_SIZE * 24

/**
 * Vertical lift used when rendering pieces on the ground plane. The
 * pieces sit a tiny fraction above `y = 0` so z-fighting with the
 * ground does not flicker the surface.
 */
export const PIECE_GROUND_LIFT = 0.02

/**
 * Building extrusion heights per type, in world units (REQ-046).
 * v1 buildings are placeholder primitives (Q-004 default B); the
 * heights are picked so the four types form a visible silhouette
 * vocabulary (small-house shortest, factory tallest) without
 * inventing per-type sprite art.
 */
export const BUILDING_HEIGHTS: Record<BuildingType, number> = {
  'small-house': CELL_SIZE * 0.6,
  'mid-house': CELL_SIZE * 1.0,
  shop: CELL_SIZE * 0.8,
  factory: CELL_SIZE * 1.6,
}

/**
 * Building colors per type (REQ-046). Distinct hues so the four
 * placeholder primitives read at a glance from the aerial drive view.
 */
export const BUILDING_COLORS: Record<BuildingType, number> = {
  'small-house': 0xc78f6a,
  'mid-house': 0xb56a4a,
  shop: 0x6b9bb5,
  factory: 0x6b6b6b,
}

/**
 * Piece colors per type (REQ-045). v1 renders every street piece as
 * a flat colored quad; per-piece glyphs (curve outlines, intersection
 * crosswalks) wait for the textured visuals slice. The cardinal
 * basics (`straight` / `left90` / `right90`) share the same asphalt
 * color; the curve / sweep / corner-connector variants get slightly
 * lighter shades so the shape vocabulary reads from the orbit view.
 */
export const DEFAULT_PIECE_COLOR = 0x4a4a4a
export const PIECE_COLORS: Partial<Record<PieceType, number>> = {
  straight: 0x4a4a4a,
  left90: 0x555555,
  right90: 0x555555,
  scurve: 0x5a5a5a,
  scurveLeft: 0x5a5a5a,
  sweepRight: 0x5a5a5a,
  sweepLeft: 0x5a5a5a,
  intersection: 0x6a6a6a,
  arc45: 0x5f5f5f,
  diagonal: 0x5f5f5f,
}

/**
 * Resolve the color used to render a piece. Falls back to the default
 * asphalt color so any piece type added to the schema in a later slice
 * still renders without a code change here.
 */
export function pieceColorFor(type: PieceType): number {
  return PIECE_COLORS[type] ?? DEFAULT_PIECE_COLOR
}

/**
 * Resolve the color used to render a building. Strict map lookup; the
 * `BuildingType` enum makes the lookup total.
 */
export function buildingColorFor(type: BuildingType): number {
  return BUILDING_COLORS[type]
}

/**
 * Resolve the extrusion height for a building. Strict map lookup;
 * the `BuildingType` enum makes the lookup total.
 */
export function buildingHeightFor(type: BuildingType): number {
  return BUILDING_HEIGHTS[type]
}

/**
 * Convert a grid cell `(row, col)` to a world-space `(x, z)` position
 * centered on the cell. Row indices grow downward (south, +z); column
 * indices grow rightward (east, +x), matching the editor convention
 * in `snapGrid.ts`.
 */
export function cellToWorld(row: number, col: number): { x: number; z: number } {
  return {
    x: col * CELL_SIZE,
    z: row * CELL_SIZE,
  }
}

/**
 * Compute the rectangular world-space bounding box (size + center) of
 * a city's placed footprint. Used by the drive scene to fit the
 * camera so a small starter city is visible on load. Returns `null`
 * when the city is empty so callers can show the empty-state prompt
 * (REQ-053).
 */
export function cityWorldBounds(
  pieces: readonly Piece[],
  buildings: readonly Building[],
): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  centerX: number
  centerZ: number
  width: number
  depth: number
} | null {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let saw = false
  const inflate = (row: number, col: number) => {
    saw = true
    const { x, z } = cellToWorld(row, col)
    const half = CELL_SIZE / 2
    if (x - half < minX) minX = x - half
    if (x + half > maxX) maxX = x + half
    if (z - half < minZ) minZ = z - half
    if (z + half > maxZ) maxZ = z + half
  }
  for (const piece of pieces) {
    const footprint = piece.footprint ?? [{ dr: 0, dc: 0 }]
    for (const cell of footprint) {
      inflate(piece.row + cell.dr, piece.col + cell.dc)
    }
  }
  for (const building of buildings) {
    inflate(building.row, building.col)
  }
  if (!saw) return null
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
  }
}

/**
 * Convert a piece rotation (0 / 90 / 180 / 270 degrees) to radians
 * around the world Y axis. The three.js scene rotates the piece quad
 * around its center so the persisted rotation flows through to the
 * rendered orientation.
 */
export function rotationToRadians(rotation: number): number {
  return (rotation * Math.PI) / 180
}
