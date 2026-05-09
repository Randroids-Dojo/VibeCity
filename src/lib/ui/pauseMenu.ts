/**
 * Pause menu state machine. Game-agnostic.
 *
 * A two-state machine (`running` / `paused`) with a single Esc-key
 * toggle. Pure module: no React, no DOM. The consumer owns the live
 * state, the keyboard listener, and the overlay markup; this module
 * supplies the state taxonomy, the bound key code, and the pure
 * transitions so the state machine is fully unit-testable.
 *
 * VibeCity's drive scene (REQ-038, REQ-039) is the v1 consumer.
 * Future games with a pause overlay can wire the same toggle without
 * rebuilding the state taxonomy.
 *
 * The integration loop in the consumer reads the live state each
 * frame: while paused, the loop skips its step / camera updates so
 * the world freezes; when the menu closes the loop resumes from the
 * same simulation state.
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
