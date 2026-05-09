/**
 * Generic three.js scene defaults. Game-agnostic.
 *
 * The constants here are starting-point values for an outdoor scene
 * with one directional key light, ambient fill, and a perspective
 * camera. VibeCity's drive scene (REQ-044) is the v1 consumer.
 *
 * The constants do not import three.js so this module stays bundleable
 * in any context (server components, tests, future menu surfaces).
 * The consumer instantiates the THREE.* objects and feeds these
 * defaults in.
 */

/**
 * Ambient light intensity. Keeps the unlit faces of extruded geometry
 * from going pure black. Pair with a directional key light for depth.
 */
export const DEFAULT_AMBIENT_LIGHT_INTENSITY = 0.6

/**
 * Directional key-light intensity. Casts a noon-style top light when
 * positioned above and slightly to one side of the scene origin.
 */
export const DEFAULT_DIRECTIONAL_LIGHT_INTENSITY = 0.9

/**
 * Directional key-light position (world units). Placed above and
 * slightly south-east of the origin so extrusions read with depth.
 * Tuple shape so a consumer can spread it into `light.position.set(...)`.
 */
export const DEFAULT_DIRECTIONAL_LIGHT_POSITION: readonly [
  number,
  number,
  number,
] = [60, 100, 40]

/**
 * Perspective-camera FOV in degrees. 50 is a comfortable default for
 * an aerial / chase-cam outdoor scene.
 */
export const DEFAULT_CAMERA_FOV = 50

/**
 * Perspective-camera near plane (world units). 0.1 keeps geometry
 * close to the camera from clipping while staying above the
 * floating-point depth-precision floor.
 */
export const DEFAULT_CAMERA_NEAR = 0.1

/**
 * Perspective-camera far plane (world units). 1000 covers a small
 * starter scene with room to grow.
 */
export const DEFAULT_CAMERA_FAR = 1000
