import { describe, it, expect } from 'vitest'
import {
  BUILDING_LIT_WINDOW_HEX_NIGHT,
  BUILDING_LIT_WINDOW_INTENSITY_NIGHT,
  DAY_NIGHT_CYCLE_TICKS,
  STREETLAMP_HEX_NIGHT,
  STREETLAMP_INTENSITY_NIGHT,
  TIME_OF_DAY_PALETTE,
  DAY_ROLLOVER_FLASH_TICKS,
  cityDayNumber,
  dayRolloverFlashing,
  resolveTimeOfDay,
  zoneEmissiveHex,
  zoneEmissiveIntensity,
  type TimeOfDay,
} from '@/app/[slug]/timeOfDay'
import type { CityMood } from '@/lib/schemas'

describe('resolveTimeOfDay (REQ-088 slice 2)', () => {
  it('defaults to day on undefined mood', () => {
    expect(resolveTimeOfDay(undefined)).toBe('day')
  })

  it('defaults to day on null mood', () => {
    expect(resolveTimeOfDay(null)).toBe('day')
  })

  it('defaults to day on mood with no timeOfDay field', () => {
    const mood: CityMood = {}
    expect(resolveTimeOfDay(mood)).toBe('day')
  })

  it('returns day when mood.timeOfDay is "day"', () => {
    expect(resolveTimeOfDay({ timeOfDay: 'day' })).toBe('day')
  })

  it('returns night when mood.timeOfDay is "night"', () => {
    expect(resolveTimeOfDay({ timeOfDay: 'night' })).toBe('night')
  })

  it('falls back to day on an unknown timeOfDay value', () => {
    expect(resolveTimeOfDay({ timeOfDay: 'tuesday' })).toBe('day')
  })

  describe('auto cycle (mass-appeal slice 3)', () => {
    it('returns day in the first half of the cycle', () => {
      expect(resolveTimeOfDay({ timeOfDay: 'auto' }, 0)).toBe('day')
      expect(
        resolveTimeOfDay(
          { timeOfDay: 'auto' },
          Math.floor(DAY_NIGHT_CYCLE_TICKS / 2) - 1,
        ),
      ).toBe('day')
    })

    it('returns night in the second half of the cycle', () => {
      expect(
        resolveTimeOfDay(
          { timeOfDay: 'auto' },
          Math.floor(DAY_NIGHT_CYCLE_TICKS / 2),
        ),
      ).toBe('night')
      expect(
        resolveTimeOfDay({ timeOfDay: 'auto' }, DAY_NIGHT_CYCLE_TICKS - 1),
      ).toBe('night')
    })

    it('wraps around at the cycle boundary', () => {
      expect(
        resolveTimeOfDay({ timeOfDay: 'auto' }, DAY_NIGHT_CYCLE_TICKS),
      ).toBe('day')
      expect(
        resolveTimeOfDay(
          { timeOfDay: 'auto' },
          DAY_NIGHT_CYCLE_TICKS + Math.floor(DAY_NIGHT_CYCLE_TICKS / 2),
        ),
      ).toBe('night')
    })

    it('handles negative ticks via positive-modulo wrap (tick=-5 wraps to phase 235 -> night)', () => {
      // (-5 % 240) === -5 in JS; the inner ((-5 % 240) + 240) % 240
      // wraps to 235, which sits in the night half of the cycle.
      expect(resolveTimeOfDay({ timeOfDay: 'auto' }, -5)).toBe('night')
      // tick=-130 wraps to (-130 + 240)=110, which sits in the day
      // half. Confirms the wrap is positive across both halves.
      expect(resolveTimeOfDay({ timeOfDay: 'auto' }, -130)).toBe('day')
    })

    it('default tick=0 returns day for auto mode', () => {
      expect(resolveTimeOfDay({ timeOfDay: 'auto' })).toBe('day')
    })
  })
})

