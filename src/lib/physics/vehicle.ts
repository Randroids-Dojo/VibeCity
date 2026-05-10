import type { DriveInput } from '@/lib/input/vehicleControls'

/**
 * Planar arcade vehicle integrator. Game-agnostic.
 *
 * A scalar-speed throttle / brake / coast model with heading rotation
 * driven by a speed-scaled steering rate. Pure module: no three.js,
 * no DOM. The consumer owns the animation loop and feeds `dt` plus
 * the per-frame `DriveInput` snapshot from `@/lib/input/vehicleControls`.
 *
 * Coordinate convention (consumer must align):
 *   - `+x` is east, `+z` is south.
 *   - `heading` is in radians around the world Y axis.
 *   - Forward at heading `h` is `(sin(h), -cos(h))` so `heading = 0`
 *     advances the vehicle along world `-z`.
 *
 * Speed is signed: positive is forward along the heading vector,
 * negative is reverse. Reverse caps at `maxReverseSpeed`. Reverse also
 * flips the steering sign so the vehicle pivots from the rear axle.
 *
 * VibeCity's drive scene (REQ-031) is the v1 consumer; tuning values
 * are derived from `CELL_SIZE` in the consumer's wrapper. Future
 * games can build their own `VehicleTuning` from their own world-unit
 * scale.
 */

/** Per-frame integration tunables. All values in world units per second (or radians/sec). */
export interface VehicleTuning {
  /** Forward speed cap. */
  maxSpeed: number
  /** Reverse speed cap (positive number; speed clamps to `-maxReverseSpeed`). */
  maxReverseSpeed: number
  /** Forward acceleration when throttle is held alone. */
  acceleration: number
  /** Deceleration applied when brake is held while moving forward. */
  brakeDeceleration: number
  /** Drag pulling speed back toward zero when neither throttle nor brake is held. */
  coastDrag: number
  /** Steering rate (rad/sec) at zero speed. Higher value lets a parked vehicle pivot in place faster. */
  steerRateAtRest: number
  /** Steering rate (rad/sec) at peak speed. Lower value damps high-speed swerve. */
  steerRateAtMaxSpeed: number
  /**
   * Minimum |speed| (world units / sec) below which steering input is
   * ignored. Mirrors VibeRacer's `minSpeedForSteering` so a stationary
   * tap on left / right does not pivot the heading; pressing the key
   * while moving still rotates as before. Set to 0 to keep the legacy
   * "pivot in place" behavior. Optional so tunings predating this field
   * stay valid.
   */
  minSpeedForSteering?: number
  /** Frame-delta clamp (seconds). Caps a long pause-then-resume so the vehicle does not teleport. */
  maxDeltaSeconds: number
}

/**
 * The pure vehicle state. Position is in world units; heading is in
 * radians around the world Y axis. Speed is signed.
 */
export interface VehicleState {
  x: number
  z: number
  heading: number
  speed: number
}

/**
 * Build a fresh vehicle state at the spawn anchor with zero speed.
 */
export function createVehicleState(params: {
  x: number
  z: number
  heading: number
}): VehicleState {
  return {
    x: params.x,
    z: params.z,
    heading: params.heading,
    speed: 0,
  }
}

/**
 * Compute the steering rate (radians per second) at the given forward
 * speed under the supplied tuning. Linear interpolation between
 * `steerRateAtRest` (when `|speed| === 0`) and `steerRateAtMaxSpeed`
 * (when `|speed| >= maxSpeed`).
 */
export function steerRateForSpeed(speed: number, tuning: VehicleTuning): number {
  const magnitude = Math.min(Math.abs(speed), tuning.maxSpeed)
  const t = magnitude / tuning.maxSpeed
  return (
    tuning.steerRateAtRest +
    (tuning.steerRateAtMaxSpeed - tuning.steerRateAtRest) * t
  )
}

/**
 * Advance the vehicle state by `dt` seconds under the given input
 * and tuning. Returns a fresh `VehicleState`; never mutates the input
 * object so callers can hold the previous state for diffing.
 *
 * Integration order:
 *   1. Throttle adds forward acceleration; brake decelerates if
 *      moving forward, otherwise applies reverse acceleration.
 *   2. When neither throttle nor brake is held, drag pulls speed
 *      toward zero so the vehicle coasts to a stop.
 *   3. Speed is clamped to [-maxReverseSpeed, maxSpeed].
 *   4. Steering rotates heading by `steerRateForSpeed(speed, tuning) * dt`
 *      in the input direction. Reverse flips the steering sign so the
 *      vehicle steers from the rear axle, matching driver intuition.
 *   5. Position advances along the heading by `speed * dt`.
 *
 * `dt` is clamped to `tuning.maxDeltaSeconds` so a long pause cannot
 * teleport the vehicle on resume. Non-finite or non-positive `dt`
 * is a no-op (returns `state` unchanged).
 */
export function applyDriveStep(
  state: VehicleState,
  input: DriveInput,
  dt: number,
  tuning: VehicleTuning,
): VehicleState {
  if (!Number.isFinite(dt) || dt <= 0) {
    return state
  }
  const step = Math.min(dt, tuning.maxDeltaSeconds)

  let speed = state.speed
  if (input.throttle && !input.brake) {
    speed += tuning.acceleration * step
  } else if (input.brake && !input.throttle) {
    if (speed > 0) {
      speed -= tuning.brakeDeceleration * step
      if (speed < 0) speed = 0
    } else {
      speed -= tuning.acceleration * step
    }
  } else {
    // Coast: drag pulls speed toward zero.
    if (speed > 0) {
      speed -= tuning.coastDrag * step
      if (speed < 0) speed = 0
    } else if (speed < 0) {
      speed += tuning.coastDrag * step
      if (speed > 0) speed = 0
    }
  }

  if (speed > tuning.maxSpeed) speed = tuning.maxSpeed
  if (speed < -tuning.maxReverseSpeed) speed = -tuning.maxReverseSpeed

  let heading = state.heading
  if (input.steerLeft !== input.steerRight) {
    // Mirror VibeRacer: ignore steering input below a small speed
    // threshold so a stationary tap on left / right does not pivot the
    // heading (which would whip the chase camera around a parked car).
    // Tunings predating this field default to 0 so the legacy
    // pivot-in-place behavior is preserved.
    const minSpeed = tuning.minSpeedForSteering ?? 0
    if (Math.abs(speed) >= minSpeed) {
      const rate = steerRateForSpeed(speed, tuning)
      // Reverse flips the steer direction so the vehicle pivots from
      // the rear axle, matching driver intuition.
      const sign = speed < 0 ? -1 : 1
      const direction = input.steerLeft ? -1 : 1
      heading += direction * sign * rate * step
    }
  }

  // Advance position along the heading. Forward (+ speed) moves the
  // vehicle in the direction the nose points; with `+x = east`,
  // `+z = south`, and the vehicle's local `-z = forward`, a heading of
  // 0 advances along world `-z` and `Math.PI / 2` advances along `+x`.
  const x = state.x + Math.sin(heading) * speed * step
  const z = state.z - Math.cos(heading) * speed * step

  return { x, z, heading, speed }
}
