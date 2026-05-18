import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEWPORT,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  PAN_MARGIN_CELLS,
  ZOOM_WHEEL_PIXELS,
  clampViewport,
  dragDeltaToPan,
  isDefaultViewport,
  panViewport,
  screenToGridPixel,
  viewportFocusCell,
  viewportPanToCell,
  viewportToViewBox,
  viewportToViewBoxString,
  wheelZoomViewport,
  zoomViewport,
  type Viewport,
} from '@/app/[slug]/edit/gridViewport'
import { CELL_PIXELS, GRID_PIXEL_SIZE } from '@/app/[slug]/edit/snapGrid'

/**
 * REQ-024: editor pan / zoom viewport.
 *
 * Pure helpers that drive the editor's viewBox manipulation. The React
 * client owns state and pointer events; this module owns the math so
 * the viewport math is testable end-to-end without a DOM.
 */

describe('gridViewport (REQ-024) constants', () => {
  it('default zoom is 1 so the unzoomed editor renders unchanged', () => {
    expect(DEFAULT_ZOOM).toBe(1)
    expect(DEFAULT_VIEWPORT.zoom).toBe(1)
    expect(DEFAULT_VIEWPORT.panX).toBe(0)
    expect(DEFAULT_VIEWPORT.panY).toBe(0)
  })

  it('MIN_ZOOM is below 1 and MAX_ZOOM is above 1', () => {
    expect(MIN_ZOOM).toBeLessThan(1)
    expect(MAX_ZOOM).toBeGreaterThan(1)
  })

  it('ZOOM_WHEEL_PIXELS is a positive finite number', () => {
    expect(Number.isFinite(ZOOM_WHEEL_PIXELS)).toBe(true)
    expect(ZOOM_WHEEL_PIXELS).toBeGreaterThan(0)
  })

  it('PAN_MARGIN_CELLS is at least 1 so the grid never pans completely off-screen', () => {
    expect(PAN_MARGIN_CELLS).toBeGreaterThanOrEqual(1)
  })
})

describe('clampViewport', () => {
  it('passes the default viewport through unchanged', () => {
    expect(clampViewport(DEFAULT_VIEWPORT)).toEqual(DEFAULT_VIEWPORT)
  })

  it('clamps zoom below MIN_ZOOM', () => {
    expect(clampViewport({ panX: 0, panY: 0, zoom: 0.1 }).zoom).toBe(MIN_ZOOM)
  })

  it('clamps zoom above MAX_ZOOM', () => {
    expect(clampViewport({ panX: 0, panY: 0, zoom: 100 }).zoom).toBe(MAX_ZOOM)
  })

  it('clamps non-finite zoom values', () => {
    // NaN collapses to MIN_ZOOM (the floor of the legal range);
    // Infinity is greater than MAX_ZOOM and so clamps to MAX_ZOOM.
    expect(clampViewport({ panX: 0, panY: 0, zoom: NaN }).zoom).toBe(MIN_ZOOM)
    expect(clampViewport({ panX: 0, panY: 0, zoom: Infinity }).zoom).toBe(
      MAX_ZOOM,
    )
  })

  it('clamps panX so the viewBox always overlaps the grid by at least PAN_MARGIN_CELLS', () => {
    // At zoom 1 the viewBox is the full grid; max pan equals
    // GRID_PIXEL_SIZE - margin.
    const margin = PAN_MARGIN_CELLS * CELL_PIXELS
    const huge = clampViewport({
      panX: GRID_PIXEL_SIZE * 10,
      panY: 0,
      zoom: 1,
    })
    expect(huge.panX).toBe(GRID_PIXEL_SIZE - margin)
  })

  it('clamps panX below the minimum', () => {
    const margin = PAN_MARGIN_CELLS * CELL_PIXELS
    const negative = clampViewport({
      panX: -GRID_PIXEL_SIZE * 10,
      panY: 0,
      zoom: 1,
    })
    expect(negative.panX).toBe(margin - GRID_PIXEL_SIZE)
  })

  it('clamp range widens when zoomed in', () => {
    const margin = PAN_MARGIN_CELLS * CELL_PIXELS
    // zoom 2 = viewBoxSize is half the grid so the user can pan farther
    const z2 = clampViewport({
      panX: GRID_PIXEL_SIZE * 10,
      panY: 0,
      zoom: 2,
    })
    expect(z2.panX).toBe(GRID_PIXEL_SIZE - margin)
    const minPan = margin - GRID_PIXEL_SIZE / 2
    const z2Low = clampViewport({
      panX: -GRID_PIXEL_SIZE * 10,
      panY: 0,
      zoom: 2,
    })
    expect(z2Low.panX).toBe(minPan)
  })

  it('returns a fresh object', () => {
    const input: Viewport = { panX: 0, panY: 0, zoom: 1 }
    const out = clampViewport(input)
    expect(out).not.toBe(input)
  })
})

