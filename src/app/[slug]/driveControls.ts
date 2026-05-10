import { CELL_SIZE } from './driveScene'
import {
  DEFAULT_KEY_BINDINGS,
  emptyInput,
  inputFromPressedKeys,
  type DriveInput,
} from '@/lib/input/vehicleControls'
import {
  applyDriveStep as libApplyDriveStep,
  createVehicleState as libCreateVehicleState,
  steerRateForSpeed as libSteerRateForSpeed,
  type VehicleState,
  type VehicleTuning,
} from '@/lib/physics/vehicle'

// Re-export the input plumbing primitives so existing call sites in
// the drive app tree do not change.
export {
  DEFAULT_KEY_BINDINGS,
  emptyInput,
  inputFromPressedKeys,
  type DriveInput,
}

// Re-export the vehicle state type from the lib for the same reason.
export type { VehicleState }

/**
 * Drive-mode keyboard controls and kinematic vehicle integration
 * (REQ-034 keyboard input, REQ-031 vehicle physics first slice).
 *
 * Pure module: no three.js, no DOM. The drive scene client owns the
 * window event listeners and the animation loop and calls into these
 * helpers each frame so the integration math is fully unit-testable.
 *
 * v1 ships a planar arcade integrator: throttle and brake change a
 * scalar forward speed, steering rotates the heading at a rate
 * proportional to current speed (so the car steers more sharply when
 * moving slower, matching driver intuition). Drag pulls the speed back
 * toward zero when no throttle / brake is applied so the car coasts
 * to a stop. Off-street penalty (REQ-054), wheel contact (REQ-032),
 * and the chase camera (REQ-033) wait for their own slices.
 */

/**
 * Vehicle integration tuning (REQ-031).
 *
 * Ported from VibeRacer's stock `CAR_PARAMS`
 * (`../VibeRacer/src/lib/derbyVehicles.ts:48`) so the driving feel
 * matches the sister project. VibeRacer uses `CELL_SIZE = 20`; VibeCity
 * uses `CELL_SIZE = 4`, so the linear-velocity values scale by `4 / 20`
 * to keep the cells-per-second feel consistent. Angular values
 * (`steerRate*`) carry over unchanged because they are
 * scene-scale-independent (radians/sec).
 *
 * Cells/sec ratios after scaling:
 * - `MAX_SPEED = 4.8` world units/sec = 1.2 cells/sec (matches
 *   VibeRacer's stock `24 / 20 = 1.2`).
 * - `STEER_RATE_AT_REST = 2.4 rad/s` and `STEER_RATE_AT_MAX_SPEED =
 *   2.0 rad/s` ported verbatim from VibeRacer.
 *
 * `MIN_SPEED_FOR_STEERING` mirrors VibeRacer's `minSpeedForSteering`
 * so a stationary tap on left / right does not pivot the heading
 * (which would whip the chase camera around a parked car). The
 * dedicated rotate-in-place affordance is the editor's rotate tool,
 * not the drive scene.
 */
export const MAX_SPEED = CELL_SIZE * 1.2
export const MAX_REVERSE_SPEED = CELL_SIZE * 0.45
export const ACCELERATION = CELL_SIZE * 0.8
export const BRAKE_DECELERATION = CELL_SIZE * 1.6
export const COAST_DRAG = CELL_SIZE * 0.2
export const STEER_RATE_AT_REST = 2.4
export const STEER_RATE_AT_MAX_SPEED = 2.0
export const MIN_SPEED_FOR_STEERING = CELL_SIZE * 0.03

/**
 * Maximum frame delta the integrator accepts (in seconds). A long
 * pause (tab in the background, devtools breakpoint) can produce a
 * delta of many seconds; clamping here keeps the car from teleporting
 * across the map on the first frame after the pause resolves.
 */
export const MAX_DELTA_SECONDS = 1 / 15

/**
 * VibeCity-specific vehicle tuning preset bound to `CELL_SIZE` so the
 * integrator stays inside the world. Future games with a different
 * unit size build their own `VehicleTuning` value from
 * `@/lib/physics/vehicle`.
 */
const VEHICLE_TUNING: VehicleTuning = {
  maxSpeed: MAX_SPEED,
  maxReverseSpeed: MAX_REVERSE_SPEED,
  acceleration: ACCELERATION,
  brakeDeceleration: BRAKE_DECELERATION,
  coastDrag: COAST_DRAG,
  steerRateAtRest: STEER_RATE_AT_REST,
  steerRateAtMaxSpeed: STEER_RATE_AT_MAX_SPEED,
  minSpeedForSteering: MIN_SPEED_FOR_STEERING,
  maxDeltaSeconds: MAX_DELTA_SECONDS,
}

/**
 * Build a fresh vehicle state at the spawn anchor. Thin wrapper over
 * the lib helper.
 */
export function createVehicleState(params: {
  x: number
  z: number
  heading: number
}): VehicleState {
  return libCreateVehicleState(params)
}

/**
 * Compute the steering rate (radians per second) at the given forward
 * speed under the city's vehicle tuning. Thin wrapper over the lib.
 */
export function steerRateForSpeed(speed: number): number {
  return libSteerRateForSpeed(speed, VEHICLE_TUNING)
}

/**
 * Advance the vehicle state by `dt` seconds under the given input
 * and the city's vehicle tuning. Thin wrapper over the lib helper.
 */
export function applyDriveStep(
  state: VehicleState,
  input: DriveInput,
  dt: number,
): VehicleState {
  return libApplyDriveStep(state, input, dt, VEHICLE_TUNING)
}

