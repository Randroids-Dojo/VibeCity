import {
  CAMERA_RIG_POSITION_LERP,
  CAMERA_RIG_TARGET_HEIGHT,
  CAMERA_RIG_TARGET_LERP,
  type CameraRigParams,
} from '@/lib/render/cameraRig'
import {
  DEFAULT_CAMERA_TUNING,
  type CameraTuning,
} from '@/lib/controlsPersistence'

/**
 * Camera tuning settings UI bounds and helpers (REQ-040).
 *
 * Pure module: no React, no DOM, no three.js. The settings panel
 * (rendered inside the pause menu, see REQ-039 / REQ-038) reads the
 * slider bounds from this module so a rebalance updates the bounds in
 * one place. The persistence layer in `src/lib/controlsPersistence.ts`
 * accepts any finite number in the documented bounds; this module
 * narrows the surface area to what a slider can actually produce.
 *
 * The chase rig in `cameraRig.ts` consumes a `CameraRigParams` shape
 * carrying `targetHeight` / `positionLerp` / `targetLerp`. The persisted
 * `CameraTuning` shape does not carry those fields because v1 only
 * exposes the five settings the player can tune (height, distance,
 * lookAhead, followSpeed, fov). `toCameraRigParams` bridges the two by
 * pulling the tunable fields from `tuning` and the fixed fields from
 * the cameraRig defaults so the rig contract stays satisfied while the
 * persistence shape stays minimal. `followSpeed` maps to the rig's
 * position lerp; the target lerp stays at the cameraRig default so a
 * future slice that exposes a separate target follow rate has a clean
 * extension point.
 *
 * `clampCameraTuning` snaps every field of an input `CameraTuning` into
 * the documented slider bounds and snaps to the slider step so a
 * persisted value loaded from a future migration cannot land between
 * slider stops; non-finite inputs collapse to the default for that
 * field. Callers that want to apply a slider event should pass the raw
 * slider value through `clampCameraTuning` before persisting via
 * `saveControls` so a stale or out-of-range value cannot leak into the
 * rig.
 */

/**
 * Slider bound shape. Each tunable field on `CameraTuning` exposes a
 * minimum, a maximum, and a step; the panel renders a labeled slider
 * for each. The bounds are conservative: a slider at min produces a
 * usable view (camera close to the car, narrow fov, slow follow); a
 * slider at max produces an extreme but still-functional view (camera
 * far from the car, wide fov, instant follow). Values outside these
 * bounds are clamped on save so a future rebalance that loosens the
 * bounds does not break a previously-persisted tuning.
 */
export interface CameraSliderBound {
  min: number
  max: number
  step: number
  label: string
}

/**
 * Per-field slider bounds (REQ-040). The min / max ranges are picked
 * to cover the visually useful range without producing an unplayable
 * view at either extreme: a height of 1 still places the camera above
 * the car, a height of 20 still keeps the road in frame; a fov of 30
 * is a tight zoom but still tracks the car, a fov of 120 is a wide
 * fisheye but still renders. Steps are picked so a single slider step
 * is a perceivable change without being jumpy: 0.5 world units for
 * positional fields, 1 degree for fov, 0.01 for the follow lerp.
 */
export const CAMERA_SLIDER_BOUNDS: Record<keyof CameraTuning, CameraSliderBound> = {
  height: { min: 1, max: 20, step: 0.2, label: 'Height' },
  distance: { min: 4, max: 30, step: 0.2, label: 'Distance' },
  lookAhead: { min: 0, max: 16, step: 0.2, label: 'Look ahead' },
  followSpeed: { min: 0.02, max: 1, step: 0.01, label: 'Follow speed' },
  fov: { min: 30, max: 120, step: 1, label: 'Field of view' },
}

/**
 * Snap a numeric value to the nearest slider step inside the slider
 * bounds. Used by `clampCameraTuning` so a persisted value loaded from
 * a future migration cannot land between slider stops; the panel's own
 * `<input type="range">` already snaps to the step natively.
 */
export function snapToSliderStep(value: number, bound: CameraSliderBound): number {
  if (!Number.isFinite(value)) return bound.min
  if (value <= bound.min) return bound.min
  if (value >= bound.max) return bound.max
  const offset = value - bound.min
  const steps = Math.round(offset / bound.step)
  const snapped = bound.min + steps * bound.step
  if (snapped < bound.min) return bound.min
  if (snapped > bound.max) return bound.max
  // Round to the step's precision so slider values render cleanly in
  // the panel readout (e.g. 0.51 + 0.01 floating noise rounds back to
  // 0.52 rather than 0.5200000000000001).
  const decimals = bound.step < 1 ? Math.max(0, -Math.floor(Math.log10(bound.step))) : 0
  const factor = Math.pow(10, decimals)
  return Math.round(snapped * factor) / factor
}

/**
 * Clamp every field of an input `CameraTuning` into its slider bound
 * and snap to the slider step. Non-finite inputs collapse to the
 * default for that field so a malformed slider event cannot poison the
 * persisted value. Returns a fresh object so the caller does not have
 * to defensively clone.
 */
export function clampCameraTuning(tuning: CameraTuning): CameraTuning {
  return {
    height: snapToSliderStep(tuning.height, CAMERA_SLIDER_BOUNDS.height),
    distance: snapToSliderStep(tuning.distance, CAMERA_SLIDER_BOUNDS.distance),
    lookAhead: snapToSliderStep(tuning.lookAhead, CAMERA_SLIDER_BOUNDS.lookAhead),
    followSpeed: snapToSliderStep(
      tuning.followSpeed,
      CAMERA_SLIDER_BOUNDS.followSpeed,
    ),
    fov: snapToSliderStep(tuning.fov, CAMERA_SLIDER_BOUNDS.fov),
  }
}

/**
 * Bridge a persisted `CameraTuning` into the `CameraRigParams` shape
 * the chase rig consumes. The persisted shape carries only the five
 * fields the player can tune; the fixed fields (target height, target
 * lerp) come from the cameraRig defaults so the rig contract stays
 * satisfied without exposing those fields in v1's settings UI.
 *
 * `followSpeed` maps to `positionLerp` (the camera's position follow
 * rate); `targetLerp` stays at the cameraRig default. A future slice
 * that exposes a separate target-follow rate slider can extend the
 * persisted shape and override here without breaking existing saves.
 */
export function toCameraRigParams(tuning: CameraTuning): CameraRigParams {
  return {
    height: tuning.height,
    distance: tuning.distance,
    lookAhead: tuning.lookAhead,
    targetHeight: CAMERA_RIG_TARGET_HEIGHT,
    positionLerp: tuning.followSpeed,
    targetLerp: CAMERA_RIG_TARGET_LERP,
  }
}

/**
 * The cameraRig defaults that cannot be tuned via the v1 settings UI.
 * Re-exported here so tests can assert the bridge picks them up
 * verbatim and a future slice that exposes them as new sliders has a
 * clean extension point.
 */
export const CAMERA_SETTINGS_FIXED_RIG_FIELDS = {
  targetHeight: CAMERA_RIG_TARGET_HEIGHT,
  positionLerp: CAMERA_RIG_POSITION_LERP,
  targetLerp: CAMERA_RIG_TARGET_LERP,
}

/**
 * Re-export the persisted defaults so a single import site covers both
 * the slider bounds and the default values when the panel mounts. The
 * panel reads `DEFAULT_CAMERA_TUNING` to seed its slider state when
 * `loadControls` returns the defaults (no persisted payload).
 */
export { DEFAULT_CAMERA_TUNING }
