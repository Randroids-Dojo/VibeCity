/**
 * Pure undo / redo stack helpers. Game-agnostic.
 *
 * Re-exports the kit's `editor-history` module so VibeCity and the
 * other consumer games (VibeRacer, FrackingAsteroids, etc.) all share
 * the same immutable history math. REQ-023 (editor undo / redo) wires
 * VibeCity's editor onto these helpers.
 *
 * The kit holds the canonical implementation in
 * `@randroids-dojo/vibekit` (`editor-history.ts`). Keeping a thin
 * re-export here preserves the project-internal `@/lib/editor` barrel
 * shape so consumers do not have to import from the kit directly. The
 * surface mirrors what `tests/lib/editor/history.test.ts` exercises:
 *
 *  - `createHistory(initial)` seeds a fresh history with one present
 *    entry and no past or future.
 *  - `pushHistory(history, next)` records the current present onto the
 *    past stack, sets `next` as the new present, clears the redo
 *    stack, and caps the past length at `EDITOR_HISTORY_MAX_PAST` so a
 *    long editing session cannot grow without bound.
 *  - `undoHistory(history)` pops the most recent past entry into the
 *    present and pushes the prior present onto the future stack so it
 *    can be redone.
 *  - `redoHistory(history)` pops the most recent future entry into the
 *    present and pushes the prior present onto the past stack.
 *  - `canUndo` / `canRedo` are O(1) flags the toolbar reads to disable
 *    buttons.
 *
 * Equality semantics: when the caller pushes a value reference-equal
 * to the current present, the helpers return the same history object,
 * so an idempotent setter (e.g. clicking erase on an already empty
 * cell) does not pollute the past stack with no-op duplicates.
 *
 * The kit also exposes `replacePresent` and `resetHistory`. They are
 * not re-exported here because the v1 VibeCity editor does not use
 * them; a future slice that needs them can extend this re-export.
 */

export {
  EDITOR_HISTORY_MAX_PAST,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type EditorHistory,
} from '@randroids-dojo/vibekit'
