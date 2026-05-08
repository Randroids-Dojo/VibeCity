/**
 * Autosave status FSM. Game-agnostic.
 *
 * A consumer that needs an autosave indicator opens in `idle` (a
 * freshly-loaded payload has nothing pending). On every mutation
 * the React surface flips to `pending`, then to `saving` once the
 * debounce window fires the network request, then to `saved` or
 * `error` depending on the response. Any new mutation while a save
 * is in flight queues another save (the next pending snapshot wins).
 *
 * The pure status flag, its labels, and the default debounce window
 * live in this lib module so any future game with an editor surface
 * can wire the same indicator without rebuilding the state machine.
 * VibeCity's editor is the v1 consumer (REQ-025).
 */
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/**
 * Default debounce window for autosave.
 *
 * 600 ms is short enough that an author who mutates the document
 * and looks at the status indicator sees `saving` without feeling
 * laggy, and long enough that a streak of edits only fires one
 * network request once the streak settles.
 */
export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 600

/**
 * Human-readable label for each `AutosaveStatus`. The `error` label
 * is intentionally short so the indicator does not balloon
 * mid-edit; full error context belongs in the console.
 */
export const AUTOSAVE_STATUS_LABEL: Record<AutosaveStatus, string> = {
  idle: 'Saved',
  pending: 'Editing',
  saving: 'Saving',
  saved: 'Saved',
  error: 'Save failed',
}
