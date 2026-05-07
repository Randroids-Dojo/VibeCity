import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { City } from '@/lib/schemas'
import type {
  DisastersBucket,
  PowerBucket,
  ServicesBucket,
  WaterBucket,
  ZonesBucket,
} from '@/lib/sim/state'
import { solvePowerStatus, type CellPowerStatus } from '@/lib/sim/powerSolver'
import {
  coverageCount,
  solveServicesCoverage,
} from '@/lib/sim/servicesSolver'
import { solveWaterStatus, type CellWaterStatus } from '@/lib/sim/waterSolver'
import {
  solveSewageStatus,
  type CellSewageStatus,
} from '@/lib/sim/sewageSolver'
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

/**
 * Per-zone-kind fill / stroke (REQ-080 unification). Mirrors the
 * SimGridView palette so the editor and any other view of the city
 * stay visually consistent. Density advances opacity per
 * `ZONE_DENSITY_OPACITY` so a freshly-painted zone reads as faint and
 * a max-density zone reads as solid.
 */
const ZONE_FILL = {
  residential: '#5fae5f',
  commercial: '#5f8aae',
  industrial: '#ae8a5f',
} as const

const ZONE_STROKE = {
  residential: '#3f7f3f',
  commercial: '#3f5f7f',
  industrial: '#7f5f3f',
} as const

const ZONE_DENSITY_OPACITY = {
  0: 0.35,
  1: 0.55,
  2: 0.78,
  3: 1.0,
} as const

/**
 * Per-power-element render constants (REQ-085 slice 2 UI). Plant
 * fills are kind-distinct: coal is industrial brown, solar is bright
 * yellow. Power lines render as bright yellow squares, clearly visible
 * over zoned + piece + building cells. The connectivity solver
 * (REQ-087, slice 3) will tint lines and lit zones based on per-cell
 * power status; slice 2 ships static visuals.
 */
const POWER_PLANT_FILL = {
  coal: '#4a3a2a',
  solar: '#d4b85f',
} as const

const POWER_PLANT_STROKE = {
  coal: '#2a1f10',
  solar: '#a08530',
} as const

const POWER_LINE_FILL = '#e0a020'
const POWER_LINE_STROKE = '#a07010'

/**
 * Per-service-kind fill / stroke (REQ-100 slice 2 UI). Each kind
 * renders as a small inset square at the cell with a kind-distinct
 * color matching the editor palette.
 */
const SERVICE_FILL = {
  'police-station': '#3a4a7a',
  'fire-station': '#a3372a',
  hospital: '#cc4f4f',
  school: '#7a5fae',
  'garbage-depot': '#5a5a3a',
} as const

const SERVICE_STROKE = {
  'police-station': '#1f2f5a',
  'fire-station': '#7a2a20',
  hospital: '#8a2f2f',
  school: '#5a3f8a',
  'garbage-depot': '#3a3a20',
} as const

/**
 * Per-water-source render constants (REQ-090 slice 2 UI).
 */
const WATER_SOURCE_FILL = {
  'water-tower': '#5a8aae',
  'pump-station': '#3a6a8a',
} as const

const WATER_SOURCE_STROKE = {
  'water-tower': '#3a5f7a',
  'pump-station': '#1f4a60',
} as const

/**
 * Per-pipe-kind render constants. Water pipes render in light blue
 * (fresh water); sewage pipes render in dark brown (waste line).
 */
const WATER_PIPE_FILL = {
  water: '#5fb0d0',
  sewage: '#7a5a3a',
} as const

const WATER_PIPE_STROKE = {
  water: '#3a8aa0',
  sewage: '#4a3a20',
} as const

/**
 * Sewage treatment plant render constants (REQ-092 sewage slice 2 UI).
 * Plants render in a deeper sewage brown so they read as the drain-side
 * counterpart to a water tower at a glance.
 */
const SEWAGE_TREATMENT_FILL = '#4a3522'
const SEWAGE_TREATMENT_STROKE = '#2a1c10'

/**
 * Per-status zone overlay stroke (REQ-087 slice 3 visible payoff).
 * Zone overlays carry the per-kind fill from `ZONE_FILL`; the
 * stroke communicates power status: green for powered, gray for
 * brownout, dark for unpowered. The fill stays the zone's kind
 * color so the player can still tell residential / commercial /
 * industrial apart while reading power state at a glance.
 */
const POWER_STATUS_STROKE: Record<CellPowerStatus, string> = {
  powered: '#3a8a3a',
  brownout: '#8a8a3a',
  unpowered: '#5a5a5a',
}

