import { describe, expect, it } from 'vitest'
import { formatCountLabel } from '@/lib/format/countLabel'

/**
 * Generic count-label formatter contract. The city-specific binding
 * (`formatCityCount`) is covered in `tests/lib/cityCount.test.ts`;
 * this file exercises the underlying singular / plural / suffix
 * machinery and the defensive fallbacks.
 */

const NOUN = { singular: 'apple', plural: 'apples' }
const NOUN_WITH_SUFFIX = { singular: 'apple', plural: 'apples', suffix: 'left' }

describe('formatCountLabel singular / plural', () => {
  it('uses the singular noun for exactly 1', () => {
    expect(formatCountLabel(1, NOUN)).toBe('1 apple')
  })

  it('uses the plural noun for 0', () => {
    expect(formatCountLabel(0, NOUN)).toBe('0 apples')
  })

  it('uses the plural noun for 2+', () => {
    expect(formatCountLabel(2, NOUN)).toBe('2 apples')
    expect(formatCountLabel(99, NOUN)).toBe('99 apples')
  })
})

describe('formatCountLabel suffix', () => {
  it('appends the optional suffix when provided', () => {
    expect(formatCountLabel(1, NOUN_WITH_SUFFIX)).toBe('1 apple left')
    expect(formatCountLabel(3, NOUN_WITH_SUFFIX)).toBe('3 apples left')
  })

  it('omits the trailing space when suffix is undefined', () => {
    expect(formatCountLabel(2, NOUN)).toBe('2 apples')
    expect(formatCountLabel(2, NOUN).endsWith(' ')).toBe(false)
  })
})

describe('formatCountLabel defensive fallbacks', () => {
  it('returns empty string for NaN', () => {
    expect(formatCountLabel(Number.NaN, NOUN)).toBe('')
  })

  it('returns empty string for Infinity', () => {
    expect(formatCountLabel(Number.POSITIVE_INFINITY, NOUN)).toBe('')
  })

  it('returns empty string for negative input', () => {
    expect(formatCountLabel(-1, NOUN)).toBe('')
    expect(formatCountLabel(-100, NOUN)).toBe('')
  })

  it('floors fractional input', () => {
    expect(formatCountLabel(1.7, NOUN)).toBe('1 apple')
    expect(formatCountLabel(2.9, NOUN)).toBe('2 apples')
  })
})
