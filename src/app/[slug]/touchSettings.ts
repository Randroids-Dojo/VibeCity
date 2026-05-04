import {
  DEFAULT_TOUCH_MODE,
  TouchModeSchema,
  type TouchMode,
} from '@/lib/controlsPersistence'

/**
 * Touch mode settings UI options and helpers (REQ-042).
 *
 * Pure module: no React, no DOM, no three.js. The settings panel
 * (rendered inside the pause menu, see REQ-039) reads the option list
 * from this module so a future option addition (e.g. a tilt mode)
 * updates the panel and the validator in one place.
 *
 * The persistence layer in `src/lib/controlsPersistence.ts` ships
 * `TouchModeSchema` (closed enum: `'dual-stick'` or `'single-stick'`)
 * and `DEFAULT_TOUCH_MODE = 'dual-stick'`. This module narrows that
 * surface area to UI-friendly option metadata: every option carries a
 * label and a short description so the panel does not have to derive
 * copy from the bare value string.
 *
 * `clampTouchMode(input)` returns a valid `TouchMode` for any input;
 * an unknown or non-string input collapses to `DEFAULT_TOUCH_MODE` so
 * a malformed event or stale persisted payload cannot poke an
 * unexpected mode into the panel state.
 *
 * The runtime touch input handler (REQ-035) is deferred to its own
 * slice; this module only exposes the persistence-and-picker substrate
 * so a player can pick a mode and the choice persists. The runtime
 * will read the persisted mode via `loadControls().touchMode` once
 * REQ-035 lands.
 */

/**
 * Option metadata for a touch mode picker. The label is the short
 * button copy; the description is the secondary line that explains
 * what the mode does.
 */
export interface TouchModeOption {
  value: TouchMode
  label: string
  description: string
}

/**
 * Per-mode picker options (REQ-042). The order is the order the panel
 * renders the buttons; dual-stick comes first because it is the
 * default and the more capable layout. The descriptions are
 * intentionally short so they fit beside the radio buttons without
 * forcing the panel to wrap onto a third line.
 */
export const TOUCH_MODE_OPTIONS: readonly TouchModeOption[] = [
  {
    value: 'dual-stick',
    label: 'Dual stick',
    description: 'Left thumb steers. Right thumb throttles and brakes.',
  },
  {
    value: 'single-stick',
    label: 'Single stick',
    description: 'One stick steers. Throttle is automatic.',
  },
]

/**
 * Clamp an input to a valid `TouchMode`. An unknown or non-string
 * input collapses to `DEFAULT_TOUCH_MODE` so a malformed event or
 * stale persisted payload cannot poke an unexpected mode into the
 * panel state. Idempotent on every valid mode.
 */
export function clampTouchMode(input: unknown): TouchMode {
  const parsed = TouchModeSchema.safeParse(input)
  if (parsed.success) return parsed.data
  return DEFAULT_TOUCH_MODE
}

/**
 * Re-export the persisted default so a single import site covers both
 * the option list and the default value when the panel mounts. The
 * panel reads `DEFAULT_TOUCH_MODE` to seed its state when
 * `loadControls` returns the defaults (no persisted payload).
 */
export { DEFAULT_TOUCH_MODE }
export type { TouchMode }
