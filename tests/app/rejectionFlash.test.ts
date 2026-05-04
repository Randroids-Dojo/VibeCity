import { describe, expect, it } from 'vitest'
import {
  REJECTION_FLASH_DURATION_MS,
  REJECTION_FLASH_FILL,
  REJECTION_FLASH_FILL_OPACITY,
  REJECTION_FLASH_STROKE,
  nextRejectionId,
  rejectionFlashFromClick,
  rejectionKindForClick,
  type RejectionInput,
  type RejectionKind,
} from '@/app/[slug]/edit/rejectionFlash'
import type { City } from '@/lib/schemas'
import { EMPTY_CITY } from '@/lib/schemas'

/**
 * REQ-027 (place rejection flash).
 *
 * Pure helper that classifies a click as accepted or rejected against
 * the live city, palette category, and tool mode. The SnapGridView
 * paints the resulting `RejectionFlash` as a brief overlay so an
 * author whose click was rejected by `placePiece` / `placeBuilding` /
 * `erasePiece` / `eraseBuilding` sees an immediate visible signal
 * that the click did nothing.
 */

const cityWithStraight = (): City => ({
  pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
  buildings: [],
})

const cityWithBuilding = (): City => ({
  pieces: [],
  buildings: [{ type: 'small-house', row: 1, col: 2, rotation: 0 }],
})

const cityWithBoth = (): City => ({
  pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
  buildings: [{ type: 'shop', row: 1, col: 2, rotation: 0 }],
})

const KINDS: readonly RejectionKind[] = ['place-occupied', 'erase-empty']

describe('rejectionFlash constants (REQ-027)', () => {
  it('REJECTION_FLASH_DURATION_MS is short enough to not delay the next click but long enough to read', () => {
    expect(REJECTION_FLASH_DURATION_MS).toBeGreaterThanOrEqual(150)
    expect(REJECTION_FLASH_DURATION_MS).toBeLessThanOrEqual(800)
  })

  it('REJECTION_FLASH_FILL is the warning red used by the place-invalid preview ghost', () => {
    expect(REJECTION_FLASH_FILL).toBe('#a3372a')
  })

  it('REJECTION_FLASH_STROKE is a darker shade of the fill', () => {
    expect(REJECTION_FLASH_STROKE).toBe('#7a2a20')
  })

  it('REJECTION_FLASH_FILL_OPACITY is between 0 and 1 with enough opacity to read on top of an occupied cell', () => {
    expect(REJECTION_FLASH_FILL_OPACITY).toBeGreaterThan(0)
    expect(REJECTION_FLASH_FILL_OPACITY).toBeLessThan(1)
    expect(REJECTION_FLASH_FILL_OPACITY).toBeGreaterThanOrEqual(0.4)
  })
})

