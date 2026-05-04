import { CELL_SIZE } from './driveScene'

/**
 * Chase camera rig (REQ-033).
 *
 * Pure module: no three.js, no DOM. The drive scene client owns the
 * THREE.PerspectiveCamera and copies `position` / `target` out of the
 * rig each frame, then calls `camera.lookAt(target)` to apply the
 * orientation. Keeping the math in a pure module means the rig can be
 * unit-tested under a Node environment without dragging WebGL into
 * the suite.
 *
 * Conventions (must stay aligned with `driveControls.ts` and
 * `DriveSceneClient.tsx`):
 *
 *   - `+x` is east.
 *   - `+z` is south.
 *   - `heading` is in radians around the world Y axis.
 *   - Forward direction at heading `h` is `(sin(h), -cos(h))` so a
 *     heading of 0 advances the car along world `-z` (matches the
 *     placeholder car's local `-z = forward` convention).
 *
 * The chase rig sits behind the car (negative forward by `distance`)
 * at `height` and looks at a point `lookAhead` units in front of the
 * car. Both the camera position and the look target ease toward their
 * desired values via linear interpolation each frame so a sharp turn
 * does not snap the camera.
 */

/**
 * Tuning constants. The default preset is a chase-far view picked to
 * keep the placeholder car visible against the orbit-style ground
 * plane while still placing the camera close enough that the city
 * pieces in front of the car read.
 *
 * `lookAhead` is positive so the camera target sits ahead of the car;
 * the camera then naturally tilts down at the road in front of the
 * vehicle rather than at the car itself. Lerp factors are tuned so a
 * 60Hz refresh produces a smooth follow without lag that exceeds the
 * width of a road piece during normal driving.
 */
export const CAMERA_RIG_HEIGHT = CELL_SIZE * 1.6
export const CAMERA_RIG_DISTANCE = CELL_SIZE * 3.5
export const CAMERA_RIG_LOOK_AHEAD = CELL_SIZE * 1.5
export const CAMERA_RIG_TARGET_HEIGHT = CELL_SIZE * 0.25
export const CAMERA_RIG_POSITION_LERP = 0.12
export const CAMERA_RIG_TARGET_LERP = 0.2

export interface CameraRigParams {
  /** Camera height above the ground plane, in world units. */
  height: number
  /** Distance behind the car along its forward axis, in world units. */
  distance: number
  /** How far ahead of the car the look target sits, in world units. */
  lookAhead: number
  /** Height of the look target above the ground plane, in world units. */
  targetHeight: number
  /** Per-frame interpolation factor for the camera position (0..1). */
  positionLerp: number
  /** Per-frame interpolation factor for the look target (0..1). */
  targetLerp: number
}

/**
 * Default chase-far preset. Picked so the placeholder car (REQ-047)
 * sits in the lower-third of the frame with the road ahead filling
 * the upper two-thirds. Future settings (REQ-040) can override per
 * preset; v1 ships the default only.
 */
export const DEFAULT_CAMERA_RIG: CameraRigParams = {
  height: CAMERA_RIG_HEIGHT,
  distance: CAMERA_RIG_DISTANCE,
  lookAhead: CAMERA_RIG_LOOK_AHEAD,
  targetHeight: CAMERA_RIG_TARGET_HEIGHT,
  positionLerp: CAMERA_RIG_POSITION_LERP,
  targetLerp: CAMERA_RIG_TARGET_LERP,
}

/**
 * The mutable rig state held across frames. Position and target are
 * world-space coordinates the renderer feeds to the camera each tick.
 */
export interface CameraRigState {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
}

/**
 * Compute the desired camera position and look target for a car at
 * `(carX, carZ)` with the given heading. This is the snap-to value
 * `updateCameraRig` lerps toward; `createCameraRig` uses it for the
 * initial state.
 *
 * Forward at heading `h` is `(sin(h), -cos(h))`. The camera sits
 * `distance` units behind the car (negative forward) and the look
 * target sits `lookAhead` units in front of the car (positive forward).
 */
export function desiredRigPose(
  carX: number,
  carZ: number,
  heading: number,
  params: CameraRigParams = DEFAULT_CAMERA_RIG,
): CameraRigState {
  const fx = Math.sin(heading)
  const fz = -Math.cos(heading)
  return {
    position: {
      x: carX - fx * params.distance,
      y: params.height,
      z: carZ - fz * params.distance,
    },
    target: {
      x: carX + fx * params.lookAhead,
      y: params.targetHeight,
      z: carZ + fz * params.lookAhead,
    },
  }
}

/**
 * Build a fresh camera rig snapped to the desired pose for the given
 * car state. Used on car spawn so the first rendered frame already
 * has the camera behind the car instead of starting at the origin and
 * lerping in.
 */
export function createCameraRig(
  carX: number,
  carZ: number,
  heading: number,
  params: CameraRigParams = DEFAULT_CAMERA_RIG,
): CameraRigState {
  const pose = desiredRigPose(carX, carZ, heading, params)
  return {
    position: { ...pose.position },
    target: { ...pose.target },
  }
}

function clampLerp(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Advance the rig one frame toward the desired pose. Mutates `rig` in
 * place so the renderer can hold a single state object across frames
 * without allocating per tick. Both position and target ease via
 * independent lerp factors so the camera can settle on the car body
 * faster than it pans the look-ahead point (or vice versa) for arcade
 * feel.
 */
export function updateCameraRig(
  rig: CameraRigState,
  carX: number,
  carZ: number,
  heading: number,
  params: CameraRigParams = DEFAULT_CAMERA_RIG,
): void {
  const pose = desiredRigPose(carX, carZ, heading, params)
  const positionLerp = clampLerp(params.positionLerp)
  const targetLerp = clampLerp(params.targetLerp)
  rig.position.x += (pose.position.x - rig.position.x) * positionLerp
  rig.position.y += (pose.position.y - rig.position.y) * positionLerp
  rig.position.z += (pose.position.z - rig.position.z) * positionLerp
  rig.target.x += (pose.target.x - rig.target.x) * targetLerp
  rig.target.y += (pose.target.y - rig.target.y) * targetLerp
  rig.target.z += (pose.target.z - rig.target.z) * targetLerp
}
