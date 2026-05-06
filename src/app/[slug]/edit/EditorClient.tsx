'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import type {
  BuilderId,
  BuildingType,
  City,
  PieceType,
  Rotation,
  Slug,
} from '@/lib/schemas'
import {
  BUILDING_PALETTE,
  DEFAULT_BUILDING_TYPE,
  DEFAULT_PALETTE_CATEGORY,
  DEFAULT_PALETTE_TYPE,
  DEFAULT_POWER_TOOL,
  DEFAULT_ROTATION,
  DEFAULT_SERVICE_TOOL,
  DEFAULT_TOOL_MODE,
  DEFAULT_WATER_TOOL,
  DEFAULT_ZONE_TYPE,
  POWER_PALETTE,
  SERVICE_PALETTE,
  STREET_PALETTE,
  WATER_PALETTE,
  ZONE_PALETTE,
  type PaletteCategory,
  type PowerPaletteToolType,
  type ServicePaletteToolType,
  type ToolMode,
  type WaterPaletteToolType,
  type ZonePaletteEntry,
  eraseBuilding,
  erasePiece,
  nextRotation,
  placeBuilding,
  placePiece,
} from './editorState'
import { useSimEngine } from '@/lib/sim/useSimEngine'
import type {
  EraseLineEvent,
  EraseServiceBuildingEvent,
  EraseWaterPipeEvent,
  EraseZoneEvent,
  PlacePowerPlantEvent,
  PlaceServiceBuildingEvent,
  PlaceSewageTreatmentPlantEvent,
  PlaceWaterSourceEvent,
  PlaceZoneEvent,
  RunPowerLineEvent,
  RunWaterPipeEvent,
} from '@/lib/sim/events'
import type { SimSpeed } from '@/lib/sim/state'
import {
  AUTOSAVE_STATUS_LABEL,
  DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  isCityContentEqual,
  type AutosaveStatus,
} from './autosaveStatus'
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type EditorHistory,
} from './editorHistory'
import {
  previewCellsFor,
  previewKindFor,
  type PreviewCell,
} from './editorPreview'
import {
  REJECTION_FLASH_DURATION_MS,
  rejectionFlashFromClick,
  type RejectionFlash,
} from './rejectionFlash'
import {
  DEFAULT_VIEWPORT,
  dragDeltaToPan,
  isDefaultViewport,
  panViewport,
  screenToGridPixel,
  wheelZoomViewport,
  type Viewport,
} from './gridViewport'
import { SnapGrid } from './SnapGridView'
import {
  cityConnectorGlyphs,
  countMatchedGlyphs,
  unmatchedPortGlyphs,
} from './connectorGlyphs'
import {
  buildTrackPath,
  summarizeTrackPath,
  unmatchedPortCells,
  validateConnections,
} from '@/lib/trackPath'
import { spawnAnchorMarker, spawnAnchorReadout } from './spawnMarker'
import { SceneTransitionCurtain } from '../SceneTransitionCurtain'
import {
  buildEditUrl,
  editCopyAriaLabel,
  editCopyLabel,
  SHARE_COPY_RESET_DELAY_MS,
  type CopyShareStatus,
} from '../shareUrl'

/**
 * Editor client surface (REQ-017, REQ-020, REQ-021, REQ-022, REQ-023,
 * REQ-025, REQ-026, REQ-028, REQ-029).
 *
 * Wraps the snap-grid (REQ-016) with two palette categories (street
 * and building), a click-to-place tool, a rotate tool that cycles the
 * selected entry's rotation in 90deg increments, an erase tool that
 * flips the cell-click contract from place to erase, undo / redo that
 * walks an immutable history stack across every accepted mutation,
 * autosave that writes through PUT `/api/city/<slug>` (REQ-014) on
 * every mutation, and a Drive CTA in the toolbar that navigates to
 * `/<slug>` so the build / drive loop round-trips from a single
 * control surface (REQ-026).
 *
 * Placement uses the pure `placePiece` / `placeBuilding` reducers from
 * `editorState.ts` so the UI does not need to inline footprint
 * validation. Clicks on an already-occupied cell are no-ops in place
 * mode (REQ-027). Buildings reject placement on any cell already
 * occupied by a piece OR another building so the two layers never
 * stack.
 *
 * Erase uses the pure `erasePiece` / `eraseBuilding` reducers. In
 * erase mode a click on any cell of a piece's footprint removes the
 * whole piece atomically; in building category, erase removes the
 * building at the clicked cell. Clicks on empty cells are no-ops.
 * Toggling the Erase button (or pressing `E`) flips the active mode;
 * the place / erase modes are mutually exclusive so the cell-click
 * contract stays unambiguous. The active palette category gates which
 * array a click mutates so an author cannot accidentally erase a
 * piece while in building category (and vice versa).
 *
 * Rotation cycles via `nextRotation`. The rotate tool is exposed two
 * ways: a Rotate button in the toolbar and the `R` keyboard shortcut.
 *
 * Undo / redo (REQ-023) wraps the working `City` in an
 * `EditorHistory<City>` from `editorHistory.ts`. Every accepted
 * placement / erase pushes the new city onto the past stack; rejected
 * mutations (overlap, empty-cell erase) keep the prior reference and
 * the history helpers' identity-equality short-circuit prevents duplicate
 * entries. The toolbar exposes Undo / Redo buttons (disabled when the
 * respective stack is empty) and the `Cmd+Z` / `Ctrl+Z` shortcut for
 * undo plus `Cmd+Shift+Z` / `Ctrl+Shift+Z` and `Cmd+Y` / `Ctrl+Y` for
 * redo.
 *
 * Autosave (REQ-025): every accepted mutation marks the working city
 * dirty and a debounced effect (DEFAULT_AUTOSAVE_DEBOUNCE_MS) issues a
 * single PUT once the streak settles. The status indicator surfaces
 * the in-flight state (`Editing` / `Saving` / `Saved` / `Save failed`)
 * via the `editor-autosave-status` test id and a `data-autosave-status`
 * attribute. Rejected placements (overlap, identity equality from the
 * reducer) do not trigger a save because the city reference is
 * unchanged. Undo / redo also flow through autosave: the resulting
 * city is a fresh reference so the debounce kicks in and persists the
 * post-undo state. The initial city (loaded via `loadCity` server-side)
 * is treated as already-saved; the first PUT only fires after the first
 * accepted mutation.
 *
 * Hover preview (REQ-024 partial: ghost piece): tracks which cell the
 * pointer is over, runs `previewKindFor` against the live city / active
 * palette category / active tool mode, and passes the resulting
 * `PreviewCell` into `SnapGrid` so a translucent ghost overlay reads
 * out what the next click would do. The ghost reflects place mode
 * (valid vs. occupied-and-rejected) and erase mode (target vs. no-op)
 * with no extra state for the author to track. The companion
 * `previewCellsFor` resolver (REQ-059) projects the rotated footprint
 * of a multi-cell street piece (mega sweep, hairpin) onto the hovered
 * anchor so the ghost reveals the full reach of a placement, and
 * expands erase-mode previews to the matched piece's full footprint.
 */
