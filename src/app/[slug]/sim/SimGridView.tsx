'use client'

import {
  CELL_PIXELS,
  GRID_DIAMETER,
  GRID_PIXEL_SIZE,
  GRID_RADIUS,
  cellKey,
  cellToPixel,
  gridCells,
} from '../edit/snapGrid'
import { type ZonesBucket, type ZoneKind } from '@/lib/sim/state'

/**
 * Sim view grid (REQ-080 zoning slice 2 of N + REQ-110 sim-as-primary
 * view scaffold).
 *
 * Minimal top-down 2D SVG grid for the sim view. Reuses the editor's
 * `GRID_RADIUS` / `CELL_PIXELS` / `cellToPixel` / `gridCells` helpers
 * so the sim view paints on the same coordinate space as the editor;
 * a future merge of the two views (REQ-110 step 2) lands a unified
 * surface without coordinate translation.
 *
 * Renders zoned cells from `city.sim.zones.cells` with a per-kind
 * fill so the player sees the zoning state at a glance. When
 * `onCellClick` is provided every cell is clickable and routes the
 * `(row, col)` to the caller; the SimViewClient dispatches
 * `placeZone` / `eraseZone` events through the engine so the local
 * state and the server log stay in sync.
 *
 * Cursor mode swaps the cursor between paint (crosshair) and erase
 * (not-allowed) to mirror the editor's place / erase tool vocabulary.
 *
 * The 3D iso camera (REQ-111) lands in its own slice on top of this
 * surface; v1 ships flat top-down because it covers the same use
 * case (place zones, see them) at a fraction of the implementation
 * cost.
 */

export const ZONE_FILL: Record<ZoneKind, string> = {
  residential: '#5fae5f',
  commercial: '#5f8aae',
  industrial: '#ae8a5f',
} as const

export const ZONE_STROKE: Record<ZoneKind, string> = {
  residential: '#3f7f3f',
  commercial: '#3f5f7f',
  industrial: '#7f5f3f',
} as const

/**
 * Density-step opacity. Density 0 (zoned but ungrown) renders at low
 * opacity so the player sees "this is zoned but waiting for growth"
 * vs density 3 (max growth) at full opacity. The per-tick growth
 * reducer (REQ-081, follow-on slice) advances density toward 3 as
 * demand allows.
 */
export const ZONE_DENSITY_OPACITY: Record<0 | 1 | 2 | 3, number> = {
  0: 0.35,
  1: 0.55,
  2: 0.78,
  3: 1.0,
} as const

export function SimGridView({
  zones,
  onCellClick,
  cursorMode = 'place',
}: {
  zones: ZonesBucket
  onCellClick?: (row: number, col: number) => void
  cursorMode?: 'place' | 'erase'
}) {
  const cells = gridCells()
  const interactive = typeof onCellClick === 'function'
  const cursor = !interactive
    ? 'default'
    : cursorMode === 'erase'
      ? 'not-allowed'
      : 'crosshair'
  const zoneCount = Object.keys(zones.cells).length

  return (
    <svg
      role="img"
      aria-label={`Sim grid, ${GRID_DIAMETER} by ${GRID_DIAMETER} cells`}
      data-testid="sim-grid"
      data-grid-radius={GRID_RADIUS}
      data-grid-diameter={GRID_DIAMETER}
      data-cell-pixels={CELL_PIXELS}
      data-zone-count={zoneCount}
      data-cursor-mode={interactive ? cursorMode : 'none'}
      width={GRID_PIXEL_SIZE}
      height={GRID_PIXEL_SIZE}
      viewBox={`0 0 ${GRID_PIXEL_SIZE} ${GRID_PIXEL_SIZE}`}
      style={{
        display: 'block',
        background: '#fdfaf2',
        border: '1px solid #d6cfbf',
        borderRadius: 4,
        maxWidth: '100%',
        height: 'auto',
        cursor,
        touchAction: 'none',
      }}
    >
      {cells.map((cell) => {
        const { x, y } = cellToPixel(cell)
        const key = cellKey(cell.row, cell.col)
        const isOrigin = cell.row === 0 && cell.col === 0
        const zone = zones.cells[key]
        const fill = zone
          ? ZONE_FILL[zone.kind]
          : isOrigin
            ? '#efe7d2'
            : 'transparent'
        const fillOpacity = zone ? ZONE_DENSITY_OPACITY[zone.density] : 1
        const stroke = zone ? ZONE_STROKE[zone.kind] : '#d6cfbf'
        const strokeWidth = zone ? 1.5 : 1
        return (
          <rect
            key={key}
            x={x}
            y={y}
            width={CELL_PIXELS}
            height={CELL_PIXELS}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            data-cell-row={cell.row}
            data-cell-col={cell.col}
            data-cell-zoned={zone ? 'true' : 'false'}
            data-cell-zone-kind={zone ? zone.kind : ''}
            data-cell-zone-density={zone ? zone.density : ''}
            onClick={
              interactive
                ? () => {
                    onCellClick(cell.row, cell.col)
                  }
                : undefined
            }
            style={interactive ? { cursor } : undefined}
          />
        )
      })}
    </svg>
  )
}
