import {
  emptyInput,
  type DriveInput,
} from './driveControls'
import type { TouchMode } from '@/lib/controlsPersistence'

/**
 * Touch input runtime helpers (REQ-035).
 *
 * Pure module: no React, no DOM, no three.js. The drive scene client
 * owns the pointer event listeners and the React render of the visible
 * joystick rings; this module ships the float-where-you-tap virtual
 * joystick state machine, the per-stick read helper, and the
 * `joysticksToInput(steerStick, throttleStick, mode)` mapper that
 * collapses a pair of joystick states into the same `DriveInput` shape
 * the keyboard handler produces. The integration loop then merges
 * keyboard input and touch input via a per-action OR (matches
 * VibeRacer's contract: two input devices share the same pressed-key
 * vocabulary so a user can tap touch and hold W at the same time and
 * the integrator just sees throttle on).
 *
 * The two persisted touch modes (REQ-042) drive the mapping:
 *
 *   - `dual-stick`: left-half of the screen spawns a steering stick on
 *     first touch, right-half spawns a throttle / brake stick. The
 *     steering stick's horizontal axis steers; the throttle stick's
 *     vertical axis is throttle (up) or brake (down).
 *   - `single-stick`: any touch anywhere spawns one stick. The stick's
 *     horizontal axis steers; the vertical axis is throttle (up) or
 *     brake (down). Only the steering stick is used; the throttle stick
 *     stays inactive in this mode so only one ring renders.
 *
 * The `JOYSTICK_DEADZONE` value is a fraction of `JOYSTICK_RADIUS`; a
 * thumb less than `DEADZONE * RADIUS` from the origin reports zero on
 * that axis. This matches VibeRacer's tuning so a user who picks up the
 * VibeRacer touch feel finds it on VibeCity.
 *
 * Mounting / unmounting the listeners and rendering the visible rings
 * are the drive scene client's concern (REQ-035 wiring slice). This
 * module is the integration math the listeners write into.
 */

/**
 * The maximum thumb-from-origin distance (in CSS pixels) that the
 * joystick reports as a unit-magnitude vector. A thumb beyond this
 * radius clamps to magnitude 1 along the angle of travel; a thumb
 * inside reports a fractional magnitude. Matches VibeRacer's value so a
 * cross-project user lands on the same touch feel.
 */
export const JOYSTICK_RADIUS = 64

/**
 * Below this fraction of `JOYSTICK_RADIUS` the joystick reports zero on
 * that axis. Keeps a planted thumb that drifted a couple of pixels from
 * registering as a steer / throttle command.
 */
export const JOYSTICK_DEADZONE = 0.25

/**
 * The persisted joystick state. The drive scene client's pointer event
 * listeners mutate this in place via `beginJoystick` / `moveJoystick` /
 * `endJoystick`; the integration loop reads it via `readJoystick` and
 * `joysticksToInput`.
 *
 * `pointerId` is `null` when the stick is inactive. It is the
 * `PointerEvent.pointerId` of the touch that owns the stick; a move /
 * up event from a different pointer id is ignored so two simultaneous
 * touches each drive their own stick (the dual-stick mode's contract).
 */
export interface JoystickState {
  active: boolean
  pointerId: number | null
  originX: number
  originY: number
  currentX: number
  currentY: number
}

/**
 * The unit-magnitude vector a joystick produces. `x` is the horizontal
 * axis (positive = right), `y` is the vertical axis (positive = down,
 * matching CSS pixel space). A thumb stationary at the origin reports
 * `{ x: 0, y: 0 }`.
 */
export interface JoystickVector {
  x: number
  y: number
}

/**
 * Build a fresh inactive joystick state. Used as the initial value for
 * the steering and throttle sticks at scene mount time.
 */
export function createJoystick(): JoystickState {
  return {
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
  }
}

/**
 * Begin a joystick at the given pointer position. The first touch on
 * the stick's half of the screen anchors the origin and the current
 * position to the pointer's `(clientX, clientY)`; subsequent moves
 * update `currentX` / `currentY` while the origin stays put so the
 * read vector is the thumb's offset from the touch-down point.
 */
export function beginJoystick(
  js: JoystickState,
  pointerId: number,
  x: number,
  y: number,
): void {
  js.active = true
  js.pointerId = pointerId
  js.originX = x
  js.originY = y
  js.currentX = x
  js.currentY = y
}

/**
 * Update an active joystick's current pointer position. A move on an
 * inactive joystick is ignored (the active flag gates against a stale
 * pointer event arriving after the up).
 */
export function moveJoystick(
  js: JoystickState,
  x: number,
  y: number,
): void {
  if (!js.active) return
  js.currentX = x
  js.currentY = y
}

/**
 * Release a joystick. Marks it inactive and clears the pointer id so a
 * subsequent down on the same half of the screen starts a fresh origin.
 * Idempotent on an already-inactive joystick.
 */
