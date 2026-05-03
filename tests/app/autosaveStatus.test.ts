import { describe, expect, it } from 'vitest'
import {
  AUTOSAVE_STATUS_LABEL,
  DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  isCityContentEqual,
  type AutosaveStatus,
} from '@/app/[slug]/edit/autosaveStatus'
import type { City } from '@/lib/schemas'

/**
 * REQ-025 (autosave): pure helpers backing the autosave debounce
 * scheduler and the status indicator. The fetch / debounce / abort
 * orchestration lives in `EditorClient.tsx` and is exercised by the
 * Playwright spec; these unit tests cover the parts that can be
 * verified without React or a network.
 */

describe('AutosaveStatus enum (REQ-025)', () => {
  it('every status has a non-empty human label', () => {
    const statuses: AutosaveStatus[] = [
      'idle',
      'pending',
      'saving',
      'saved',
      'error',
    ]
    for (const status of statuses) {
      expect(typeof AUTOSAVE_STATUS_LABEL[status]).toBe('string')
      expect(AUTOSAVE_STATUS_LABEL[status].length).toBeGreaterThan(0)
    }
  })

  it('idle and saved render the same Saved label so the steady state is unambiguous', () => {
    expect(AUTOSAVE_STATUS_LABEL.idle).toBe('Saved')
    expect(AUTOSAVE_STATUS_LABEL.saved).toBe('Saved')
  })

  it('error label flags the failure mode without a long sentence', () => {
    expect(AUTOSAVE_STATUS_LABEL.error).toBe('Save failed')
  })

  it('pending and saving labels distinguish the in-flight transitions', () => {
    expect(AUTOSAVE_STATUS_LABEL.pending).toBe('Editing')
    expect(AUTOSAVE_STATUS_LABEL.saving).toBe('Saving')
  })
})

describe('DEFAULT_AUTOSAVE_DEBOUNCE_MS (REQ-025)', () => {
  it('is a positive integer in the comfortable range for an editor', () => {
    expect(Number.isInteger(DEFAULT_AUTOSAVE_DEBOUNCE_MS)).toBe(true)
    expect(DEFAULT_AUTOSAVE_DEBOUNCE_MS).toBeGreaterThan(100)
    expect(DEFAULT_AUTOSAVE_DEBOUNCE_MS).toBeLessThan(2000)
  })
})

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

  it('returns true when only mood differs (mood excluded from equality)', () => {
    // The autosave equality check mirrors REQ-013 hash semantics so a
    // mood-only change does not fire a network round-trip the server
    // would treat as the same version.
    const a: City = {
      pieces: [],
      buildings: [],
      mood: { timeOfDay: 'noon' },
    }
    const b: City = {
      pieces: [],
      buildings: [],
      mood: { timeOfDay: 'sunset' },
    }
    expect(isCityContentEqual(a, b)).toBe(true)
  })
})
