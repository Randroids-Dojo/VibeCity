import { describe, expect, it } from 'vitest'
import {
  HAPPINESS_HEATMAP_FILL_OPACITY,
  cellHappiness,
  happinessHeatmapColor,
} from '@/lib/sim/cellHappiness'
import {
  COVERAGE_HAPPINESS_WEIGHT,
  DEFAULT_TAX_RATES,
  EARTHQUAKE_HAPPINESS_PENALTY,
  EMPTY_POWER_BUCKET,
  EMPTY_ZONES_BUCKET,
  POLLUTION_HAPPINESS_WEIGHT,
  TAX_HAPPINESS_WEIGHT,
  TAX_NEUTRAL_RATE,
  WASTE_HAPPINESS_WEIGHT,
  WASTE_MAX_PER_CELL,
  type DisastersBucket,
  type PowerBucket,
  type ServicesBucket,
  type WaterBucket,
  type ZonesBucket,
} from '@/lib/sim/state'

function emptyServices(): ServicesBucket {
  return { buildings: [] }
}

function emptyWater(): WaterBucket {
  return {
    sources: [],
    pipes: {},
    treatmentPlants: [],
    wasteAccumulation: {},
  }
}

function emptyDisasters(): DisastersBucket {
  return { active: [] }
}

function zonesWith(cells: ZonesBucket['cells']): ZonesBucket {
  return { cells }
}

describe('cellHappiness baseline', () => {
  it('returns 100 on an empty city with neutral inputs and no zoning', () => {
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    expect(score).toBe(100)
  })

  it('returns 0 for non-finite coordinates', () => {
    expect(
      cellHappiness(
        Number.NaN,
        0,
        emptyWater(),
        EMPTY_POWER_BUCKET,
        emptyServices(),
        EMPTY_ZONES_BUCKET,
        DEFAULT_TAX_RATES,
        emptyDisasters(),
      ),
    ).toBe(0)
  })

  it('returns 0 for non-integer coordinates so cell-key contract holds', () => {
    expect(
      cellHappiness(
        0.5,
        0,
        emptyWater(),
        EMPTY_POWER_BUCKET,
        emptyServices(),
        EMPTY_ZONES_BUCKET,
        DEFAULT_TAX_RATES,
        emptyDisasters(),
      ),
    ).toBe(0)
    expect(
      cellHappiness(
        0,
        1.7,
        emptyWater(),
        EMPTY_POWER_BUCKET,
        emptyServices(),
        EMPTY_ZONES_BUCKET,
        DEFAULT_TAX_RATES,
        emptyDisasters(),
      ),
    ).toBe(0)
  })
})

describe('cellHappiness waste input', () => {
  it('subtracts waste penalty proportional to wasteAccumulation', () => {
    const water: WaterBucket = {
      ...emptyWater(),
      wasteAccumulation: { '0,0': WASTE_MAX_PER_CELL },
    }
    const score = cellHappiness(
      0,
      0,
      water,
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    // max waste → full WASTE_HAPPINESS_WEIGHT penalty.
    expect(score).toBe(100 - WASTE_HAPPINESS_WEIGHT)
  })

  it('only the matching cell key sees the penalty', () => {
    const water: WaterBucket = {
      ...emptyWater(),
      wasteAccumulation: { '5,5': WASTE_MAX_PER_CELL },
    }
    const score = cellHappiness(
      0,
      0,
      water,
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    expect(score).toBe(100)
  })
})

describe('cellHappiness services coverage input', () => {
  it('zoned cell with zero coverage takes the full 5-service penalty', () => {
    const zones = zonesWith({
      '0,0': { kind: 'residential', density: 1 },
    })
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      EMPTY_POWER_BUCKET,
      emptyServices(),
      zones,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    expect(score).toBe(100 - 5 * COVERAGE_HAPPINESS_WEIGHT)
  })

  it('unzoned cell skips the coverage penalty entirely', () => {
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    expect(score).toBe(100)
  })
})

describe('cellHappiness tax input', () => {
  it('residential tax above neutral drags happiness for every cell', () => {
    const taxRates = {
      ...DEFAULT_TAX_RATES,
      residential: TAX_NEUTRAL_RATE + 0.05,
    }
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      taxRates,
      emptyDisasters(),
    )
    const expectedTaxPenalty = 0.05 * TAX_HAPPINESS_WEIGHT
    expect(score).toBeCloseTo(100 - expectedTaxPenalty)
  })

  it('rates at or below neutral contribute 0 tax penalty', () => {
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      { ...DEFAULT_TAX_RATES, residential: TAX_NEUTRAL_RATE / 2 },
      emptyDisasters(),
    )
    expect(score).toBe(100)
  })
})

