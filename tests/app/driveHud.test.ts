import { describe, expect, it } from 'vitest'
import {
  COMPASS_DIRECTIONS,
  HUD_BRAKE_COLOR,
  HUD_BRAKE_LABEL,
  HUD_CITY_VALIDITY_LABEL,
  HUD_COMPASS_LABEL,
  HUD_CONTROLS_HINT_LINES,
  HUD_SPEED_DIRECTION_LABEL,
  HUD_SPEED_LABEL,
  HUD_SPEED_UNIT,
  HUD_SURFACE_LABEL,
  SPEED_DIRECTION_THRESHOLD,
  cityValidity,
  formatSpeed,
  headingToCompass,
  speedDirection,
  speedFraction,
  surfaceState,
  type CityValidity,
  type CompassDirection,
  type SpeedDirection,
  type SurfaceState,
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

describe('surfaceState (REQ-030, REQ-054, REQ-066)', () => {
  it('returns street when on a placed street piece and not on a building', () => {
    expect(surfaceState(true, false)).toBe('street')
  })

  it('returns off-street when no wheel touches a placed piece', () => {
    expect(surfaceState(false, false)).toBe('off-street')
  })

  it('returns building when the car is on a building cell', () => {
    expect(surfaceState(true, true)).toBe('building')
  })

  it('prefers building when both off-street and building flags are active', () => {
    // A building cell is also off-street; the building cap is tighter
    // (REQ-030 cap < REQ-054 cap) so the more aggressive penalty wins.
    expect(surfaceState(false, true)).toBe('building')
  })

  it('is deterministic: matrix coverage of all four flag pairs', () => {
    expect(surfaceState(true, false)).toBe('street')
    expect(surfaceState(false, false)).toBe('off-street')
    expect(surfaceState(true, true)).toBe('building')
    expect(surfaceState(false, true)).toBe('building')
  })
})

describe('HUD_SURFACE_LABEL', () => {
  it('emits an empty label for the on-street default so the HUD stays silent', () => {
    expect(HUD_SURFACE_LABEL.street).toBe('')
  })

  it('emits a non-empty label for off-street so the player sees the cap engage', () => {
    expect(HUD_SURFACE_LABEL['off-street'].length).toBeGreaterThan(0)
    expect(HUD_SURFACE_LABEL['off-street']).toBe(
      HUD_SURFACE_LABEL['off-street'].trim(),
    )
  })

  it('emits a non-empty label for building so the player knows it was a building hit', () => {
    expect(HUD_SURFACE_LABEL.building.length).toBeGreaterThan(0)
    expect(HUD_SURFACE_LABEL.building).toBe(HUD_SURFACE_LABEL.building.trim())
  })

  it('emits distinct labels for off-street and building so the player can tell them apart', () => {
    expect(HUD_SURFACE_LABEL['off-street']).not.toBe(HUD_SURFACE_LABEL.building)
  })

  it('mentions the word street in the off-street label', () => {
    expect(HUD_SURFACE_LABEL['off-street'].toLowerCase()).toContain('street')
  })

  it('mentions the word building in the building label', () => {
    expect(HUD_SURFACE_LABEL.building.toLowerCase()).toContain('building')
  })

  it('covers every SurfaceState union member', () => {
    const states: SurfaceState[] = ['street', 'off-street', 'building']
    for (const state of states) {
      expect(HUD_SURFACE_LABEL).toHaveProperty(state)
      expect(typeof HUD_SURFACE_LABEL[state]).toBe('string')
    }
  })
})

describe('cityValidity (REQ-066, REQ-019, REQ-064)', () => {
  it('returns closed for zero unmatched ports', () => {
    expect(cityValidity(0)).toBe('closed')
  })

  it('returns open for one unmatched port', () => {
    expect(cityValidity(1)).toBe('open')
  })

  it('returns open for many unmatched ports', () => {
    expect(cityValidity(7)).toBe('open')
  })

  it('returns closed for negative counts (defensive against tuning bugs)', () => {
    expect(cityValidity(-1)).toBe('closed')
    expect(cityValidity(-100)).toBe('closed')
  })

  it('returns closed for non-finite inputs (defensive against NaN leaks)', () => {
    expect(cityValidity(Number.NaN)).toBe('closed')
    expect(cityValidity(Number.POSITIVE_INFINITY)).toBe('closed')
    expect(cityValidity(Number.NEGATIVE_INFINITY)).toBe('closed')
  })

  it('is deterministic across the boundary at zero', () => {
    expect(cityValidity(0)).toBe('closed')
    expect(cityValidity(0.5)).toBe('open')
    expect(cityValidity(1)).toBe('open')
  })
})

describe('HUD_CITY_VALIDITY_LABEL', () => {
  it('emits an empty label for the closed default so the HUD stays silent on a closed city', () => {
    expect(HUD_CITY_VALIDITY_LABEL.closed).toBe('')
  })

  it('emits a non-empty trimmed label for open so the player sees the warning', () => {
    expect(HUD_CITY_VALIDITY_LABEL.open.length).toBeGreaterThan(0)
    expect(HUD_CITY_VALIDITY_LABEL.open).toBe(HUD_CITY_VALIDITY_LABEL.open.trim())
  })

  it('mentions the word ends or open so the player understands the warning', () => {
    const label = HUD_CITY_VALIDITY_LABEL.open.toLowerCase()
    expect(label.includes('end') || label.includes('open')).toBe(true)
  })

  it('covers every CityValidity union member', () => {
    const states: CityValidity[] = ['closed', 'open']
    for (const state of states) {
      expect(HUD_CITY_VALIDITY_LABEL).toHaveProperty(state)
      expect(typeof HUD_CITY_VALIDITY_LABEL[state]).toBe('string')
    }
  })

  it('emits a label distinct from the surface label vocabulary so the HUD reads as two channels', () => {
    expect(HUD_CITY_VALIDITY_LABEL.open).not.toBe(HUD_SURFACE_LABEL['off-street'])
    expect(HUD_CITY_VALIDITY_LABEL.open).not.toBe(HUD_SURFACE_LABEL.building)
  })
})

describe('HUD_SPEED_DIRECTION_LABEL (REQ-066)', () => {
  it('emits an empty label for the idle default so the HUD stays silent at rest', () => {
    expect(HUD_SPEED_DIRECTION_LABEL.idle).toBe('')
  })

  it('emits an empty label for forward driving so the HUD does not crowd the readout when the speed bar already conveys the state', () => {
    expect(HUD_SPEED_DIRECTION_LABEL.forward).toBe('')
  })

  it('emits a non-empty trimmed label for reverse so the player sees the disambiguation', () => {
    expect(HUD_SPEED_DIRECTION_LABEL.reverse.length).toBeGreaterThan(0)
    expect(HUD_SPEED_DIRECTION_LABEL.reverse).toBe(
      HUD_SPEED_DIRECTION_LABEL.reverse.trim(),
    )
  })

  it('mentions the word reverse in the reverse label so a player understands the cue', () => {
    expect(HUD_SPEED_DIRECTION_LABEL.reverse.toLowerCase()).toContain('reverse')
  })

  it('covers every SpeedDirection union member', () => {
    const states: SpeedDirection[] = ['idle', 'forward', 'reverse']
    for (const state of states) {
      expect(HUD_SPEED_DIRECTION_LABEL).toHaveProperty(state)
      expect(typeof HUD_SPEED_DIRECTION_LABEL[state]).toBe('string')
    }
  })

  it('emits a label distinct from the surface and city-validity vocabulary so the HUD reads as separate channels', () => {
    expect(HUD_SPEED_DIRECTION_LABEL.reverse).not.toBe(
      HUD_SURFACE_LABEL['off-street'],
    )
    expect(HUD_SPEED_DIRECTION_LABEL.reverse).not.toBe(HUD_SURFACE_LABEL.building)
    expect(HUD_SPEED_DIRECTION_LABEL.reverse).not.toBe(
      HUD_CITY_VALIDITY_LABEL.open,
    )
  })
})

describe('COMPASS_DIRECTIONS (REQ-066)', () => {
  it('lists exactly eight directions', () => {
    expect(COMPASS_DIRECTIONS).toHaveLength(8)
  })

  it('starts at north and walks clockwise through the eight cardinals', () => {
    expect(COMPASS_DIRECTIONS).toEqual([
      'N',
      'NE',
      'E',
      'SE',
      'S',
      'SW',
      'W',
      'NW',
    ])
  })

  it('contains every CompassDirection union member exactly once', () => {
    const set = new Set<CompassDirection>(COMPASS_DIRECTIONS)
    expect(set.size).toBe(COMPASS_DIRECTIONS.length)
    const members: CompassDirection[] = [
      'N',
      'NE',
      'E',
      'SE',
      'S',
      'SW',
      'W',
      'NW',
    ]
    for (const member of members) {
      expect(set.has(member)).toBe(true)
    }
  })
})

describe('headingToCompass (REQ-066)', () => {
  // Heading convention from `applyDriveStep`: 0 radians = car points
  // north; forward at heading h is `(sin h, -cos h)`. So +pi/2 = east,
  // pi = south, -pi/2 (or +3pi/2) = west.
  it('reads N at heading 0', () => {
    expect(headingToCompass(0)).toBe('N')
  })

  it('reads E at heading +pi/2', () => {
    expect(headingToCompass(Math.PI / 2)).toBe('E')
  })

  it('reads S at heading +pi', () => {
    expect(headingToCompass(Math.PI)).toBe('S')
  })

  it('reads W at heading -pi/2', () => {
    expect(headingToCompass(-Math.PI / 2)).toBe('W')
  })

  it('reads NE at heading +pi/4', () => {
    expect(headingToCompass(Math.PI / 4)).toBe('NE')
  })

  it('reads SE at heading +3pi/4', () => {
    expect(headingToCompass((3 * Math.PI) / 4)).toBe('SE')
  })

  it('reads SW at heading -3pi/4', () => {
    expect(headingToCompass(-(3 * Math.PI) / 4)).toBe('SW')
  })

  it('reads NW at heading -pi/4', () => {
    expect(headingToCompass(-Math.PI / 4)).toBe('NW')
  })

  it('handles a heading slightly inside the N bin around the +pi/8 boundary', () => {
    const eps = 1e-6
    expect(headingToCompass(Math.PI / 8 - eps)).toBe('N')
    expect(headingToCompass(-Math.PI / 8 + eps)).toBe('N')
  })

  it('flips to NE just past the +pi/8 boundary', () => {
    expect(headingToCompass(Math.PI / 8 + 1e-6)).toBe('NE')
  })

  it('flips to NW just below the -pi/8 boundary', () => {
    expect(headingToCompass(-Math.PI / 8 - 1e-6)).toBe('NW')
  })

  it('reads N for headings just under +2pi (wrap-around)', () => {
    expect(headingToCompass(Math.PI * 2 - 1e-6)).toBe('N')
  })

  it('reads N for +2pi exactly (full wrap)', () => {
    expect(headingToCompass(Math.PI * 2)).toBe('N')
  })

  it('reads N for negative wrap-around at -2pi', () => {
    expect(headingToCompass(-Math.PI * 2)).toBe('N')
  })

  it('reads E for a heading equal to +pi/2 + 2pi (wrap invariant)', () => {
    expect(headingToCompass(Math.PI / 2 + Math.PI * 2)).toBe('E')
  })

  it('reads W for a heading equal to -pi/2 - 2pi (negative wrap invariant)', () => {
    expect(headingToCompass(-Math.PI / 2 - Math.PI * 2)).toBe('W')
  })

  it('returns N for non-finite headings (defensive against NaN leaks)', () => {
    expect(headingToCompass(Number.NaN)).toBe('N')
    expect(headingToCompass(Number.POSITIVE_INFINITY)).toBe('N')
    expect(headingToCompass(Number.NEGATIVE_INFINITY)).toBe('N')
  })

  it('produces every compass direction across a full sweep', () => {
    const seen = new Set<CompassDirection>()
    const STEP = Math.PI / 32
    for (let h = -Math.PI; h < Math.PI; h += STEP) {
      seen.add(headingToCompass(h))
    }
    expect(seen.size).toBe(8)
    for (const direction of COMPASS_DIRECTIONS) {
      expect(seen.has(direction)).toBe(true)
    }
  })

  it('is deterministic on the heading value', () => {
    const samples = [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 3]
    for (const heading of samples) {
      expect(headingToCompass(heading)).toBe(headingToCompass(heading))
    }
  })

  it('returns one of the eight compass directions for every finite heading', () => {
    const set = new Set<CompassDirection>(COMPASS_DIRECTIONS)
    for (let h = -10; h <= 10; h += 0.1) {
      expect(set.has(headingToCompass(h))).toBe(true)
    }
  })

  it('walks the bin clockwise as the heading increases through one full turn', () => {
    // Sample at the center of each 45deg bin and confirm the sequence
    // matches `COMPASS_DIRECTIONS` order.
    const QUARTER_PI = Math.PI / 4
    for (let i = 0; i < COMPASS_DIRECTIONS.length; i++) {
      const heading = i * QUARTER_PI
      expect(headingToCompass(heading)).toBe(COMPASS_DIRECTIONS[i])
    }
  })
})

describe('HUD_COMPASS_LABEL (REQ-066)', () => {
  it('emits a non-empty trimmed label for every compass direction', () => {
    for (const direction of COMPASS_DIRECTIONS) {
      const label = HUD_COMPASS_LABEL[direction]
      expect(label.length).toBeGreaterThan(0)
      expect(label).toBe(label.trim())
    }
  })

  it('uses the canonical one- or two-character compass abbreviations', () => {
    expect(HUD_COMPASS_LABEL.N).toBe('N')
    expect(HUD_COMPASS_LABEL.NE).toBe('NE')
    expect(HUD_COMPASS_LABEL.E).toBe('E')
    expect(HUD_COMPASS_LABEL.SE).toBe('SE')
    expect(HUD_COMPASS_LABEL.S).toBe('S')
    expect(HUD_COMPASS_LABEL.SW).toBe('SW')
    expect(HUD_COMPASS_LABEL.W).toBe('W')
    expect(HUD_COMPASS_LABEL.NW).toBe('NW')
  })

  it('emits eight pairwise distinct labels', () => {
    const labels = COMPASS_DIRECTIONS.map((d) => HUD_COMPASS_LABEL[d])
    const set = new Set(labels)
    expect(set.size).toBe(labels.length)
  })

  it('covers every CompassDirection union member', () => {
    const directions: CompassDirection[] = [
      'N',
      'NE',
      'E',
      'SE',
      'S',
      'SW',
      'W',
      'NW',
    ]
    for (const direction of directions) {
      expect(HUD_COMPASS_LABEL).toHaveProperty(direction)
      expect(typeof HUD_COMPASS_LABEL[direction]).toBe('string')
    }
  })

  it('emits labels distinct from the surface, speed-direction, and city-validity vocabulary', () => {
    for (const direction of COMPASS_DIRECTIONS) {
      const label = HUD_COMPASS_LABEL[direction]
      expect(label).not.toBe(HUD_SURFACE_LABEL['off-street'])
      expect(label).not.toBe(HUD_SURFACE_LABEL.building)
      expect(label).not.toBe(HUD_SPEED_DIRECTION_LABEL.reverse)
      expect(label).not.toBe(HUD_CITY_VALIDITY_LABEL.open)
    }
  })
})

describe('HUD_BRAKE_LABEL / HUD_BRAKE_COLOR (F-013 slice 1)', () => {
  it('label is non-empty and trimmed', () => {
    expect(HUD_BRAKE_LABEL.length).toBeGreaterThan(0)
    expect(HUD_BRAKE_LABEL.trim()).toBe(HUD_BRAKE_LABEL)
  })

  it('label is distinct from every other HUD label channel', () => {
    expect(HUD_BRAKE_LABEL).not.toBe(HUD_SURFACE_LABEL.street)
    expect(HUD_BRAKE_LABEL).not.toBe(HUD_SURFACE_LABEL['off-street'])
    expect(HUD_BRAKE_LABEL).not.toBe(HUD_SURFACE_LABEL.building)
    expect(HUD_BRAKE_LABEL).not.toBe(HUD_SPEED_DIRECTION_LABEL.reverse)
    expect(HUD_BRAKE_LABEL).not.toBe(HUD_SPEED_DIRECTION_LABEL.idle)
    expect(HUD_BRAKE_LABEL).not.toBe(HUD_SPEED_DIRECTION_LABEL.forward)
    expect(HUD_BRAKE_LABEL).not.toBe(HUD_CITY_VALIDITY_LABEL.open)
    expect(HUD_BRAKE_LABEL).not.toBe(HUD_CITY_VALIDITY_LABEL.closed)
    for (const dir of COMPASS_DIRECTIONS) {
      expect(HUD_BRAKE_LABEL).not.toBe(HUD_COMPASS_LABEL[dir])
    }
  })

  it('color is a non-empty hex string', () => {
    expect(HUD_BRAKE_COLOR.length).toBeGreaterThan(0)
    expect(HUD_BRAKE_COLOR.startsWith('#')).toBe(true)
  })

  it('color is distinct from the cool-sage compass and warm-tan day cues', () => {
    expect(HUD_BRAKE_COLOR).not.toBe('#a3c8a3')
    expect(HUD_BRAKE_COLOR).not.toBe('#cbb88a')
  })
})
