import { describe, expect, it } from 'vitest'
import {
  HUD_CONTROLS_HINT_LINES,
  HUD_SPEED_LABEL,
  HUD_SPEED_UNIT,
  SPEED_DIRECTION_THRESHOLD,
  formatSpeed,
  speedDirection,
  speedFraction,
} from '@/app/[slug]/driveHud'
import { DEFAULT_KEY_BINDINGS, MAX_SPEED } from '@/app/[slug]/driveControls'

/**
 * REQ-066 drive HUD: speed readout, speed bar fraction, controls hint.
 * The drive scene client renders the React overlays on top of these
 * helpers; the integration math is fully unit-testable here.
 */

describe('HUD_CONTROLS_HINT_LINES', () => {
  it('lists every default action plus the respawn and pause hints', () => {
    // Six rows: throttle, steerLeft, brake, steerRight, respawn, pause.
    expect(HUD_CONTROLS_HINT_LINES).toHaveLength(6)
  })

  it('mentions every action label from the default key bindings', () => {
    const text = HUD_CONTROLS_HINT_LINES.join(' ').toLowerCase()
    const actions = new Set(Object.values(DEFAULT_KEY_BINDINGS))
    if (actions.has('throttle')) expect(text).toContain('throttle')
    if (actions.has('brake')) expect(text).toContain('brake')
    if (actions.has('steerLeft')) expect(text).toContain('steer left')
    if (actions.has('steerRight')) expect(text).toContain('steer right')
  })

  it('mentions the W and A and S and D keys (REQ-034 default bindings)', () => {
    const text = HUD_CONTROLS_HINT_LINES.join(' ')
    expect(text).toContain('W')
    expect(text).toContain('A')
    expect(text).toContain('S')
    expect(text).toContain('D')
  })

  it('mentions the arrow key fallbacks (REQ-034 default bindings)', () => {
    const text = HUD_CONTROLS_HINT_LINES.join(' ')
    expect(text).toContain('Up')
    expect(text).toContain('Left')
    expect(text).toContain('Down')
    expect(text).toContain('Right')
  })

  it('mentions Esc for the pause toggle (REQ-039)', () => {
    const text = HUD_CONTROLS_HINT_LINES.join(' ')
    expect(text).toContain('Esc')
    expect(text.toLowerCase()).toContain('pause')
  })

  it('mentions R for respawn (REQ-067)', () => {
    const text = HUD_CONTROLS_HINT_LINES.join(' ')
    expect(text).toContain('R')
    expect(text.toLowerCase()).toContain('respawn')
  })

  it('emits non-empty trimmed strings on every line', () => {
    for (const line of HUD_CONTROLS_HINT_LINES) {
      expect(line.length).toBeGreaterThan(0)
      expect(line).toBe(line.trim())
    }
  })
})

describe('HUD_SPEED_LABEL and HUD_SPEED_UNIT', () => {
  it('exposes a non-empty speed label', () => {
    expect(HUD_SPEED_LABEL.length).toBeGreaterThan(0)
    expect(HUD_SPEED_LABEL).toBe(HUD_SPEED_LABEL.trim())
  })

  it('exposes a non-empty unit string distinct from real-world units', () => {
    // The integrator runs in world units per second; v1 is not
    // calibrated to km/h or mph so the label must not lie about that.
    expect(HUD_SPEED_UNIT.length).toBeGreaterThan(0)
    expect(HUD_SPEED_UNIT.toLowerCase()).not.toBe('mph')
    expect(HUD_SPEED_UNIT.toLowerCase()).not.toBe('km/h')
  })
})

describe('formatSpeed', () => {
  it('returns 0 at rest', () => {
    expect(formatSpeed(0)).toBe('0')
  })

  it('rounds positive forward speed to nearest integer', () => {
    expect(formatSpeed(0.4)).toBe('0')
    expect(formatSpeed(0.6)).toBe('1')
    expect(formatSpeed(12.49)).toBe('12')
    expect(formatSpeed(12.5)).toBe('13')
  })

  it('returns the magnitude for negative reverse speed', () => {
    expect(formatSpeed(-7)).toBe('7')
    expect(formatSpeed(-12.5)).toBe('13')
  })

  it('returns 0 for non-finite inputs', () => {
    expect(formatSpeed(Number.NaN)).toBe('0')
    expect(formatSpeed(Number.POSITIVE_INFINITY)).toBe('0')
    expect(formatSpeed(Number.NEGATIVE_INFINITY)).toBe('0')
  })

  it('handles MAX_SPEED without overflow', () => {
    expect(formatSpeed(MAX_SPEED)).toBe(Math.round(MAX_SPEED).toString())
  })
})

describe('speedFraction', () => {
  it('returns 0 at rest', () => {
    expect(speedFraction(0)).toBe(0)
  })

  it('returns 1 at MAX_SPEED', () => {
    expect(speedFraction(MAX_SPEED)).toBe(1)
  })

  it('returns 1 above MAX_SPEED (clamped)', () => {
    expect(speedFraction(MAX_SPEED * 2)).toBe(1)
  })

  it('returns 0.5 at half MAX_SPEED', () => {
    expect(speedFraction(MAX_SPEED / 2)).toBeCloseTo(0.5, 6)
  })

  it('uses the magnitude for reverse speed (so the bar fills both directions)', () => {
    expect(speedFraction(-MAX_SPEED / 4)).toBeCloseTo(0.25, 6)
    expect(speedFraction(-MAX_SPEED)).toBe(1)
  })

  it('returns 0 for non-finite speed inputs', () => {
    expect(speedFraction(Number.NaN)).toBe(0)
    expect(speedFraction(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('returns 0 when the maxSpeed override is non-positive or non-finite', () => {
    expect(speedFraction(5, 0)).toBe(0)
    expect(speedFraction(5, -1)).toBe(0)
    expect(speedFraction(5, Number.NaN)).toBe(0)
  })

  it('respects a custom maxSpeed override (REQ-040 future settings)', () => {
    expect(speedFraction(5, 10)).toBeCloseTo(0.5, 6)
    expect(speedFraction(20, 10)).toBe(1)
  })
})

describe('speedDirection', () => {
  it('reads idle at rest', () => {
    expect(speedDirection(0)).toBe('idle')
  })

  it('reads forward for positive speed above the threshold', () => {
    expect(speedDirection(SPEED_DIRECTION_THRESHOLD * 2)).toBe('forward')
    expect(speedDirection(MAX_SPEED)).toBe('forward')
  })

  it('reads reverse for negative speed below the negated threshold', () => {
    expect(speedDirection(-SPEED_DIRECTION_THRESHOLD * 2)).toBe('reverse')
    expect(speedDirection(-MAX_SPEED)).toBe('reverse')
  })

  it('reads idle inside the symmetric threshold band', () => {
    expect(speedDirection(SPEED_DIRECTION_THRESHOLD / 2)).toBe('idle')
    expect(speedDirection(-SPEED_DIRECTION_THRESHOLD / 2)).toBe('idle')
  })

  it('reads idle for non-finite inputs', () => {
    expect(speedDirection(Number.NaN)).toBe('idle')
    expect(speedDirection(Number.POSITIVE_INFINITY)).toBe('idle')
  })

  it('uses a positive symmetric threshold (REQ-066 stable HUD readout)', () => {
    expect(SPEED_DIRECTION_THRESHOLD).toBeGreaterThan(0)
  })
})
