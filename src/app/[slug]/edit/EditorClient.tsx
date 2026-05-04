'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { City, PieceType, Rotation, Slug } from '@/lib/schemas'
import {
  DEFAULT_PALETTE_TYPE,
  DEFAULT_ROTATION,
  DEFAULT_TOOL_MODE,
  STREET_PALETTE,
  type ToolMode,
  erasePiece,
  nextRotation,
  placePiece,
} from './editorState'
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
import { SnapGrid } from './SnapGridView'

/**
 * Editor client surface (REQ-017, REQ-020, REQ-021, REQ-022, REQ-023,
 * REQ-025, REQ-026).
 *
 * Wraps the snap-grid (REQ-016) with the v1 cardinal-only street
 * palette, a click-to-place tool, a rotate tool that cycles the
 * selected piece's rotation in 90deg increments, an erase tool that
 * flips the cell-click contract from place to erase, undo / redo that
 * walks an immutable history stack across every accepted mutation,
 * autosave that writes through PUT `/api/city/<slug>` (REQ-014) on
 * every mutation, and a Drive CTA in the toolbar that navigates to
 * `/<slug>` so the build / drive loop round-trips from a single
 * control surface (REQ-026).
 *
 * Placement uses the pure `placePiece` reducer from `editorState.ts`
 * so the UI does not need to inline footprint validation. Clicks on
 * an already-occupied cell are no-ops in place mode (REQ-027).
 *
 * Erase uses the pure `erasePiece` reducer. In erase mode a click on
 * any cell of a piece's footprint removes the whole piece atomically;
 * clicks on empty cells are no-ops. Toggling the Erase button (or
 * pressing `E`) flips the active mode; the place / erase modes are
 * mutually exclusive so the cell-click contract stays unambiguous.
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
 */
export function EditorClient({
  slug,
  initialCity,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
}: {
  slug: Slug
  initialCity: City
  autosaveDebounceMs?: number
}) {
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
  const [selectedType, setSelectedType] = useState<PieceType>(
    DEFAULT_PALETTE_TYPE,
  )
  const [rotation, setRotation] = useState<Rotation>(DEFAULT_ROTATION)
  const [toolMode, setToolMode] = useState<ToolMode>(DEFAULT_TOOL_MODE)
  const [autosaveStatus, setAutosaveStatus] =
    useState<AutosaveStatus>('idle')
  const undoAvailable = canUndo(history)
  const redoAvailable = canRedo(history)

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

  const handleCellClick = (row: number, col: number) => {
    if (toolMode === 'erase') {
      setCityWithHistory((current) => {
        const next = erasePiece(current, row, col)
        if (next !== current) setAutosaveStatus('pending')
        return next
      })
      return
    }
    setCityWithHistory((current) => {
      const next = placePiece(current, selectedType, row, col, rotation)
      if (next !== current) setAutosaveStatus('pending')
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

  const eraseActive = toolMode === 'erase'

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
        role="toolbar"
        aria-label="Editor tools"
        data-testid="editor-palette"
        data-tool-mode={toolMode}
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {STREET_PALETTE.map((entry) => {
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
        </Link>
      </div>
      <p
        data-testid="editor-piece-count"
        style={{
          fontSize: 12,
          margin: 0,
          opacity: 0.65,
        }}
      >
        Pieces placed: {city.pieces.length}
      </p>
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
        cursorMode={toolMode}
      />
    </div>
  )
}
