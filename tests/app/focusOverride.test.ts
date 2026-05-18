import { describe, expect, it } from 'vitest'
import {
  focusOverrideQuery,
  parseFocusOverride,
  readFocusSearchParam,
} from '@/app/[slug]/edit/focusOverride'

describe('parseFocusOverride', () => {
  it('shares the parse contract with parseSpawnOverride (integers, both signs)', () => {
    expect(parseFocusOverride('3,5')).toEqual({ row: 3, col: 5 })
    expect(parseFocusOverride('-2,7')).toEqual({ row: -2, col: 7 })
    expect(parseFocusOverride('0,0')).toEqual({ row: 0, col: 0 })
  })

  it('returns null on malformed input (mirrors spawn parser)', () => {
    expect(parseFocusOverride(undefined)).toBeNull()
    expect(parseFocusOverride('')).toBeNull()
    expect(parseFocusOverride('1.5,2')).toBeNull()
    expect(parseFocusOverride('abc,3')).toBeNull()
    expect(parseFocusOverride('3,')).toBeNull()
  })
})

describe('focusOverrideQuery', () => {
  it('composes a ?focus=row,col query (not ?spawn=)', () => {
    expect(focusOverrideQuery({ row: 3, col: 5 })).toBe('?focus=3,5')
    expect(focusOverrideQuery({ row: -2, col: 7 })).toBe('?focus=-2,7')
  })

  it('returns empty string for null / undefined / non-integer coords', () => {
    expect(focusOverrideQuery(null)).toBe('')
    expect(focusOverrideQuery(undefined)).toBe('')
    expect(focusOverrideQuery({ row: 1.5, col: 2 })).toBe('')
    expect(focusOverrideQuery({ row: 1, col: Number.NaN })).toBe('')
  })

  it('round-trips through parseFocusOverride', () => {
    const original = { row: -5, col: 12 }
    const query = focusOverrideQuery(original)
    const value = query.replace(/^\?focus=/, '')
    expect(parseFocusOverride(value)).toEqual(original)
  })
})

describe('readFocusSearchParam', () => {
  it('returns null for undefined input', () => {
    expect(readFocusSearchParam(undefined)).toBeNull()
  })

  it('parses a single string value', () => {
    expect(readFocusSearchParam('3,5')).toEqual({ row: 3, col: 5 })
  })

  it('uses the first entry when given an array', () => {
    expect(readFocusSearchParam(['3,5', '7,9'])).toEqual({ row: 3, col: 5 })
  })

  it('returns null for an invalid first entry', () => {
    expect(readFocusSearchParam(['nope', '3,5'])).toBeNull()
  })
})
