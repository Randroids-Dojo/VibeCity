/**
 * Iso-camera rotation helpers. Game-agnostic: any iso-rendered
 * surface (e.g. VibeCity's editor at REQ-111, or a future
 * VibeRacer track viewer) can stack 90deg-snap camera rotation on
 * top of the base 45deg dimetric projection from `./projection`.
 *
 * Rotation values are stored as integer degrees in [0, 360). The
 * normalize helper accepts any integer (positive, negative, > 360)
 * and wraps it into the canonical four-cardinal range so the iso
 * transform always reads from one of {0, 90, 180, 270}.
 */

/** Rotation step (degrees) per cardinal-snap call. 90deg yields four cardinal orientations. */
export const ISO_ROTATION_STEP_DEG = 90

/** Default camera rotation for a freshly-mounted iso surface. Zero matches the base 45deg projection. */
export const DEFAULT_ISO_ROTATION_DEG = 0

/**
 * Wrap any degrees value into the canonical [0, 360) range with
 * positive-modulo semantics. JS `%` returns negative remainders for
 * negative inputs, so the inner `(x % 360 + 360) % 360` collapses
 * `-90` to `270` and `450` to `90`. Non-finite input falls back to
 * the default rotation so a tuning bug cannot crash the per-frame
 * mount.
 */
export function normalizeIsoRotation(deg: number): number {
  if (!Number.isFinite(deg)) return DEFAULT_ISO_ROTATION_DEG
  return ((deg % 360) + 360) % 360
}

/**
 * Rotate one step counterclockwise. Returns a normalized degrees
 * value in [0, 360).
 */
export function rotateIsoCcw(current: number): number {
  return normalizeIsoRotation(current - ISO_ROTATION_STEP_DEG)
}

/**
 * Rotate one step clockwise. Returns a normalized degrees value
 * in [0, 360).
 */
export function rotateIsoCw(current: number): number {
  return normalizeIsoRotation(current + ISO_ROTATION_STEP_DEG)
}
