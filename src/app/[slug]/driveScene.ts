import type {
  Building,
  BuildingType,
  Piece,
  PieceFootprintCell,
  PieceType,
} from '@/lib/schemas'

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

/**
 * Default single-cell footprint used when a piece does not declare its
 * own. Mirrors the canonical default in `edit/snapGrid.ts`'s
 * `pieceFootprintCells`; duplicated here so this module stays free of
 * the editor-only dependency tree.
 */
const DEFAULT_PIECE_FOOTPRINT: readonly PieceFootprintCell[] = [
  { dr: 0, dc: 0 },
]

/**
 * Resolve a piece's footprint to absolute cell coordinates, paired with
 * the world-space center of each cell so the drive scene can drop one
 * ground quad per occupied cell. Single-cell pieces (which omit the
 * `footprint` field) expand to one entry at `(piece.row, piece.col)`;
 * multi-cell pieces (mega sweep, hairpin, future arc45 / diagonal once
 * REQ-059 lands) expand to one entry per declared cell so a placed
 * piece never leaves visual holes on the ground plane while the
 * footprint contract is satisfied.
 *
 * Returns a fresh array on each call so callers cannot mutate a shared
 * singleton.
 */
export function pieceFootprintWorldCells(
  piece: Piece,
): { row: number; col: number; x: number; z: number }[] {
  const footprint = piece.footprint ?? DEFAULT_PIECE_FOOTPRINT
  return footprint.map((cell) => {
    const row = piece.row + cell.dr
    const col = piece.col + cell.dc
    const { x, z } = cellToWorld(row, col)
    return { row, col, x, z }
  })
}

/**
 * Spawn-marker visual defaults (REQ-036). v1 ships a small chevron-shaped
 * placeholder mesh at the spawn anchor so an author can see where their
 * future vehicle (REQ-047) will appear when the physics slice (REQ-031)
 * lands. The size is a fraction of `CELL_SIZE` so the marker reads as a
 * point of interest without overpowering the placed pieces.
 *
 * The placeholder car (REQ-047) sits at the same spawn anchor and reads
 * as the player vehicle from frame zero. We keep the marker constants
 * exported so a future slice that swaps the car for a higher-fidelity
 * model can still reference the same anchor footprint while the
 * placeholder car is in flight.
 */
export const SPAWN_MARKER_COLOR = 0xd94f3a
export const SPAWN_MARKER_LENGTH = CELL_SIZE * 0.6
export const SPAWN_MARKER_WIDTH = CELL_SIZE * 0.32
export const SPAWN_MARKER_HEIGHT = CELL_SIZE * 0.22

/**
 * Placeholder player-vehicle visual defaults (REQ-047).
 *
 * v1 ships a small primitive-composed car (body + cabin + four wheels)
 * at the spawn anchor so the build / drive loop has a visible vehicle
 * ahead of the physics slice (REQ-031) and the chase camera (REQ-033).
 * The car is a static mesh in v1; it does not move. The next slices
 * attach the keyboard input (REQ-034), physics integrator (REQ-031),
 * and chase camera (REQ-033) to the same mesh.
 *
 * Dimensions are sized so the car reads from the orbit camera without
 * overpowering the placed pieces (a single CELL_SIZE quad is the road
 * surface). `CAR_LENGTH > CAR_WIDTH` so the forward axis is visually
 * unambiguous; the body sits above the wheels so the silhouette is
 * recognizable as a car, not a chevron.
 *
 * Colors pick a saturated red body so the car reads against the
 * asphalt-grey pieces and the cream ground plane; the cabin is a
 * slightly darker shade so the windscreen line is legible from the
 * orbit camera; wheels are near-black so the contact patch reads.
 */
export const CAR_BODY_COLOR = 0xc0392b
export const CAR_CABIN_COLOR = 0x8e2a1f
export const CAR_WHEEL_COLOR = 0x1c1c1c

