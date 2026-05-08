/**
 * Iso-projection helpers for the sim-as-primary view (REQ-110, REQ-111).
 *
 * The editor's `SnapGridView` renders a flat 2D snap grid in SVG. To
 * give the surface the SimCity-style 45-degree dimetric look, we apply
 * a CSS transform to the SVG element itself: rotate by `-45deg`, then
 * compress the vertical axis by `0.5` so a square cell renders as a
 * diamond that is twice as wide as it is tall (the classic 2:1
 * dimetric projection used by SimCity 2000 / 4).
 *
 * The transform is purely visual: the SVG's internal coordinate system
 * is unchanged. Pointer events and viewBox-space pan / zoom continue
 * to operate on the flat coords; the browser applies the inverse
 * transform for hit-testing automatically. This lets the slice ship
 * iso visuals without a parallel hit-testing implementation.
 */

/** Rotation angle (degrees) applied to the SVG in iso mode. */
export const ISO_ROTATE_DEG = -45

/** Vertical scale applied after rotation. 0.5 yields the 2:1 dimetric ratio. */
export const ISO_SCALE_Y = 0.5

/** View-mode union exposed to the editor. */
export type SnapGridViewMode = 'flat' | 'iso'

/**
 * Returns the CSS `transform` string for the given view mode. The
 * editor and any future surfaces (e.g. home-page thumbnails) read this
 * so a single tuning change updates every iso-rendered grid.
 *
 * CSS transform functions are applied RIGHT-TO-LEFT (the rightmost
 * function transforms the original coordinate space first, then the
 * next-leftmost transforms the result, etc.). For the SimCity-style
 * dimetric projection we want to rotate the unit square into a
 * diamond first, then squash the diamond's vertical axis to get the
 * flat 2:1 ratio. That means `rotate` must appear on the RIGHT and
 * `scaleY` on the LEFT of the transform string.
 *
 * `rotationDeg` (REQ-111 slice C) adds an additional camera rotation
 * on top of the base iso angle so a builder can spin the canvas in
 * 90deg snaps. The two rotations sum into a single `rotate(...)` call
 * to keep the CSS string compact and the matrix multiplication order
 * unambiguous.
 */
export function isoTransformCss(
  mode: SnapGridViewMode,
  rotationDeg: number = 0,
): string {
  if (mode === 'iso') {
    const totalRotate = ISO_ROTATE_DEG + rotationDeg
    return `scaleY(${ISO_SCALE_Y}) rotate(${totalRotate}deg)`
  }
  return 'none'
}

/**
 * Default view mode for a freshly-mounted editor surface. Iso is the
 * SimCity-style default; the flat mode stays available as a debug
 * toggle for builders who want a top-down orthographic view.
 */
export const DEFAULT_SNAP_GRID_VIEW_MODE: SnapGridViewMode = 'iso'
