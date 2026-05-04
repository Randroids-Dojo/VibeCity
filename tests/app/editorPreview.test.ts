import { describe, expect, it } from 'vitest'
import {
  PREVIEW_FILL,
  PREVIEW_FILL_OPACITY,
  PREVIEW_STROKE,
  previewKindFor,
  type PreviewKind,
} from '@/app/[slug]/edit/editorPreview'
import type { City } from '@/lib/schemas'
import { EMPTY_CITY } from '@/lib/schemas'

/**
 * REQ-024 (partial: hover preview ghost piece).
 *
 * Pure helper that maps the active palette category, tool mode, and
 * occupancy of a hovered cell to one of four `PreviewKind` values.
 * The SnapGridView consumes the result to draw a translucent ghost
 * overlay communicating what the next click would do; the place /
 * erase reducers in `editorState.ts` enforce the actual mutation.
 */

const ALL_KINDS: readonly PreviewKind[] = [
  'place-valid',
  'place-invalid',
  'erase-target',
  'erase-empty',
]

describe('previewKindFor (REQ-024 partial)', () => {
  it('reports place-valid on an empty cell in street + place mode', () => {
    const kind = previewKindFor({
      city: EMPTY_CITY,
      category: 'street',
      toolMode: 'place',
      row: 0,
      col: 0,
    })
    expect(kind).toBe('place-valid')
  })

  it('reports place-valid on an empty cell in building + place mode', () => {
    const kind = previewKindFor({
      city: EMPTY_CITY,
      category: 'building',
      toolMode: 'place',
      row: 2,
      col: 3,
    })
    expect(kind).toBe('place-valid')
  })

  it('reports place-invalid when the hovered cell already holds a piece (street mode)', () => {
    const city: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const kind = previewKindFor({
      city,
      category: 'street',
      toolMode: 'place',
      row: 0,
      col: 0,
    })
    expect(kind).toBe('place-invalid')
  })

  it('reports place-invalid when the hovered cell already holds a piece (building mode)', () => {
    const city: City = {
      pieces: [{ type: 'straight', row: 1, col: 2, rotation: 0 }],
      buildings: [],
    }
    const kind = previewKindFor({
      city,
      category: 'building',
      toolMode: 'place',
      row: 1,
      col: 2,
    })
    expect(kind).toBe('place-invalid')
  })

  it('reports place-invalid when the hovered cell already holds a building (street mode)', () => {
    const city: City = {
      pieces: [],
      buildings: [{ type: 'small-house', row: 3, col: 3, rotation: 0 }],
    }
    const kind = previewKindFor({
      city,
      category: 'street',
      toolMode: 'place',
      row: 3,
      col: 3,
    })
    expect(kind).toBe('place-invalid')
  })

  it('reports place-invalid when the hovered cell already holds a building (building mode)', () => {
    const city: City = {
      pieces: [],
      buildings: [{ type: 'shop', row: -1, col: -2, rotation: 0 }],
    }
    const kind = previewKindFor({
      city,
      category: 'building',
      toolMode: 'place',
      row: -1,
      col: -2,
    })
    expect(kind).toBe('place-invalid')
  })

  it('reports erase-target when the hovered cell holds a piece in street + erase mode', () => {
    const city: City = {
      pieces: [{ type: 'left90', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const kind = previewKindFor({
      city,
      category: 'street',
      toolMode: 'erase',
      row: 0,
      col: 0,
    })
    expect(kind).toBe('erase-target')
  })

  it('reports erase-empty when the hovered cell is empty in street + erase mode', () => {
    const kind = previewKindFor({
      city: EMPTY_CITY,
      category: 'street',
      toolMode: 'erase',
      row: 0,
      col: 0,
    })
    expect(kind).toBe('erase-empty')
  })

  it('reports erase-empty when the hovered cell holds a building in street + erase mode (other category)', () => {
    const city: City = {
      pieces: [],
      buildings: [{ type: 'factory', row: 0, col: 0, rotation: 0 }],
    }
    const kind = previewKindFor({
      city,
      category: 'street',
      toolMode: 'erase',
      row: 0,
      col: 0,
    })
    expect(kind).toBe('erase-empty')
  })

  it('reports erase-target when the hovered cell holds a building in building + erase mode', () => {
    const city: City = {
      pieces: [],
      buildings: [{ type: 'mid-house', row: 4, col: 1, rotation: 0 }],
    }
    const kind = previewKindFor({
      city,
      category: 'building',
      toolMode: 'erase',
      row: 4,
      col: 1,
    })
    expect(kind).toBe('erase-target')
  })

  it('reports erase-empty when the hovered cell holds a piece in building + erase mode (other category)', () => {
    const city: City = {
      pieces: [{ type: 'straight', row: 4, col: 1, rotation: 0 }],
      buildings: [],
    }
    const kind = previewKindFor({
      city,
      category: 'building',
      toolMode: 'erase',
      row: 4,
      col: 1,
    })
    expect(kind).toBe('erase-empty')
  })

  it('reports erase-empty when the hovered cell is empty in building + erase mode', () => {
    const kind = previewKindFor({
      city: EMPTY_CITY,
      category: 'building',
      toolMode: 'erase',
      row: -3,
      col: 5,
    })
    expect(kind).toBe('erase-empty')
  })

  it('honors multi-cell footprints when computing place-invalid', () => {
    // A multi-cell piece with explicit footprint; a hover on any of
    // its footprint cells should report place-invalid even though the
    // anchor cell is one corner of the footprint.
    const city: City = {
      pieces: [
        {
          type: 'megaSweepRight',
          row: 0,
          col: 0,
          rotation: 0,
          footprint: [
            { dr: 0, dc: 0 },
            { dr: 0, dc: 1 },
            { dr: 1, dc: 0 },
            { dr: 1, dc: 1 },
          ],
        },
      ],
      buildings: [],
    }
    expect(
      previewKindFor({
        city,
        category: 'street',
        toolMode: 'place',
        row: 1,
        col: 1,
      }),
    ).toBe('place-invalid')
    expect(
      previewKindFor({
        city,
        category: 'street',
        toolMode: 'erase',
        row: 1,
        col: 1,
      }),
    ).toBe('erase-target')
  })

  it('treats negative cell coordinates exactly like positive ones', () => {
    const city: City = {
      pieces: [{ type: 'straight', row: -5, col: -7, rotation: 0 }],
      buildings: [],
    }
    expect(
      previewKindFor({
        city,
        category: 'street',
        toolMode: 'place',
        row: -5,
        col: -7,
      }),
    ).toBe('place-invalid')
    expect(
      previewKindFor({
        city,
        category: 'street',
        toolMode: 'place',
        row: -4,
        col: -7,
      }),
    ).toBe('place-valid')
  })

  it('does not mutate the input city', () => {
    const piece = { type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }
    const city: City = { pieces: [piece], buildings: [] }
    const snapshot = JSON.stringify(city)
    previewKindFor({
      city,
      category: 'street',
      toolMode: 'place',
      row: 0,
      col: 0,
    })
    previewKindFor({
      city,
      category: 'building',
      toolMode: 'erase',
      row: 1,
      col: 1,
    })
    expect(JSON.stringify(city)).toBe(snapshot)
  })
})

describe('PREVIEW_FILL / PREVIEW_STROKE / PREVIEW_FILL_OPACITY tables', () => {
  it('cover every PreviewKind in the union', () => {
    for (const kind of ALL_KINDS) {
      expect(PREVIEW_FILL[kind]).toBeDefined()
      expect(PREVIEW_STROKE[kind]).toBeDefined()
      expect(PREVIEW_FILL_OPACITY[kind]).toBeDefined()
    }
  })

  it('returns valid 6-digit hex colors for every fill', () => {
    for (const kind of ALL_KINDS) {
      expect(PREVIEW_FILL[kind]).toMatch(/^#[0-9a-f]{6}$/)
      expect(PREVIEW_STROKE[kind]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('clamps every fill opacity to (0, 1]', () => {
    for (const kind of ALL_KINDS) {
      const opacity = PREVIEW_FILL_OPACITY[kind]
      expect(opacity).toBeGreaterThan(0)
      expect(opacity).toBeLessThanOrEqual(1)
    }
  })

  it('keeps the erase-empty kind softer (lower opacity) than the active kinds', () => {
    expect(PREVIEW_FILL_OPACITY['erase-empty']).toBeLessThan(
      PREVIEW_FILL_OPACITY['place-valid'],
    )
    expect(PREVIEW_FILL_OPACITY['erase-empty']).toBeLessThan(
      PREVIEW_FILL_OPACITY['erase-target'],
    )
  })

  it('uses the warning red for both place-invalid and erase-target', () => {
    expect(PREVIEW_FILL['place-invalid']).toBe(PREVIEW_FILL['erase-target'])
    expect(PREVIEW_STROKE['place-invalid']).toBe(PREVIEW_STROKE['erase-target'])
  })

  it('uses a distinct fill for place-valid (street brown) vs warning kinds', () => {
    expect(PREVIEW_FILL['place-valid']).not.toBe(PREVIEW_FILL['place-invalid'])
    expect(PREVIEW_FILL['place-valid']).not.toBe(PREVIEW_FILL['erase-target'])
  })
})
