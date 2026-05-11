import type { Building, Piece } from '@/lib/schemas'
import { CELL_SIZE } from '@/lib/cellSize'
import {
  buildingFootprintWorldSize,
  buildingHeightFor,
  cellToWorld,
  rotationToRadians,
} from './driveScene'

/**
 * Lit-window night ambience helpers (REQ-088 lit-window extension).
 *
 * Pure module: no three.js types in here so the unit tests can run
 * under a Node environment without dragging WebGL into the suite.
 * The three.js scene module (`DriveSceneClient.tsx`) consumes the
 * descriptors emitted here and constructs the actual `MeshBasicMaterial`
 * window quads + `THREE.PointLight` street lamps. The shape of those
 * descriptors mirrors the `brakeLightOffsets()` / `carWheelOffsets()`
 * pattern in `driveScene.ts`: positions, sizes, and rotations as plain
 * numbers, with no three.js dependency.
 *
 * Scope of this slice: extend the night palette to per-building window
 * panels (emissive quads on building faces) and per-intersection point
 * lights (a true scene light, not just an emissive bulb material). The
 * existing whole-body emissive tint and the streetlamp post / bulb mesh
 * pair already shipped in the `timeOfDay` slice; this module adds on top
 * of them rather than replacing them.
 */

/**
 * Warm-amber window-glow color. Picked to match the existing
 * `BUILDING_LIT_WINDOW_HEX_NIGHT` (`timeOfDay.ts`) so the per-face
 * window quads sit in the same color family as the whole-body emissive
 * baseline. Sat further toward yellow than the body emissive so the
 * quads read as the lit panels and the body emissive reads as a faint
 * underlying wall glow.
 */
export const WINDOW_GLOW_COLOR = 0xffd089

/**
 * Cool-white street-lamp color. Sits near the daylight side of the
 * spectrum so a point light cast onto the ground / nearby buildings
 * reads as a sodium-lamp pool of light rather than an extension of
 * the warm window glow. Distinct hue from `WINDOW_GLOW_COLOR` so the
 * two layers do not visually blend at intersection-adjacent buildings.
 */
export const STREET_LAMP_COLOR = 0xfff3d6

/**
 * Point-light intensity at intersection cells. Tuned so a single lamp
 * pools a few cells of soft light around the intersection without
 * washing out the per-building window quads. Three.js's
 * `PointLight.intensity` is a unitless multiplier; the renderer's
 * tonemapping / exposure stays at defaults.
 */
export const STREET_LAMP_INTENSITY = 1.4

/**
 * Point-light falloff distance in world units. Approximately three
 * cells of reach so the pool of light stops before crossing into the
 * next intersection's footprint, keeping the cap-of-8 lamps visually
 * distinct rather than blending into one citywide ambient bump.
 */
export const STREET_LAMP_DISTANCE = CELL_SIZE * 3

/**
 * Vertical position of the point-light bulb above the ground plane.
 * Sits at the same height as the streetlamp's emissive bulb mesh
 * (`timeOfDay.ts` post-and-bulb pair) so the visible bulb and the
 * actual scene light are colocated.
 */
export const STREET_LAMP_HEIGHT = CELL_SIZE * 0.65

/**
 * Maximum simultaneous street-lamp point lights (perf guard). A point
 * light adds a real GPU cost per frame; capping at 8 keeps the night
 * scene affordable on integrated GPUs even for large cities. Cities
 * with more than 8 intersections get street lamps on the first 8
 * intersections in placement order; the remaining intersections still
 * render the existing emissive bulb mesh (which carries no per-frame
 * light cost) so the silhouette is consistent across the grid.
 */
export const MAX_STREET_LAMPS = 8

/**
 * Number of window quads per visible face of a building. Two windows
 * per face read as a small storefront / two-room residence at the
 * orbit camera's distance without over-detailing the placeholder
 * silhouette. Increasing this is a polish slice; the value is exported
 * for unit-test invariants.
 */
export const WINDOWS_PER_FACE = 2

/**
 * Width of one window quad as a fraction of a face's full width. With
 * `WINDOWS_PER_FACE = 2` and a per-quad width of 0.22 cells, the two
 * windows sit on the inner two-thirds of the face with a margin on
 * each side and a gap between them. The remaining face area reads as
 * "wall" at orbit distance.
 */
export const WINDOW_WIDTH = CELL_SIZE * 0.22

/**
 * Height of one window quad in world units. Sized so a row of windows
 * at the body's mid-height reads as a single story; future polish can
 * stack two rows for taller buildings (e.g. the factory) but this
 * slice ships a single row.
 */
export const WINDOW_HEIGHT = CELL_SIZE * 0.22

/**
 * Slight lift away from the building face so the window quad does not
 * z-fight with the body extrusion. Two orders of magnitude smaller
 * than the cell size so the offset is invisible from the orbit camera.
 */
export const WINDOW_FACE_OFFSET = 0.02

/**
 * One window quad's placement on a building face, in world space. The
 * quad is rendered as a `MeshBasicMaterial` plane in three.js; the
 * `rotationY` rotates the plane around the world Y axis so it lies
 * flush against the building face it sits on.
 */
export interface WindowQuad {
  /** World-space x of the quad center. */
  x: number
  /** World-space y of the quad center (height above the ground). */
  y: number
  /** World-space z of the quad center. */
  z: number
  /** Quad width (along the face direction) in world units. */
  width: number
  /** Quad height in world units. */
  height: number
  /** Rotation around world Y, in radians, that lays the plane flush against the face. */
  rotationY: number
  /** Which of the four cardinal faces this quad sits on. Local to the building (rotation applied). */
  face: 'north' | 'east' | 'south' | 'west'
}

