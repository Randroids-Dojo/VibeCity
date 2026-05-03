'use client'

import { useState } from 'react'
import type { City, PieceType } from '@/lib/schemas'
import {
  DEFAULT_PALETTE_TYPE,
  STREET_PALETTE,
  placePiece,
} from './editorState'
import { SnapGrid } from './SnapGridView'

/**
 * Editor client surface (REQ-017, REQ-020).
 *
 * Wraps the snap-grid (REQ-016) with the v1 cardinal-only street
 * palette and a click-to-place tool. State is local-only in this
 * slice: rotate / erase (REQ-021, REQ-022), undo / redo (REQ-023),
 * pan / zoom (REQ-024), and autosave through PUT
 * `/api/city/<slug>` (REQ-025) each ship as their own slices.
 *
 * Placement uses the pure `placePiece` reducer from `editorState.ts`
 * so the UI does not need to inline footprint validation. Clicks on
 * an already-occupied cell are no-ops (REQ-027).
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

  const handleCellClick = (row: number, col: number) => {
    setCity((current) => placePiece(current, selectedType, row, col, 0))
  }

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
