import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MILESTONE_COLOR,
  DEFAULT_MILESTONE_LABEL,
  MILESTONE_TIERS,
  POPULATION_MILESTONES,
  milestoneTierColor,
  milestoneTierLabel,
} from '@/lib/sim/state'

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
    expect(milestoneTierLabel(0)).toBe(DEFAULT_MILESTONE_LABEL)
    expect(milestoneTierLabel(1)).toBe(DEFAULT_MILESTONE_LABEL)
    expect(milestoneTierLabel(3)).toBe(DEFAULT_MILESTONE_LABEL)
  })

  it('falls back to the default for values that do not match any tier', () => {
    // Between thresholds: derive a probe strictly between two adjacent
    // tiers so the assertion stays valid if a future slice retunes the
    // tier ladder. The exact-match contract guarantees this collapses
    // to the default regardless of which tiers exist.
    const between =
      MILESTONE_TIERS[0].threshold + 1 < MILESTONE_TIERS[1].threshold
        ? MILESTONE_TIERS[0].threshold + 1
        : Math.floor(
            (MILESTONE_TIERS[0].threshold + MILESTONE_TIERS[1].threshold) /
              2,
          )
    expect(milestoneTierLabel(between)).toBe(DEFAULT_MILESTONE_LABEL)
    // Above the largest tier: the highest threshold + 1 is guaranteed
    // not to match any tier.
    const aboveMax =
      Math.max(...MILESTONE_TIERS.map((t) => t.threshold)) + 1
    expect(milestoneTierLabel(aboveMax)).toBe(DEFAULT_MILESTONE_LABEL)
  })
})

describe('milestoneTierColor', () => {
  it('returns the exact color for every threshold', () => {
    for (const tier of MILESTONE_TIERS) {
      expect(milestoneTierColor(tier.threshold)).toBe(tier.color)
    }
  })

  it('falls back to the default color for values below the smallest tier', () => {
    expect(milestoneTierColor(0)).toBe(DEFAULT_MILESTONE_COLOR)
    expect(milestoneTierColor(3)).toBe(DEFAULT_MILESTONE_COLOR)
  })

  it('falls back to the default color for between-tier and above-max values', () => {
    // Derive probes from the MILESTONE_TIERS table so the assertion
    // stays valid if a future slice retunes the ladder.
    const between =
      MILESTONE_TIERS[0].threshold + 1 < MILESTONE_TIERS[1].threshold
        ? MILESTONE_TIERS[0].threshold + 1
        : Math.floor(
            (MILESTONE_TIERS[0].threshold + MILESTONE_TIERS[1].threshold) /
              2,
          )
    expect(milestoneTierColor(between)).toBe(DEFAULT_MILESTONE_COLOR)
    const aboveMax =
      Math.max(...MILESTONE_TIERS.map((t) => t.threshold)) + 1
    expect(milestoneTierColor(aboveMax)).toBe(DEFAULT_MILESTONE_COLOR)
  })

  it('default color is a valid hex string', () => {
    expect(DEFAULT_MILESTONE_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})
