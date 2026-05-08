/**
 * Generic editor primitives shared across games. The contents of
 * this barrel have no dependency on city or track schemas; each
 * helper is generic on the value type the consumer manages.
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
} from './history'

export {
  AUTOSAVE_STATUS_LABEL,
  DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  type AutosaveStatus,
} from './autosaveStatus'