describe('cellHappiness pollution input', () => {
  it('subtracts pollution penalty proportional to power.pollution[key]', () => {
    const power: PowerBucket = {
      ...EMPTY_POWER_BUCKET,
      pollution: { '0,0': 8 },
    }
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      power,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    expect(score).toBeCloseTo(100 - 8 * POLLUTION_HAPPINESS_WEIGHT)
  })

  it('cells outside the pollution map read 0 pollution', () => {
    const power: PowerBucket = {
      ...EMPTY_POWER_BUCKET,
      pollution: { '5,5': 8 },
    }
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      power,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    expect(score).toBe(100)
  })
})

describe('cellHappiness earthquake input', () => {
  it('one active earthquake drops every cell by EARTHQUAKE_HAPPINESS_PENALTY', () => {
    const disasters: DisastersBucket = {
      active: [
        { kind: 'earthquake', row: 5, col: 5, ticksRemaining: 10 },
      ],
    }
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      disasters,
    )
    expect(score).toBe(100 - EARTHQUAKE_HAPPINESS_PENALTY)
  })

  it('non-earthquake disasters do not contribute', () => {
    const disasters: DisastersBucket = {
      active: [
        { kind: 'fire', row: 0, col: 0, ticksRemaining: 10 },
        { kind: 'flood', row: 5, col: 5, ticksRemaining: 10 },
      ],
    }
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      disasters,
    )
    expect(score).toBe(100)
  })

  it('multiple active earthquakes accumulate the penalty', () => {
    const disasters: DisastersBucket = {
      active: [
        { kind: 'earthquake', row: 0, col: 0, ticksRemaining: 10 },
        { kind: 'earthquake', row: 5, col: 5, ticksRemaining: 8 },
      ],
    }
    const score = cellHappiness(
      0,
      0,
      emptyWater(),
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      disasters,
    )
    expect(score).toBe(100 - 2 * EARTHQUAKE_HAPPINESS_PENALTY)
  })
})

describe('happinessHeatmapColor', () => {
  it('returns the high-end green at score 100', () => {
    expect(happinessHeatmapColor(100)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(happinessHeatmapColor(100)).toBe('#3a8a3a')
  })

  it('returns the floor red at score 0', () => {
    expect(happinessHeatmapColor(0)).toBe('#c74a3a')
  })

  it('returns the mid yellow at score 50', () => {
    expect(happinessHeatmapColor(50)).toBe('#d9c84a')
  })

  it('interpolates exactly to #d08942 at score 25 (red → yellow midpoint)', () => {
    expect(happinessHeatmapColor(25)).toBe('#d08942')
  })

  it('interpolates exactly to #8aa942 at score 75 (yellow → green midpoint)', () => {
    expect(happinessHeatmapColor(75)).toBe('#8aa942')
  })

  it('clamps scores below 0 and above 100', () => {
    expect(happinessHeatmapColor(-10)).toBe('#c74a3a')
    expect(happinessHeatmapColor(200)).toBe('#3a8a3a')
  })

  it('returns the safe mid color for non-finite input', () => {
    expect(happinessHeatmapColor(Number.NaN)).toBe('#d9c84a')
  })

  it('HAPPINESS_HEATMAP_FILL_OPACITY is locked at the documented 0.32 contract', () => {
    expect(HAPPINESS_HEATMAP_FILL_OPACITY).toBe(0.32)
  })
})

describe('cellHappiness clamping and rounding', () => {
  it('clamps below 0 to 0 when penalties exceed the baseline', () => {
    const water: WaterBucket = {
      ...emptyWater(),
      wasteAccumulation: { '0,0': WASTE_MAX_PER_CELL },
    }
    const power: PowerBucket = {
      ...EMPTY_POWER_BUCKET,
      pollution: { '0,0': 100 },
    }
    const score = cellHappiness(
      0,
      0,
      water,
      power,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    expect(score).toBe(0)
  })

  it('rounds to one decimal place for HUD stability', () => {
    const water: WaterBucket = {
      ...emptyWater(),
      wasteAccumulation: { '0,0': 1 },
    }
    const score = cellHappiness(
      0,
      0,
      water,
      EMPTY_POWER_BUCKET,
      emptyServices(),
      EMPTY_ZONES_BUCKET,
      DEFAULT_TAX_RATES,
      emptyDisasters(),
    )
    // 100 - (1/100)*50 = 99.5 exactly; the rounding is observable
    // on any waste value that is not a multiple of 2.
    expect(score).toBe(99.5)
  })
})
