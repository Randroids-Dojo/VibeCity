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

/**
 * Human-readable label per speed direction (REQ-066).
 *
 * The HUD writes this label imperatively into a span next to the speed
 * value each frame so a player who is rolling backward sees the
 * disambiguation in the visible HUD without having to read the
 * `data-hud-direction` data attribute. The forward and idle defaults
 * emit empty strings so the visible HUD only adds a line when the car
 * is reversing; forward driving is the default state and the speed bar
 * already conveys that the car is moving, so a "Forward" label would
 * crowd the readout without telling the player anything new.
 *
 * Reverse is the only case that gets a non-empty label because a
 * reversing car still fills the speed bar (the bar reads `|speed|`)
 * which would otherwise be indistinguishable from forward driving.
 */
export const HUD_SPEED_DIRECTION_LABEL: Record<SpeedDirection, string> = {
  idle: '',
  forward: '',
  reverse: 'Reverse',
}

/**
 * Surface state shown next to the speed readout (REQ-030, REQ-054, REQ-066).
 *
 * The integration loop already mirrors `data-on-building` (REQ-030) and
 * `data-off-street` (REQ-054) onto the scene root each frame, but those
 * flags are only observable to tests. A player who veers off the road or
 * clips a building feels the speed cap engage without any visible
 * explanation. This surface state collapses the two flags into one
 * label so the HUD can read out which penalty is active.
 *
 * `building` wins over `off-street` because a building cell IS off-street
 * but the building cap is tighter (REQ-030 cap is below the off-street
 * cap per offStreetPenalty / buildingCollision tuning) so the more
 * aggressive penalty is the meaningful one to surface.
 *
 * `street` is the default when the car is on a placed street piece and
 * not on a building cell.
 */
export type SurfaceState = 'street' | 'off-street' | 'building'

/**
 * Resolve the live surface state from the per-frame penalty flags. Pure:
 * no allocation, deterministic on `(onStreet, onBuilding)`.
 */
export function surfaceState(
  onStreet: boolean,
  onBuilding: boolean,
): SurfaceState {
  if (onBuilding) return 'building'
  if (!onStreet) return 'off-street'
  return 'street'
}

/**
 * Human-readable label per surface state. The HUD writes this label
 * imperatively into a span next to the speed readout each frame; the
 * label is empty for the on-street default so the visible HUD only adds
 * a line when there is something to say.
 */
export const HUD_SURFACE_LABEL: Record<SurfaceState, string> = {
  street: '',
  'off-street': 'Off street',
  building: 'Building hit',
}

/**
 * City validity state shown in the drive HUD (REQ-066, REQ-019, REQ-064).
 *
 * `validateConnections(city)` from `src/lib/trackPath.ts` returns the list
 * of every connector port across the city that does not have an opposing
 * neighbor port. Zero unmatched ports means the city is a `closed`
 * connector graph (every port is connected to another piece); any
 * non-zero count means the city has `open` ends and a player driving
 * around will eventually run out of road.
 *
 * The state is the substrate-level summary the HUD reads each render so
 * a player exploring a city with open ends sees a visible explanation
 * instead of mistaking a road end for a tuning bug. The signal is
 * non-prescriptive: the drive surface still lets the player keep driving
 * (via the off-street penalty when they leave the placed streets); the
 * label is purely informational.
 */
export type CityValidity = 'closed' | 'open'

/**
 * Resolve the live city validity from the unmatched-port count. Pure:
 * deterministic on `unmatchedPortCount`, no allocation. Treats any
 * non-finite or negative count as `closed` so a tuning bug that emits
 * `NaN` or `-1` does not flip the HUD into a permanent open-ends
 * warning. Zero unmatched ports (including the empty-city case where
 * `validateConnections` returns the empty array) reads as `closed`.
 */
export function cityValidity(unmatchedPortCount: number): CityValidity {
  if (!Number.isFinite(unmatchedPortCount)) return 'closed'
  if (unmatchedPortCount <= 0) return 'closed'
  return 'open'
}

/**
 * Human-readable label per city-validity state. The HUD writes this
 * label imperatively into a span near the surface readout when the
 * state is `open`; the label is empty for the `closed` default so the
 * visible HUD only adds a line when the player needs the explanation.
 */
export const HUD_CITY_VALIDITY_LABEL: Record<CityValidity, string> = {
  closed: '',
  open: 'Open ends',
}

