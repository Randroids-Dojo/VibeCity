/**
 * Iso-camera rotation helpers (REQ-111 sim-as-primary slice C).
 *
 * The sim view's iso projection (slice A) renders the city as a 45deg
 * dimetric diamond. Slice C adds 90deg-snap camera rotation on top so
 * a builder can spin the surface to see the back-side of a city or
 * align a placement with a different cardinal direction.
 *
 * Rotation values are stored as integer degrees in [0, 360). The
 * normalize helper accepts any integer (positive, negative, > 360)
 * and wraps it into the canonical four-cardinal range so the iso
 * transform always reads from one of {0, 90, 180, 270}.
 */

/** Rotation step (degrees) for one Q / `]` press. 90deg gives the four cardinal snaps. */
export const ISO_ROTATION_STEP_DEG = 90

/** Default camera rotation when the editor mounts. Zero matches the slice-A iso baseline. */
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
 * Rotate the camera one step counterclockwise (Q key per REQ-111).
 * Returns a normalized degrees value in [0, 360).
 */
export function rotateIsoCcw(current: number): number {
  return normalizeIsoRotation(current - ISO_ROTATION_STEP_DEG)
}

/**
 * Rotate the camera one step clockwise. Bound to `]` because the
 * conventional REQ-111 `E` key is already wired to the editor's
 * erase tool (REQ-022); a future slice can add an alternate keybind
 * without conflict. Returns a normalized degrees value in [0, 360).
 */
export function rotateIsoCw(current: number): number {
  return normalizeIsoRotation(current + ISO_ROTATION_STEP_DEG)
}