describe('panViewport', () => {
  it('shifts panX / panY by the delta from the default viewport', () => {
    const out = panViewport(DEFAULT_VIEWPORT, 50, 30)
    expect(out.panX).toBe(50)
    expect(out.panY).toBe(30)
    expect(out.zoom).toBe(DEFAULT_VIEWPORT.zoom)
  })

  it('clamps the result through clampViewport', () => {
    const margin = PAN_MARGIN_CELLS * CELL_PIXELS
    const out = panViewport(DEFAULT_VIEWPORT, GRID_PIXEL_SIZE * 5, 0)
    expect(out.panX).toBe(GRID_PIXEL_SIZE - margin)
  })

  it('zero delta returns the same pan position', () => {
    const out = panViewport({ panX: 10, panY: 20, zoom: 1 }, 0, 0)
    expect(out.panX).toBe(10)
    expect(out.panY).toBe(20)
  })

  it('preserves zoom across pan', () => {
    const out = panViewport({ panX: 0, panY: 0, zoom: 2 }, 5, 5)
    expect(out.zoom).toBe(2)
  })
})

describe('zoomViewport', () => {
  it('returns the same reference when the zoom does not change', () => {
    const v: Viewport = { panX: 50, panY: 50, zoom: 1 }
    expect(zoomViewport(v, 1, 100, 100)).toBe(v)
  })

  it('clamps the target zoom into [MIN_ZOOM, MAX_ZOOM]', () => {
    const out = zoomViewport(DEFAULT_VIEWPORT, MAX_ZOOM * 10, GRID_PIXEL_SIZE / 2, GRID_PIXEL_SIZE / 2)
    expect(out.zoom).toBe(MAX_ZOOM)
  })

  it('keeps the focus pixel stationary while zooming', () => {
    // At zoom 1 the focus point at (250, 250) is a fixed grid pixel.
    // After zooming to 2 with the same focus, the same grid pixel
    // should remain at the same fractional position in the viewBox.
    const start: Viewport = { panX: 0, panY: 0, zoom: 1 }
    const focusX = 250
    const focusY = 250
    const out = zoomViewport(start, 2, focusX, focusY)
    // The viewBoxSize is now GRID_PIXEL_SIZE / 2, and the focus pixel
    // should still be at the same fractional position (focusX - panX) / viewBoxSize
    // that it was before (when fraction was 250 / GRID_PIXEL_SIZE).
    const fracBefore = focusX / GRID_PIXEL_SIZE
    const newSize = GRID_PIXEL_SIZE / 2
    const expectedPanX = focusX - fracBefore * newSize
    expect(out.panX).toBeCloseTo(expectedPanX, 5)
  })

  it('falls back to the viewBox center when focus is non-finite', () => {
    const start: Viewport = { panX: 0, panY: 0, zoom: 1 }
    const out = zoomViewport(start, 2, NaN, NaN)
    // Center of viewBox at zoom 1 is (GRID_PIXEL_SIZE / 2, GRID_PIXEL_SIZE / 2).
    const cx = GRID_PIXEL_SIZE / 2
    const fracBefore = cx / GRID_PIXEL_SIZE
    const newSize = GRID_PIXEL_SIZE / 2
    const expected = cx - fracBefore * newSize
    expect(out.panX).toBeCloseTo(expected, 5)
    expect(out.panY).toBeCloseTo(expected, 5)
  })

  it('clamps the resulting pan into the legal range', () => {
    // Zoom in toward the far corner; the resulting pan would push
    // beyond GRID_PIXEL_SIZE - margin if not clamped.
    const start: Viewport = { panX: GRID_PIXEL_SIZE - 10, panY: 0, zoom: 1 }
    const out = zoomViewport(start, MAX_ZOOM, GRID_PIXEL_SIZE * 2, 0)
    const margin = PAN_MARGIN_CELLS * CELL_PIXELS
    expect(out.panX).toBeLessThanOrEqual(GRID_PIXEL_SIZE - margin)
  })
})

