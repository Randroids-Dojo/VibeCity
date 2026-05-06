import { describe, it, expect } from 'vitest'
import {
  SimSpeedSchema,
  TaxRatesSchema,
  SimStateSchema,
  EMPTY_SIM_STATE,
  DEFAULT_SIM_SPEED,
  DEFAULT_TAX_RATES,
  ZoneKindSchema,
  ZoneDensitySchema,
  ZoneCellSchema,
  ZonesBucketSchema,
  EMPTY_ZONES_BUCKET,
  zoneCellKey,
  type SimSpeed,
  type TaxRates,
  type SimState,
  type ZonesBucket,
  type ZoneCell,
} from '@/lib/sim/state'

describe('SimSpeedSchema', () => {
  it('accepts the four canonical speeds', () => {
    expect(SimSpeedSchema.safeParse(0).success).toBe(true)
    expect(SimSpeedSchema.safeParse(1).success).toBe(true)
    expect(SimSpeedSchema.safeParse(2).success).toBe(true)
    expect(SimSpeedSchema.safeParse(4).success).toBe(true)
  })

  it('rejects 3 (would violate Q-011 doubling cadence)', () => {
    expect(SimSpeedSchema.safeParse(3).success).toBe(false)
  })

  it('rejects 8 (above v1 cap)', () => {
    expect(SimSpeedSchema.safeParse(8).success).toBe(false)
  })

  it('rejects negative speeds', () => {
    expect(SimSpeedSchema.safeParse(-1).success).toBe(false)
  })

  it('rejects non-integer speeds', () => {
    expect(SimSpeedSchema.safeParse(1.5).success).toBe(false)
  })
})

describe('DEFAULT_SIM_SPEED', () => {
  it('is 1x', () => {
    expect(DEFAULT_SIM_SPEED).toBe(1)
  })

  it('is in the SimSpeed union', () => {
    const _typecheck: SimSpeed = DEFAULT_SIM_SPEED
    expect(SimSpeedSchema.safeParse(_typecheck).success).toBe(true)
  })
})

describe('TaxRatesSchema', () => {
  it('accepts the default rates', () => {
    expect(TaxRatesSchema.safeParse(DEFAULT_TAX_RATES).success).toBe(true)
  })

  it('accepts zero rates', () => {
    const rates: TaxRates = { residential: 0, commercial: 0, industrial: 0 }
    expect(TaxRatesSchema.safeParse(rates).success).toBe(true)
  })

  it('accepts rates at the cap of 1.0 (100%)', () => {
    const rates: TaxRates = { residential: 1, commercial: 1, industrial: 1 }
    expect(TaxRatesSchema.safeParse(rates).success).toBe(true)
  })

  it('rejects rates above 1.0', () => {
    const rates = { residential: 1.5, commercial: 0.07, industrial: 0.05 }
    expect(TaxRatesSchema.safeParse(rates).success).toBe(false)
  })

  it('rejects negative rates', () => {
    const rates = { residential: -0.1, commercial: 0.07, industrial: 0.05 }
    expect(TaxRatesSchema.safeParse(rates).success).toBe(false)
  })

  it('rejects extra fields (strict)', () => {
    const rates = {
      residential: 0.07,
      commercial: 0.07,
      industrial: 0.05,
      tourism: 0.1,
    }
    expect(TaxRatesSchema.safeParse(rates).success).toBe(false)
  })
})

describe('DEFAULT_TAX_RATES', () => {
  it('matches REQ-095 economy slice defaults', () => {
    expect(DEFAULT_TAX_RATES.residential).toBeCloseTo(0.07, 5)
    expect(DEFAULT_TAX_RATES.commercial).toBeCloseTo(0.07, 5)
    expect(DEFAULT_TAX_RATES.industrial).toBeCloseTo(0.05, 5)
  })

  it('passes TaxRatesSchema', () => {
    expect(TaxRatesSchema.safeParse(DEFAULT_TAX_RATES).success).toBe(true)
  })
})

describe('SimStateSchema', () => {
  it('accepts EMPTY_SIM_STATE', () => {
    expect(SimStateSchema.safeParse(EMPTY_SIM_STATE).success).toBe(true)
  })

  it('rejects extra fields at the top level (strict)', () => {
    const state = { ...EMPTY_SIM_STATE, futureLayer: {} }
    expect(SimStateSchema.safeParse(state).success).toBe(false)
  })

  it('rejects negative tick', () => {
    const state = { ...EMPTY_SIM_STATE, tick: -1 }
    expect(SimStateSchema.safeParse(state).success).toBe(false)
  })

  it('rejects negative simTimeMs', () => {
    const state = { ...EMPTY_SIM_STATE, simTimeMs: -1 }
    expect(SimStateSchema.safeParse(state).success).toBe(false)
  })

  it('rejects non-integer tick', () => {
    const state = { ...EMPTY_SIM_STATE, tick: 1.5 }
    expect(SimStateSchema.safeParse(state).success).toBe(false)
  })

  it('accepts populated layer buckets (passthrough until layer slice ships)', () => {
    const state: SimState = {
      ...EMPTY_SIM_STATE,
      population: { totalPopulation: 42 },
    }
    expect(SimStateSchema.safeParse(state).success).toBe(true)
  })
})