export const CAR_LENGTH = CELL_SIZE * 0.7
export const CAR_WIDTH = CELL_SIZE * 0.36
export const CAR_BODY_HEIGHT = CELL_SIZE * 0.18
export const CAR_CABIN_LENGTH = CELL_SIZE * 0.34
export const CAR_CABIN_WIDTH = CELL_SIZE * 0.32
export const CAR_CABIN_HEIGHT = CELL_SIZE * 0.14
export const CAR_CABIN_OFFSET = CELL_SIZE * 0.06
export const CAR_WHEEL_RADIUS = CELL_SIZE * 0.08
export const CAR_WHEEL_THICKNESS = CELL_SIZE * 0.05
export const CAR_WHEEL_INSET = CELL_SIZE * 0.04
export const CAR_AXLE_OFFSET = CELL_SIZE * 0.22
export const CAR_GROUND_LIFT = CELL_SIZE * 0.02

/**
 * Pure description of where the four wheels of the placeholder car sit
 * relative to the car body's local origin. The local space convention
 * matches the placed mesh: `+x` is the right side, `-z` is the forward
 * axis (so a car pointing along `+z = 0` faces the camera in the orbit
 * view), and the body origin is centered. Returns a fresh array so a
 * caller cannot mutate a shared singleton.
 */
export function carWheelOffsets(): readonly {
  x: number
  z: number
  side: 'left' | 'right'
  axle: 'front' | 'rear'
}[] {
  const halfWidth = CAR_WIDTH / 2 - CAR_WHEEL_INSET
  return [
    { x: -halfWidth, z: -CAR_AXLE_OFFSET, side: 'left', axle: 'front' },
    { x: halfWidth, z: -CAR_AXLE_OFFSET, side: 'right', axle: 'front' },
    { x: -halfWidth, z: CAR_AXLE_OFFSET, side: 'left', axle: 'rear' },
    { x: halfWidth, z: CAR_AXLE_OFFSET, side: 'right', axle: 'rear' },
  ]
}

/**
 * Vertical position of the car body's geometric center above the
 * ground plane. Lifts by `CAR_GROUND_LIFT` so the wheels touch the
 * ground without z-fighting, then by half the body height so the
 * BoxGeometry center sits at the body's middle.
 */
export function carBodyY(): number {
  return CAR_GROUND_LIFT + CAR_WHEEL_RADIUS + CAR_BODY_HEIGHT / 2
}

/**
 * Vertical position of the cabin's geometric center. Sits on top of
 * the body, offset upward by half the cabin height.
 */
export function carCabinY(): number {
  return (
    CAR_GROUND_LIFT +
    CAR_WHEEL_RADIUS +
    CAR_BODY_HEIGHT +
    CAR_CABIN_HEIGHT / 2
  )
}

/**
 * The deterministic spawn cell for a city (REQ-036).
 *
 * Returns `(piece.row, piece.col)` of the first placed street piece,
 * or the grid origin `(0, 0)` when no street pieces exist. This is
 * the cell the vehicle will spawn on once the physics slice (REQ-031)
 * lands; v1 visualizes it as a chevron-shaped placeholder marker so a
 * builder can see where the car will appear before driving.
 *
 * "First placed" is the first piece in `city.pieces`. The editor's
 * `placePiece` reducer appends to that array (REQ-020) so the array
 * order is the placement order, and the spawn anchor stays stable as
 * long as the first piece is not erased. Erasing the first piece
 * shifts the anchor to the next-placed piece, which is the simplest
 * consistent behavior for a builder who can re-place the original
 * piece to restore the anchor.
 *
 * Buildings do not affect the spawn anchor because v1 cannot drive
 * through buildings (REQ-030 off-street penalty); spawning on a
 * building cell would put the car off-street from frame zero.
 */
export function spawnAnchor(
  pieces: readonly Piece[],
): { row: number; col: number } {
  const first = pieces[0]
  if (!first) return { row: 0, col: 0 }
  return { row: first.row, col: first.col }
}
