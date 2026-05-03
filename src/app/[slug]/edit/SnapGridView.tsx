import type { City } from '@/lib/schemas'
import {
  CELL_PIXELS,
  GRID_DIAMETER,
  GRID_PIXEL_SIZE,
  GRID_RADIUS,
  cellKey,
  cellToPixel,
  gridCells,
  occupiedPieceCells,
} from './snapGrid'

/**
 * Render the editor snap-grid (REQ-016).
 *
 * The grid is an SVG of `GRID_DIAMETER x GRID_DIAMETER` cells. Each
 * cell renders as a faint outlined square. The origin cell `(0, 0)`
 * is highlighted so authors have a visual anchor when zero pieces
 * are placed. Pieces in the city render as filled squares over their
 * resolved footprint cells; the empty city has zero pieces and shows
 * just the grid.
 *
 * This component is presentational: it consumes a city and emits
 * SVG. Place / rotate / erase (REQ-020 onward) and pan / zoom
 * (REQ-024) live in their own slices on top of this surface.
 */
export function SnapGrid({ city }: { city: City }) {
  const cells = gridCells()
  const occupied = occupiedPieceCells(city)

  return (
    <svg
      role="img"
      aria-label={`Snap grid, ${GRID_DIAMETER} by ${GRID_DIAMETER} cells`}
      data-testid="editor-snap-grid"
      data-grid-radius={GRID_RADIUS}
      data-grid-diameter={GRID_DIAMETER}
      data-cell-pixels={CELL_PIXELS}
      data-occupied-count={occupied.size}
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
      }}
    >
      {cells.map((cell) => {
        const { x, y } = cellToPixel(cell)
        const key = cellKey(cell.row, cell.col)
        const isOrigin = cell.row === 0 && cell.col === 0
        const isOccupied = occupied.has(key)
        return (
          <rect
            key={key}
            x={x}
            y={y}
            width={CELL_PIXELS}
            height={CELL_PIXELS}
            fill={isOccupied ? '#7d6b4a' : isOrigin ? '#efe7d2' : 'transparent'}
            stroke="#d6cfbf"
            strokeWidth={1}
            data-cell-row={cell.row}
            data-cell-col={cell.col}
            data-cell-occupied={isOccupied ? 'true' : 'false'}
          />
        )
      })}
    </svg>
  )
}
