import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { City } from '@/lib/schemas'
import {
  CELL_PIXELS,
  GRID_DIAMETER,
  GRID_PIXEL_SIZE,
  GRID_RADIUS,
  cellKey,
  cellToPixel,
  gridCells,
  occupiedBuildingCells,
  occupiedPieceCells,
} from './snapGrid'
import {
  PREVIEW_FILL,
  PREVIEW_FILL_OPACITY,
  PREVIEW_STROKE,
  type PreviewCell,
} from './editorPreview'
import {
  REJECTION_FLASH_DURATION_MS,
  REJECTION_FLASH_FILL,
  REJECTION_FLASH_FILL_OPACITY,
  REJECTION_FLASH_STROKE,
  type RejectionFlash,
} from './rejectionFlash'
import {
  DEFAULT_VIEWPORT,
  isDefaultViewport,
  viewportToViewBoxString,
  type Viewport,
} from './gridViewport'
import {
  CONNECTOR_DIR_LABEL,
  GLYPH_RADIUS_PIXELS,
  cityConnectorGlyphs,
  countMatchedGlyphs,
  type OpenEndArrowGlyph,
} from './connectorGlyphs'

/**
 * Shared empty fallback for the open-end cell set so callers that omit
 * `openEndCellKeys` do not allocate a fresh empty set per render.
 */
const EMPTY_OPEN_END_KEYS: ReadonlySet<string> = new Set<string>()

/**
 * Shared empty fallback for the open-end arrow list so callers that omit
 * `openEndArrows` do not allocate a fresh empty array per render.
 */
const EMPTY_OPEN_END_ARROWS: readonly OpenEndArrowGlyph[] = []

/**
 * Render the editor snap-grid (REQ-016, REQ-020, REQ-022, REQ-028).
 *
 * The grid is an SVG of `GRID_DIAMETER x GRID_DIAMETER` cells. Each
 * cell renders as a faint outlined square. The origin cell `(0, 0)`
 * is highlighted so authors have a visual anchor when zero pieces
 * are placed. Pieces in the city render as brown filled squares over
 * their resolved footprint cells; buildings render as olive filled
 * squares over their single occupied cell so the two layers are
 * visually distinguishable on the same grid (REQ-028).
 *
 * When `onCellClick` is provided, every cell renders as a clickable
 * `<rect>` so the place / erase tools can attach. Without the
 * handler the grid stays presentational. The optional `cursorMode`
 * prop swaps the cursor glyph between place (crosshair) and erase
 * (not-allowed); the cell-click contract itself is owned by the
 * caller. Pan / zoom (REQ-024) lives in its own slice on top of this
 * surface.
 *
 * Hover preview (ghost cell): when the caller wires `onCellEnter` /
 * `onCellLeave` and passes a `previewCell`, the matching cell renders
 * a translucent ghost overlay communicating what the next click would
 * do (place valid, place invalid because the cell is occupied, erase
 * target, or erase no-op). The overlay is non-interactive so it does
 * not steal hover events from the underlying clickable cell. When the
 * caller also passes `previewCells` (multi-cell footprint preview per
 * REQ-059), every cell in the list renders a ghost so a multi-cell
 * piece (mega sweep, hairpin) shows its full reach; the first cell of
 * the list is treated as the anchor (carries `data-preview-anchor='true'`)
 * and the SVG-level `data-preview-row` / `data-preview-col` continue
 * to mirror `previewCell`.
 *
 * Pan / zoom (REQ-024): when `viewport` is provided the SVG `viewBox`
 * is derived from it (panX, panY, GRID_PIXEL_SIZE / zoom). The SVG's
 * outer pixel size stays at `GRID_PIXEL_SIZE` so layout is stable
 * across zoom levels. Wheel and pointer-drag handlers (`onWheel`,
 * `onSurfacePointerDown`) are forwarded through so the parent can
 * own the viewport state machine. The default viewport renders
 * exactly the same as before this slice.
 *
 * Connector glyphs (REQ-019, REQ-063): each placed piece's connector
 * ports are rendered as small circles at the cell-edge midpoint
 * (cardinal) or cell corner (corner) along the compass direction the
 * port faces. Cardinals get a wheat fill so they read as the dominant
 * cardinal-only piece taxonomy; corners get a moccasin fill so the
 * arc45 / diagonal corner-connector pieces are visually
 * distinguishable. Glyphs are non-interactive (`pointerEvents='none'`)
 * so they do not steal hover or click events from the underlying
 * cells.
 *
 * Connector match status (REQ-019, REQ-063): each glyph's
 * `data-connector-status` attribute reads `matched` when the port
 * faces an opposing port on a neighbor piece, or `open` otherwise.
 * Matched glyphs render with a sage-green stroke (and a slightly
 * heavier stroke width) to signal "this connector links" at a glance;
 * open glyphs keep the original dark-brown stroke. The SVG root
 * exposes `data-connector-matched` mirroring the matched count so the
 * EditorClient toolbar can surface a count without re-walking the
 * city.
 *
 * Open-end cell highlight (REQ-019, REQ-064): when the caller passes
 * `openEndCellKeys` (the substrate-derived `Set<cellKey>` of cells
 * that host at least one unmatched connector port), every cell whose
 * key is in the set carries `data-cell-has-open-port='true'` and
 * renders with an additional warning stroke ring (rendered as a
 * non-interactive overlay rect so the underlying clickable cell stays
 * intact). The warning color matches the rejection-flash and unmatched-
 * ports-readout palette (`#a3372a`) so the editor's open-ends warning
 * vocabulary stays consistent across the per-cell highlight, the
 * per-port glyph stroke, and the toolbar count readout. Cells with no
 * open port carry `data-cell-has-open-port='false'` so a test can
 * count both populations.
 *
 * Open-end direction arrows (REQ-019, REQ-064): when the caller passes
 * `openEndArrows` (the substrate-derived list of one outward-pointing
 * triangle per unmatched connector port), every entry renders as a
 * non-interactive `editor-open-end-arrow` `<polygon>` whose tip points
 * outward in the direction the missing neighbor needs to land. Two
 * ports on the same cell (e.g. an isolated straight reports both N and
 * S as unmatched) emit two distinct arrows so a builder reads "this
 * north side AND this south side both still need a neighbor" instead
 * of just "this cell is open somewhere". The arrows render after the
 * open-end cell overlay rects but before the connector glyphs so the
 * connector dots stay on top and the arrows read as a complementary
 * directional cue rather than overlapping the connector dot.
 */