describe('wheelZoomViewport', () => {
  it('positive wheelDeltaY zooms out (deltaY > 0 means scroll down)', () => {
    const out = wheelZoomViewport(DEFAULT_VIEWPORT, ZOOM_WHEEL_PIXELS, 0, 0)
    expect(out.zoom).toBeLessThan(DEFAULT_VIEWPORT.zoom)
  })

  it('negative wheelDeltaY zooms in', () => {
    const out = wheelZoomViewport(DEFAULT_VIEWPORT, -ZOOM_WHEEL_PIXELS, 0, 0)
    expect(out.zoom).toBeGreaterThan(DEFAULT_VIEWPORT.zoom)
  })

  it('zero deltaY is idempotent', () => {
    const v: Viewport = { panX: 10, panY: 10, zoom: 1.5 }
    expect(wheelZoomViewport(v, 0, 0, 0)).toBe(v)
  })

  it('clamps zoom into the legal range across many notches', () => {
    let v: Viewport = DEFAULT_VIEWPORT
    for (let i = 0; i < 100; i++) {
      v = wheelZoomViewport(v, -ZOOM_WHEEL_PIXELS, 0, 0)
    }
    expect(v.zoom).toBe(MAX_ZOOM)
    for (let i = 0; i < 100; i++) {
      v = wheelZoomViewport(v, ZOOM_WHEEL_PIXELS, 0, 0)
    }
    expect(v.zoom).toBe(MIN_ZOOM)
  })
})

describe('viewportToViewBox', () => {
  it('default viewport produces the full-grid viewBox', () => {
    expect(viewportToViewBox(DEFAULT_VIEWPORT)).toEqual({
      x: 0,
      y: 0,
      width: GRID_PIXEL_SIZE,
      height: GRID_PIXEL_SIZE,
    })
  })

  it('zoom 2 shrinks viewBox to half size', () => {
    const out = viewportToViewBox({ panX: 0, panY: 0, zoom: 2 })
    expect(out.width).toBe(GRID_PIXEL_SIZE / 2)
    expect(out.height).toBe(GRID_PIXEL_SIZE / 2)
  })

  it('panX / panY become x / y in the viewBox', () => {
    const out = viewportToViewBox({ panX: 25, panY: 50, zoom: 1 })
    expect(out.x).toBe(25)
    expect(out.y).toBe(50)
  })
})

describe('viewportToViewBoxString', () => {
  it('joins the four numbers with spaces', () => {
    const out = viewportToViewBoxString(DEFAULT_VIEWPORT)
    expect(out).toBe(`0 0 ${GRID_PIXEL_SIZE} ${GRID_PIXEL_SIZE}`)
  })
})

describe('screenToGridPixel', () => {
  it('default viewport: 1:1 mapping when svg size matches grid pixel size', () => {
    const out = screenToGridPixel(
      DEFAULT_VIEWPORT,
      100,
      200,
      GRID_PIXEL_SIZE,
      GRID_PIXEL_SIZE,
    )
    expect(out.x).toBe(100)
    expect(out.y).toBe(200)
  })

  it('zoom 2 halves the grid-pixel offset for a fixed screen offset', () => {
    const out = screenToGridPixel(
      { panX: 0, panY: 0, zoom: 2 },
      100,
      100,
      GRID_PIXEL_SIZE,
      GRID_PIXEL_SIZE,
    )
    expect(out.x).toBe(50)
    expect(out.y).toBe(50)
  })

  it('respects pan offset', () => {
    const out = screenToGridPixel(
      { panX: 25, panY: 0, zoom: 1 },
      100,
      0,
      GRID_PIXEL_SIZE,
      GRID_PIXEL_SIZE,
    )
    expect(out.x).toBe(125)
    expect(out.y).toBe(0)
  })
})

