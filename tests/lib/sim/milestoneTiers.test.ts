import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MILESTONE_COLOR,
  DEFAULT_MILESTONE_LABEL,
  MILESTONE_TIERS,
  POPULATION_MILESTONES,
  milestoneTierColor,
  milestoneTierLabel,
} from '@/lib/sim/state'

/**
 * Find a probe value strictly between two adjacent tier thresholds.
 * Walks every adjacent pair so a tier ladder with one tight pair (say
 * 4 and 5) and one loose pair (say 12 and 40) still yields a valid
 * probe from the loose pair. Returns null when every pair is
 * consecutive integers (no gap anywhere); the calling test should
 * skip the between-tier assertion in that case.
 */
function findBetweenTierProbe(): number | null {
  for (let i = 1; i < MILESTONE_TIERS.length; i++) {
    const lo = MILESTONE_TIERS[i - 1].threshold
    const hi = MILESTONE_TIERS[i].threshold
    if (hi > lo + 1) return lo + 1
  }
  return null
}

const ABOVE_MAX_PROBE =
  Math.max(...MILESTONE_TIERS.map((t) => t.threshold)) + 1

const MIN_THRESHOLD = Math.min(...MILESTONE_TIERS.map((t) => t.threshold))
const BELOW_MIN_PROBE = MIN_THRESHOLD - 1

describe('MILESTONE_TIERS (mass-appeal slice 1 follow-on)', () => {
  it('covers every threshold in POPULATION_MILESTONES', () => {
    const tierThresholds = MILESTONE_TIERS.map((t) => t.threshold).sort(
      (a, b) => a - b,
    )
    const milestones = [...POPULATION_MILESTONES].sort((a, b) => a - b)
    expect(tierThresholds).toEqual(milestones)
  })

  it('emits a non-empty trimmed label for every tier', () => {
    for (const tier of MILESTONE_TIERS) {
      expect(tier.label.length).toBeGreaterThan(0)
      expect(tier.label).toBe(tier.label.trim())
    }
  })

  it('emits a hex color string for every tier', () => {
    for (const tier of MILESTONE_TIERS) {
      expect(tier.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('every tier label is distinct (no two tiers share a label)', () => {
    const labels = new Set(MILESTONE_TIERS.map((t) => t.label))
    expect(labels.size).toBe(MILESTONE_TIERS.length)
  })

  it('every tier color is distinct so the toasts read as a progression', () => {
    const colors = new Set(MILESTONE_TIERS.map((t) => t.color))
    expect(colors.size).toBe(MILESTONE_TIERS.length)
  })

  it('thresholds are strictly increasing (progression-ladder invariant)', () => {
    for (let i = 1; i < MILESTONE_TIERS.length; i++) {
      expect(MILESTONE_TIERS[i].threshold).toBeGreaterThan(
        MILESTONE_TIERS[i - 1].threshold,
      )
    }
  })
})

describe('milestoneTierLabel', () => {
  it('returns the exact label for every threshold', () => {
    for (const tier of MILESTONE_TIERS) {
      expect(milestoneTierLabel(tier.threshold)).toBe(tier.label)
    }
  })

  it('falls back to the default label for values below the smallest tier', () => {
    // Derive the probe from the tier table so the assertion stays
    // valid if a future slice retunes the smallest threshold.
    expect(milestoneTierLabel(BELOW_MIN_PROBE)).toBe(DEFAULT_MILESTONE_LABEL)
  })

  it('falls back to the default for values that do not match any tier', () => {
    const between = findBetweenTierProbe()
    if (between !== null) {
      expect(milestoneTierLabel(between)).toBe(DEFAULT_MILESTONE_LABEL)
    }
    expect(milestoneTierLabel(ABOVE_MAX_PROBE)).toBe(DEFAULT_MILESTONE_LABEL)
  })
})

describe('milestoneTierColor', () => {
  it('returns the exact color for every threshold', () => {
    for (const tier of MILESTONE_TIERS) {
      expect(milestoneTierColor(tier.threshold)).toBe(tier.color)
    }
  })

  it('falls back to the default color for values below the smallest tier', () => {
    expect(milestoneTierColor(BELOW_MIN_PROBE)).toBe(DEFAULT_MILESTONE_COLOR)
  })

  it('falls back to the default color for between-tier and above-max values', () => {
    const between = findBetweenTierProbe()
    if (between !== null) {
      expect(milestoneTierColor(between)).toBe(DEFAULT_MILESTONE_COLOR)
    }
    expect(milestoneTierColor(ABOVE_MAX_PROBE)).toBe(DEFAULT_MILESTONE_COLOR)
  })

  it('default color is a valid hex string', () => {
    expect(DEFAULT_MILESTONE_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})