export function endJoystick(js: JoystickState): void {
  js.active = false
  js.pointerId = null
}

/**
 * Read the joystick's unit-magnitude vector. An inactive joystick
 * reports `{ x: 0, y: 0 }`. A thumb inside `JOYSTICK_RADIUS` reports a
 * fractional magnitude scaled by the radius; a thumb beyond clamps to
 * magnitude 1 along the angle of travel.
 *
 * The deadzone is applied per-axis by the consumer (`joysticksToInput`)
 * because the steering / throttle mapping interprets the axes
 * independently and the deadzone is not a circular dead zone in
 * VibeRacer's contract.
 */
export function readJoystick(js: JoystickState): JoystickVector {
  if (!js.active) return { x: 0, y: 0 }
  const dx = js.currentX - js.originX
  const dy = js.currentY - js.originY
  const len = Math.hypot(dx, dy)
  if (len <= JOYSTICK_RADIUS) {
    return { x: dx / JOYSTICK_RADIUS, y: dy / JOYSTICK_RADIUS }
  }
  return { x: dx / len, y: dy / len }
}

/**
 * Map a pair of joystick states into a `DriveInput` snapshot under the
 * given touch mode. The integration loop merges this with the keyboard
 * input via a per-action OR.
 *
 * Mode `dual-stick`:
 *   - The steer joystick's horizontal axis drives `steerLeft` /
 *     `steerRight` (negative = left, positive = right).
 *   - The throttle joystick's vertical axis drives `throttle` (negative
 *     = up = forward) and `brake` (positive = down = brake).
 *
 * Mode `single-stick`:
 *   - The steer joystick is the only stick. Horizontal axis drives
 *     `steerLeft` / `steerRight`; vertical axis drives `throttle` /
 *     `brake`. The throttle joystick is ignored.
 *
 * The deadzone (`JOYSTICK_DEADZONE`) is applied per-axis so a small
 * thumb drift along one axis does not trigger that action. Both
 * positive and negative directions on the same axis can never fire
 * simultaneously (a thumb is either left or right of center, not
 * both).
 */
export function joysticksToInput(
  steer: JoystickState,
  throttle: JoystickState,
  mode: TouchMode,
): DriveInput {
  const input = emptyInput()
  const s = readJoystick(steer)
  if (s.x < -JOYSTICK_DEADZONE) input.steerLeft = true
  else if (s.x > JOYSTICK_DEADZONE) input.steerRight = true
  if (mode === 'single-stick') {
    if (s.y < -JOYSTICK_DEADZONE) input.throttle = true
    else if (s.y > JOYSTICK_DEADZONE) input.brake = true
  } else {
    const t = readJoystick(throttle)
    if (t.y < -JOYSTICK_DEADZONE) input.throttle = true
    else if (t.y > JOYSTICK_DEADZONE) input.brake = true
  }
  return input
}

/**
 * Merge two `DriveInput` snapshots via a per-action OR. The integration
 * loop calls this once a frame to combine the keyboard input with the
 * touch input so a user can tap touch and hold a key at the same time
 * and the integrator sees the union.
 *
 * Returns a fresh `DriveInput`; never mutates the inputs.
 */
export function mergeDriveInputs(
  a: DriveInput,
  b: DriveInput,
): DriveInput {
  return {
    throttle: a.throttle || b.throttle,
    brake: a.brake || b.brake,
    steerLeft: a.steerLeft || b.steerLeft,
    steerRight: a.steerRight || b.steerRight,
  }
}

/**
 * Decide which joystick a fresh touch should anchor under the given
 * touch mode. Pure helper so the listener wiring can stay declarative:
 *   - `single-stick`: every touch anchors the steer joystick (the
 *     throttle joystick is unused). Returns `'steer'` whenever the
 *     steer joystick is inactive; returns `'none'` if a steer touch is
 *     already in flight (a second simultaneous touch is ignored to keep
 *     the contract one-stick).
 *   - `dual-stick`: a touch on the left half of the viewport anchors
 *     the steer joystick; a touch on the right half anchors the
 *     throttle joystick. Returns `'none'` if the matching half's
 *     joystick is already active so two thumbs on the same half do not
 *     fight over the same anchor.
 *
 * The viewport split is at `viewportWidth / 2`; an exact-on-center
 * tap is right-half (the right half is the throttle stick by VibeRacer
 * convention).
 */
export function joystickForTouch(params: {
  mode: TouchMode
  clientX: number
  viewportWidth: number
  steerActive: boolean
  throttleActive: boolean
}): 'steer' | 'throttle' | 'none' {
  const { mode, clientX, viewportWidth, steerActive, throttleActive } =
    params
  if (mode === 'single-stick') {
    if (steerActive) return 'none'
    return 'steer'
  }
  const rightHalf = clientX >= viewportWidth / 2
  if (rightHalf) {
    if (throttleActive) return 'none'
    return 'throttle'
  }
  if (steerActive) return 'none'
  return 'steer'
}