const POWER_STATUS_STROKE_WIDTH: Record<CellPowerStatus, number> = {
  powered: 2,
  brownout: 2,
  unpowered: 1,
}
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
import type { SpawnAnchorMarker } from './spawnMarker'

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
  spawnMarker,
  zones,
  power,
  services,
  water,
  disasters,
  abandonedCellKeys,
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
  spawnMarker?: SpawnAnchorMarker | null
  /**
   * Optional sim zones (REQ-080 unification). When supplied, every
   * cell whose key matches a zone gets a translucent overlay tinted
   * by zone kind and density. Pieces and buildings render on top of
   * the cell base layer; zones render UNDER the connector glyphs and
   * preview overlays so the place / erase ghosts and the open-end
   * warning rings stay legible over a zoned background.
   */
  zones?: ZonesBucket | null
  /**
   * Optional sim power layer (REQ-085 slice 2 UI). When supplied,
   * every line cell renders as a yellow overlay and every plant
   * renders as a kind-distinct anchor square. Plants and lines
   * render ABOVE zones (so a plant on a zoned cell stays visible)
   * but BELOW the connector glyphs and preview overlays so the
   * place / erase ghosts and open-end warnings stay legible.
   */
  power?: PowerBucket | null
  /**
   * Optional sim services layer (REQ-100 slice 2 UI). When supplied,
   * each service building renders as a small kind-distinct overlay
   * at its anchor cell. Services render after the power layer but
   * before the connector glyphs so the place / erase ghosts and
   * open-end warnings stay legible.
   */
  services?: ServicesBucket | null
  /**
   * Optional sim water layer (REQ-090 slice 2 UI). When supplied,
   * each pipe cell renders as a small kind-tinted square overlay
   * and each source as a kind-distinct anchor square. Pipes / sources
   * render after the services layer but before the connector glyphs.
   */
  water?: WaterBucket | null
  /**
   * Optional sim disasters layer (REQ-105 slice 2 UI). When supplied,
   * each active disaster renders as a kind-distinct overlay at its
   * anchor cell so the editor surface reads which cells are under
   * disaster effect. Renders after the water layer but before the
   * connector glyphs.
   */
  disasters?: DisastersBucket | null
  /**
   * Optional set of cell keys (`"row,col"`) for cells whose density
   * dropped to 0 via REQ-079 happiness-driven decline (population
   * entry exists with residents=0). When supplied, those cells get a
   * `data-zone-abandoned="true"` attribute and a dashed gray stroke
   * override so the player can distinguish a freshly-abandoned cell
   * from a never-grown density-0 zone.
   */
  abandonedCellKeys?: ReadonlySet<string> | null
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
      data-spawn-marker={spawnMarker ? 'present' : 'absent'}
      data-spawn-marker-row={spawnMarker ? spawnMarker.cellRow : ''}
      data-spawn-marker-col={spawnMarker ? spawnMarker.cellCol : ''}
      data-spawn-marker-direction={spawnMarker ? spawnMarker.direction : ''}
      data-spawn-marker-rotation={spawnMarker ? spawnMarker.rotation : ''}
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
        const zone = zones?.cells[key]
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
      {zones
        ? (() => {
            // Compute power status + service coverage once per render
            // so the per-cell map drives both the stroke color and
            // the data attributes. Empty fallback buckets ensure the
            // solver runs cleanly when a layer is absent.
            const powerStatus = solvePowerStatus(
              zones,
              power ?? { plants: [], lines: {} },
            )
            const servicesCoverage = solveServicesCoverage(
              zones,
              services ?? { buildings: [] },
            )
            const waterStatus = solveWaterStatus(
              zones,
              water ??
                {
                  sources: [],
                  pipes: {},
                  treatmentPlants: [],
                  wasteAccumulation: {},
                },
            )
            const sewageStatus = solveSewageStatus(
              zones,
              water ??
                {
                  sources: [],
                  pipes: {},
                  treatmentPlants: [],
                  wasteAccumulation: {},
                },
            )
            return Object.entries(zones.cells).map(([key, zone]) => {
              const [rowStr, colStr] = key.split(',')
              const row = Number(rowStr)
              const col = Number(colStr)
              if (!Number.isFinite(row) || !Number.isFinite(col)) return null
              const { x, y } = cellToPixel({ row, col })
              const status: CellPowerStatus = powerStatus[key] ?? 'unpowered'
              const coverage = servicesCoverage[key]
              const cov = coverage ? coverageCount(coverage) : 0
              const wstatus: CellWaterStatus = waterStatus[key] ?? 'unserved'
              const sstatus: CellSewageStatus =
                sewageStatus[key] ?? 'unmanaged'
              // Fire-risk highlight (REQ-105 + REQ-100 follow-on).
              // An industrial cell with density > 0 not covered by a
              // fire-station gets a red stroke override so the player
              // sees WHICH cells contribute to the editor's fire-risk
              // readout, not just the count.
              const isFireRisk =
                zone.kind === 'industrial' &&
                zone.density > 0 &&
                !coverage?.['fire-station']
              const isAbandoned =
                zone.density === 0 && abandonedCellKeys?.has(key) === true
              const baseStroke =
                status === 'unpowered'
                  ? ZONE_STROKE[zone.kind]
                  : POWER_STATUS_STROKE[status]
              const baseStrokeWidth = POWER_STATUS_STROKE_WIDTH[status]
              return (
                <rect
                  key={`zone-${key}`}
                  data-testid="editor-zone-overlay"
                  data-zone-row={row}
                  data-zone-col={col}
                  data-zone-kind={zone.kind}
                  data-zone-density={zone.density}
                  data-zone-power-status={status}
                  data-zone-coverage-count={cov}
                  data-zone-water-status={wstatus}
                  data-zone-sewage-status={sstatus}
                  data-zone-fire-risk={isFireRisk ? 'true' : 'false'}
                  data-zone-abandoned={isAbandoned ? 'true' : 'false'}
                  x={x + 1}
                  y={y + 1}
                  width={CELL_PIXELS - 2}
                  height={CELL_PIXELS - 2}
                  fill={ZONE_FILL[zone.kind]}
                  fillOpacity={ZONE_DENSITY_OPACITY[zone.density]}
                  stroke={
                    isFireRisk
                      ? '#a3372a'
                      : isAbandoned
                        ? '#8a8a8a'
                        : baseStroke
                  }
                  strokeWidth={
                    isFireRisk ? 2 : isAbandoned ? 2 : baseStrokeWidth
                  }
                  strokeDasharray={isAbandoned ? '4 3' : undefined}
                  pointerEvents="none"
                />
              )
            })
          })()
        : null}
      {power
        ? Object.keys(power.lines).map((key) => {
            const [rowStr, colStr] = key.split(',')
            const row = Number(rowStr)
            const col = Number(colStr)
            if (!Number.isFinite(row) || !Number.isFinite(col)) return null
            const { x, y } = cellToPixel({ row, col })
            return (
              <rect
                key={`power-line-${key}`}
                data-testid="editor-power-line"
                data-power-line-row={row}
                data-power-line-col={col}
                x={x + CELL_PIXELS / 4}
                y={y + CELL_PIXELS / 4}
                width={CELL_PIXELS / 2}
                height={CELL_PIXELS / 2}
                fill={POWER_LINE_FILL}
                stroke={POWER_LINE_STROKE}
                strokeWidth={1}
                pointerEvents="none"
              />
            )
          })
        : null}
      {services
        ? services.buildings.map((building, index) => {
            const { x, y } = cellToPixel({ row: building.row, col: building.col })
            return (
              <rect
                key={`service-${building.kind}-${building.row}-${building.col}-${index}`}
                data-testid="editor-service-building"
                data-service-kind={building.kind}
                data-service-row={building.row}
                data-service-col={building.col}
                x={x + 4}
                y={y + 4}
                width={CELL_PIXELS - 8}
                height={CELL_PIXELS - 8}
                fill={SERVICE_FILL[building.kind]}
                stroke={SERVICE_STROKE[building.kind]}
                strokeWidth={2}
                pointerEvents="none"
              />
            )
          })
        : null}
      {water
        ? Object.entries(water.pipes).map(([key, kind]) => {
            const [rowStr, colStr] = key.split(',')
            const row = Number(rowStr)
            const col = Number(colStr)
            if (!Number.isFinite(row) || !Number.isFinite(col)) return null
            const { x, y } = cellToPixel({ row, col })
            return (
              <rect
                key={`water-pipe-${key}`}
                data-testid="editor-water-pipe"
                data-water-pipe-row={row}
                data-water-pipe-col={col}
                data-water-pipe-kind={kind}
                x={x + CELL_PIXELS / 4}
                y={y + CELL_PIXELS / 4}
                width={CELL_PIXELS / 2}
                height={CELL_PIXELS / 2}
                fill={WATER_PIPE_FILL[kind]}
                stroke={WATER_PIPE_STROKE[kind]}
                strokeWidth={1}
                pointerEvents="none"
              />
            )
          })
        : null}
      {water
        ? water.sources.map((source, index) => {
            const { x, y } = cellToPixel({ row: source.row, col: source.col })
            return (
              <rect
                key={`water-source-${source.kind}-${source.row}-${source.col}-${index}`}
                data-testid="editor-water-source"
                data-water-source-kind={source.kind}
                data-water-source-row={source.row}
                data-water-source-col={source.col}
                x={x + 2}
                y={y + 2}
                width={CELL_PIXELS - 4}
                height={CELL_PIXELS - 4}
                fill={WATER_SOURCE_FILL[source.kind]}
                stroke={WATER_SOURCE_STROKE[source.kind]}
                strokeWidth={2}
                pointerEvents="none"
              />
            )
          })
        : null}
      {water
        ? water.treatmentPlants.map((plant, index) => {
            const { x, y } = cellToPixel({ row: plant.row, col: plant.col })
            return (
              <rect
                key={`sewage-plant-${plant.row}-${plant.col}-${index}`}
                data-testid="editor-sewage-treatment-plant"
                data-sewage-plant-row={plant.row}
                data-sewage-plant-col={plant.col}
                x={x + 2}
                y={y + 2}
                width={CELL_PIXELS - 4}
                height={CELL_PIXELS - 4}
                fill={SEWAGE_TREATMENT_FILL}
                stroke={SEWAGE_TREATMENT_STROKE}
                strokeWidth={2}
                pointerEvents="none"
              />
            )
          })
        : null}
      {power
        ? power.plants.map((plant, index) => {
            const { x, y } = cellToPixel({ row: plant.row, col: plant.col })
            return (
              <rect
                key={`power-plant-${plant.kind}-${plant.row}-${plant.col}-${index}`}
                data-testid="editor-power-plant"
                data-power-plant-kind={plant.kind}
                data-power-plant-row={plant.row}
                data-power-plant-col={plant.col}
                x={x + 2}
                y={y + 2}
                width={CELL_PIXELS - 4}
                height={CELL_PIXELS - 4}
                fill={POWER_PLANT_FILL[plant.kind]}
                stroke={POWER_PLANT_STROKE[plant.kind]}
                strokeWidth={2}
                pointerEvents="none"
              />
            )
          })
        : null}
      {spawnMarker ? (
        <g data-testid="editor-spawn-marker" pointerEvents="none">
          <rect
            data-testid="editor-spawn-marker-ring"
            data-spawn-marker-row={spawnMarker.cellRow}
            data-spawn-marker-col={spawnMarker.cellCol}
            x={spawnMarker.ringX}
            y={spawnMarker.ringY}
            width={spawnMarker.ringSize}
            height={spawnMarker.ringSize}
            fill="transparent"
            stroke="#3a6ea0"
            strokeWidth={2}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
          <polygon
            data-testid="editor-spawn-marker-arrow"
            data-spawn-marker-direction={spawnMarker.direction}
            data-spawn-marker-rotation={spawnMarker.rotation}
            points={spawnMarker.points}
            fill="#3a6ea0"
            stroke="#1f4670"
            strokeWidth={1}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        </g>
      ) : null}
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
      {disasters
        ? disasters.active.map((disaster, index) => {
            const { x, y } = cellToPixel({
              row: disaster.row,
              col: disaster.col,
            })
            const fill =
              disaster.kind === 'fire'
                ? '#c44d2a'
                : disaster.kind === 'flood'
                  ? '#3a78a8'
                  : disaster.kind === 'tornado'
                    ? '#6a5a4a'
                    : disaster.kind === 'earthquake'
                      ? '#8a6a3a'
                      : '#5a2a4a'
            return (
              <rect
                key={`disaster-${disaster.kind}-${disaster.row}-${disaster.col}-${index}`}
                data-testid="editor-disaster-overlay"
                data-disaster-kind={disaster.kind}
                data-disaster-row={disaster.row}
                data-disaster-col={disaster.col}
                data-disaster-ticks-remaining={disaster.ticksRemaining}
                x={x + 4}
                y={y + 4}
                width={CELL_PIXELS - 8}
                height={CELL_PIXELS - 8}
                fill={fill}
                fillOpacity={0.55}
                stroke={fill}
                strokeWidth={2}
                pointerEvents="none"
              />
            )
          })
        : null}
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
