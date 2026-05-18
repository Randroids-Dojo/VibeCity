import { CELL_PIXELS, GRID_PIXEL_SIZE, GRID_RADIUS } from './snapGrid'

/**
 * Pan + zoom viewport for the editor snap-grid (REQ-024).
 *
 * The grid SVG is rendered with a fixed pixel size. To pan / zoom we
 * leave the rendered size alone and manipulate the SVG `viewBox`
 * instead. The viewBox is `(panX, panY, width, height)` in SVG user
 * units; lowering the width / height while keeping the rendered size
 * fixed zooms in, raising them zooms out, and shifting `panX` / `panY`
 * pans the visible window across the underlying grid.
 *
 * `Viewport.zoom` is the visual scale factor (zoom 2 = pieces appear
 * twice as large; the visible region shrinks to half the grid). Pan
 * is stored in grid-pixel units (the same units as `cellToPixel`) so
 * a zoom-aware client can map a pointer position to a cell coordinate
 * with one helper.
 *
 * v1 ships a single shared viewport for the whole editor surface. The
 * pure helpers in this module own clamping, zoom-toward-cursor, and
 * the viewBox derivation; the `EditorClient` wires React state and
 * pointer events on top.
 */

/** Inclusive minimum zoom factor. 0.5x lets builders take in a wider
 * slice of the underlying grid than the default window without losing
 * cell legibility. */
export const MIN_ZOOM = 0.5

/** Inclusive maximum zoom factor. 3x is enough to inspect a single
 * piece's footprint cells at roughly 96 px per cell, which is large
 * enough for fine-grained corner / connector hand placement. */
export const MAX_ZOOM = 3

/** The default zoom factor. Matches the v1 unzoomed editor so pre-existing
 * sessions render unchanged. */
export const DEFAULT_ZOOM = 1

/** How many pixels along the screen a single wheel notch maps to when
 * zooming. The resulting zoom delta uses an exponential curve (see
 * `zoomViewport`) so the perceived speed is the same near MIN_ZOOM as
 * near MAX_ZOOM. */
export const ZOOM_WHEEL_PIXELS = 100

/**
 * Maximum pan margin in grid pixels. The pan range is clamped so the
 * visible viewBox always overlaps the grid by at least one cell width.
 * Without a clamp the user could pan the grid completely off-screen
 * with no visible signal of where home is.
 */
export const PAN_MARGIN_CELLS = 1

/**
 * The viewport state. `panX` / `panY` are in grid-pixel units; `zoom`
 * is dimensionless. The default viewport `(panX: 0, panY: 0, zoom: 1)`
 * exactly reproduces the pre-pan-zoom rendering.
 */
export interface Viewport {
  panX: number
  panY: number
  zoom: number
}

export const DEFAULT_VIEWPORT: Viewport = {
  panX: 0,
  panY: 0,
  zoom: DEFAULT_ZOOM,
}

/** Clamp a number into `[lo, hi]`. NaN collapses to `lo`; positive
 * Infinity collapses to `hi` and negative Infinity to `lo` so a wheel
 * event with extreme deltaY does not silently flip the zoom direction. */
function clamp(value: number, lo: number, hi: number): number {
  if (Number.isNaN(value)) return lo
  if (value < lo) return lo
  if (value > hi) return hi
  return value
}

/**
 * Clamp a viewport into the legal range. Zoom is clamped first so the
 * pan range can be computed against the post-clamp viewBox dimensions.
 *
 * `panX` / `panY` are clamped so the viewBox always overlaps the
 * underlying grid by at least `PAN_MARGIN_CELLS` cells; without the
 * clamp a user could pan completely off-screen. The clamp uses the
 * post-zoom viewBox size so a zoomed-in user has a wider pan range
 * (more grid to walk through) than a zoomed-out user.
 */
