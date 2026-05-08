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
 */
export function isoTransformCss(mode: SnapGridViewMode): string {
  if (mode === 'iso') {
    return `rotate(${ISO_ROTATE_DEG}deg) scaleY(${ISO_SCALE_Y})`
  }
  return 'none'
}

/**
 * Default view mode for a freshly-mounted editor surface. Iso is the
 * SimCity-style default; the flat mode stays available as a debug
 * toggle for builders who want a top-down orthographic view.
 */
export const DEFAULT_SNAP_GRID_VIEW_MODE: SnapGridViewMode = 'iso'
