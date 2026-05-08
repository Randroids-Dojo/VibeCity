import { describe, expect, it } from 'vitest'
import {
  bboxNormalizedDots,
  type BboxPlacement,
} from '@/lib/render/thumbnail'

/**
 * Generic bbox-to-normalized-dots projector. The city-specific binding
 * (`cityThumbnailDots`) is covered in `tests/lib/cityThumbnail.test.ts`;
 * this file exercises the underlying projection math.
 */

const MARGIN = 0.1

describe('bboxNormalizedDots edge cases', () => {
  it('returns empty list for empty input', () => {
    expect(bboxNormalizedDots<'a'>([], { margin: MARGIN })).toEqual([])
  })

  it('centers a single placement at (0.5, 0.5)', () => {
    const dots = bboxNormalizedDots(
      [{ row: 5, col: 5, kind: 'piece' as const }],
      { margin: MARGIN },
    )
    expect(dots).toHaveLength(1)
    expect(dots[0].xNorm).toBe(0.5)
    expect(dots[0].yNorm).toBe(0.5)
    expect(dots[0].kind).toBe('piece')
  })

  it('centers along an axis when the span on that axis collapses', () => {
    // All points share row=3, so yNorm collapses to 0.5; xNorm spans.
    const dots = bboxNormalizedDots(
      [
        { row: 3, col: 0, kind: 'piece' as const },
        { row: 3, col: 4, kind: 'piece' as const },
      ],
      { margin: MARGIN },
    )
    expect(dots[0].yNorm).toBe(0.5)
    expect(dots[1].yNorm).toBe(0.5)
    expect(dots[0].xNorm).toBe(MARGIN)
    expect(dots[1].xNorm).toBe(1 - MARGIN)
  })
})

describe('bboxNormalizedDots multi-placement projection', () => {
  it('projects min into margin and max into 1 - margin', () => {
    const dots = bboxNormalizedDots(
      [
        { row: 0, col: 0, kind: 'piece' as const },
        { row: 10, col: 10, kind: 'building' as const },
      ],
      { margin: MARGIN },
    )
    expect(dots[0].xNorm).toBe(MARGIN)
    expect(dots[0].yNorm).toBe(MARGIN)
    expect(dots[1].xNorm).toBe(1 - MARGIN)
    expect(dots[1].yNorm).toBe(1 - MARGIN)
  })

  it('linearly interpolates intermediate placements', () => {
    const dots = bboxNormalizedDots(
      [
        { row: 0, col: 0, kind: 'a' as const },
        { row: 0, col: 10, kind: 'a' as const },
        { row: 0, col: 5, kind: 'a' as const },
      ],
      { margin: MARGIN },
    )
    // The middle placement at col=5 sits at exactly halfway (0.5)
    expect(dots[2].xNorm).toBeCloseTo(0.5, 6)
  })

  it('preserves the kind tag through projection', () => {
    const placements: BboxPlacement<'piece' | 'building'>[] = [
      { row: 0, col: 0, kind: 'piece' },
      { row: 5, col: 5, kind: 'building' },
    ]
    const dots = bboxNormalizedDots(placements, { margin: MARGIN })
    expect(dots[0].kind).toBe('piece')
    expect(dots[1].kind).toBe('building')
  })
})

describe('bboxNormalizedDots margin contract', () => {
  it('respects a zero margin (dots span [0, 1])', () => {
    const dots = bboxNormalizedDots(
      [
        { row: 0, col: 0, kind: 'a' as const },
        { row: 1, col: 1, kind: 'a' as const },
      ],
      { margin: 0 },
    )
    expect(dots[0].xNorm).toBe(0)
    expect(dots[1].xNorm).toBe(1)
    expect(dots[0].yNorm).toBe(0)
    expect(dots[1].yNorm).toBe(1)
  })

  it('respects a 0.25 margin (dots span [0.25, 0.75])', () => {
    const dots = bboxNormalizedDots(
      [
        { row: 0, col: 0, kind: 'a' as const },
        { row: 1, col: 1, kind: 'a' as const },
      ],
      { margin: 0.25 },
    )
    expect(dots[0].xNorm).toBeCloseTo(0.25, 6)
    expect(dots[1].xNorm).toBeCloseTo(0.75, 6)
  })
})