describe('EMPTY_SIM_STATE', () => {
  it('has tick 0', () => {
    expect(EMPTY_SIM_STATE.tick).toBe(0)
  })

  it('has simTimeMs 0', () => {
    expect(EMPTY_SIM_STATE.simTimeMs).toBe(0)
  })

  it('starts at 1x speed (not paused)', () => {
    expect(EMPTY_SIM_STATE.speed).toBe(1)
  })

  it('has the default tax rates', () => {
    expect(EMPTY_SIM_STATE.taxRates).toEqual(DEFAULT_TAX_RATES)
  })

  it('has every passthrough per-layer bucket as an empty object', () => {
    expect(EMPTY_SIM_STATE.population).toEqual({})
    expect(EMPTY_SIM_STATE.power).toEqual({})
    expect(EMPTY_SIM_STATE.water).toEqual({})
    expect(EMPTY_SIM_STATE.economy).toEqual({})
    expect(EMPTY_SIM_STATE.services).toEqual({})
    expect(EMPTY_SIM_STATE.disasters).toEqual({})
  })

  it('has zones bucket initialized to empty cells map (REQ-080 slice 1 strict shape)', () => {
    expect(EMPTY_SIM_STATE.zones).toEqual({ cells: {} })
  })

  it('is frozen at the top level', () => {
    expect(Object.isFrozen(EMPTY_SIM_STATE)).toBe(true)
  })

  it('throws on attempted top-level mutation in strict mode', () => {
    'use strict'
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(EMPTY_SIM_STATE as any).tick = 99
    }).toThrow()
  })
})

describe('ZoneKindSchema (REQ-080 slice 1)', () => {
  it('accepts the three v1 zone kinds', () => {
    expect(ZoneKindSchema.safeParse('residential').success).toBe(true)
    expect(ZoneKindSchema.safeParse('commercial').success).toBe(true)
    expect(ZoneKindSchema.safeParse('industrial').success).toBe(true)
  })

  it('rejects an unknown zone kind', () => {
    expect(ZoneKindSchema.safeParse('agricultural').success).toBe(false)
  })
})

describe('ZoneDensitySchema (REQ-080 slice 1)', () => {
  it('accepts 0 (empty zoned cell, ungrown)', () => {
    expect(ZoneDensitySchema.safeParse(0).success).toBe(true)
  })

  it('accepts 1, 2, 3 (low / medium / high density)', () => {
    expect(ZoneDensitySchema.safeParse(1).success).toBe(true)
    expect(ZoneDensitySchema.safeParse(2).success).toBe(true)
    expect(ZoneDensitySchema.safeParse(3).success).toBe(true)
  })

  it('rejects density 4 (above v1 cap)', () => {
    expect(ZoneDensitySchema.safeParse(4).success).toBe(false)
  })

  it('rejects negative density', () => {
    expect(ZoneDensitySchema.safeParse(-1).success).toBe(false)
  })

  it('rejects non-integer density', () => {
    expect(ZoneDensitySchema.safeParse(1.5).success).toBe(false)
  })
})

describe('ZoneCellSchema (REQ-080 slice 1)', () => {
  it('accepts a residential cell at density 0', () => {
    const cell: ZoneCell = { kind: 'residential', density: 0 }
    expect(ZoneCellSchema.safeParse(cell).success).toBe(true)
  })

  it('rejects extra fields (strict)', () => {
    const cell = { kind: 'residential', density: 0, color: '#fff' }
    expect(ZoneCellSchema.safeParse(cell).success).toBe(false)
  })

  it('rejects missing kind', () => {
    const cell = { density: 0 }
    expect(ZoneCellSchema.safeParse(cell).success).toBe(false)
  })

  it('rejects missing density', () => {
    const cell = { kind: 'residential' }
    expect(ZoneCellSchema.safeParse(cell).success).toBe(false)
  })
})

describe('ZonesBucketSchema (REQ-080 slice 1)', () => {
  it('accepts the empty bucket', () => {
    expect(ZonesBucketSchema.safeParse(EMPTY_ZONES_BUCKET).success).toBe(true)
  })

  it('accepts a populated bucket', () => {
    const bucket: ZonesBucket = {
      cells: {
        '0,0': { kind: 'residential', density: 0 },
        '1,2': { kind: 'commercial', density: 2 },
      },
    }
    expect(ZonesBucketSchema.safeParse(bucket).success).toBe(true)
  })

  it('rejects extra top-level fields (strict)', () => {
    const bucket = { cells: {}, totalCells: 0 }
    expect(ZonesBucketSchema.safeParse(bucket).success).toBe(false)
  })

  it('rejects a cell with bad kind', () => {
    const bucket = { cells: { '0,0': { kind: 'farmland', density: 0 } } }
    expect(ZonesBucketSchema.safeParse(bucket).success).toBe(false)
  })
})

describe('EMPTY_ZONES_BUCKET', () => {
  it('is shaped { cells: {} }', () => {
    expect(EMPTY_ZONES_BUCKET).toEqual({ cells: {} })
  })

  it('passes ZonesBucketSchema', () => {
    expect(ZonesBucketSchema.safeParse(EMPTY_ZONES_BUCKET).success).toBe(true)
  })

  it('is frozen at the top level', () => {
    expect(Object.isFrozen(EMPTY_ZONES_BUCKET)).toBe(true)
  })
})

describe('zoneCellKey', () => {
  it('composes "row,col"', () => {
    expect(zoneCellKey(3, 4)).toBe('3,4')
  })

  it('handles zero', () => {
    expect(zoneCellKey(0, 0)).toBe('0,0')
  })

  it('handles negative coordinates', () => {
    expect(zoneCellKey(-2, 5)).toBe('-2,5')
  })

  it('matches the streetCellSet / buildingCellSet convention exactly', () => {
    // The existing helpers use `${row},${col}`. zoneCellKey must
    // match so future zone-vs-piece collision checks can compare
    // string keys directly.
    const row = 7
    const col = 3
    const inline = `${row},${col}`
    expect(zoneCellKey(row, col)).toBe(inline)
  })
})