/**
 * Compass heading state shown in the drive HUD (REQ-066).
 *
 * The integrator's `heading` is a radian angle (0 = car points north,
 * forward at heading `h` is `(sin h, -cos h)`). A player driving across
 * a long city loses track of orientation when the chase camera follows
 * the car turn-for-turn. Collapsing the heading into one of the eight
 * cardinal / corner directions gives a quick "I am heading north-east"
 * cue at the bottom of the HUD without forcing the player to read a
 * radian value or count compass-rose tick marks.
 *
 * Eight bins of 45 degrees each, centered on each cardinal: a heading
 * of `+/- 22.5deg` reads as `N`; `22.5deg` to `67.5deg` reads as `NE`,
 * and so on around the compass. Mirrors the `Dir` taxonomy from
 * `src/lib/connectors.ts` so a future compass-based piece-snap layer
 * can speak the same vocabulary.
 */
export type CompassDirection =
  | 'N'
  | 'NE'
  | 'E'
  | 'SE'
  | 'S'
  | 'SW'
  | 'W'
  | 'NW'

/**
 * Ordered list of compass directions starting at north and walking
 * clockwise. The index into this array is the bin index used by
 * `headingToCompass`. Mirrors `connectors.Dir` (0 = N, 1 = NE, ...,
 * 7 = NW) so a future caller that wants the index alongside the label
 * can use `COMPASS_DIRECTIONS.indexOf(direction)` without recomputing.
 */
export const COMPASS_DIRECTIONS: ReadonlyArray<CompassDirection> = [
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
]

/**
 * Resolve the live compass direction from the integrator's heading.
 *
 * The heading convention is `applyDriveStep`'s: 0 radians = car points
 * north, `forward = (sin h, -cos h)`. We normalize the heading into
 * `[0, 2pi)` and bin into eight 45deg sectors centered on each cardinal
 * (`N` covers `-22.5deg` to `+22.5deg`, `NE` covers `22.5deg` to
 * `67.5deg`, etc.). The result is deterministic on the heading value;
 * non-finite inputs collapse to `N` so a tuning bug cannot flip the HUD
 * into an undefined state.
 *
 * Pure: no allocation, no DOM. The drive scene client calls this each
 * frame inside `updateHud` and writes the result to the visible span
 * plus the `data-hud-compass` attribute on the scene root.
 */
export function headingToCompass(heading: number): CompassDirection {
  if (!Number.isFinite(heading)) return 'N'
  const TWO_PI = Math.PI * 2
  // Normalize to `[0, 2pi)`. JavaScript's `%` keeps the sign of the
  // dividend, so a negative heading after `% TWO_PI` lands in `(-2pi, 0]`;
  // adding `TWO_PI` and modding again folds it back into `[0, 2pi)`.
  const normalized = ((heading % TWO_PI) + TWO_PI) % TWO_PI
  // Each bin is `pi/4` wide. Shift by `pi/8` so the `N` bin straddles
  // zero (covers `[-pi/8, +pi/8)` after normalization), then floor to
  // get an integer in `[0, 8)`. The `% 8` handles the `2pi` wrap so a
  // heading just under `2pi` reads as `N` (back to bin 0) instead of
  // bin 8.
  const QUARTER_PI = Math.PI / 4
  const HALF_BIN = QUARTER_PI / 2
  const binIndex = Math.floor((normalized + HALF_BIN) / QUARTER_PI) % 8
  return COMPASS_DIRECTIONS[binIndex]
}

/**
 * Human-readable label per compass direction. The HUD writes this label
 * imperatively into a span next to the speed readout each frame; every
 * direction gets a non-empty label because the compass cue is always
 * useful (unlike the surface state or the speed-direction labels which
 * stay silent on the default state). The labels use the standard
 * one- or two-character compass abbreviations to keep the HUD compact.
 */
export const HUD_COMPASS_LABEL: Record<CompassDirection, string> = {
  N: 'N',
  NE: 'NE',
  E: 'E',
  SE: 'SE',
  S: 'S',
  SW: 'SW',
  W: 'W',
  NW: 'NW',
}

/**
 * Brake-input indicator label (F-013 drive-feel texture pass, slice 1).
 * Surfaced in the 2026-05-03 fun-factor audit: the drive surface today
 * has engine pitch (REQ-068) but no other texture. This slice ships a
 * visible HUD pill whose text content reads this label when
 * `input.brake` is true and an empty string otherwise, so a player who
 * is actively braking gets visual feedback on top of the existing audio
 * cue. The pill DOM element itself stays mounted while the HUD is
 * visible (gated on the same `hasVehicle && !showPauseMenu` branch as
 * the rest of the dashboard); only the text content toggles per frame
 * so the React tree never re-renders. The 3D tail-light material swap
 * (and the tire screech audio + suspension bob visual cues that round
 * out F-013) stay deferred to follow-on slices.
 */
export const HUD_BRAKE_LABEL = 'Brake'

/** Hex fill for the brake pill text. Warm red, distinct from the other HUD label channels. */
export const HUD_BRAKE_COLOR = '#e85a3a'
