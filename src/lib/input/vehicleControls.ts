/**
 * Vehicle keyboard input plumbing. Game-agnostic.
 *
 * Owns the action vocabulary (`throttle` / `brake` / `steerLeft` /
 * `steerRight`), the default WASD + arrow-key binding table, and the
 * pure helpers that translate a live set of pressed `KeyboardEvent.code`
 * values into an action snapshot. The integrator that consumes the
 * snapshot lives in the consumer (e.g. VibeCity's `driveControls.ts`)
 * because vehicle physics tuning is unit-size dependent.
 *
 * Future games with the same arcade-vehicle vocabulary can import
 * these helpers as is and feed the snapshot into their own integrator.
 *
 * Keys are matched against `KeyboardEvent.code` so the layout is
 * stable across QWERTY / AZERTY / Dvorak; a future locale-aware
 * rebinding pane can swap the table without touching the helpers.
 */

/**
 * The set of logical actions a key binding can map to.
 */
export type DriveAction = 'throttle' | 'brake' | 'steerLeft' | 'steerRight'

/**
 * Default key bindings. WASD plus arrow keys cover both common
 * keyboard layouts; the binding table is a many-to-one map so a
 * single action can be triggered by either layout.
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
 * Per-frame snapshot of a vehicle's input state. Each flag reflects
 * whether at least one binding for that action is currently pressed.
 */
export interface DriveInput {
  throttle: boolean
  brake: boolean
  steerLeft: boolean
  steerRight: boolean
}

/**
 * Build an empty input snapshot. Used by callers that want to start
 * from a clean state before merging the live keyboard set (or merge
 * keyboard + touch input via per-action OR).
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