describe('rejectionKindForClick (REQ-027)', () => {
  it('returns null for an accepted place click on an empty cell in street mode', () => {
    const input: RejectionInput = {
      city: EMPTY_CITY,
      category: 'street',
      toolMode: 'place',
      row: 0,
      col: 0,
    }
    expect(rejectionKindForClick(input)).toBeNull()
  })

  it('returns null for an accepted place click on an empty cell in building mode', () => {
    const input: RejectionInput = {
      city: EMPTY_CITY,
      category: 'building',
      toolMode: 'place',
      row: 3,
      col: 4,
    }
    expect(rejectionKindForClick(input)).toBeNull()
  })

  it('returns place-occupied for a place click on a piece-occupied cell in street mode', () => {
    const input: RejectionInput = {
      city: cityWithStraight(),
      category: 'street',
      toolMode: 'place',
      row: 0,
      col: 0,
    }
    expect(rejectionKindForClick(input)).toBe('place-occupied')
  })

  it('returns place-occupied for a place click on a piece-occupied cell in building mode', () => {
    const input: RejectionInput = {
      city: cityWithStraight(),
      category: 'building',
      toolMode: 'place',
      row: 0,
      col: 0,
    }
    expect(rejectionKindForClick(input)).toBe('place-occupied')
  })

  it('returns place-occupied for a place click on a building-occupied cell in either category', () => {
    const city = cityWithBuilding()
    expect(
      rejectionKindForClick({
        city,
        category: 'street',
        toolMode: 'place',
        row: 1,
        col: 2,
      }),
    ).toBe('place-occupied')
    expect(
      rejectionKindForClick({
        city,
        category: 'building',
        toolMode: 'place',
        row: 1,
        col: 2,
      }),
    ).toBe('place-occupied')
  })

  it('returns erase-empty for an erase click on an empty cell in street mode', () => {
    const input: RejectionInput = {
      city: EMPTY_CITY,
      category: 'street',
      toolMode: 'erase',
      row: 0,
      col: 0,
    }
    expect(rejectionKindForClick(input)).toBe('erase-empty')
  })

  it('returns erase-empty for an erase click on an empty cell in building mode', () => {
    const input: RejectionInput = {
      city: EMPTY_CITY,
      category: 'building',
      toolMode: 'erase',
      row: 5,
      col: 7,
    }
    expect(rejectionKindForClick(input)).toBe('erase-empty')
  })

  it('returns null for an accepted erase click on a piece in street mode', () => {
    const input: RejectionInput = {
      city: cityWithStraight(),
      category: 'street',
      toolMode: 'erase',
      row: 0,
      col: 0,
    }
    expect(rejectionKindForClick(input)).toBeNull()
  })

  it('returns null for an accepted erase click on a building in building mode', () => {
    const input: RejectionInput = {
      city: cityWithBuilding(),
      category: 'building',
      toolMode: 'erase',
      row: 1,
      col: 2,
    }
    expect(rejectionKindForClick(input)).toBeNull()
  })

  it('returns erase-empty for an erase click on a building cell while street category is active', () => {
    const input: RejectionInput = {
      city: cityWithBuilding(),
      category: 'street',
      toolMode: 'erase',
      row: 1,
      col: 2,
    }
    expect(rejectionKindForClick(input)).toBe('erase-empty')
  })

  it('returns erase-empty for an erase click on a piece cell while building category is active', () => {
    const input: RejectionInput = {
      city: cityWithStraight(),
      category: 'building',
      toolMode: 'erase',
      row: 0,
      col: 0,
    }
    expect(rejectionKindForClick(input)).toBe('erase-empty')
  })

  it('handles negative coordinates the same way as positive coordinates', () => {
    const city: City = {
      pieces: [{ type: 'straight', row: -3, col: -5, rotation: 0 }],
      buildings: [],
    }
    expect(
      rejectionKindForClick({
        city,
        category: 'street',
        toolMode: 'place',
        row: -3,
        col: -5,
      }),
    ).toBe('place-occupied')
    expect(
      rejectionKindForClick({
        city,
        category: 'street',
        toolMode: 'erase',
        row: -10,
        col: -10,
      }),
    ).toBe('erase-empty')
  })

  it('handles a multi-cell footprint piece across every footprint cell', () => {
    const city: City = {
      pieces: [{ type: 'megaSweepRight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    // Mega sweep at rotation 0 anchored at (0, 0) covers (-1, -1) / (-1, 0) /
    // (0, -1) / (0, 0) per snapGrid's defaultFootprintForPiece.
    for (const [row, col] of [
      [-1, -1],
      [-1, 0],
      [0, -1],
      [0, 0],
    ] as const) {
      expect(
        rejectionKindForClick({
          city,
          category: 'street',
          toolMode: 'place',
          row,
          col,
        }),
      ).toBe('place-occupied')
    }
    // A neighbor cell outside the footprint accepts placement.
    expect(
      rejectionKindForClick({
        city,
        category: 'street',
        toolMode: 'place',
        row: 1,
        col: 1,
      }),
    ).toBeNull()
  })

  it('does not mutate the input city', () => {
    const city = cityWithBoth()
    const snapshot = JSON.stringify(city)
    rejectionKindForClick({
      city,
      category: 'street',
      toolMode: 'place',
      row: 0,
      col: 0,
    })
    expect(JSON.stringify(city)).toBe(snapshot)
  })

  it('reports every kind the SMIL overlay can render', () => {
    expect(KINDS).toContain('place-occupied')
    expect(KINDS).toContain('erase-empty')
    expect(KINDS).toHaveLength(2)
  })
})

describe('nextRejectionId (REQ-027)', () => {
  it('starts at 1 from a zero seed', () => {
    expect(nextRejectionId(0)).toBe(1)
  })

  it('increments by one on each call', () => {
    expect(nextRejectionId(1)).toBe(2)
    expect(nextRejectionId(2)).toBe(3)
    expect(nextRejectionId(99)).toBe(100)
  })

  it('wraps to 1 at MAX_SAFE_INTEGER so a long session does not overflow', () => {
    expect(nextRejectionId(Number.MAX_SAFE_INTEGER)).toBe(1)
    expect(nextRejectionId(Number.MAX_SAFE_INTEGER - 1)).toBe(
      Number.MAX_SAFE_INTEGER,
    )
  })

  it('collapses non-finite seeds to 1', () => {
    expect(nextRejectionId(Number.NaN)).toBe(1)
    expect(nextRejectionId(Number.POSITIVE_INFINITY)).toBe(1)
    expect(nextRejectionId(Number.NEGATIVE_INFINITY)).toBe(1)
    expect(nextRejectionId(-1)).toBe(1)
  })
})

describe('rejectionFlashFromClick (REQ-027)', () => {
  it('returns null for an accepted click', () => {
    const flash = rejectionFlashFromClick(
      {
        city: EMPTY_CITY,
        category: 'street',
        toolMode: 'place',
        row: 0,
        col: 0,
      },
      0,
    )
    expect(flash).toBeNull()
  })

  it('returns a flash carrying the click cell and the matching kind', () => {
    const flash = rejectionFlashFromClick(
      {
        city: cityWithStraight(),
        category: 'street',
        toolMode: 'place',
        row: 0,
        col: 0,
      },
      0,
    )
    expect(flash).toEqual({
      row: 0,
      col: 0,
      kind: 'place-occupied',
      id: 1,
    })
  })

  it('reports erase-empty for an erase click on an empty cell', () => {
    const flash = rejectionFlashFromClick(
      {
        city: EMPTY_CITY,
        category: 'street',
        toolMode: 'erase',
        row: 4,
        col: 5,
      },
      0,
    )
    expect(flash).toEqual({
      row: 4,
      col: 5,
      kind: 'erase-empty',
      id: 1,
    })
  })

  it('threads the previous id through nextRejectionId so back-to-back rejections produce distinct ids', () => {
    const first = rejectionFlashFromClick(
      {
        city: cityWithStraight(),
        category: 'street',
        toolMode: 'place',
        row: 0,
        col: 0,
      },
      0,
    )
    const second = rejectionFlashFromClick(
      {
        city: cityWithStraight(),
        category: 'street',
        toolMode: 'place',
        row: 0,
        col: 0,
      },
      first?.id ?? 0,
    )
    expect(first?.id).toBe(1)
    expect(second?.id).toBe(2)
  })

  it('preserves the row / col coordinates on negative cells', () => {
    const flash = rejectionFlashFromClick(
      {
        city: EMPTY_CITY,
        category: 'street',
        toolMode: 'erase',
        row: -7,
        col: -8,
      },
      99,
    )
    expect(flash?.row).toBe(-7)
    expect(flash?.col).toBe(-8)
    expect(flash?.id).toBe(100)
  })
})