/**
 * Generate the window-quad descriptors for one building's four faces.
 *
 * Each face emits `WINDOWS_PER_FACE` evenly-spaced quads at the body's
 * mid-height. The face vectors are picked in the building's local
 * frame and rotated into world space via `rotationToRadians(building.rotation)`,
 * so a rotated building's windows stay glued to the rotated face.
 *
 * Returns a fresh array on every call so callers cannot mutate a shared
 * singleton. Position and size are in three.js world units (`CELL_SIZE = 4`).
 */
export function windowMeshesForBuilding(
  building: Pick<Building, 'type' | 'row' | 'col' | 'rotation'>,
): WindowQuad[] {
  const { x, z } = cellToWorld(building.row, building.col)
  const height = buildingHeightFor(building.type)
  const footprint = buildingFootprintWorldSize()
  const halfFootprint = footprint / 2
  // Single mid-height row for v1. Future polish can stack rows for
  // taller types (factory) without changing the descriptor shape.
  const windowCenterY = height / 2
  const heading = rotationToRadians(building.rotation)
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)

  const faces: { face: WindowQuad['face']; nx: number; nz: number }[] = [
    { face: 'south', nx: 0, nz: 1 },
    { face: 'north', nx: 0, nz: -1 },
    { face: 'east', nx: 1, nz: 0 },
    { face: 'west', nx: -1, nz: 0 },
  ]

  const out: WindowQuad[] = []
  for (const { face, nx, nz } of faces) {
    // Local face normal rotated into world space.
    const worldNx = nx * cos + nz * sin
    const worldNz = -nx * sin + nz * cos
    // Tangent vector along the face (perpendicular to the normal, in
    // the XZ plane). With normal = (worldNx, worldNz), tangent =
    // (-worldNz, worldNx) puts +tangent to the right of the outward
    // normal so windows scan left-to-right consistently across faces.
    const tx = -worldNz
    const tz = worldNx
    // Face center sits at the building anchor plus half the footprint
    // along the face normal, plus a tiny lift to dodge z-fighting.
    const faceCx = x + worldNx * (halfFootprint + WINDOW_FACE_OFFSET)
    const faceCz = z + worldNz * (halfFootprint + WINDOW_FACE_OFFSET)
    // Spread N quads evenly across the face width. With N = 2 and a
    // total spread of half the footprint, the quads sit at +/- quarter
    // of the face width from the center.
    const spread = footprint / 2
    const denominator = Math.max(1, WINDOWS_PER_FACE - 1)
    for (let i = 0; i < WINDOWS_PER_FACE; i++) {
      const t = (i / denominator - 0.5) * spread
      out.push({
        x: faceCx + tx * t,
        y: windowCenterY,
        z: faceCz + tz * t,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        // The quad is a PlaneGeometry (which faces +z in its local
        // frame). Rotating around Y by `atan2(worldNx, worldNz)`
        // turns the plane's local +z into the face's outward normal,
        // so the visible side faces away from the building.
        rotationY: Math.atan2(worldNx, worldNz),
        face,
      })
    }
  }
  return out
}

/**
 * One point-light descriptor at an intersection cell.
 */
export interface StreetLampLight {
  /** World-space x of the bulb. */
  x: number
  /** World-space y above the ground plane (matches the visible bulb mesh). */
  y: number
  /** World-space z of the bulb. */
  z: number
  /** Hex color of the emitted light. */
  color: number
  /** Three.js point-light intensity. */
  intensity: number
  /** Three.js point-light distance (falloff cutoff). */
  distance: number
}

/**
 * Build the point-light descriptor for one intersection piece. The
 * caller is responsible for capping the total number of lights (per
 * `MAX_STREET_LAMPS`); see `streetLampIntersections` for the deterministic
 * picker.
 *
 * The bulb sits at the same cell-center anchor + corner offset as the
 * existing emissive bulb mesh (see the streetlamp section in
 * `DriveSceneClient.tsx`) so the visible bulb and the actual point
 * light are colocated.
 */
export function streetLampForIntersection(piece: Piece): StreetLampLight {
  const { x, z } = cellToWorld(piece.row, piece.col)
  // Same corner offset the existing bulb mesh uses (`CELL_SIZE * 0.35`)
  // so the point light and the visible bulb sit at the same point.
  const offset = CELL_SIZE * 0.35
  return {
    x: x + offset,
    y: STREET_LAMP_HEIGHT,
    z: z + offset,
    color: STREET_LAMP_COLOR,
    intensity: STREET_LAMP_INTENSITY,
    distance: STREET_LAMP_DISTANCE,
  }
}

/**
 * Pick at most `max` intersection pieces (in placement order) so the
 * caller can spawn one point light per pick. The cap exists because a
 * point light is a real per-frame GPU cost; capping at 8 keeps the
 * night scene affordable on integrated GPUs.
 *
 * Returns a fresh array on every call. Non-intersection pieces are
 * filtered out; the filtered array's order matches the input order so
 * the picked intersections are deterministic across renders for the
 * same `city.pieces` array.
 */
export function streetLampIntersections(
  pieces: readonly Piece[],
  max: number = MAX_STREET_LAMPS,
): Piece[] {
  if (!Number.isFinite(max) || max <= 0) return []
  const out: Piece[] = []
  for (const piece of pieces) {
    if (piece.type !== 'intersection') continue
    out.push(piece)
    if (out.length >= max) break
  }
  return out
}