export function clampViewport(input: Viewport): Viewport {
  const zoom = clamp(input.zoom, MIN_ZOOM, MAX_ZOOM)
  const viewBoxSize = GRID_PIXEL_SIZE / zoom
  const margin = PAN_MARGIN_CELLS * CELL_PIXELS
  // The viewBox extent is `[pan, pan + viewBoxSize]`. We require the
  // viewBox and the grid to overlap by `margin`, so:
  //   pan <= GRID_PIXEL_SIZE - margin
  //   pan + viewBoxSize >= margin
  // Rearranged: pan >= margin - viewBoxSize.
  const minPan = margin - viewBoxSize
  const maxPan = GRID_PIXEL_SIZE - margin
  return {
    zoom,
    panX: clamp(input.panX, minPan, maxPan),
    panY: clamp(input.panY, minPan, maxPan),
  }
}

/** Pan the viewport by a delta in grid-pixel units. Positive deltas
 * shift the viewBox right / down (so the visible content appears to
 * move left / up). Output is clamped. */
export function panViewport(
  viewport: Viewport,
  deltaX: number,
  deltaY: number,
): Viewport {
  return clampViewport({
    panX: viewport.panX + deltaX,
    panY: viewport.panY + deltaY,
    zoom: viewport.zoom,
  })
}

/**
 * Zoom the viewport to a target factor while keeping the grid pixel
 * under `(focusX, focusY)` stationary. `focusX` / `focusY` are in the
 * same grid-pixel coordinate space the viewBox uses, so a caller can
 * pass `viewportToGridPixel(viewport, screenX, screenY)` (with the
 * screen coords mapped through `screenToGridPixel`) to zoom toward
 * the cursor.
 *
 * If `focusX` or `focusY` is non-finite the zoom anchors to the
 * viewBox center.
 */
export function zoomViewport(
  viewport: Viewport,
  targetZoom: number,
  focusX: number,
  focusY: number,
): Viewport {
  const nextZoom = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM)
  if (nextZoom === viewport.zoom) {
    return viewport
  }
  const cx = Number.isFinite(focusX)
    ? focusX
    : viewport.panX + GRID_PIXEL_SIZE / viewport.zoom / 2
  const cy = Number.isFinite(focusY)
    ? focusY
    : viewport.panY + GRID_PIXEL_SIZE / viewport.zoom / 2
  // Solve for the pan that keeps the focus fixed:
  //   focusX = panX + screenFractionX * viewBoxWidth
  // where screenFractionX = (focusX - panX) / viewBoxWidth at the
  // pre-zoom viewport. Substituting gives:
  //   newPanX = focusX - screenFractionX * (GRID_PIXEL_SIZE / nextZoom)
  const oldSize = GRID_PIXEL_SIZE / viewport.zoom
  const fracX = (cx - viewport.panX) / oldSize
  const fracY = (cy - viewport.panY) / oldSize
  const newSize = GRID_PIXEL_SIZE / nextZoom
  return clampViewport({
    panX: cx - fracX * newSize,
    panY: cy - fracY * newSize,
    zoom: nextZoom,
  })
}

/**
 * Apply a wheel-notch delta to the viewport's zoom. Positive deltas
 * (scroll up / pinch out) zoom in, matching the OS convention for the
 * wheel-zoom direction in image editors. The zoom curve is
 * exponential so a notch zooms by the same proportional amount near
 * MIN_ZOOM as near MAX_ZOOM.
 *
 * `focusX` / `focusY` are in grid-pixel units (use `screenToGridPixel`
 * to map a `clientX` / `clientY` from a wheel event).
 */
export function wheelZoomViewport(
  viewport: Viewport,
  wheelDeltaY: number,
  focusX: number,
  focusY: number,
): Viewport {
  // Wheel events report `deltaY` in pixels. Negative deltaY = scroll
  // up = zoom in.
  const factor = Math.exp(-wheelDeltaY / ZOOM_WHEEL_PIXELS)
  return zoomViewport(viewport, viewport.zoom * factor, focusX, focusY)
}

/**
 * Render the viewport as the four-number tuple SVG `viewBox` accepts.
 * The output is in grid-pixel units; a fixed-size SVG element will
 * scale the viewBox to fit and the visible content will pan / zoom.
 */
