/**
 * Drive-mode pause menu state machine (REQ-039 pause via Esc, REQ-038
 * Edit CTA in the pause menu).
 *
 * Pure module: no React, no DOM, no three.js. The drive scene client
 * owns the live state, the keyboard listener, and the overlay markup;
 * this module supplies the state taxonomy, the bound key code, and the
 * pure transitions so the state machine is fully unit-testable.
 *
 * v1 ships two states (`running` and `paused`) and one trigger (Esc).
 * VibeRacer's lap-timer compensation (which paused / resumed the timer
 * around a paused interval) is dropped here because REQ-037 explicitly
 * forbids a lap timer in VibeCity. The pause menu offers two actions:
 * resume (closes the menu) and Edit (navigates back to `/<slug>/edit`).
 *
 * The integration loop in `DriveSceneClient.tsx` reads the live state
 * each frame: while paused, the loop skips the `applyDriveStep` call
 * and the chase camera rig update so the world freezes; when the menu
 * closes the loop resumes from the same vehicle state.
 */

/**
 * The two-state pause machine. `running` is the default; `paused`
 * means the integration loop should freeze the world and the overlay
 * should render. Mirrors VibeRacer's pause taxonomy minus the timer
 * compensation states (REQ-037 forbids the timer in VibeCity).
 */
export type PauseState = 'running' | 'paused'

/**
 * The default state for a freshly-mounted drive scene. The car spawns
 * running so the build / drive loop starts in motion the moment the
 * canvas mounts; the player opts in to the pause menu by pressing Esc.
 */
export const DEFAULT_PAUSE_STATE: PauseState = 'running'

/**
 * The `KeyboardEvent.code` value that toggles the pause menu (REQ-039).
 * Esc is the platform convention for "menu / pause" across browsers and
 * the only key bound in v1; future settings (REQ-041) may rebind via a
 * settings pane but should preserve Esc as the default.
 */
export const PAUSE_KEY_CODE = 'Escape'

/**
 * Toggle the pause state. Used by the Esc key handler so a single
 * binding flips into and out of the menu.
 */
export function togglePauseState(state: PauseState): PauseState {
  return state === 'paused' ? 'running' : 'paused'
}

/**
 * Force the pause menu open. Used by callers that want to show the
 * menu in response to an explicit action (e.g. a future "open menu"
 * button) instead of toggling.
 */
export function openPauseMenu(_state: PauseState): PauseState {
  return 'paused'
}

/**
 * Force the pause menu closed. Used by the Resume action in the
 * overlay so a click on Resume always returns to running, regardless
 * of the prior state. Mirrors `openPauseMenu` for symmetry.
 */
export function closePauseMenu(_state: PauseState): PauseState {
  return 'running'
}

/**
 * Returns true when the integration loop should freeze the world. The
 * drive scene client gates `applyDriveStep` and the chase camera rig
 * update on this check so a paused world does not drift mid-frame.
 */
export function isPaused(state: PauseState): boolean {
  return state === 'paused'
}
