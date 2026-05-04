import {
  DEFAULT_KEY_BINDINGS,
  DriveActionSchema,
  KeyBindingsSchema,
  type DriveActionName,
  type KeyBindings,
} from '@/lib/controlsPersistence'

/**
 * Keyboard rebinding settings UI options and helpers (REQ-041).
 *
 * Pure module: no React, no DOM, no three.js. The settings panel
 * (rendered inside the pause menu, see REQ-039) reads the action list
 * and the display-label helpers from this module so a future action
 * vocabulary change updates the panel and the validator in one place.
 *
 * The persistence layer in `src/lib/controlsPersistence.ts` ships
 * `KeyBindingsSchema` (a record from `KeyboardEvent.code` to a closed
 * `DriveActionName` enum), `DEFAULT_KEY_BINDINGS` (WASD plus arrow
 * keys), and `DriveActionSchema` (the closed action enum). This module
 * narrows that surface area to UI-friendly per-action option metadata
 * (label, description) and adds two defensive helpers:
 *
 *   - `clampKeyBindings(input)` runs an unknown input through
 *     `KeyBindingsSchema.safeParse` and falls back to
 *     `DEFAULT_KEY_BINDINGS` on a malformed payload (a stale persisted
 *     payload from a future migration cannot poke an unexpected shape
 *     into the panel state).
 *   - `keyCodeDisplayLabel(code)` produces a short human-readable label
 *     for a `KeyboardEvent.code` (e.g. `KeyW` becomes `W`,
 *     `ArrowUp` becomes the up-arrow caret, `Space` becomes `Space`).
 *
 * The action options carry a label and a short description so the
 * panel does not have to derive copy from the bare action name.
 */

/**
 * Option metadata for a single drive action. The label is the short
 * row title; the description is the secondary line that explains what
 * the action does.
 */
export interface DriveActionOption {
  action: DriveActionName
  label: string
  description: string
}

/**
 * Per-action picker options (REQ-041). The order is the order the panel
 * renders the rows; the throttle / brake pair sits above the steering
 * pair so a player reads forward / backward before left / right (matches
 * the natural narrative of "go, then turn"). Descriptions are kept
 * short so the panel does not force a third line per row.
 */
export const DRIVE_ACTION_OPTIONS: readonly DriveActionOption[] = [
  {
    action: 'throttle',
    label: 'Throttle',
    description: 'Accelerate the car forward.',
  },
  {
    action: 'brake',
    label: 'Brake',
    description: 'Decelerate or reverse.',
  },
  {
    action: 'steerLeft',
    label: 'Steer left',
    description: 'Turn the car to the left.',
  },
  {
    action: 'steerRight',
    label: 'Steer right',
    description: 'Turn the car to the right.',
  },
]

/**
 * Clamp an input to a valid `KeyBindings` map. An unknown or malformed
 * input collapses to `DEFAULT_KEY_BINDINGS` so a malformed event or
 * stale persisted payload cannot poke an unexpected shape into the
 * panel state. Idempotent on every valid map. Returns a fresh object
 * so the caller does not have to defensively clone.
 */
export function clampKeyBindings(input: unknown): KeyBindings {
  const parsed = KeyBindingsSchema.safeParse(input)
  if (parsed.success) return { ...parsed.data }
  return { ...DEFAULT_KEY_BINDINGS }
}

/**
 * Build a fresh map from drive action to the list of `KeyboardEvent.code`
 * values bound to that action. Sorted alphabetically so two equivalent
 * binding maps produce the same display order; this matters for the
 * panel readout (the row for each action lists its bound codes) and
 * for the data attribute mirror exposed on the scene root.
 *
 * Actions with no bound codes return an empty list rather than being
 * omitted; the panel renders an explicit "Unbound" hint so a player
 * does not silently lose an action.
 */
export function bindingsByAction(
  bindings: KeyBindings,
): Record<DriveActionName, string[]> {
  const out: Record<DriveActionName, string[]> = {
    throttle: [],
    brake: [],
    steerLeft: [],
    steerRight: [],
  }
  for (const code of Object.keys(bindings).sort()) {
    const action = bindings[code]
    if (action) out[action].push(code)
  }
  return out
}

