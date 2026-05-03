'use client'

import { useCallback, useEffect, useState } from 'react'
import type { City, PieceType, Rotation } from '@/lib/schemas'
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
import { SnapGrid } from './SnapGridView'

/**
 * Editor client surface (REQ-017, REQ-020, REQ-021, REQ-022).
 *
 * Wraps the snap-grid (REQ-016) with the v1 cardinal-only street
 * palette, a click-to-place tool, a rotate tool that cycles the
 * selected piece's rotation in 90deg increments, and an erase tool
 * that flips the cell-click contract from place to erase. State is
 * local-only in this slice: undo / redo (REQ-023), pan / zoom
 * (REQ-024), and autosave through PUT `/api/city/<slug>` (REQ-025)
 * each ship as their own slices.
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
 * ways: a Rotate button in the toolbar and the `R` keyboard shortcut
 * so a power user can rotate without leaving the grid. The cycle is
 * `0 -> 90 -> 180 -> 270 -> 0`. Rotation is sticky across mode flips
 * so an author who rotates to 90deg and then erases a stray piece
 * comes back to place mode still rotated to 90deg.
 *
 * The grid is the same `SnapGrid` SVG used by the server-rendered
 * shell, now passed an `onCellClick` handler so cells become
 * interactive. The selected piece type is highlighted in the palette
 * with a darker background and `aria-pressed`. The cursor flips to
 * `not-allowed` on the grid in erase mode so the change of intent is
 * visually obvious without a custom eraser glyph.
 */
export function EditorClient({ initialCity }: { initialCity: City }) {
  const [city, setCity] = useState<City>(initialCity)
  const [selectedType, setSelectedType] = useState<PieceType>(
    DEFAULT_PALETTE_TYPE,
  )
  const [rotation, setRotation] = useState<Rotation>(DEFAULT_ROTATION)
  const [toolMode, setToolMode] = useState<ToolMode>(DEFAULT_TOOL_MODE)

  const handleRotate = useCallback(() => {
    setRotation((current) => nextRotation(current))
  }, [])

  const handleToggleErase = useCallback(() => {
    setToolMode((current) => (current === 'erase' ? 'place' : 'erase'))
  }, [])

  const handleCellClick = (row: number, col: number) => {
    if (toolMode === 'erase') {
      setCity((current) => erasePiece(current, row, col))
      return
    }
    setCity((current) => placePiece(current, selectedType, row, col, rotation))
  }

  // Keyboard shortcuts: `R` rotates the selected piece (REQ-021),
  // `E` toggles erase mode (REQ-022). Ignored when the user is typing
  // in an input / textarea or holding a modifier so the shortcuts do
  // not collide with browser refresh (Cmd+R / Ctrl+R) or in-place
  // text editing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const isRotate = event.key === 'r' || event.key === 'R'
      const isErase = event.key === 'e' || event.key === 'E'
      if (!isRotate && !isErase) return
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }
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
  }, [handleRotate, handleToggleErase])

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
        aria-label="Street piece palette"
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
      <SnapGrid
        city={city}
        onCellClick={handleCellClick}
        cursorMode={toolMode}
      />
    </div>
  )
}
