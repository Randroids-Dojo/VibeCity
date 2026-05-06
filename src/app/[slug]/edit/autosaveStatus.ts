import type { City } from '@/lib/schemas'

/**
 * Autosave status (REQ-025).
 *
 * The editor opens in `idle` (a freshly-loaded city has nothing pending).
 * On every mutation the EditorClient flips to `pending`, then to `saving`
 * once the debounce window fires the network request, then to `saved` or
 * `error` depending on the response. Any new mutation while a save is in
 * flight queues another save (the next pending city snapshot wins).
 *
 * The pure status flag lives in its own module so the React surface only
 * has to render it; the state-machine transitions and the debounce timer
 * are tested separately.
 */
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/**
 * Default debounce window for autosave (REQ-025).
 *
 * 600 ms is short enough that an author who places a piece and looks at
 * the status indicator sees `saving` without feeling laggy, and long
 * enough that a streak of placements (place, rotate, place, place) only
 * fires one network request once the streak settles.
 */
export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 600

/**
 * Human-readable label for each `AutosaveStatus`. Used by the editor's
 * status indicator. The `error` label is intentionally short so the
 * indicator does not balloon mid-edit; full error context lives in the
 * console.
 */
export const AUTOSAVE_STATUS_LABEL: Record<AutosaveStatus, string> = {
  idle: 'Saved',
  pending: 'Editing',
  saving: 'Saving',
  saved: 'Saved',
  error: 'Save failed',
}

/**
 * Decide whether two cities are equal enough to skip a save (REQ-025).
 *
 * The autosave path computes a content hash on the server (REQ-013) and a
 * second PUT with the same payload is a no-op as far as the version
 * history is concerned, but it still costs a round-trip. Skipping the
 * fetch when the city snapshot has not changed since the last saved
 * snapshot avoids that cost.
 *
 * Equality is structural over `pieces`, `buildings`, AND `mood`. Mood
 * is included here even though REQ-013 hashCity excludes it: the
 * version hash (REQ-013) stays stable across mood-only changes
 * because the hash function itself omits mood, but the autosave
 * needs to detect mood changes so a Day -> Night toggle (REQ-088
 * follow-on) actually persists. Without mood in this equality
 * check, the autosave skip-on-equal path silently drops the mood
 * change and the player's preference is lost on refresh.
 *
 * Same length / same per-index entries by `JSON.stringify`. Pure so
 * it can be unit-tested without React.
 */
export function isCityContentEqual(a: City, b: City): boolean {
  if (a === b) return true
  if (a.pieces.length !== b.pieces.length) return false
  if (a.buildings.length !== b.buildings.length) return false
  for (let i = 0; i < a.pieces.length; i++) {
    if (JSON.stringify(a.pieces[i]) !== JSON.stringify(b.pieces[i])) return false
  }
  for (let i = 0; i < a.buildings.length; i++) {
    if (JSON.stringify(a.buildings[i]) !== JSON.stringify(b.buildings[i])) {
      return false
    }
  }
  if (JSON.stringify(a.mood ?? null) !== JSON.stringify(b.mood ?? null)) {
    return false
  }
  return true
}