describe('dragDeltaToPan', () => {
  it('default viewport: drag right shifts pan left', () => {
    const out = dragDeltaToPan(
      DEFAULT_VIEWPORT,
      50,
      30,
      GRID_PIXEL_SIZE,
      GRID_PIXEL_SIZE,
    )
    expect(out.panDeltaX).toBe(-50)
    expect(out.panDeltaY).toBe(-30)
  })

  it('zoom 2 halves the pan delta for the same screen drag', () => {
    const out = dragDeltaToPan(
      { panX: 0, panY: 0, zoom: 2 },
      100,
      100,
      GRID_PIXEL_SIZE,
      GRID_PIXEL_SIZE,
    )
    expect(out.panDeltaX).toBe(-50)
    expect(out.panDeltaY).toBe(-50)
  })

  it('zero drag yields zero pan', () => {
    const out = dragDeltaToPan(
      DEFAULT_VIEWPORT,
      0,
      0,
      GRID_PIXEL_SIZE,
      GRID_PIXEL_SIZE,
    )
    expect(out.panDeltaX).toBe(0)
    expect(out.panDeltaY).toBe(0)
  })
})

describe('isDefaultViewport', () => {
  it('reports true for the default viewport', () => {
    expect(isDefaultViewport(DEFAULT_VIEWPORT)).toBe(true)
  })

  it('reports false when zoom differs', () => {
    expect(isDefaultViewport({ panX: 0, panY: 0, zoom: 1.5 })).toBe(false)
  })

  it('reports false when pan differs', () => {
    expect(isDefaultViewport({ panX: 1, panY: 0, zoom: 1 })).toBe(false)
    expect(isDefaultViewport({ panX: 0, panY: 1, zoom: 1 })).toBe(false)
  })

  it('reports true after a zoom-in / zoom-out cycle that lands at zoom 1 with no pan', () => {
    let v: Viewport = DEFAULT_VIEWPORT
    v = zoomViewport(v, 2, GRID_PIXEL_SIZE / 2, GRID_PIXEL_SIZE / 2)
    v = zoomViewport(v, 1, GRID_PIXEL_SIZE / 2, GRID_PIXEL_SIZE / 2)
    expect(isDefaultViewport(v)).toBe(true)
  })
})

describe('viewportFocusCell (REQ-110)', () => {
  it('default viewport focuses on the origin cell (0, 0)', () => {
    expect(viewportFocusCell(DEFAULT_VIEWPORT)).toEqual({ row: 0, col: 0 })
  })

  it('shifts row / col when panned by one cell', () => {
    // Panning the viewBox right by CELL_PIXELS moves the focus cell
    // east by 1 (col + 1). Panning down by CELL_PIXELS moves focus
    // south by 1 (row + 1).
    expect(
      viewportFocusCell({ panX: CELL_PIXELS, panY: 0, zoom: 1 }),
    ).toEqual({ row: 0, col: 1 })
    expect(
      viewportFocusCell({ panX: 0, panY: CELL_PIXELS, zoom: 1 }),
    ).toEqual({ row: 1, col: 0 })
    expect(
      viewportFocusCell({
        panX: -CELL_PIXELS,
        panY: -CELL_PIXELS,
        zoom: 1,
      }),
    ).toEqual({ row: -1, col: -1 })
  })

  it('still tracks the cell under the center when zoomed in', () => {
    // Zoom 2 means the viewBox shrinks to half-size. A non-zero pan
    // still places the focus on the cell at the visible center.
    const cell = viewportFocusCell({
      panX: CELL_PIXELS * 3,
      panY: CELL_PIXELS * 2,
      zoom: 2,
    })
    // viewBox size = GRID_PIXEL_SIZE / 2; center pixel =
    // (3 * CELL_PIXELS + GRID_PIXEL_SIZE / 4,
    //  2 * CELL_PIXELS + GRID_PIXEL_SIZE / 4)
    // floor(centerX / CELL_PIXELS) - GRID_RADIUS = floor(3 + 8.5/2) - 8
    // GRID_PIXEL_SIZE = 17 * 32 = 544; 544/4 = 136; 136/32 = 4.25.
    // col = floor(3 + 4.25) - 8 = 7 - 8 = -1; row = floor(2 + 4.25) - 8 = -2.
    expect(cell).toEqual({ row: -2, col: -1 })
  })

  it('returns integer coords (no fractional cells slip through)', () => {
    const cell = viewportFocusCell({ panX: 13, panY: 47, zoom: 1.7 })
    expect(Number.isInteger(cell.row)).toBe(true)
    expect(Number.isInteger(cell.col)).toBe(true)
  })
})

