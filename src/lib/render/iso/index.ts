/**
 * Iso-projection rendering primitives. Game-agnostic: any tile-based
 * surface that wants the SimCity-style 45deg dimetric look can import
 * `isoTransformCss` and the rotation helpers from this barrel.
 *
 * The math here has no dependency on city schemas or sim state; it
 * operates purely on a `(viewMode, rotationDeg)` input and returns a
 * CSS transform string. That keeps it cheap to share with future
 * games (e.g. VibeRacer track editor surfaces) without dragging the
 * city-specific schemas along.
 */

export {
  DEFAULT_SNAP_GRID_VIEW_MODE,
  ISO_ROTATE_DEG,
  ISO_SCALE_Y,
  isoTransformCss,
  type SnapGridViewMode,
} from './projection'

export {
  DEFAULT_ISO_ROTATION_DEG,
  ISO_ROTATION_STEP_DEG,
  normalizeIsoRotation,
  rotateIsoCcw,
  rotateIsoCw,
} from './rotation'