describe('TIME_OF_DAY_PALETTE', () => {
  it('day sky is lighter than night sky', () => {
    expect(TIME_OF_DAY_PALETTE.day.skyHex).toBeGreaterThan(
      TIME_OF_DAY_PALETTE.night.skyHex,
    )
  })

  it('day ground is brighter than night ground', () => {
    expect(TIME_OF_DAY_PALETTE.day.groundHex).toBeGreaterThan(
      TIME_OF_DAY_PALETTE.night.groundHex,
    )
  })

  it('day sun is brighter than night sun', () => {
    expect(TIME_OF_DAY_PALETTE.day.sunIntensity).toBeGreaterThan(
      TIME_OF_DAY_PALETTE.night.sunIntensity,
    )
  })

  it('day ambient is brighter than night ambient', () => {
    expect(TIME_OF_DAY_PALETTE.day.ambientIntensity).toBeGreaterThan(
      TIME_OF_DAY_PALETTE.night.ambientIntensity,
    )
  })

  it('night sun is greater than 0 (moonlight)', () => {
    expect(TIME_OF_DAY_PALETTE.night.sunIntensity).toBeGreaterThan(0)
  })

  it('all intensities are non-negative', () => {
    for (const mode of Object.values(TIME_OF_DAY_PALETTE)) {
      expect(mode.sunIntensity).toBeGreaterThanOrEqual(0)
      expect(mode.ambientIntensity).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('zoneEmissiveHex', () => {
  it('day mode powered residential is unlit (no emissive)', () => {
    expect(zoneEmissiveHex('day', 'residential', 'powered')).toBe(0)
  })

  it('day mode brownout has the dark-yellow warning tint', () => {
    expect(zoneEmissiveHex('day', 'residential', 'brownout')).toBe(0x222200)
  })

  it('day mode unpowered is unlit', () => {
    expect(zoneEmissiveHex('day', 'residential', 'unpowered')).toBe(0)
  })

  it('night mode unpowered residential is fully dark', () => {
    expect(zoneEmissiveHex('night', 'residential', 'unpowered')).toBe(0)
  })

  it('night mode powered residential is warm (orange-ish)', () => {
    const hex = zoneEmissiveHex('night', 'residential', 'powered')
    // Red channel should be the dominant component for warm color.
    const r = (hex >> 16) & 0xff
    const g = (hex >> 8) & 0xff
    const b = hex & 0xff
    expect(r).toBeGreaterThan(b)
    expect(r).toBeGreaterThan(0x80)
  })

  it('night mode powered commercial is cool (blue-ish)', () => {
    const hex = zoneEmissiveHex('night', 'commercial', 'powered')
    const r = (hex >> 16) & 0xff
    const b = hex & 0xff
    // Blue channel should match or exceed red for cool color.
    expect(b).toBeGreaterThanOrEqual(r)
  })

  it('night mode powered industrial is non-zero', () => {
    expect(zoneEmissiveHex('night', 'industrial', 'powered')).toBeGreaterThan(0)
  })

  it('night mode brownout is dim warm', () => {
    expect(zoneEmissiveHex('night', 'residential', 'brownout')).toBeGreaterThan(
      0,
    )
    expect(zoneEmissiveHex('night', 'residential', 'brownout')).toBeLessThan(
      zoneEmissiveHex('night', 'residential', 'powered'),
    )
  })
})

describe('zoneEmissiveIntensity', () => {
  it('day mode powered is 0 (no glow during the day)', () => {
    expect(zoneEmissiveIntensity('day', 'powered')).toBe(0)
  })

  it('day mode brownout has full intensity for the warning tint', () => {
    expect(zoneEmissiveIntensity('day', 'brownout')).toBe(1.0)
  })

  it('day mode unpowered is 0', () => {
    expect(zoneEmissiveIntensity('day', 'unpowered')).toBe(0)
  })

  it('night mode powered intensity exceeds 1.0 (bright glow)', () => {
    expect(zoneEmissiveIntensity('night', 'powered')).toBeGreaterThan(1.0)
  })

  it('night mode brownout is dimmer than powered', () => {
    expect(zoneEmissiveIntensity('night', 'brownout')).toBeLessThan(
      zoneEmissiveIntensity('night', 'powered'),
    )
  })

  it('night mode unpowered is 0 (cell stays dark)', () => {
    expect(zoneEmissiveIntensity('night', 'unpowered')).toBe(0)
  })

  it('every (mode, status) combination returns a non-negative finite number', () => {
    const modes: TimeOfDay[] = ['day', 'night']
    const statuses = ['powered', 'brownout', 'unpowered'] as const
    for (const m of modes) {
      for (const s of statuses) {
        const v = zoneEmissiveIntensity(m, s)
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('lit-window night-ambience constants', () => {
  it('building lit-window emissive is a warm-amber hex with positive intensity', () => {
    expect(BUILDING_LIT_WINDOW_HEX_NIGHT).toBeGreaterThan(0)
    expect(BUILDING_LIT_WINDOW_INTENSITY_NIGHT).toBeGreaterThan(0)
  })

  it('streetlamp night emissive is bright enough to read against the night palette', () => {
    expect(STREETLAMP_HEX_NIGHT).toBeGreaterThan(0)
    expect(STREETLAMP_INTENSITY_NIGHT).toBeGreaterThan(
      BUILDING_LIT_WINDOW_INTENSITY_NIGHT,
    )
  })
})


describe('cityDayNumber (mass-appeal slice 5)', () => {
  it('starts on Day 1 at tick 0', () => {
    expect(cityDayNumber(0)).toBe(1)
  })

  it('stays on Day 1 across the first cycle', () => {
    expect(cityDayNumber(1)).toBe(1)
    expect(cityDayNumber(DAY_NIGHT_CYCLE_TICKS - 1)).toBe(1)
  })

  it('ticks to Day 2 at the first cycle boundary', () => {
    expect(cityDayNumber(DAY_NIGHT_CYCLE_TICKS)).toBe(2)
  })

  it('advances one day per DAY_NIGHT_CYCLE_TICKS span', () => {
    expect(cityDayNumber(DAY_NIGHT_CYCLE_TICKS * 5 - 1)).toBe(5)
    expect(cityDayNumber(DAY_NIGHT_CYCLE_TICKS * 5)).toBe(6)
    expect(cityDayNumber(DAY_NIGHT_CYCLE_TICKS * 100)).toBe(101)
  })

  it('clamps to Day 1 on negative or non-finite tick', () => {
    expect(cityDayNumber(-1)).toBe(1)
    expect(cityDayNumber(-DAY_NIGHT_CYCLE_TICKS * 3)).toBe(1)
    expect(cityDayNumber(Number.NaN)).toBe(1)
    expect(cityDayNumber(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('dayRolloverFlashing (mass-appeal slice 5 follow-on)', () => {
  it('does not flash on tick 0 (city just mounted, no rollover)', () => {
    expect(dayRolloverFlashing(0)).toBe(false)
  })

  it('does not flash anywhere inside Day 1', () => {
    expect(dayRolloverFlashing(1)).toBe(false)
    expect(dayRolloverFlashing(DAY_NIGHT_CYCLE_TICKS - 1)).toBe(false)
  })

  it('flashes on the first tick of Day 2', () => {
    expect(dayRolloverFlashing(DAY_NIGHT_CYCLE_TICKS)).toBe(true)
  })

  it('flashes through the full DAY_ROLLOVER_FLASH_TICKS window', () => {
    for (let i = 0; i < DAY_ROLLOVER_FLASH_TICKS; i++) {
      expect(dayRolloverFlashing(DAY_NIGHT_CYCLE_TICKS + i)).toBe(true)
    }
  })

  it('stops flashing once the window expires', () => {
    expect(
      dayRolloverFlashing(DAY_NIGHT_CYCLE_TICKS + DAY_ROLLOVER_FLASH_TICKS),
    ).toBe(false)
    expect(
      dayRolloverFlashing(
        DAY_NIGHT_CYCLE_TICKS + DAY_ROLLOVER_FLASH_TICKS + 1,
      ),
    ).toBe(false)
  })

  it('flashes again at every subsequent day boundary', () => {
    for (let day = 2; day <= 10; day++) {
      const boundary = (day - 1) * DAY_NIGHT_CYCLE_TICKS
      expect(dayRolloverFlashing(boundary)).toBe(true)
      expect(
        dayRolloverFlashing(boundary + DAY_ROLLOVER_FLASH_TICKS - 1),
      ).toBe(true)
      expect(dayRolloverFlashing(boundary + DAY_ROLLOVER_FLASH_TICKS)).toBe(
        false,
      )
    }
  })

  it('returns false for negative or non-finite ticks', () => {
    expect(dayRolloverFlashing(-1)).toBe(false)
    expect(dayRolloverFlashing(-DAY_NIGHT_CYCLE_TICKS)).toBe(false)
    expect(dayRolloverFlashing(Number.NaN)).toBe(false)
    expect(dayRolloverFlashing(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('DAY_ROLLOVER_FLASH_TICKS is positive and well below the cycle length', () => {
    expect(DAY_ROLLOVER_FLASH_TICKS).toBeGreaterThan(0)
    expect(DAY_ROLLOVER_FLASH_TICKS).toBeLessThan(DAY_NIGHT_CYCLE_TICKS / 2)
  })
})
