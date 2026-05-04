import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOUCH_MODE,
  TOUCH_MODE_OPTIONS,
  clampTouchMode,
} from '@/app/[slug]/touchSettings'
import { TouchModeSchema } from '@/lib/controlsPersistence'

/**
 * REQ-042: touch mode picker. The persistence layer (REQ-043) ships
 * the closed `TouchModeSchema` enum and the default literal; this
 * module narrows that surface to UI-friendly option metadata and a
 * defensive clamp the panel uses to keep the picker state valid.
 */

describe('TOUCH_MODE_OPTIONS', () => {
  it('exposes an option for every value in the persistence enum', () => {
    const enumValues = TouchModeSchema.options
    const optionValues = TOUCH_MODE_OPTIONS.map((option) => option.value)
    for (const value of enumValues) {
      expect(optionValues).toContain(value)
    }
    expect(optionValues.length).toBe(enumValues.length)
  })

  it('every option carries a non-empty label and description', () => {
    for (const option of TOUCH_MODE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.description.length).toBeGreaterThan(0)
    }
  })

  it('option values are unique', () => {
    const values = TOUCH_MODE_OPTIONS.map((option) => option.value)
    const set = new Set(values)
    expect(set.size).toBe(values.length)
  })

  it('the default option is the first entry so the picker reads the default-first ordering', () => {
    expect(TOUCH_MODE_OPTIONS[0].value).toBe(DEFAULT_TOUCH_MODE)
  })

  it('label and description vocabulary stays free of race terminology so REQ-037 does not regress', () => {
    const RACE_TERMS = ['lap', 'race', 'checkpoint', 'finish', 'leaderboard']
    for (const option of TOUCH_MODE_OPTIONS) {
      const lowerLabel = option.label.toLowerCase()
      const lowerDescription = option.description.toLowerCase()
      for (const term of RACE_TERMS) {
        expect(lowerLabel.includes(term)).toBe(false)
        expect(lowerDescription.includes(term)).toBe(false)
      }
    }
  })
})

describe('clampTouchMode', () => {
  it('returns the default for a non-string input', () => {
    expect(clampTouchMode(undefined)).toBe(DEFAULT_TOUCH_MODE)
    expect(clampTouchMode(null)).toBe(DEFAULT_TOUCH_MODE)
    expect(clampTouchMode(123)).toBe(DEFAULT_TOUCH_MODE)
    expect(clampTouchMode({})).toBe(DEFAULT_TOUCH_MODE)
    expect(clampTouchMode([])).toBe(DEFAULT_TOUCH_MODE)
  })

  it('returns the default for an unknown string value', () => {
    expect(clampTouchMode('gyro')).toBe(DEFAULT_TOUCH_MODE)
    expect(clampTouchMode('')).toBe(DEFAULT_TOUCH_MODE)
    expect(clampTouchMode('DUAL-STICK')).toBe(DEFAULT_TOUCH_MODE)
  })

  it('returns the input verbatim for every valid TouchMode', () => {
    for (const option of TOUCH_MODE_OPTIONS) {
      expect(clampTouchMode(option.value)).toBe(option.value)
    }
  })

  it('is idempotent on every valid TouchMode', () => {
    for (const option of TOUCH_MODE_OPTIONS) {
      const first = clampTouchMode(option.value)
      const second = clampTouchMode(first)
      expect(second).toBe(first)
    }
  })
})

describe('DEFAULT_TOUCH_MODE re-export', () => {
  it('matches the persistence-layer default verbatim', () => {
    // Re-export pattern keeps the panel from importing from two
    // modules; the value must stay in sync with controlsPersistence.
    expect(TouchModeSchema.safeParse(DEFAULT_TOUCH_MODE).success).toBe(true)
    expect(DEFAULT_TOUCH_MODE).toBe('dual-stick')
  })
})
