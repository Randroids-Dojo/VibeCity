import { CELL_SIZE } from './driveScene'

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
 * The set of logical actions a key binding can map to. Mirrors
 * VibeRacer's `DEFAULT_KEY_BINDINGS` action vocabulary so a future
 * keybinding pane (REQ-041) can reuse this taxonomy.
 */
export type DriveAction = 'throttle' | 'brake' | 'steerLeft' | 'steerRight'

/**
 * Default key bindings (REQ-034). WASD plus arrow keys cover both
 * common keyboard layouts; the binding table is a many-to-one map so
 * a single action can be triggered by either layout. Picked to match
 * VibeRacer's default arcade scheme.
 *
 * Keys are matched against `KeyboardEvent.code` so the layout is
 * stable across QWERTY / AZERTY / Dvorak; a future locale-aware
 * rebinding pane (REQ-041) can swap the table without touching the
 * integrator.
 */
export const DEFAULT_KEY_BINDINGS: Readonly<Record<string, DriveAction>> = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'steerLeft',
  ArrowLeft: 'steerLeft',
  KeyD: 'steerRight',
  ArrowRight: 'steerRight',
}

/**
 * Vehicle integration tuning (REQ-031 first slice).
 *
 * All values are in world units per second (or radians per second for
 * angular). `MAX_SPEED` is bounded so the integrator stays inside the
 * scene; `STEER_RATE_AT_MAX_SPEED` plus `STEER_RATE_AT_REST` define
 * the linear interpolation used by `applyDriveStep` to scale steering
 * rate by current speed. Reverse caps at half forward speed so the
 * car cannot rocket backward through buildings.
 */
export const MAX_SPEED = CELL_SIZE * 8
export const MAX_REVERSE_SPEED = CELL_SIZE * 4
export const ACCELERATION = CELL_SIZE * 6
export const BRAKE_DECELERATION = CELL_SIZE * 12
export const COAST_DRAG = CELL_SIZE * 3
export const STEER_RATE_AT_REST = Math.PI * 1.6
export const STEER_RATE_AT_MAX_SPEED = Math.PI * 0.8

/**
 * Maximum frame delta the integrator accepts (in seconds). A long
 * pause (tab in the background, devtools breakpoint) can produce a
 * delta of many seconds; clamping here keeps the car from teleporting
 * across the map on the first frame after the pause resolves.
 */
export const MAX_DELTA_SECONDS = 1 / 15

/**
 * The pure vehicle state. Position is in world units; heading is in
 * radians around the world Y axis (matches the three.js convention
 * used by `DriveSceneClient`). Speed is signed: positive is forward
 * along the heading vector, negative is reverse.
 */
export interface VehicleState {
  x: number
  z: number
  heading: number
  speed: number
}

/**
 * The per-frame input snapshot the integrator consumes. Each flag
 * reflects whether at least one binding for that action is currently
 * pressed. Mirrors VibeRacer's `DriveInput` shape.
 */
export interface DriveInput {
  throttle: boolean
  brake: boolean
  steerLeft: boolean
  steerRight: boolean
}

/**
 * Build a fresh vehicle state at the spawn anchor. Heading is in
 * radians and matches the persisted rotation of the first piece (the
 * drive scene client converts the piece rotation via
 * `rotationToRadians` before calling here).
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
 * Build an empty input snapshot. Used by callers that want to start
 * from a clean state before merging the live keyboard set.
 */
export function emptyInput(): DriveInput {
  return {
    throttle: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
  }
}

/**
 * Translate the live set of pressed key codes into a `DriveInput`
 * snapshot via the binding table. Unknown keys are ignored.
 */
export function inputFromPressedKeys(
  pressed: ReadonlySet<string>,
  bindings: Readonly<Record<string, DriveAction>> = DEFAULT_KEY_BINDINGS,
): DriveInput {
  const input = emptyInput()
  for (const code of pressed) {
    const action = bindings[code]
    if (!action) continue
    input[action] = true
  }
  return input
}

/**
 * Compute the steering rate (radians per second) at the given forward
 * speed. Linear interpolation between `STEER_RATE_AT_REST` (when
 * `|speed| === 0`) and `STEER_RATE_AT_MAX_SPEED` (when `|speed| >=
 * MAX_SPEED`). The car turns more sharply at low speed so a parked
 * car can pivot in place; high-speed turns feel less twitchy.
 */
export function steerRateForSpeed(speed: number): number {
  const magnitude = Math.min(Math.abs(speed), MAX_SPEED)
  const t = magnitude / MAX_SPEED
  return STEER_RATE_AT_REST + (STEER_RATE_AT_MAX_SPEED - STEER_RATE_AT_REST) * t
}

/**
 * Advance the vehicle state by `dt` seconds under the given input.
 * Returns a fresh `VehicleState`; never mutates the input object so
 * callers can hold the previous state for diffing.
 *
 * Integration order:
 *   1. Throttle adds forward acceleration; brake decelerates if moving
 *      forward, otherwise applies reverse acceleration.
 *   2. When neither throttle nor brake is held, drag pulls speed
 *      toward zero so the car coasts to a stop.
 *   3. Speed is clamped to [-MAX_REVERSE_SPEED, MAX_SPEED].
 *   4. Steering rotates heading by `steerRateForSpeed(speed) * dt` in
 *      the input direction. Reverse flips the steering sign so the
 *      car steers from the rear axle, matching driver intuition.
 *   5. Position advances along the heading by `speed * dt`.
 *
 * `dt` is clamped to `MAX_DELTA_SECONDS` so a long pause (tab in
 * background) cannot teleport the car across the map on resume.
 */
export function applyDriveStep(
  state: VehicleState,
  input: DriveInput,
  dt: number,
): VehicleState {
  if (!Number.isFinite(dt) || dt <= 0) {
    return state
  }
  const step = Math.min(dt, MAX_DELTA_SECONDS)

  let speed = state.speed
  if (input.throttle && !input.brake) {
    speed += ACCELERATION * step
  } else if (input.brake && !input.throttle) {
    if (speed > 0) {
      speed -= BRAKE_DECELERATION * step
      if (speed < 0) speed = 0
    } else {
      speed -= ACCELERATION * step
    }
  } else {
    // Coast: drag pulls speed toward zero.
    if (speed > 0) {
      speed -= COAST_DRAG * step
      if (speed < 0) speed = 0
    } else if (speed < 0) {
      speed += COAST_DRAG * step
      if (speed > 0) speed = 0
    }
  }

  if (speed > MAX_SPEED) speed = MAX_SPEED
  if (speed < -MAX_REVERSE_SPEED) speed = -MAX_REVERSE_SPEED

  let heading = state.heading
  if (input.steerLeft !== input.steerRight) {
    const rate = steerRateForSpeed(speed)
    // Reverse flips the steer direction so the car pivots from the
    // rear axle. A parked car (speed === 0) still pivots so the
    // builder can re-aim before driving.
    const sign = speed < 0 ? -1 : 1
    const direction = input.steerLeft ? -1 : 1
    heading += direction * sign * rate * step
  }

  // Advance position along the heading. Forward (+ speed) moves the
  // car in the direction the nose points; the three.js mount uses
  // `+x = east`, `+z = south`, and the car's local `-z` is forward
  // (matches `carWheelOffsets` convention), so a heading of 0 advances
  // along world `-z` and a heading of `Math.PI / 2` advances along
  // world `+x`.
  const x = state.x + Math.sin(heading) * speed * step
  const z = state.z - Math.cos(heading) * speed * step

  return { x, z, heading, speed }
}
