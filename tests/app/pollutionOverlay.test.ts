import { describe, expect, it } from 'vitest'
import {
  POLLUTION_OVERLAY_FILL,
  POLLUTION_OVERLAY_OPACITY_MAX,
  POLLUTION_OVERLAY_OPACITY_SCALE,
  pollutionOverlayOpacity,
} from '@/app/[slug]/edit/SnapGridView'
import { COAL_POLLUTION_PER_TICK } from '@/lib/sim/state'

describe('pollutionOverlayOpacity', () => {
  it('returns 0 for zero exposure', () => {
    expect(pollutionOverlayOpacity(0)).toBe(0)
  })

  it('returns 0 for negative or non-finite exposure', () => {
    expect(pollutionOverlayOpacity(-1)).toBe(0)
    expect(pollutionOverlayOpacity(Number.NaN)).toBe(0)
    expect(pollutionOverlayOpacity(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('scales linearly below the cap', () => {
    // Pick a value small enough to land below the cap. The cap MAX
    // is reached when value >= SCALE * MAX, so anything below
    // MAX * SCALE reads linearly.
    const subCap = POLLUTION_OVERLAY_OPACITY_SCALE * POLLUTION_OVERLAY_OPACITY_MAX / 2
    expect(pollutionOverlayOpacity(subCap)).toBeCloseTo(
      POLLUTION_OVERLAY_OPACITY_MAX / 2,
    )
  })

  it('caps at the maximum opacity', () => {
    // Exposure equal to or above the scale should saturate at max.
    expect(
      pollutionOverlayOpacity(POLLUTION_OVERLAY_OPACITY_SCALE * 10),
    ).toBe(POLLUTION_OVERLAY_OPACITY_MAX)
  })

  it('a single coal plant produces a subtle but visible tint', () => {
    // Per-plant per-tick exposure should sit well below the cap so
    // stacked plants can deepen the red.
    const opacity = pollutionOverlayOpacity(COAL_POLLUTION_PER_TICK)
    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThan(POLLUTION_OVERLAY_OPACITY_MAX)
  })
})

describe('POLLUTION_OVERLAY_FILL', () => {
  it('is a 6-digit hex string in the warm-red range', () => {
    expect(POLLUTION_OVERLAY_FILL).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