/**
 * The list of common keyboard codes a v1 rebind UI accepts. The
 * `KeyboardEvent.code` shape is layout-stable (works on QWERTY,
 * AZERTY, Dvorak); listed here as a guard so a stray code (e.g. a
 * media key) cannot be persisted via the panel. The panel's
 * "Press a key" capture only commits the next press if it matches
 * this list; an unbindable key is silently ignored and the panel
 * stays in capture mode.
 *
 * The list intentionally excludes `Escape` (REQ-039 pause toggle),
 * `KeyM` (REQ-068 engine mute toggle), and `KeyR` (REQ-067 respawn)
 * because rebinding those would collide with other reserved actions;
 * a future slice that exposes those toggles in the same panel can
 * extend the unbindable list and the rebindable list together.
 */
export const REBINDABLE_KEY_CODES: readonly string[] = [
  'KeyA',
  'KeyB',
  'KeyC',
  'KeyD',
  'KeyE',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyI',
  'KeyJ',
  'KeyK',
  'KeyL',
  'KeyN',
  'KeyO',
  'KeyP',
  'KeyQ',
  'KeyS',
  'KeyT',
  'KeyU',
  'KeyV',
  'KeyW',
  'KeyX',
  'KeyY',
  'KeyZ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]

/**
 * The set of `KeyboardEvent.code` values reserved by other drive
 * surfaces (REQ-039 Esc pause, REQ-067 R respawn, REQ-068 M mute).
 * `isRebindableKeyCode` rejects any of these so a player cannot
 * inadvertently overwrite a reserved control via the rebind capture.
 */
export const RESERVED_KEY_CODES: readonly string[] = [
  'Escape',
  'KeyM',
  'KeyR',
]

/**
 * Return true if `code` is in the rebindable allowlist. Used by the
 * panel's capture step to filter out keys that the runtime does not
 * recognize and the reserved keys that other drive surfaces own.
 */
export function isRebindableKeyCode(code: string): boolean {
  if (RESERVED_KEY_CODES.includes(code)) return false
  return REBINDABLE_KEY_CODES.includes(code)
}

/**
 * Produce a short human-readable label for a `KeyboardEvent.code`.
 * Used by the panel readout so a row labeled "Throttle" reads as
 * "W, Up" rather than "KeyW, ArrowUp". Falls back to the raw code for
 * any unrecognized value so a future migration does not silently lose
 * a binding.
 */
export function keyCodeDisplayLabel(code: string): string {
  if (code.length === 0) return code
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'ArrowUp') return 'Up'
  if (code === 'ArrowDown') return 'Down'
  if (code === 'ArrowLeft') return 'Left'
  if (code === 'ArrowRight') return 'Right'
  if (code === 'Space') return 'Space'
  return code
}

/**
 * Bind `code` to `action` in a fresh `KeyBindings` map. Removes any
 * previous binding of `code` (so a key can switch from one action to
 * another atomically) and returns the merged result. The input
 * bindings map is not mutated.
 */
export function setBinding(
  bindings: KeyBindings,
  code: string,
  action: DriveActionName,
): KeyBindings {
  if (!isRebindableKeyCode(code)) return { ...bindings }
  const parsedAction = DriveActionSchema.safeParse(action)
  if (!parsedAction.success) return { ...bindings }
  const next: KeyBindings = { ...bindings }
  next[code] = parsedAction.data
  return next
}

/**
 * Remove `code` from the bindings map. Returns a fresh map; the input
 * is not mutated. A code that is not present is a no-op.
 */
export function clearBinding(bindings: KeyBindings, code: string): KeyBindings {
  const next: KeyBindings = { ...bindings }
  delete next[code]
  return next
}

/**
 * Build a deterministic string signature for a `KeyBindings` map.
 * Used by the scene root's `data-key-bindings` attribute so a test
 * can read the live mapping without inspecting React state. Two
 * equivalent maps produce the same signature regardless of insertion
 * order; the format is `code:action` pairs joined by `,` sorted by
 * code so the output is stable across iterations.
 */
export function keyBindingSignature(bindings: KeyBindings): string {
  return Object.keys(bindings)
    .sort()
    .map((code) => `${code}:${bindings[code]}`)
    .join(',')
}

/**
 * Re-export the persisted defaults so a single import site covers the
 * action options, the rebindable list, and the default bindings when
 * the panel mounts. The panel reads `DEFAULT_KEY_BINDINGS` to seed its
 * state when `loadControls` returns the defaults (no persisted
 * payload).
 */
export { DEFAULT_KEY_BINDINGS }
export type { DriveActionName, KeyBindings }
