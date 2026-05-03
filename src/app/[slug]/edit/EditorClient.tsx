'use client'

import { useCallback, useEffect, useState } from 'react'
import type { City, PieceType, Rotation } from '@/lib/schemas'
import {
  DEFAULT_PALETTE_TYPE,
  DEFAULT_ROTATION,
  STREET_PALETTE,
  nextRotation,
  placePiece,
} from './editorState'
import { SnapGrid } from './SnapGridView'

/**
 * Editor client surface (REQ-017, REQ-020, REQ-021).
 *
 * Wraps the snap-grid (REQ-016) with the v1 cardinal-only street
 * palette, a click-to-place tool, and a rotate tool that cycles the
 * selected piece's rotation in 90deg increments. State is local-only
 * in this slice: erase (REQ-022), undo / redo (REQ-023), pan / zoom
 * (REQ-024), and autosave through PUT `/api/city/<slug>` (REQ-025)
 * each ship as their own slices.
 *
 * Placement uses the pure `placePiece` reducer from `editorState.ts`
 * so the UI does not need to inline footprint validation. Clicks on
 * an already-occupied cell are no-ops (REQ-027).
 *
 * Rotation cycles via `nextRotation`. The rotate tool is exposed two
 * ways: a Rotate button in the toolbar and the `R` keyboard shortcut
 * so a power user can rotate without leaving the grid. The cycle is
 * `0 -> 90 -> 180 -> 270 -> 0`.
 *
 * The grid is the same `SnapGrid` SVG used by the server-rendered
 * shell, now passed an `onCellClick` handler so cells become
 * interactive. The selected piece type is highlighted in the palette
 * with a darker background and `aria-pressed`.
 */
export function EditorClient({ initialCity }: { initialCity: City }) {
  const [city, setCity] = useState<City>(initialCity)
  const [selectedType, setSelectedType] = useState<PieceType>(
    DEFAULT_PALETTE_TYPE,
  )
  const [rotation, setRotation] = useState<Rotation>(DEFAULT_ROTATION)

  const handleRotate = useCallback(() => {
    setRotation((current) => nextRotation(current))
  }, [])

  const handleCellClick = (row: number, col: number) => {
    setCity((current) => placePiece(current, selectedType, row, col, rotation))
  }

  // Keyboard shortcut: `R` rotates the selected piece (REQ-021).
  // Ignored when the user is typing in an input / textarea or holding
  // a modifier so the shortcut does not collide with browser refresh
  // (Cmd+R / Ctrl+R) or in-place text editing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'r' && event.key !== 'R') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }
      event.preventDefault()
      handleRotate()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [handleRotate])

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
      <SnapGrid city={city} onCellClick={handleCellClick} />
    </div>
  )
}