export function EditorClient({
  slug,
  initialCity,
  builderId,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
}: {
  slug: Slug
  initialCity: City
  builderId: BuilderId
  autosaveDebounceMs?: number
}) {
  // Sim engine (REQ-070..074 substrate + REQ-080 unification).
  // Mounted here so the editor surface is the canonical place /
  // place-zone / drive-toggle home; the legacy /<slug>/sim view is a
  // historical artifact from when sim was prototyped separately.
  const simEngine = useSimEngine(slug, builderId)
  const simRuntime = simEngine.runtime
  const simState = simRuntime.state
  const [history, setHistory] = useState<EditorHistory<City>>(() =>
    createHistory(initialCity),
  )
  const city = history.present
  const setCityWithHistory = useCallback(
    (updater: (current: City) => City) => {
      setHistory((prev) => {
        const next = updater(prev.present)
        return pushHistory(prev, next)
      })
    },
    [],
  )
  const [paletteCategory, setPaletteCategory] = useState<PaletteCategory>(
    DEFAULT_PALETTE_CATEGORY,
  )
  const [selectedType, setSelectedType] = useState<PieceType>(
    DEFAULT_PALETTE_TYPE,
  )
  const [selectedBuildingType, setSelectedBuildingType] =
    useState<BuildingType>(DEFAULT_BUILDING_TYPE)
  const [selectedZoneType, setSelectedZoneType] = useState<
    ZonePaletteEntry['type']
  >(DEFAULT_ZONE_TYPE)
  const [selectedPowerTool, setSelectedPowerTool] = useState<
    PowerPaletteToolType
  >(DEFAULT_POWER_TOOL)
  const [selectedServiceTool, setSelectedServiceTool] = useState<
    ServicePaletteToolType
  >(DEFAULT_SERVICE_TOOL)
  const [selectedWaterTool, setSelectedWaterTool] = useState<
    WaterPaletteToolType
  >(DEFAULT_WATER_TOOL)
  const [rotation, setRotation] = useState<Rotation>(DEFAULT_ROTATION)
  const [toolMode, setToolMode] = useState<ToolMode>(DEFAULT_TOOL_MODE)
  const [autosaveStatus, setAutosaveStatus] =
    useState<AutosaveStatus>('idle')
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(
    null,
  )
  const [rejectionFlash, setRejectionFlash] = useState<RejectionFlash | null>(
    null,
  )
  // Holds the timeout that clears the rejection flash so a fresh
  // rejection on a different cell cancels the prior clear and shows the
  // new flash for its full duration.
  const rejectionTimeoutRef = useRef<number | null>(null)
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const viewportDefault = isDefaultViewport(viewport)
  const undoAvailable = canUndo(history)
  const redoAvailable = canRedo(history)

  // Active drag state for the pan tool (REQ-024). Captured in a ref so
  // the window-level pointermove / pointerup listeners read the live
  // origin without forcing a re-render every move event.
  const panDragRef = useRef<{
    pointerId: number
    lastClientX: number
    lastClientY: number
    svgWidth: number
    svgHeight: number
  } | null>(null)

  // Hover preview cell (REQ-024 partial: ghost piece). Recomputed
  // from the live city, the active palette category, and the active
  // tool mode so a rotation flip, palette change, or place / erase
  // toggle updates the ghost without waiting for a fresh hover. Null
  // when the pointer is not over the grid so the SVG renders no
  // overlay. The pure `previewKindFor` helper owns the place /
  // erase / occupied logic; this component only wires the React
  // state.
  const previewCell: PreviewCell | null = hoverCell
    ? {
        row: hoverCell.row,
        col: hoverCell.col,
        kind: previewKindFor({
          city,
          category: paletteCategory,
          toolMode,
          row: hoverCell.row,
          col: hoverCell.col,
        }),
      }
    : null
  // Multi-cell footprint preview (REQ-059): a multi-cell street piece
  // (mega sweep, hairpin) projects its rotated footprint onto the
  // hovered anchor cell so the ghost reads out the full reach of the
  // placement. The legacy `previewCell` stays the anchor for the
  // SVG-level data attributes; `previewCells` carries every footprint
  // cell for the multi-ghost render path.
  const previewCells: readonly PreviewCell[] | null = hoverCell
    ? previewCellsFor({
        city,
        category: paletteCategory,
        toolMode,
        row: hoverCell.row,
        col: hoverCell.col,
        activePieceType: selectedType,
        activeRotation: rotation,
      })
    : null

  const handleCellEnter = useCallback((row: number, col: number) => {
    setHoverCell({ row, col })
  }, [])

  const handleCellLeave = useCallback((row: number, col: number) => {
    setHoverCell((current) => {
      if (current && current.row === row && current.col === col) {
        return null
      }
      return current
    })
  }, [])

  // Wheel-zoom around the cursor (REQ-024). React's wheel events are
  // passive by default in modern browsers but the SVG sits inside a
  // scrollable column; calling preventDefault stops the page from
  // scrolling while the cursor is over the grid so the wheel feels
  // like a zoom control rather than a page scroll. The native wheel
  // listener (passive: false) is wired in a useEffect below; this
  // synth-event handler is the React surface and only updates state.
  const handleSurfaceWheel = useCallback(
    (event: ReactWheelEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const offsetX = event.clientX - rect.left
      const offsetY = event.clientY - rect.top
      setViewport((current) => {
        const focus = screenToGridPixel(
          current,
          offsetX,
          offsetY,
          rect.width,
          rect.height,
        )
        return wheelZoomViewport(current, event.deltaY, focus.x, focus.y)
      })
    },
    [],
  )

  // Pointer-drag pan (REQ-024). Activated by middle-button (button 1)
  // or alt + left-button (button 0). The plain left button is
  // reserved for the place / erase cell-click contract so a pan drag
  // never collides with a placement. The drag state lives in a ref
  // (panDragRef) so the window-level move / up listeners do not pay
  // the React re-render tax on every move.
  const handleSurfacePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const isPanGesture =
        event.button === 1 || (event.button === 0 && event.altKey)
      if (!isPanGesture) return
      const rect = event.currentTarget.getBoundingClientRect()
      panDragRef.current = {
        pointerId: event.pointerId,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        svgWidth: rect.width,
        svgHeight: rect.height,
      }
      event.preventDefault()
      event.stopPropagation()
    },
    [],
  )

  const handleResetViewport = useCallback(() => {
    setViewport(DEFAULT_VIEWPORT)
  }, [])

  // Build-URL copy button state (REQ-007, REQ-026). Mirrors the drive
  // HUD's share-copy state machine: the button reads "Copy build URL"
  // at rest, flips to "Copied!" on a successful clipboard write, and
  // flips to "Copy failed" when the browser refuses the call. The
  // status drives the visible button label via `editCopyLabel`; the
  // timer ref clears a stale reset timer if the player clicks again
  // before the prior success / error label has timed out so we never
  // schedule two overlapping resets. The drive HUD covers the share
  // (drive) URL; this button covers the build (editor) URL so a
  // co-author hand-off does not require copying the address bar.
  const [editCopyStatus, setEditCopyStatus] =
    useState<CopyShareStatus>('idle')
  const editCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  useEffect(() => {
    return () => {
      if (editCopyResetTimerRef.current !== null) {
        clearTimeout(editCopyResetTimerRef.current)
        editCopyResetTimerRef.current = null
      }
    }
  }, [])
  const handleCopyEditUrl = useCallback(async () => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : null
    const url = buildEditUrl(slug, origin)
    let nextStatus: CopyShareStatus = 'error'
    try {
      const clipboard =
        typeof navigator !== 'undefined' ? navigator.clipboard : null
      if (clipboard && typeof clipboard.writeText === 'function') {
        await clipboard.writeText(url)
        nextStatus = 'copied'
      }
    } catch {
      nextStatus = 'error'
    }
    setEditCopyStatus(nextStatus)
    if (editCopyResetTimerRef.current !== null) {
      clearTimeout(editCopyResetTimerRef.current)
    }
    editCopyResetTimerRef.current = setTimeout(() => {
      editCopyResetTimerRef.current = null
      setEditCopyStatus('idle')
    }, SHARE_COPY_RESET_DELAY_MS)
  }, [slug])

  // Track the last city the network successfully persisted (or the
  // server-loaded initial city). The autosave effect compares the live
  // city against this snapshot to skip no-op saves and to detect when
  // a mid-flight save is already stale and needs a follow-up PUT.
  const lastSavedCityRef = useRef<City>(initialCity)
  const inFlightAbortRef = useRef<AbortController | null>(null)
  // Always points at the latest city so the in-flight save's `.then`
  // callback can compare its snapshot against the live city, not the
  // stale closure capture from the render that scheduled the request.
  // Without this, a mutation that lands between the fetch and its
  // resolution would falsely flip the indicator to `saved` even though
  // there are unsaved edits queued for the next debounce.
  const latestCityRef = useRef<City>(initialCity)
  useEffect(() => {
    latestCityRef.current = city
  }, [city])

  const handleRotate = useCallback(() => {
    setRotation((current) => nextRotation(current))
  }, [])

  const handleToggleErase = useCallback(() => {
    setToolMode((current) => (current === 'erase' ? 'place' : 'erase'))
  }, [])

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      const next = undoHistory(prev)
      if (next !== prev) setAutosaveStatus('pending')
      return next
    })
  }, [])

  const handleRedo = useCallback(() => {
    setHistory((prev) => {
      const next = redoHistory(prev)
      if (next !== prev) setAutosaveStatus('pending')
      return next
    })
  }, [])

  // Trigger a brief visual flash on a click that the place / erase
  // reducer rejected (REQ-027). The setTimeout clears the flash after
  // REJECTION_FLASH_DURATION_MS so the overlay disappears at the same
  // time the SMIL animation finishes the fade. A fresh rejection
  // cancels the prior timeout so back-to-back rejections each render
  // for their full duration (the keyed React node remounts in
  // SnapGridView so the SMIL animation restarts).
  const triggerRejectionFlash = useCallback(
    (row: number, col: number, currentCity: City) => {
      setRejectionFlash((prev) => {
        const next = rejectionFlashFromClick(
          {
            city: currentCity,
            category: paletteCategory,
            toolMode,
            row,
            col,
          },
          prev?.id ?? 0,
        )
        if (next === null) return prev
        return next
      })
      if (rejectionTimeoutRef.current !== null) {
        window.clearTimeout(rejectionTimeoutRef.current)
      }
      rejectionTimeoutRef.current = window.setTimeout(() => {
        setRejectionFlash(null)
        rejectionTimeoutRef.current = null
      }, REJECTION_FLASH_DURATION_MS)
    },
    [paletteCategory, toolMode],
  )

  const handleCellClick = (row: number, col: number) => {
    // Zone category routes through the sim event log (REQ-080), NOT
    // the legacy autosave PUT path. The reducer is pure and the
    // engine's enqueue helper buffers + advances local state
    // synchronously; the autonomous flush trigger POSTs the buffer
    // when idle / on save / on visibilitychange.
    if (paletteCategory === 'zone') {
      if (toolMode === 'erase') {
        const event: EraseZoneEvent = {
          type: 'eraseZone',
          payload: { row, col },
          clientCreatedAt: Date.now(),
          authorBuilderId: builderId,
        }
        simEngine.enqueue(event)
        return
      }
      const event: PlaceZoneEvent = {
        type: 'placeZone',
        payload: { kind: selectedZoneType, row, col },
        clientCreatedAt: Date.now(),
        authorBuilderId: builderId,
      }
      simEngine.enqueue(event)
      return
    }
    // Power category (REQ-085 slice 2 UI). Dispatches plant or line
    // events through the same engine.enqueue path. Erase mode in
    // power category dispatches eraseLine for the clicked cell;
    // plant erase ships with a future erasePowerPlant event.
    if (paletteCategory === 'power') {
      if (toolMode === 'erase') {
        const event: EraseLineEvent = {
          type: 'eraseLine',
          payload: { row, col },
          clientCreatedAt: Date.now(),
          authorBuilderId: builderId,
        }
        simEngine.enqueue(event)
        return
      }
      if (selectedPowerTool === 'line') {
        const event: RunPowerLineEvent = {
          type: 'runPowerLine',
          payload: { row, col },
          clientCreatedAt: Date.now(),
          authorBuilderId: builderId,
        }
        simEngine.enqueue(event)
        return
      }
      const kind = selectedPowerTool === 'plant-coal' ? 'coal' : 'solar'
      const event: PlacePowerPlantEvent = {
        type: 'placePowerPlant',
        payload: { kind, row, col },
        clientCreatedAt: Date.now(),
        authorBuilderId: builderId,
      }
      simEngine.enqueue(event)
      return
    }
    // Services category (REQ-100 slice 2 UI). Dispatches
    // placeServiceBuilding (or eraseServiceBuilding in erase mode)
    // through the sim event log.
    if (paletteCategory === 'services') {
      if (toolMode === 'erase') {
        const event: EraseServiceBuildingEvent = {
          type: 'eraseServiceBuilding',
          payload: { row, col },
          clientCreatedAt: Date.now(),
          authorBuilderId: builderId,
        }
        simEngine.enqueue(event)
        return
      }
      const event: PlaceServiceBuildingEvent = {
        type: 'placeServiceBuilding',
        payload: { kind: selectedServiceTool, row, col },
        clientCreatedAt: Date.now(),
        authorBuilderId: builderId,
      }
      simEngine.enqueue(event)
      return
    }
    // Water category (REQ-090 slice 2 UI). Dispatches placeWaterSource
    // (for source tools) or runWaterPipe (for pipe tools); erase mode
    // dispatches eraseWaterPipe.
    if (paletteCategory === 'water') {
      if (toolMode === 'erase') {
        const event: EraseWaterPipeEvent = {
          type: 'eraseWaterPipe',
          payload: { row, col },
          clientCreatedAt: Date.now(),
          authorBuilderId: builderId,
        }
        simEngine.enqueue(event)
        return
      }
      if (
        selectedWaterTool === 'source-water-tower' ||
        selectedWaterTool === 'source-pump-station'
      ) {
        const kind =
          selectedWaterTool === 'source-water-tower'
            ? 'water-tower'
            : 'pump-station'
        const event: PlaceWaterSourceEvent = {
          type: 'placeWaterSource',
          payload: { kind, row, col },
          clientCreatedAt: Date.now(),
          authorBuilderId: builderId,
        }
        simEngine.enqueue(event)
        return
      }
      if (selectedWaterTool === 'source-sewage-treatment') {
        const event: PlaceSewageTreatmentPlantEvent = {
          type: 'placeSewageTreatmentPlant',
          payload: { row, col },
          clientCreatedAt: Date.now(),
          authorBuilderId: builderId,
        }
        simEngine.enqueue(event)
        return
      }
      const pipeKind =
        selectedWaterTool === 'pipe-water' ? 'water' : 'sewage'
      const event: RunWaterPipeEvent = {
        type: 'runWaterPipe',
        payload: { kind: pipeKind, row, col },
        clientCreatedAt: Date.now(),
        authorBuilderId: builderId,
      }
      simEngine.enqueue(event)
      return
    }
    if (toolMode === 'erase') {
      setCityWithHistory((current) => {
        const next =
          paletteCategory === 'building'
            ? eraseBuilding(current, row, col)
            : erasePiece(current, row, col)
        if (next !== current) {
          setAutosaveStatus('pending')
        } else {
          triggerRejectionFlash(row, col, current)
        }
        return next
      })
      return
    }
    setCityWithHistory((current) => {
      const next =
        paletteCategory === 'building'
          ? placeBuilding(current, selectedBuildingType, row, col, rotation)
          : placePiece(current, selectedType, row, col, rotation)
      if (next !== current) {
        setAutosaveStatus('pending')
      } else {
        triggerRejectionFlash(row, col, current)
      }
      return next
    })
  }

  // Keyboard shortcuts: `R` rotates the selected piece (REQ-021),
  // `E` toggles erase mode (REQ-022), `Cmd+Z` / `Ctrl+Z` undoes the
  // last accepted mutation (REQ-023), and `Cmd+Shift+Z` /
  // `Ctrl+Shift+Z` plus `Cmd+Y` / `Ctrl+Y` redo. Ignored when the user
  // is typing in an input / textarea so the shortcuts do not collide
  // with in-place text editing. Plain `R` and `E` ignore modifier
  // presses so browser refresh (Cmd+R / Ctrl+R) keeps working; the
  // undo / redo shortcut path explicitly requires the modifier so the
  // single `z` / `y` keys stay free for typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }
      const modifier = event.metaKey || event.ctrlKey
      if (modifier) {
        if (event.altKey) return
        const key = event.key.toLowerCase()
        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) {
            handleRedo()
          } else {
            handleUndo()
          }
          return
        }
        if (key === 'y') {
          event.preventDefault()
          handleRedo()
          return
        }
        return
      }
      if (event.altKey) return
      const isRotate = event.key === 'r' || event.key === 'R'
      const isErase = event.key === 'e' || event.key === 'E'
      if (!isRotate && !isErase) return
      event.preventDefault()
      if (isRotate) {
        handleRotate()
      } else {
        handleToggleErase()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [handleRotate, handleToggleErase, handleUndo, handleRedo])

  // Window-level pointer listeners drive the pan tool (REQ-024). The
  // pointerdown handler on the SVG seeds `panDragRef`; this effect
  // reads each move's clientX / clientY, converts the screen-pixel
  // delta into a grid-pixel pan delta via `dragDeltaToPan`, and feeds
  // it through `panViewport` (which clamps the result). Pointer up /
  // cancel clears the ref so a stale drag does not leak across
  // gestures. The listeners are window-level so a drag that exits
  // the SVG bounds (a fast pan) still gets the up event.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = panDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const dx = event.clientX - drag.lastClientX
      const dy = event.clientY - drag.lastClientY
      drag.lastClientX = event.clientX
      drag.lastClientY = event.clientY
      setViewport((current) => {
        const { panDeltaX, panDeltaY } = dragDeltaToPan(
          current,
          dx,
          dy,
          drag.svgWidth,
          drag.svgHeight,
        )
        return panViewport(current, panDeltaX, panDeltaY)
      })
    }
    const onUp = (event: PointerEvent) => {
      const drag = panDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      panDragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // Autosave (REQ-025). Every mutation that produces a fresh city
  // reference flips the status to `pending` (above). This effect waits
  // out the debounce window, then issues a single PUT against the
  // working city snapshot. If the city reference changes mid-debounce,
  // the timer resets so a streak of placements only fires one network
  // request at the end. If the city changes mid-flight, the next save
  // is queued via the same dirty check after the response settles.
  useEffect(() => {
    if (isCityContentEqual(city, lastSavedCityRef.current)) {
      // The city has not actually moved (e.g. autosave just succeeded
      // and the dirty flag is being cleared). Stay in `saved` / `idle`.
      return
    }
    const handle = window.setTimeout(() => {
      const snapshot = city
      // Cancel any save still in flight; the new snapshot supersedes it.
      inFlightAbortRef.current?.abort()
      const ac = new AbortController()
      inFlightAbortRef.current = ac
      setAutosaveStatus('saving')
      fetch(`/api/city/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
        signal: ac.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`save failed (${res.status})`)
          }
          lastSavedCityRef.current = snapshot
          // The user may have edited again while the request was in
          // flight; only flip to `saved` when the LIVE city (read via
          // `latestCityRef`, not the stale closure capture) matches the
          // snapshot we just persisted. Otherwise stay `pending` so the
          // debounce timer fires another save.
          setAutosaveStatus((prev) => {
            if (ac.signal.aborted) return prev
            return isCityContentEqual(snapshot, latestCityRef.current)
              ? 'saved'
              : 'pending'
          })
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          console.warn('autosave PUT failed', err)
          setAutosaveStatus('error')
        })
        .finally(() => {
          if (inFlightAbortRef.current === ac) {
            inFlightAbortRef.current = null
          }
        })
    }, autosaveDebounceMs)
    return () => {
      window.clearTimeout(handle)
    }
  }, [city, slug, autosaveDebounceMs])

  // On unmount, abort any save in flight so a navigation away does not
  // log a spurious AbortError as an autosave failure on the next page.
  useEffect(() => {
    return () => {
      inFlightAbortRef.current?.abort()
    }
  }, [])

  // On unmount, clear any pending rejection-flash clear timer so a
  // navigation mid-flash does not log a stale state update on the next
  // page.
  useEffect(() => {
    return () => {
      if (rejectionTimeoutRef.current !== null) {
        window.clearTimeout(rejectionTimeoutRef.current)
        rejectionTimeoutRef.current = null
      }
    }
  }, [])

  const eraseActive = toolMode === 'erase'

  const handleSelectCategory = useCallback((next: PaletteCategory) => {
    setPaletteCategory(next)
  }, [])

  // Resolve every connector glyph once per render so the toolbar
  // readout and the SnapGrid render reuse the same walk. The walk is
  // O(N) over the total port count which is bounded by piece count;
  // the city is capped at MAX_PIECES_PER_CITY = 256 so the cost is
  // negligible at human pace.
  const connectorGlyphs = cityConnectorGlyphs(city.pieces)
  const matchedConnectorCount = countMatchedGlyphs(connectorGlyphs)

  // Resolve the substrate-level path summary so the toolbar can show
  // how many of the placed pieces sit on the canonical `main` path and
  // whether the main path is a closed loop. The walk is O(N^2) on the
  // piece count but bounded by MAX_PIECES_PER_CITY = 256 so the cost is
  // negligible at human pace; a future render-perf slice can memoize on
  // the city reference if a benchmark identifies a cost.
  const trackPath = buildTrackPath(city)
  const trackPathSummary = summarizeTrackPath(trackPath)

  // Resolve the substrate-level unmatched-port count so the toolbar can
  // surface where the city has open road ends (REQ-019, REQ-064). The
  // walk is O(N * P) on the piece count times the average port count
  // and shares the same bounded MAX_PIECES_PER_CITY = 256 ceiling as the
  // connector / track-path resolvers above.
  const unmatchedPorts = validateConnections(city)
  const unmatchedPortCount = unmatchedPorts.length
  // Collapse the per-port list to the unique cells that host at least
  // one unmatched port so the SnapGrid can render a per-cell warning
  // overlay (REQ-019, REQ-064). Keeps the resolver work in EditorClient
  // (one walk per render) instead of redoing it inside SnapGridView.
  const openEndCellKeys = unmatchedPortCells(unmatchedPorts)
  // Resolve one outward-pointing arrow per unmatched port so the editor
  // SVG paints which side of every open-end cell still needs a neighbor
  // (REQ-019, REQ-064). The cell-level overlay above tells a builder
  // which cells are open; the per-port arrows tell them which direction
  // the missing neighbor needs to land.
  const openEndArrows = unmatchedPortGlyphs(unmatchedPorts)
  // Resolve the spawn-anchor marker so the editor SVG paints where the
  // car will spawn and which way it will face (REQ-019, REQ-036). The
  // marker is null on an empty city because the drive scene never mounts
  // the car on an empty grid. Mirrors the substrate `spawnAnchor`
  // contract from `src/app/[slug]/driveScene.ts` and `respawnVehicle`
  // from `src/app/[slug]/respawn.ts` exactly so the editor cue agrees
  // with the live drive-scene behavior.
  const spawnMarker = spawnAnchorMarker(city)
  // Resolve the spawn-anchor toolbar readout so a builder reads the
  // exact spawn cell and heading direction without scanning the SVG
  // marker (REQ-019, REQ-036). Same null-on-empty-city contract as the
  // marker so the readout stays silent on a city with no pieces.
  const spawnReadout = spawnAnchorReadout(city)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        role="tablist"
        aria-label="Palette category"
        data-testid="editor-palette-category"
        data-palette-category={paletteCategory}
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {(
          [
            'street',
            'building',
            'zone',
            'power',
            'services',
            'water',
          ] as const
        ).map((category) => {
          const isActive = category === paletteCategory
          const label =
            category === 'street'
              ? 'Streets'
              : category === 'building'
                ? 'Buildings'
                : category === 'zone'
                  ? 'Zones'
                  : category === 'power'
                    ? 'Power'
                    : category === 'services'
                      ? 'Services'
                      : 'Water'
          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`editor-palette-category-${category}`}
              data-palette-category={category}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => handleSelectCategory(category)}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                color: isActive ? '#f7f4ee' : '#222',
                background: isActive ? '#3a4a3a' : '#efe7d2',
                border: '1px solid #d6cfbf',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div
        role="toolbar"
        aria-label="Sim speed"
        data-testid="editor-sim-speed"
        data-sim-speed={simState.speed}
        data-sim-tick={simState.tick}
        data-sim-pending={simRuntime.pendingEvents.length}
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: 12,
          opacity: 0.75,
        }}
      >
        <span
          style={{
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            opacity: 0.65,
          }}
        >
          Sim
        </span>
        {([0, 1, 2, 4] as SimSpeed[]).map((speed) => {
          const active = simState.speed === speed
          return (
            <button
              key={speed}
              type="button"
              data-testid={`editor-sim-speed-${speed}`}
              data-sim-speed-button={speed}
              data-sim-speed-active={active ? 'true' : 'false'}
              aria-pressed={active}
              onClick={() => simEngine.setSpeed(speed)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontFamily: 'inherit',
                color: active ? '#f7f4ee' : '#222',
                background: active ? '#222' : '#fdfaf2',
                border: '1px solid #d6cfbf',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {speed === 0 ? 'Pause' : `${speed}x`}
            </button>
          )
        })}
        <span
          data-testid="editor-sim-readout"
          data-sim-tick={simState.tick}
          data-sim-time-ms={simState.simTimeMs}
          style={{ marginLeft: 6, fontFamily: 'ui-monospace, Menlo, monospace' }}
        >
          {`tick ${simState.tick}`}
        </span>
        <span
          data-testid="editor-sim-population"
          data-sim-population={simState.population.totalPopulation}
          style={{ marginLeft: 6, fontFamily: 'ui-monospace, Menlo, monospace' }}
        >
          {`pop ${simState.population.totalPopulation}`}
        </span>
        <span
          data-testid="editor-sim-treasury"
          data-sim-treasury={Math.round(simState.economy.treasury)}
          style={{
            marginLeft: 6,
            fontFamily: 'ui-monospace, Menlo, monospace',
            color:
              simState.economy.treasury < 0 ? '#a3372a' : undefined,
          }}
        >
          {`$${Math.round(simState.economy.treasury).toLocaleString('en-US')}`}
        </span>
        <span
          style={{
            marginLeft: 12,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            opacity: 0.65,
          }}
        >
          Mood
        </span>
        {(['day', 'night'] as const).map((mode) => {
          const current =
            city.mood?.timeOfDay === 'night' ? 'night' : 'day'
          const active = current === mode
          return (
            <button
              key={mode}
              type="button"
              data-testid={`editor-mood-${mode}`}
              data-mood-button={mode}
              data-mood-active={active ? 'true' : 'false'}
              aria-pressed={active}
              onClick={() => {
                setCityWithHistory((prev) => {
                  if ((prev.mood?.timeOfDay ?? 'day') === mode) return prev
                  setAutosaveStatus('pending')
                  return {
                    ...prev,
                    mood: { ...prev.mood, timeOfDay: mode },
                  }
                })
              }}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontFamily: 'inherit',
                color: active ? '#f7f4ee' : '#222',
                background: active
                  ? mode === 'night'
                    ? '#0e1a2c'
                    : '#bfd9e8'
                  : '#fdfaf2',
                border: '1px solid #d6cfbf',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {mode === 'day' ? 'Day' : 'Night'}
            </button>
          )
        })}
      </div>
      <div
        role="toolbar"
        aria-label="Editor tools"
        data-testid="editor-palette"
        data-tool-mode={toolMode}
        data-palette-category={paletteCategory}
        data-copy-build-status={editCopyStatus}
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {paletteCategory === 'street'
          ? STREET_PALETTE.map((entry) => {
              const isSelected = entry.type === selectedType
              return (
                <button
                  key={entry.type}
                  type="button"
                  aria-pressed={isSelected}
                  data-piece-type={entry.type}
                  data-selected={isSelected ? 'true' : 'false'}
                  onClick={() => {
                    setSelectedType(entry.type)
                  }}
                  style={{
                    padding: '8px 14px',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    color: isSelected ? '#f7f4ee' : '#222',
                    background: isSelected ? '#222' : '#efe7d2',
                    border: '1px solid #d6cfbf',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  {entry.label}
                </button>
              )
            })
          : paletteCategory === 'building'
            ? BUILDING_PALETTE.map((entry) => {
                const isSelected = entry.type === selectedBuildingType
                return (
                  <button
                    key={entry.type}
                    type="button"
                    aria-pressed={isSelected}
                    data-building-type={entry.type}
                    data-selected={isSelected ? 'true' : 'false'}
                    onClick={() => {
                      setSelectedBuildingType(entry.type)
                    }}
                    style={{
                      padding: '8px 14px',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      color: isSelected ? '#f7f4ee' : '#222',
                      background: isSelected ? '#3a4a3a' : '#efe7d2',
                      border: '1px solid #d6cfbf',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {entry.label}
                  </button>
                )
              })
            : paletteCategory === 'zone'
              ? ZONE_PALETTE.map((entry) => {
                  const isSelected = entry.type === selectedZoneType
                  const bg =
                    entry.type === 'residential'
                      ? '#5fae5f'
                      : entry.type === 'commercial'
                        ? '#5f8aae'
                        : '#ae8a5f'
                  return (
                    <button
                      key={entry.type}
                      type="button"
                      aria-pressed={isSelected}
                      data-zone-type={entry.type}
                      data-selected={isSelected ? 'true' : 'false'}
                      onClick={() => {
                        setSelectedZoneType(entry.type)
                      }}
                      style={{
                        padding: '8px 14px',
                        fontSize: 14,
                        fontFamily: 'inherit',
                        color: isSelected ? '#fff' : '#222',
                        background: isSelected ? bg : '#fdfaf2',
                        border: `1px solid ${isSelected ? bg : '#d6cfbf'}`,
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      {entry.label}
                    </button>
                  )
                })
              : paletteCategory === 'power'
                ? POWER_PALETTE.map((entry) => {
                    const isSelected = entry.type === selectedPowerTool
                    const bg =
                      entry.type === 'plant-coal'
                        ? '#4a3a2a'
                        : entry.type === 'plant-solar'
                          ? '#d4b85f'
                          : '#e0a020'
                    return (
                      <button
                        key={entry.type}
                        type="button"
                        aria-pressed={isSelected}
                        data-power-tool={entry.type}
                        data-selected={isSelected ? 'true' : 'false'}
                        onClick={() => {
                          setSelectedPowerTool(entry.type)
                        }}
                        style={{
                          padding: '8px 14px',
                          fontSize: 14,
                          fontFamily: 'inherit',
                          color:
                            isSelected && entry.type === 'plant-coal'
                              ? '#fff'
                              : '#222',
                          background: isSelected ? bg : '#fdfaf2',
                          border: `1px solid ${isSelected ? bg : '#d6cfbf'}`,
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        {entry.label}
                      </button>
                    )
                  })
                : paletteCategory === 'services'
                  ? SERVICE_PALETTE.map((entry) => {
                      const isSelected = entry.type === selectedServiceTool
                      const bg =
                        entry.type === 'police-station'
                          ? '#3a4a7a'
                          : entry.type === 'fire-station'
                            ? '#a3372a'
                            : entry.type === 'hospital'
                              ? '#cc4f4f'
                              : entry.type === 'school'
                                ? '#7a5fae'
                                : '#5a5a3a'
                      return (
                        <button
                          key={entry.type}
                          type="button"
                          aria-pressed={isSelected}
                          data-service-tool={entry.type}
                          data-selected={isSelected ? 'true' : 'false'}
                          onClick={() => {
                            setSelectedServiceTool(entry.type)
                          }}
                          style={{
                            padding: '8px 14px',
                            fontSize: 14,
                            fontFamily: 'inherit',
                            color: isSelected ? '#fff' : '#222',
                            background: isSelected ? bg : '#fdfaf2',
                            border: `1px solid ${isSelected ? bg : '#d6cfbf'}`,
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {entry.label}
                        </button>
                      )
                    })
                  : WATER_PALETTE.map((entry) => {
                      const isSelected = entry.type === selectedWaterTool
                      const bg =
                        entry.type === 'source-water-tower'
                          ? '#5a8aae'
                          : entry.type === 'source-pump-station'
                            ? '#3a6a8a'
                            : entry.type === 'pipe-water'
                              ? '#5fb0d0'
                              : entry.type === 'pipe-sewage'
                                ? '#7a5a3a'
                                : '#4a3522'
                      return (
                        <button
                          key={entry.type}
                          type="button"
                          aria-pressed={isSelected}
                          data-water-tool={entry.type}
                          data-selected={isSelected ? 'true' : 'false'}
                          onClick={() => {
                            setSelectedWaterTool(entry.type)
                          }}
                          style={{
                            padding: '8px 14px',
                            fontSize: 14,
                            fontFamily: 'inherit',
                            color: isSelected ? '#fff' : '#222',
                            background: isSelected ? bg : '#fdfaf2',
                            border: `1px solid ${isSelected ? bg : '#d6cfbf'}`,
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {entry.label}
                        </button>
                      )
                    })}
        <button
          type="button"
          data-testid="editor-rotate"
          data-rotation={rotation}
          aria-label={`Rotate piece (current ${rotation} degrees)`}
          title="Rotate (R)"
          onClick={handleRotate}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: '#222',
            background: '#efe7d2',
            border: '1px solid #d6cfbf',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Rotate ({rotation} deg)
        </button>
        <button
          type="button"
          data-testid="editor-erase"
          data-tool-mode={toolMode}
          aria-pressed={eraseActive}
          aria-label={
            eraseActive
              ? 'Erase mode active. Click a piece to remove it.'
              : 'Switch to erase mode'
          }
          title="Erase (E)"
          onClick={handleToggleErase}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: eraseActive ? '#f7f4ee' : '#222',
            background: eraseActive ? '#a3372a' : '#efe7d2',
            border: '1px solid #d6cfbf',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {eraseActive ? 'Erasing' : 'Erase'}
        </button>
        <button
          type="button"
          data-testid="editor-undo"
          data-can-undo={undoAvailable ? 'true' : 'false'}
          aria-label="Undo last edit"
          title="Undo (Cmd+Z / Ctrl+Z)"
          onClick={handleUndo}
          disabled={!undoAvailable}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: '#222',
            background: '#efe7d2',
            border: '1px solid #d6cfbf',
            borderRadius: 4,
            cursor: undoAvailable ? 'pointer' : 'not-allowed',
            opacity: undoAvailable ? 1 : 0.5,
          }}
        >
          Undo
        </button>
        <button
          type="button"
          data-testid="editor-redo"
          data-can-redo={redoAvailable ? 'true' : 'false'}
          aria-label="Redo last undone edit"
          title="Redo (Cmd+Shift+Z / Ctrl+Y)"
          onClick={handleRedo}
          disabled={!redoAvailable}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: '#222',
            background: '#efe7d2',
            border: '1px solid #d6cfbf',
            borderRadius: 4,
            cursor: redoAvailable ? 'pointer' : 'not-allowed',
            opacity: redoAvailable ? 1 : 0.5,
          }}
        >
          Redo
        </button>
        <button
          type="button"
          data-testid="editor-reset-viewport"
          data-viewport-default={viewportDefault ? 'true' : 'false'}
          data-viewport-zoom={viewport.zoom}
          aria-label="Reset pan and zoom"
          title="Reset pan / zoom"
          onClick={handleResetViewport}
          disabled={viewportDefault}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: '#222',
            background: '#efe7d2',
            border: '1px solid #d6cfbf',
            borderRadius: 4,
            cursor: viewportDefault ? 'not-allowed' : 'pointer',
            opacity: viewportDefault ? 0.5 : 1,
          }}
        >
          Reset View
        </button>
        <button
          type="button"
          data-testid="editor-copy-build-url"
          data-copy-status={editCopyStatus}
          aria-label={editCopyAriaLabel(slug, editCopyStatus)}
          title="Copy this city's build link"
          onClick={handleCopyEditUrl}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: editCopyStatus === 'error' ? '#a3372a' : '#222',
            background: '#efe7d2',
            border:
              editCopyStatus === 'copied'
                ? '1px solid #6a8f5a'
                : editCopyStatus === 'error'
                  ? '1px solid #a3372a'
                  : '1px solid #d6cfbf',
            borderRadius: 4,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          {editCopyLabel(editCopyStatus)}
        </button>
        <Link
          href={`/${slug}`}
          data-testid="editor-drive-cta"
          data-slug={slug}
          aria-label={`Drive city ${slug}`}
          title="Drive this city"
          prefetch
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: '#f7f4ee',
            background: '#222',
            border: '1px solid #222',
            borderRadius: 4,
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
          }}
        >
          Drive
          <SceneTransitionCurtain target="drive" />
        </Link>
      </div>
      <p
        data-testid="editor-piece-count"
        data-building-count={city.buildings.length}
        data-connector-count={connectorGlyphs.length}
        data-connector-matched={matchedConnectorCount}
        style={{
          fontSize: 12,
          margin: 0,
          opacity: 0.65,
        }}
      >
        Pieces placed: {city.pieces.length}
        {city.buildings.length > 0
          ? ` / Buildings placed: ${city.buildings.length}`
          : ''}
      </p>
      {connectorGlyphs.length > 0 ? (
        <p
          data-testid="editor-connector-match-readout"
          data-connector-count={connectorGlyphs.length}
          data-connector-matched={matchedConnectorCount}
          style={{
            fontSize: 12,
            margin: 0,
            opacity: 0.65,
          }}
        >
          Connectors matched: {matchedConnectorCount} of {connectorGlyphs.length}
        </p>
      ) : null}
      {trackPathSummary.totalPieces > 0 ? (
        <p
          data-testid="editor-track-path-readout"
          data-main-segment-length={trackPathSummary.mainSegmentLength}
          data-total-pieces={trackPathSummary.totalPieces}
          data-main-segment-closes-loop={
            trackPathSummary.mainSegmentClosesLoop ? 'true' : 'false'
          }
          data-segment-count={trackPathSummary.segmentCount}
          style={{
            fontSize: 12,
            margin: 0,
            opacity: 0.65,
          }}
        >
          {`Pieces in main path: ${trackPathSummary.mainSegmentLength} of ${trackPathSummary.totalPieces}`}
          {' / '}
          {trackPathSummary.mainSegmentClosesLoop
            ? 'Main path: closed loop'
            : 'Main path: open chain'}
        </p>
      ) : null}
      {unmatchedPortCount > 0 ? (
        <p
          data-testid="editor-unmatched-ports-readout"
          data-unmatched-port-count={unmatchedPortCount}
          style={{
            fontSize: 12,
            margin: 0,
            opacity: 0.65,
            color: '#a3372a',
          }}
        >
          {`Open ends: ${unmatchedPortCount}`}
        </p>
      ) : null}
      {spawnReadout !== null ? (
        <p
          data-testid="editor-spawn-anchor-readout"
          data-spawn-anchor-row={spawnReadout.cellRow}
          data-spawn-anchor-col={spawnReadout.cellCol}
          data-spawn-anchor-direction={spawnReadout.direction}
          style={{
            fontSize: 12,
            margin: 0,
            opacity: 0.65,
            color: '#3a6ea0',
          }}
        >
          {spawnReadout.text}
        </p>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        data-testid="editor-autosave-status"
        data-autosave-status={autosaveStatus}
        style={{
          fontSize: 12,
          margin: 0,
          opacity: 0.65,
          color: autosaveStatus === 'error' ? '#a3372a' : undefined,
        }}
      >
        {AUTOSAVE_STATUS_LABEL[autosaveStatus]}
      </p>
      <SnapGrid
        city={city}
        onCellClick={handleCellClick}
        onCellEnter={handleCellEnter}
        onCellLeave={handleCellLeave}
        previewCell={previewCell}
        previewCells={previewCells}
        rejectionFlash={rejectionFlash}
        cursorMode={toolMode}
        viewport={viewport}
        openEndCellKeys={openEndCellKeys}
        openEndArrows={openEndArrows}
        spawnMarker={spawnMarker}
        zones={simState.zones}
        power={simState.power}
        services={simState.services}
        water={simState.water}
        onSurfaceWheel={handleSurfaceWheel}
        onSurfacePointerDown={handleSurfacePointerDown}
      />
    </div>
  )
}
