import type { City } from '@/lib/schemas'

/**
 * City-specific autosave equality (REQ-025).
 *
 * The generic autosave status FSM (`AutosaveStatus`,
 * `AUTOSAVE_STATUS_LABEL`, `DEFAULT_AUTOSAVE_DEBOUNCE_MS`) lives in
 * `@/lib/editor`. This module owns the city-shaped equality check
 * the editor uses to decide whether to skip a save. Splitting them
 * lets future games with their own document type reuse the FSM
 * without dragging the city schema along.
 */

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