export function SnapGrid({
  city,
  onCellClick,
  onCellEnter,
  onCellLeave,
  previewCell,
  previewCells,
  rejectionFlash,
  cursorMode = 'place',
  viewport = DEFAULT_VIEWPORT,
  openEndCellKeys,
  openEndArrows,
  onSurfaceWheel,
  onSurfacePointerDown,
}: {
  city: City
  onCellClick?: (row: number, col: number) => void
  onCellEnter?: (row: number, col: number) => void
  onCellLeave?: (row: number, col: number) => void
  previewCell?: PreviewCell | null
  previewCells?: readonly PreviewCell[] | null
  rejectionFlash?: RejectionFlash | null
  cursorMode?: 'place' | 'erase'
  viewport?: Viewport
  openEndCellKeys?: ReadonlySet<string> | null
  openEndArrows?: readonly OpenEndArrowGlyph[] | null
  onSurfaceWheel?: (event: ReactWheelEvent<SVGSVGElement>) => void
  onSurfacePointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void
}) {
  const cells = gridCells()
  const occupiedPieces = occupiedPieceCells(city)
  const occupiedBuildings = occupiedBuildingCells(city)
  const connectorGlyphs = cityConnectorGlyphs(city.pieces)
  const matchedConnectorCount = countMatchedGlyphs(connectorGlyphs)
  const interactive = typeof onCellClick === 'function'
  const cursor = !interactive
    ? 'default'
    : cursorMode === 'erase'
      ? 'not-allowed'
      : 'crosshair'
  // The footprint ghost list (REQ-059): when the caller passes
  // `previewCells`, every cell in the list renders as a ghost so a
  // multi-cell piece (mega sweep, hairpin) shows its full reach. When
  // omitted the legacy single-cell `previewCell` is wrapped into a
  // one-element list so the existing render path stays.
  const ghostList: readonly PreviewCell[] =
    previewCells && previewCells.length > 0
      ? previewCells
      : previewCell
        ? [previewCell]
        : []
  const previewedKeys = new Set<string>()
  for (const ghost of ghostList) {
    previewedKeys.add(cellKey(ghost.row, ghost.col))
  }
  const openEndKeys: ReadonlySet<string> = openEndCellKeys ?? EMPTY_OPEN_END_KEYS
  const openEndArrowList: readonly OpenEndArrowGlyph[] =
    openEndArrows && openEndArrows.length > 0
      ? openEndArrows
      : EMPTY_OPEN_END_ARROWS
  const viewBox = viewportToViewBoxString(viewport)
  const viewportIsDefault = isDefaultViewport(viewport)

  return (
    <svg
      role="img"
      aria-label={`Snap grid, ${GRID_DIAMETER} by ${GRID_DIAMETER} cells`}
      data-testid="editor-snap-grid"
      data-grid-radius={GRID_RADIUS}
      data-grid-diameter={GRID_DIAMETER}
      data-cell-pixels={CELL_PIXELS}
      data-occupied-count={occupiedPieces.size}
      data-building-count={occupiedBuildings.size}
      data-connector-count={connectorGlyphs.length}
      data-connector-matched={matchedConnectorCount}
      data-open-end-cell-count={openEndKeys.size}
      data-open-end-arrow-count={openEndArrowList.length}
      data-cursor-mode={interactive ? cursorMode : 'none'}
      data-preview-kind={previewCell ? previewCell.kind : 'none'}
      data-preview-row={previewCell ? previewCell.row : ''}
      data-preview-col={previewCell ? previewCell.col : ''}
      data-preview-cell-count={ghostList.length}
      data-rejection-kind={rejectionFlash ? rejectionFlash.kind : 'none'}
      data-rejection-row={rejectionFlash ? rejectionFlash.row : ''}
      data-rejection-col={rejectionFlash ? rejectionFlash.col : ''}
      data-rejection-id={rejectionFlash ? rejectionFlash.id : ''}
      data-viewport-pan-x={viewport.panX}
      data-viewport-pan-y={viewport.panY}
      data-viewport-zoom={viewport.zoom}
      data-viewport-default={viewportIsDefault ? 'true' : 'false'}
      width={GRID_PIXEL_SIZE}
      height={GRID_PIXEL_SIZE}
      viewBox={viewBox}
      onWheel={onSurfaceWheel}
      onPointerDown={onSurfacePointerDown}
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
        const isPiece = occupiedPieces.has(key)
        const isBuilding = occupiedBuildings.has(key)
        const fill = isPiece
          ? '#7d6b4a'
          : isBuilding
            ? '#6b7d4a'
            : isOrigin
              ? '#efe7d2'
              : 'transparent'
        const occupiedKind = isPiece ? 'piece' : isBuilding ? 'building' : 'none'
        const isPreviewed = previewedKeys.has(key)
        const hasOpenPort = openEndKeys.has(key)
        return (
          <rect
            key={key}
            x={x}
            y={y}
            width={CELL_PIXELS}
            height={CELL_PIXELS}
            fill={fill}
            stroke="#d6cfbf"
            strokeWidth={1}
            data-cell-row={cell.row}
            data-cell-col={cell.col}
            data-cell-occupied={isPiece || isBuilding ? 'true' : 'false'}
            data-cell-occupied-kind={occupiedKind}
            data-cell-previewed={isPreviewed ? 'true' : 'false'}
            data-cell-has-open-port={hasOpenPort ? 'true' : 'false'}
            onClick={
              interactive
                ? () => {
                    onCellClick(cell.row, cell.col)
                  }
                : undefined
            }
            onMouseEnter={
              onCellEnter
                ? () => {
                    onCellEnter(cell.row, cell.col)
                  }
                : undefined
            }
            onMouseLeave={
              onCellLeave
                ? () => {
                    onCellLeave(cell.row, cell.col)
                  }
                : undefined
            }
            style={interactive ? { cursor } : undefined}
          />
        )
      })}
      {Array.from(openEndKeys).map((key) => {
        // Render a non-interactive warning overlay rect on top of any
        // cell that hosts an unmatched connector port (REQ-019, REQ-064).
        // The fill is transparent so the underlying piece / building /
        // origin tile keeps its visual; the warning stroke (`#a3372a`,
        // matching the rejection-flash and open-ends-readout palette)
        // pulls the builder's eye to the cells that still need a
        // neighbor without obscuring the connector glyphs.
        const [rowStr, colStr] = key.split(',')
        const row = Number(rowStr)
        const col = Number(colStr)
        const { x, y } = cellToPixel({ row, col })
        return (
          <rect
            key={`open-end-${key}`}
            data-testid="editor-open-end-cell"
            data-open-end-row={row}
            data-open-end-col={col}
            x={x + 1}
            y={y + 1}
            width={CELL_PIXELS - 2}
            height={CELL_PIXELS - 2}
            fill="transparent"
            stroke="#a3372a"
            strokeWidth={2}
            pointerEvents="none"
          />
        )
      })}
      {openEndArrowList.map((arrow, index) => (
        <polygon
          key={`open-end-arrow-${arrow.pieceIndex}-${arrow.cellRow}-${arrow.cellCol}-${arrow.dir}-${index}`}
          data-testid="editor-open-end-arrow"
          data-open-end-arrow-piece={arrow.pieceIndex}
          data-open-end-arrow-row={arrow.cellRow}
          data-open-end-arrow-col={arrow.cellCol}
          data-open-end-arrow-dir={CONNECTOR_DIR_LABEL[arrow.dir]}
          points={arrow.points}
          fill="#a3372a"
          stroke="#7a2a20"
          strokeWidth={1}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      ))}
      {connectorGlyphs.map((glyph, index) => (
        <circle
          key={`connector-${glyph.pieceIndex}-${index}`}
          data-testid="editor-connector-glyph"
          data-connector-piece={glyph.pieceIndex}
          data-connector-dir={CONNECTOR_DIR_LABEL[glyph.dir]}
          data-connector-kind={glyph.kind}
          data-connector-row={glyph.cellRow}
          data-connector-col={glyph.cellCol}
          data-connector-status={glyph.status}
          cx={glyph.x}
          cy={glyph.y}
          r={GLYPH_RADIUS_PIXELS}
          fill={glyph.kind === 'cardinal' ? '#f5deb3' : '#ffe4b5'}
          stroke={glyph.status === 'matched' ? '#3f6b3f' : '#5a4a2a'}
          strokeWidth={glyph.status === 'matched' ? 2 : 1}
          pointerEvents="none"
        />
      ))}
      {ghostList.map((ghost, index) => (
        <rect
          key={`preview-${ghost.row}-${ghost.col}`}
          data-testid="editor-preview-ghost"
          data-preview-kind={ghost.kind}
          data-preview-row={ghost.row}
          data-preview-col={ghost.col}
          data-preview-anchor={index === 0 ? 'true' : 'false'}
          x={cellToPixel(ghost).x}
          y={cellToPixel(ghost).y}
          width={CELL_PIXELS}
          height={CELL_PIXELS}
          fill={PREVIEW_FILL[ghost.kind]}
          fillOpacity={PREVIEW_FILL_OPACITY[ghost.kind]}
          stroke={PREVIEW_STROKE[ghost.kind]}
          strokeWidth={2}
          pointerEvents="none"
        />
      ))}
      {rejectionFlash ? (
        <rect
          // The id-based key forces React to remount the rect whenever a
          // fresh rejection lands on the same cell so the SMIL animation
          // restarts cleanly. SMIL is used over CSS keyframes because
          // SVG attributes (fill-opacity) animate via SMIL without a
          // browser-specific @keyframes declaration.
          key={`rejection-${rejectionFlash.id}`}
          data-testid="editor-rejection-flash"
          data-rejection-kind={rejectionFlash.kind}
          data-rejection-row={rejectionFlash.row}
          data-rejection-col={rejectionFlash.col}
          data-rejection-id={rejectionFlash.id}
          x={cellToPixel(rejectionFlash).x}
          y={cellToPixel(rejectionFlash).y}
          width={CELL_PIXELS}
          height={CELL_PIXELS}
          fill={REJECTION_FLASH_FILL}
          fillOpacity={REJECTION_FLASH_FILL_OPACITY}
          stroke={REJECTION_FLASH_STROKE}
          strokeWidth={2}
          pointerEvents="none"
        >
          <animate
            attributeName="fill-opacity"
            from={REJECTION_FLASH_FILL_OPACITY}
            to={0}
            dur={`${REJECTION_FLASH_DURATION_MS}ms`}
            fill="freeze"
            repeatCount="1"
          />
          <animate
            attributeName="stroke-opacity"
            from={1}
            to={0}
            dur={`${REJECTION_FLASH_DURATION_MS}ms`}
            fill="freeze"
            repeatCount="1"
          />
        </rect>
      ) : null}
    </svg>
  )
}