export function viewportToViewBox(viewport: Viewport): {
  x: number
  y: number
  width: number
  height: number
} {
  const size = GRID_PIXEL_SIZE / viewport.zoom
  return {
    x: viewport.panX,
    y: viewport.panY,
    width: size,
    height: size,
  }
}

/** Stable string form of `viewportToViewBox` for the SVG `viewBox` attribute. */
export function viewportToViewBoxString(viewport: Viewport): string {
  const { x, y, width, height } = viewportToViewBox(viewport)
  return `${x} ${y} ${width} ${height}`
}

/**
 * Map a screen-space pixel offset (relative to the SVG bounding rect)
 * to a grid-pixel coordinate inside the underlying viewport. Used to
 * anchor wheel-zoom on the cursor and to convert a drag delta in
 * screen pixels into a pan delta in grid-pixel units.
 *
 * `svgWidth` / `svgHeight` are the rendered SVG dimensions (typically
 * `GRID_PIXEL_SIZE` if the editor lets the grid render at its native
 * size). The viewBox has size `GRID_PIXEL_SIZE / zoom`, so one screen
 * pixel maps to `viewBoxSize / svgSize` grid pixels.
 */
export function screenToGridPixel(
  viewport: Viewport,
  screenOffsetX: number,
  screenOffsetY: number,
  svgWidth: number,
  svgHeight: number,
): { x: number; y: number } {
  const viewBoxSize = GRID_PIXEL_SIZE / viewport.zoom
  return {
    x: viewport.panX + (screenOffsetX / svgWidth) * viewBoxSize,
    y: viewport.panY + (screenOffsetY / svgHeight) * viewBoxSize,
  }
}

/**
 * Convert a screen-pixel drag delta to a pan delta in grid-pixel
 * units. The sign is flipped so dragging the grid right (positive
 * screen deltaX) shifts the viewBox left (negative panX), which is
 * the natural drag-the-paper convention.
 */
export function dragDeltaToPan(
  viewport: Viewport,
  screenDeltaX: number,
  screenDeltaY: number,
  svgWidth: number,
  svgHeight: number,
): { panDeltaX: number; panDeltaY: number } {
  const viewBoxSize = GRID_PIXEL_SIZE / viewport.zoom
  const panDeltaX = -((screenDeltaX / svgWidth) * viewBoxSize)
  const panDeltaY = -((screenDeltaY / svgHeight) * viewBoxSize)
  return {
    panDeltaX: Object.is(panDeltaX, -0) ? 0 : panDeltaX,
    panDeltaY: Object.is(panDeltaY, -0) ? 0 : panDeltaY,
  }
}

/** True when the viewport is at the initial (no pan, no zoom) state. */
export function isDefaultViewport(viewport: Viewport): boolean {
  return (
    viewport.panX === DEFAULT_VIEWPORT.panX &&
    viewport.panY === DEFAULT_VIEWPORT.panY &&
    viewport.zoom === DEFAULT_VIEWPORT.zoom
  )
}

/**
 * Compute the `(row, col)` cell at the center of the viewport's
 * visible viewBox. Used by the editor Drive CTA (REQ-110) to encode
 * the camera focus into a `?spawn=row,col` URL so the drive view
 * spawns under wherever the player was looking in the editor.
 *
 * The default viewport `(0, 0, 1)` centers on cell `(0, 0)`, matching
 * the editor's initial framing. Panning shifts the center, so a player
 * panned to the corner of their city gets the corner cell back.
 */
export function viewportFocusCell(viewport: Viewport): {
  row: number
  col: number
} {
  const size = GRID_PIXEL_SIZE / viewport.zoom
  const centerX = viewport.panX + size / 2
  const centerY = viewport.panY + size / 2
  return {
    row: Math.floor(centerY / CELL_PIXELS) - GRID_RADIUS,
    col: Math.floor(centerX / CELL_PIXELS) - GRID_RADIUS,
  }
}