describe('viewportPanToCell (REQ-110)', () => {
  it('cell (0, 0) at default zoom yields DEFAULT_VIEWPORT', () => {
    expect(viewportPanToCell({ row: 0, col: 0 })).toEqual(DEFAULT_VIEWPORT)
  })

  it('positive cell shifts pan east / south by the cell offset', () => {
    // Cell (0, 3) at zoom 1: cellCenterX = (3 + 8 + 0.5) * 32 = 368;
    // panX = 368 - 544/2 = 368 - 272 = 96 = 3 * CELL_PIXELS. panY = 0.
    expect(viewportPanToCell({ row: 0, col: 3 })).toEqual({
      panX: 3 * CELL_PIXELS,
      panY: 0,
      zoom: 1,
    })
    expect(viewportPanToCell({ row: 4, col: 0 })).toEqual({
      panX: 0,
      panY: 4 * CELL_PIXELS,
      zoom: 1,
    })
  })

  it('round-trips with viewportFocusCell', () => {
    // Any cell that round-trips through both helpers must come back
    // intact at the default zoom. Sample a spread of cells across
    // sign quadrants and the origin.
    for (const cell of [
      { row: 0, col: 0 },
      { row: 1, col: 2 },
      { row: -3, col: 4 },
      { row: 5, col: -7 },
      { row: -4, col: -6 },
    ]) {
      expect(viewportFocusCell(viewportPanToCell(cell))).toEqual(cell)
    }
  })

  it('honors the zoom argument', () => {
    // At zoom 2 the viewBox is half-size, but the focus cell must
    // still land at the geometric center.
    const v = viewportPanToCell({ row: 0, col: 0 }, 2)
    expect(v.zoom).toBe(2)
    expect(viewportFocusCell(v)).toEqual({ row: 0, col: 0 })
  })

  it('output is clamped (extreme cell stays inside the legal pan range)', () => {
    // A far-flung cell still produces a clamped viewport (no
    // out-of-range pan that would render the grid off-screen).
    const v = viewportPanToCell({ row: 999, col: -999 })
    expect(Number.isFinite(v.panX)).toBe(true)
    expect(Number.isFinite(v.panY)).toBe(true)
    expect(v.zoom).toBe(1)
  })

  it('clamps zoom before computing pan (out-of-range zoom still centers correctly)', () => {
    // An out-of-range `zoom` argument must not corrupt the pan math.
    // Both an above-MAX and a below-MIN value should produce a
    // viewport whose focus cell round-trips back to the input cell.
    const huge = viewportPanToCell({ row: 0, col: 0 }, 100)
    expect(huge.zoom).toBe(MAX_ZOOM)
    expect(viewportFocusCell(huge)).toEqual({ row: 0, col: 0 })
    const tiny = viewportPanToCell({ row: 0, col: 0 }, 0.001)
    expect(tiny.zoom).toBe(MIN_ZOOM)
    expect(viewportFocusCell(tiny)).toEqual({ row: 0, col: 0 })
  })
})
