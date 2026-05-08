import { describe, expect, it } from 'vitest'
import { isCityContentEqual } from '@/app/[slug]/edit/cityAutosave'
import type { City } from '@/lib/schemas'

/**
 * REQ-025: city-shaped autosave equality. The generic FSM
 * (statuses, labels, debounce) is covered in
 * `tests/lib/editor/autosaveStatus.test.ts`; this file covers the
 * city-document equality the editor uses to skip redundant saves.
 */

describe('isCityContentEqual (REQ-025)', () => {
  it('returns true for the same reference', () => {
    const city: City = { pieces: [], buildings: [] }
    expect(isCityContentEqual(city, city)).toBe(true)
  })

  it('returns true for two structurally-empty cities', () => {
    expect(
      isCityContentEqual(
        { pieces: [], buildings: [] },
        { pieces: [], buildings: [] },
      ),
    ).toBe(true)
  })

  it('returns true for cities with the same pieces in the same order', () => {
    const a: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
      ],
      buildings: [],
    }
    const b: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
      ],
      buildings: [],
    }
    expect(isCityContentEqual(a, b)).toBe(true)
  })

  it('returns false when piece counts differ', () => {
    const a: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const b: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
      ],
      buildings: [],
    }
    expect(isCityContentEqual(a, b)).toBe(false)
  })

  it('returns false when piece order differs', () => {
    const a: City = {
      pieces: [
        { type: 'straight', row: 0, col: 0, rotation: 0 },
        { type: 'left90', row: 0, col: 1, rotation: 0 },
      ],
      buildings: [],
    }
    const b: City = {
      pieces: [
        { type: 'left90', row: 0, col: 1, rotation: 0 },
        { type: 'straight', row: 0, col: 0, rotation: 0 },
      ],
      buildings: [],
    }
    expect(isCityContentEqual(a, b)).toBe(false)
  })

  it('returns false when a single piece field differs (rotation)', () => {
    const a: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      buildings: [],
    }
    const b: City = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 90 }],
      buildings: [],
    }
    expect(isCityContentEqual(a, b)).toBe(false)
  })

  it('returns false when buildings differ', () => {
    const a: City = {
      pieces: [],
      buildings: [{ type: 'small-house', row: 0, col: 0, rotation: 0 }],
    }
    const b: City = {
      pieces: [],
      buildings: [{ type: 'shop', row: 0, col: 0, rotation: 0 }],
    }
    expect(isCityContentEqual(a, b)).toBe(false)
  })

  it('returns false when only mood differs (REQ-088 follow-on: mood persistence)', () => {
    // REQ-088 lit-windows-at-night made mood player-actionable via
    // the editor's day/night toggle. The autosave equality check now
    // includes mood so a Day -> Night toggle actually persists. The
    // version hash (REQ-013) stays stable across mood changes
    // because hashCity itself excludes mood; the autosave equality
    // is independent of the hash function.
    const a: City = {
      pieces: [],
      buildings: [],
      mood: { timeOfDay: 'day' },
    }
    const b: City = {
      pieces: [],
      buildings: [],
      mood: { timeOfDay: 'night' },
    }
    expect(isCityContentEqual(a, b)).toBe(false)
  })

  it('returns true when both cities have the same mood', () => {
    const mood = { timeOfDay: 'night', weather: 'rain' }
    const a: City = { pieces: [], buildings: [], mood }
    const b: City = { pieces: [], buildings: [], mood: { ...mood } }
    expect(isCityContentEqual(a, b)).toBe(true)
  })

  it('returns true when both cities have no mood', () => {
    const a: City = { pieces: [], buildings: [] }
    const b: City = { pieces: [], buildings: [] }
    expect(isCityContentEqual(a, b)).toBe(true)
  })

  it('returns false when one has mood and the other does not', () => {
    const a: City = {
      pieces: [],
      buildings: [],
      mood: { timeOfDay: 'night' },
    }
    const b: City = { pieces: [], buildings: [] }
    expect(isCityContentEqual(a, b)).toBe(false)
  })
})
