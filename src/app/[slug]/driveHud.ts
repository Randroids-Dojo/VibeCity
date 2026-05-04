import { MAX_SPEED } from './driveControls'

/**
 * Drive-mode HUD helpers (REQ-066 speed readout and controls hint).
 *
 * Pure module: no React, no DOM, no three.js. The drive scene client
 * owns the React overlays and reads these helpers each frame to keep
 * the speed readout in sync with the live vehicle state. Doing the
 * formatting and the bar-fraction math here keeps the integration
 * surface fully unit-testable.
 *
 * REQ-037 explicitly forbids a lap timer, checkpoints, or a race HUD.
 * The v1 HUD ships only a speedometer (driver feedback, not race
 * scoring) and a static controls hint so a first-time visitor can see
 * which keys move the car. Both surfaces hide while the pause menu is
 * open so the menu owns the click surface (REQ-039).
 */

/**
 * The text shown in the bottom-right controls hint. Encoded as a
 * single multi-line string here so the drive scene client renders it
 * verbatim and the unit tests can assert the bindings stay in sync
 * with `DEFAULT_KEY_BINDINGS` from `driveControls.ts` without parsing
 * three.js scene state.
 *
 * The order is the conventional WASD layout (top, left, down, right),
 * followed by the respawn hint (REQ-067) and the pause-menu hint
 * (REQ-039). Each row is `Keys: action` so a screen reader reads the
 * binding before the action label.
 */
export const HUD_CONTROLS_HINT_LINES: ReadonlyArray<string> = [
  'W / Up: throttle',
  'A / Left: steer left',
  'S / Down: brake',
  'D / Right: steer right',
  'R: respawn',
  'Esc: pause',
]

/**
 * The label shown above the speed readout. Static so a screen reader
 * announces the readout's meaning before the value.
 */
export const HUD_SPEED_LABEL = 'Speed'

/**
 * The unit suffix shown after the speed readout. World units per
 * second; the v1 number is unitless (no km/h or mph because there is
 * no real-world calibration) so the label reads as "wu/s" to mark it
 * clearly as a relative number rather than a measured speed.
 */
export const HUD_SPEED_UNIT = 'wu/s'

/**
 * Format the live speed into the integer string the readout displays.
 * The integrator's `speed` is signed (negative when reversing) and the
 * readout shows the magnitude so a player who is reversing still sees
 * a positive readout. Non-finite inputs collapse to zero so a tuning
 * bug cannot leak `NaN` into the DOM.
 */
export function formatSpeed(speed: number): string {
  if (!Number.isFinite(speed)) return '0'
  const magnitude = Math.abs(speed)
  return Math.round(magnitude).toString()
}

/**
 * Compute the fill fraction (`[0, 1]`) for the speed bar at the given
 * speed. The bar shows |speed| / MAX_SPEED so reversing fills the bar
 * the same way as accelerating forward; this matches the readout above
 * which also shows the magnitude. Non-finite inputs collapse to zero.
 *
 * The optional `maxSpeed` override is exposed so a future settings
 * slice (REQ-040) can swap the cap without rewriting the helper.
 */
export function speedFraction(speed: number, maxSpeed: number = MAX_SPEED): number {
  if (!Number.isFinite(speed) || !Number.isFinite(maxSpeed) || maxSpeed <= 0) {
    return 0
  }
  const magnitude = Math.abs(speed)
  if (magnitude >= maxSpeed) return 1
  return magnitude / maxSpeed
}

/**
 * Returns the textual direction hint shown next to the speed readout.
 * Forward is the default; a small negative speed reads as "reverse" so
 * a player who is rolling backward sees the disambiguation in the HUD
 * without having to read the heading data attribute. The threshold is
 * tight (1e-3) so coast-to-zero does not flicker between forward and
 * reverse near zero.
 */
export type SpeedDirection = 'idle' | 'forward' | 'reverse'

export const SPEED_DIRECTION_THRESHOLD = 1e-3

export function speedDirection(speed: number): SpeedDirection {
  if (!Number.isFinite(speed)) return 'idle'
  if (speed > SPEED_DIRECTION_THRESHOLD) return 'forward'
  if (speed < -SPEED_DIRECTION_THRESHOLD) return 'reverse'
  return 'idle'
}
