import { describe, expect, it } from 'vitest'
import {
  RELATIVE_TIME_JUST_NOW_LABEL,
  RELATIVE_TIME_JUST_NOW_THRESHOLD_MS,
  formatRelativeTime,
} from '@/lib/relativeTime'

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

const NOW = 1_700_000_000_000

/**
 * REQ-011 / REQ-050: home page renders a relative "Updated N ago" cue
 * for each recently-updated city. The formatter is a pure helper that
 * collapses a `(updatedAt, now)` pair into a short human-readable cue
 * across the standard band table (just now / m / h / d / w / mo / y).
 */
describe('formatRelativeTime (REQ-011, REQ-050)', () => {
  describe('constants', () => {
    it('exposes the just-now threshold as one minute', () => {
      expect(RELATIVE_TIME_JUST_NOW_THRESHOLD_MS).toBe(MINUTE_MS)
    })

    it('exposes the just-now label as the literal "just now"', () => {
      expect(RELATIVE_TIME_JUST_NOW_LABEL).toBe('just now')
    })

    it('the just-now label is non-empty and trimmed', () => {
      expect(RELATIVE_TIME_JUST_NOW_LABEL.length).toBeGreaterThan(0)
      expect(RELATIVE_TIME_JUST_NOW_LABEL.trim()).toBe(
        RELATIVE_TIME_JUST_NOW_LABEL,
      )
    })
  })

  describe('just now band (delta < 1 minute)', () => {
    it('returns "just now" when the timestamps are equal', () => {
      expect(formatRelativeTime(NOW, NOW)).toBe('just now')
    })

    it('returns "just now" for a delta of one second', () => {
      expect(formatRelativeTime(NOW - SECOND_MS, NOW)).toBe('just now')
    })

    it('returns "just now" for a delta one millisecond below the minute boundary', () => {
      expect(formatRelativeTime(NOW - (MINUTE_MS - 1), NOW)).toBe('just now')
    })

    it('returns "just now" for a future timestamp (clock-skew defense)', () => {
      expect(formatRelativeTime(NOW + 5 * MINUTE_MS, NOW)).toBe('just now')
    })
  })

  describe('minute band (1m to 59m)', () => {
    it('returns "1m ago" exactly at the minute boundary', () => {
      expect(formatRelativeTime(NOW - MINUTE_MS, NOW)).toBe('1m ago')
    })

    it('returns "5m ago" for a five-minute delta', () => {
      expect(formatRelativeTime(NOW - 5 * MINUTE_MS, NOW)).toBe('5m ago')
    })

    it('returns "59m ago" one millisecond below the hour boundary', () => {
      expect(formatRelativeTime(NOW - (HOUR_MS - 1), NOW)).toBe('59m ago')
    })

    it('floors fractional minutes (90 seconds reads as 1m ago)', () => {
      expect(formatRelativeTime(NOW - 90 * SECOND_MS, NOW)).toBe('1m ago')
    })
  })

  describe('hour band (1h to 23h)', () => {
    it('returns "1h ago" exactly at the hour boundary', () => {
      expect(formatRelativeTime(NOW - HOUR_MS, NOW)).toBe('1h ago')
    })

    it('returns "5h ago" for a five-hour delta', () => {
      expect(formatRelativeTime(NOW - 5 * HOUR_MS, NOW)).toBe('5h ago')
    })

    it('returns "23h ago" one millisecond below the day boundary', () => {
      expect(formatRelativeTime(NOW - (DAY_MS - 1), NOW)).toBe('23h ago')
    })
  })

  describe('day band (1d to 6d)', () => {
    it('returns "1d ago" exactly at the day boundary', () => {
      expect(formatRelativeTime(NOW - DAY_MS, NOW)).toBe('1d ago')
    })

    it('returns "3d ago" for a three-day delta', () => {
      expect(formatRelativeTime(NOW - 3 * DAY_MS, NOW)).toBe('3d ago')
    })

    it('returns "6d ago" one millisecond below the week boundary', () => {
      expect(formatRelativeTime(NOW - (WEEK_MS - 1), NOW)).toBe('6d ago')
    })
  })

  describe('week band (1w to 4w)', () => {
    it('returns "1w ago" exactly at the week boundary', () => {
      expect(formatRelativeTime(NOW - WEEK_MS, NOW)).toBe('1w ago')
    })

    it('returns "2w ago" for a two-week delta', () => {
      expect(formatRelativeTime(NOW - 2 * WEEK_MS, NOW)).toBe('2w ago')
    })

    it('returns "4w ago" one millisecond below the month boundary', () => {
      expect(formatRelativeTime(NOW - (MONTH_MS - 1), NOW)).toBe('4w ago')
    })
  })

  describe('month band (1mo to 11mo)', () => {
    it('returns "1mo ago" exactly at the month boundary', () => {
      expect(formatRelativeTime(NOW - MONTH_MS, NOW)).toBe('1mo ago')
    })

    it('returns "6mo ago" for a six-month delta', () => {
      expect(formatRelativeTime(NOW - 6 * MONTH_MS, NOW)).toBe('6mo ago')
    })

    it('returns "12mo ago" one millisecond below the year boundary (365 days / 30 = 12.17 month buckets)', () => {
      expect(formatRelativeTime(NOW - (YEAR_MS - 1), NOW)).toBe('12mo ago')
    })

    it('returns "11mo ago" at 11 months exactly', () => {
      expect(formatRelativeTime(NOW - 11 * MONTH_MS, NOW)).toBe('11mo ago')
    })
  })

  describe('year band (1y and beyond)', () => {
    it('returns "1y ago" exactly at the year boundary', () => {
      expect(formatRelativeTime(NOW - YEAR_MS, NOW)).toBe('1y ago')
    })

    it('returns "5y ago" for a five-year delta', () => {
      expect(formatRelativeTime(NOW - 5 * YEAR_MS, NOW)).toBe('5y ago')
    })

    it('returns "10y ago" for a ten-year delta', () => {
      expect(formatRelativeTime(NOW - 10 * YEAR_MS, NOW)).toBe('10y ago')
    })
  })

  describe('defensive fallbacks', () => {
    it('returns the empty string when updatedAt is zero', () => {
      expect(formatRelativeTime(0, NOW)).toBe('')
    })

    it('returns the empty string when updatedAt is negative', () => {
      expect(formatRelativeTime(-1, NOW)).toBe('')
    })

    it('returns the empty string when updatedAt is NaN', () => {
      expect(formatRelativeTime(Number.NaN, NOW)).toBe('')
    })

    it('returns the empty string when updatedAt is positive infinity', () => {
      expect(formatRelativeTime(Number.POSITIVE_INFINITY, NOW)).toBe('')
    })

    it('returns the empty string when updatedAt is negative infinity', () => {
      expect(formatRelativeTime(Number.NEGATIVE_INFINITY, NOW)).toBe('')
    })

    it('returns the empty string when nowMs is zero', () => {
      expect(formatRelativeTime(NOW - 5 * MINUTE_MS, 0)).toBe('')
    })

    it('returns the empty string when nowMs is NaN', () => {
      expect(formatRelativeTime(NOW - 5 * MINUTE_MS, Number.NaN)).toBe('')
    })

    it('returns the empty string when nowMs is negative', () => {
      expect(formatRelativeTime(NOW - 5 * MINUTE_MS, -1)).toBe('')
    })
  })

  describe('output shape contracts', () => {
    it('every non-empty band readout ends with " ago"', () => {
      const samples = [
        formatRelativeTime(NOW - MINUTE_MS, NOW),
        formatRelativeTime(NOW - HOUR_MS, NOW),
        formatRelativeTime(NOW - DAY_MS, NOW),
        formatRelativeTime(NOW - WEEK_MS, NOW),
        formatRelativeTime(NOW - MONTH_MS, NOW),
        formatRelativeTime(NOW - YEAR_MS, NOW),
      ]
      for (const cue of samples) {
        expect(cue.endsWith(' ago')).toBe(true)
      }
    })

    it('every band readout starts with a digit', () => {
      const samples = [
        formatRelativeTime(NOW - MINUTE_MS, NOW),
        formatRelativeTime(NOW - HOUR_MS, NOW),
        formatRelativeTime(NOW - DAY_MS, NOW),
        formatRelativeTime(NOW - WEEK_MS, NOW),
        formatRelativeTime(NOW - MONTH_MS, NOW),
        formatRelativeTime(NOW - YEAR_MS, NOW),
      ]
      for (const cue of samples) {
        expect(/^\d/.test(cue)).toBe(true)
      }
    })

    it('the band cues are pairwise distinct so the bands read as different cues', () => {
      const cues = new Set([
        formatRelativeTime(NOW - MINUTE_MS, NOW),
        formatRelativeTime(NOW - HOUR_MS, NOW),
        formatRelativeTime(NOW - DAY_MS, NOW),
        formatRelativeTime(NOW - WEEK_MS, NOW),
        formatRelativeTime(NOW - MONTH_MS, NOW),
        formatRelativeTime(NOW - YEAR_MS, NOW),
        RELATIVE_TIME_JUST_NOW_LABEL,
      ])
      expect(cues.size).toBe(7)
    })

    it('the just-now label does not include the word "ago"', () => {
      expect(RELATIVE_TIME_JUST_NOW_LABEL.includes('ago')).toBe(false)
    })

    it('the same input produces the same output (deterministic)', () => {
      const a = formatRelativeTime(NOW - 5 * MINUTE_MS, NOW)
      const b = formatRelativeTime(NOW - 5 * MINUTE_MS, NOW)
      expect(a).toBe(b)
    })
  })
})
