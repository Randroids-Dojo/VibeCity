import { describe, expect, it } from 'vitest'
import {
  CITY_COUNT_NOUN_PLURAL,
  CITY_COUNT_NOUN_SINGULAR,
  CITY_COUNT_SUFFIX,
  formatCityCount,
} from '@/lib/cityCount'

/**
 * REQ-011 / REQ-050: home page surfaces a "N cities so far" header cue
 * derived from `cityIndexCount()` (a `ZCARD` against `city:index`). The
 * formatter is a pure helper that collapses the count into a short
 * conversational cue with proper singular / plural noun agreement.
 */
describe('formatCityCount (REQ-011, REQ-050)', () => {
  describe('constants', () => {
    it('exposes the suffix as the literal "so far"', () => {
      expect(CITY_COUNT_SUFFIX).toBe('so far')
    })

    it('exposes the singular noun as the literal "city"', () => {
      expect(CITY_COUNT_NOUN_SINGULAR).toBe('city')
    })

    it('exposes the plural noun as the literal "cities"', () => {
      expect(CITY_COUNT_NOUN_PLURAL).toBe('cities')
    })

    it('all three constants are non-empty and trimmed', () => {
      expect(CITY_COUNT_SUFFIX.length).toBeGreaterThan(0)
      expect(CITY_COUNT_SUFFIX.trim()).toBe(CITY_COUNT_SUFFIX)
      expect(CITY_COUNT_NOUN_SINGULAR.length).toBeGreaterThan(0)
      expect(CITY_COUNT_NOUN_SINGULAR.trim()).toBe(CITY_COUNT_NOUN_SINGULAR)
      expect(CITY_COUNT_NOUN_PLURAL.length).toBeGreaterThan(0)
      expect(CITY_COUNT_NOUN_PLURAL.trim()).toBe(CITY_COUNT_NOUN_PLURAL)
    })

    it('singular and plural noun differ', () => {
      expect(CITY_COUNT_NOUN_SINGULAR).not.toBe(CITY_COUNT_NOUN_PLURAL)
    })
  })

  describe('zero band (count = 0)', () => {
    it('uses the plural noun for zero', () => {
      expect(formatCityCount(0)).toBe('0 cities so far')
    })

    it('output contains the literal suffix', () => {
      expect(formatCityCount(0)).toContain(CITY_COUNT_SUFFIX)
    })

    it('output contains the plural noun, not the singular noun', () => {
      const out = formatCityCount(0)
      expect(out).toContain(CITY_COUNT_NOUN_PLURAL)
      // The plural noun is "cities" and the singular noun "city" is a
      // prefix of "cities" so a contains check on the singular would be
      // ambiguous; the count + space + noun shape disambiguates.
      expect(out.startsWith('0 cities ')).toBe(true)
    })
  })

  describe('singular band (count = 1)', () => {
    it('uses the singular noun for exactly one', () => {
      expect(formatCityCount(1)).toBe('1 city so far')
    })

    it('output contains the literal suffix', () => {
      expect(formatCityCount(1)).toContain(CITY_COUNT_SUFFIX)
    })

    it('output uses the singular noun, not the plural noun', () => {
      const out = formatCityCount(1)
      // Word-bounded singular check: "1 city " has the trailing space
      // before the suffix so we cannot accidentally match "1 cities".
      expect(out.startsWith('1 city ')).toBe(true)
    })
  })

  describe('plural band (count >= 2)', () => {
    it('uses the plural noun for two', () => {
      expect(formatCityCount(2)).toBe('2 cities so far')
    })

    it('uses the plural noun for a small count', () => {
      expect(formatCityCount(7)).toBe('7 cities so far')
    })

    it('uses the plural noun for a large count', () => {
      expect(formatCityCount(247)).toBe('247 cities so far')
    })

    it('uses the plural noun for a very large count', () => {
      expect(formatCityCount(1_000_000)).toBe('1000000 cities so far')
    })
  })

  describe('fractional inputs floor', () => {
    it('floors a positive fractional count', () => {
      expect(formatCityCount(1.9)).toBe('1 city so far')
    })

    it('floors a positive fractional count above the singular boundary', () => {
      expect(formatCityCount(2.5)).toBe('2 cities so far')
    })

    it('floors zero-point-something to zero', () => {
      expect(formatCityCount(0.5)).toBe('0 cities so far')
    })
  })

  describe('defensive fallbacks', () => {
    it('returns the empty string for NaN', () => {
      expect(formatCityCount(NaN)).toBe('')
    })

    it('returns the empty string for +Infinity', () => {
      expect(formatCityCount(Number.POSITIVE_INFINITY)).toBe('')
    })

    it('returns the empty string for -Infinity', () => {
      expect(formatCityCount(Number.NEGATIVE_INFINITY)).toBe('')
    })

    it('returns the empty string for a negative count', () => {
      expect(formatCityCount(-1)).toBe('')
    })

    it('returns the empty string for a negative fractional count', () => {
      expect(formatCityCount(-0.5)).toBe('')
    })
  })

  describe('output shape contracts', () => {
    it('all non-empty outputs end with the suffix', () => {
      for (const count of [0, 1, 2, 5, 99]) {
        const out = formatCityCount(count)
        expect(out.endsWith(CITY_COUNT_SUFFIX)).toBe(true)
      }
    })

    it('all non-empty outputs start with the digit', () => {
      for (const count of [0, 1, 2, 5, 99]) {
        const out = formatCityCount(count)
        expect(/^\d/.test(out)).toBe(true)
      }
    })

    it('zero and singular outputs differ', () => {
      expect(formatCityCount(0)).not.toBe(formatCityCount(1))
    })

    it('singular and plural outputs differ', () => {
      expect(formatCityCount(1)).not.toBe(formatCityCount(2))
    })

    it('formatter is deterministic across repeat calls', () => {
      expect(formatCityCount(42)).toBe(formatCityCount(42))
    })
  })
})
