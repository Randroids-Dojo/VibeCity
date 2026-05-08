import { describe, expect, it } from 'vitest'
import {
  AUTOSAVE_STATUS_LABEL,
  DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  type AutosaveStatus,
} from '@/lib/editor'

/**
 * Generic autosave-FSM contract. The city-shaped equality helper
 * lives in `tests/app/cityAutosave.test.ts`.
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
