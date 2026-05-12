import { describe, it, expect } from 'vitest'
import {
  SimEventSchema,
  applyEconomyTick,
  applySimEvent,
  computeCityHappiness,
  maybeGrowZones,
  reduceSimEvents,
  type SimEvent,
  type TickEvent,
  type SetSpeedEvent,
  type SetTaxRateEvent,
} from '@/lib/sim/events'
import {
  BANKRUPTCY_THRESHOLD_TICKS,
  EMPTY_SIM_STATE,
  type EconomyBucket,
  type SimState,
} from '@/lib/sim/state'

const A_BUILDER = '11111111-2222-3333-4444-555555555555'
const B_BUILDER = '99999999-8888-7777-6666-555555555555'

function tick(deltaMs: number, t = 0): TickEvent {
  return {
    type: 'tick',
    payload: { deltaMs },
    clientCreatedAt: t,
    authorBuilderId: A_BUILDER,
  }
}

function setSpeed(speed: 0 | 1 | 2 | 4, t = 0): SetSpeedEvent {
  return {
    type: 'setSpeed',
    payload: { speed },
    clientCreatedAt: t,
    authorBuilderId: A_BUILDER,
  }
}

function setTax(
  kind: 'residential' | 'commercial' | 'industrial',
  rate: number,
  t = 0,
): SetTaxRateEvent {
  return {
    type: 'setTaxRate',
    payload: { kind, rate },
    clientCreatedAt: t,
    authorBuilderId: A_BUILDER,
  }
}

describe('SimEventSchema', () => {
  it('accepts a tick event', () => {
    expect(SimEventSchema.safeParse(tick(250)).success).toBe(true)
  })

  it('accepts a setSpeed event', () => {
    expect(SimEventSchema.safeParse(setSpeed(2)).success).toBe(true)
  })

  it('accepts a setTaxRate event', () => {
    expect(SimEventSchema.safeParse(setTax('residential', 0.1)).success).toBe(
      true,
    )
  })

  it('accepts a placeholder layer event (forward-compat)', () => {
    const event = {
      type: 'placeZone',
      payload: { kind: 'residential', row: 0, col: 0 },
      clientCreatedAt: 0,
      authorBuilderId: A_BUILDER,
    }
    expect(SimEventSchema.safeParse(event).success).toBe(true)
  })

  it('rejects an unknown event type', () => {
    const event = {
      type: 'invalid',
      payload: {},
      clientCreatedAt: 0,
      authorBuilderId: A_BUILDER,
    }
    expect(SimEventSchema.safeParse(event).success).toBe(false)
  })

  it('rejects a tick with a non-integer deltaMs', () => {
    const event = {
      type: 'tick',
      payload: { deltaMs: 250.5 },
      clientCreatedAt: 0,
      authorBuilderId: A_BUILDER,
    }
    expect(SimEventSchema.safeParse(event).success).toBe(false)
  })

  it('rejects a setSpeed with speed=3 (Q-011 doubling cadence)', () => {
    const event = {
      type: 'setSpeed',
      payload: { speed: 3 },
      clientCreatedAt: 0,
      authorBuilderId: A_BUILDER,
    }
    expect(SimEventSchema.safeParse(event).success).toBe(false)
  })

  it('rejects a setTaxRate with rate above 1.0', () => {
    expect(SimEventSchema.safeParse(setTax('residential', 1.5)).success).toBe(
      false,
    )
  })

  it('rejects a tick missing the authorBuilderId', () => {
    const event = {
      type: 'tick',
      payload: { deltaMs: 250 },
      clientCreatedAt: 0,
    }
    expect(SimEventSchema.safeParse(event).success).toBe(false)
  })

  it('accepts an event with the optional clientReceivedAt stamp', () => {
    const event = {
      type: 'tick',
      payload: { deltaMs: 250 },
      clientCreatedAt: 1000,
      clientReceivedAt: 1042,
      authorBuilderId: A_BUILDER,
    }
    expect(SimEventSchema.safeParse(event).success).toBe(true)
  })
})

describe('applySimEvent', () => {
  describe('tick', () => {
    it('advances tick count by 1 at 1x speed', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, tick(250))
      expect(next.tick).toBe(1)
    })

    it('advances simTimeMs by deltaMs', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, tick(250))
      expect(next.simTimeMs).toBe(250)
    })

    it('returns identity when paused (speed = 0)', () => {
      const paused: SimState = { ...EMPTY_SIM_STATE, speed: 0 }
      const next = applySimEvent(paused, tick(250))
      expect(next).toBe(paused)
    })

    it('does not mutate the input state', () => {
      const before = JSON.parse(JSON.stringify(EMPTY_SIM_STATE))
      applySimEvent(EMPTY_SIM_STATE, tick(250))
      expect(EMPTY_SIM_STATE).toEqual(before)
    })

    it('produces a fresh state object on advance', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, tick(250))
      expect(next).not.toBe(EMPTY_SIM_STATE)
    })
  })

  describe('setSpeed', () => {
    it('changes speed to the new value', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, setSpeed(2))
      expect(next.speed).toBe(2)
    })

    it('changes speed to 0 (pause)', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, setSpeed(0))
      expect(next.speed).toBe(0)
    })

    it('returns identity when speed is unchanged', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, setSpeed(1))
      expect(next).toBe(EMPTY_SIM_STATE)
    })

    it('does not mutate the input state', () => {
      const before = JSON.parse(JSON.stringify(EMPTY_SIM_STATE))
      applySimEvent(EMPTY_SIM_STATE, setSpeed(4))
      expect(EMPTY_SIM_STATE).toEqual(before)
    })
  })

  describe('setTaxRate', () => {
    it('updates the residential rate', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, setTax('residential', 0.1))
      expect(next.taxRates.residential).toBeCloseTo(0.1, 5)
    })

    it('leaves the other rates unchanged', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, setTax('residential', 0.1))
      expect(next.taxRates.commercial).toEqual(
        EMPTY_SIM_STATE.taxRates.commercial,
      )
      expect(next.taxRates.industrial).toEqual(
        EMPTY_SIM_STATE.taxRates.industrial,
      )
    })

    it('returns identity when the rate is unchanged', () => {
      const same = EMPTY_SIM_STATE.taxRates.residential
      const next = applySimEvent(EMPTY_SIM_STATE, setTax('residential', same))
      expect(next).toBe(EMPTY_SIM_STATE)
    })
  })

  describe('spawnDisaster + per-tick lifetime (REQ-105 substrate slice 1)', () => {
    function spawn(
      kind: 'fire' | 'flood' | 'tornado' | 'earthquake' | 'monster',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'spawnDisaster',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('appends a disaster with the per-kind default duration', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, spawn('fire', 2, 3))
      expect(next.disasters.active).toHaveLength(1)
      expect(next.disasters.active[0]).toEqual({
        kind: 'fire',
        row: 2,
        col: 3,
        ticksRemaining: 60,
      })
    })

    it('allows two disasters at the same anchor (no overlap rejection in v1)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, spawn('fire', 0, 0))
      s = applySimEvent(s, spawn('flood', 0, 0))
      expect(s.disasters.active).toHaveLength(2)
    })

    it('per-tick decrement reduces ticksRemaining by 1 on each active disaster', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, spawn('tornado', 0, 0))
      // Tornado default duration = 40 ticks.
      s = applySimEvent(s, {
        type: 'tick',
        payload: { deltaMs: 250 },
        clientCreatedAt: 1,
        authorBuilderId: A_BUILDER,
      })
      expect(s.disasters.active[0].ticksRemaining).toBe(39)
    })

    it('disasters are removed when ticksRemaining reaches 0', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, spawn('earthquake', 0, 0))
      // Earthquake default duration = 20 ticks. Tick 20 times to expire.
      for (let i = 0; i < 20; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i + 1,
          authorBuilderId: A_BUILDER,
        })
      }
      expect(s.disasters.active).toHaveLength(0)
    })

    it('two replays of a mixed disaster event log produce identical state', () => {
      const events: SimEvent[] = [
        spawn('fire', 0, 0),
        spawn('flood', 1, 1),
        ...Array.from({ length: 30 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
        spawn('tornado', 2, 2),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.disasters).toEqual(b.disasters)
    })

    it('tick is identity on disasters bucket when no active disasters', () => {
      const s1 = applySimEvent(EMPTY_SIM_STATE, {
        type: 'tick',
        payload: { deltaMs: 250 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(s1.disasters).toBe(EMPTY_SIM_STATE.disasters)
    })
  })

  describe('placePowerPlant (REQ-085 slice 1)', () => {
    function placePlant(
      kind: 'coal' | 'solar',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placePowerPlant',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('appends a coal plant to the empty bucket', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, placePlant('coal', 3, 4))
      expect(next.power.plants).toHaveLength(1)
      expect(next.power.plants[0]).toEqual({ kind: 'coal', row: 3, col: 4 })
    })

    it('returns identity on a duplicate plant (same anchor + kind)', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, placePlant('coal', 0, 0))
      const again = applySimEvent(after, placePlant('coal', 0, 0))
      expect(again).toBe(after)
    })

    it('allows two plants of different kinds at the same anchor', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placePlant('coal', 0, 0))
      s = applySimEvent(s, placePlant('solar', 0, 0))
      expect(s.power.plants).toHaveLength(2)
    })

    it('appends multiple plants at distinct anchors', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placePlant('coal', 0, 0))
      s = applySimEvent(s, placePlant('solar', 5, 5))
      s = applySimEvent(s, placePlant('coal', 2, 7))
      expect(s.power.plants).toHaveLength(3)
    })

    it('does not mutate the input state', () => {
      const before = JSON.parse(JSON.stringify(EMPTY_SIM_STATE))
      applySimEvent(EMPTY_SIM_STATE, placePlant('coal', 0, 0))
      expect(EMPTY_SIM_STATE).toEqual(before)
    })

    it('preserves zones / other buckets when placing a plant', () => {
      const seeded: SimEvent[] = [
        {
          type: 'placeZone',
          payload: { kind: 'residential', row: 0, col: 0 },
          clientCreatedAt: 0,
          authorBuilderId: A_BUILDER,
        },
      ]
      const withZone = applyMany(EMPTY_SIM_STATE, seeded)
      const next = applySimEvent(withZone, placePlant('coal', 5, 5))
      expect(next.zones.cells['0,0']).toEqual({
        kind: 'residential',
        density: 0,
      })
      expect(next.power.plants).toHaveLength(1)
    })
  })

  describe('runPowerLine + eraseLine (REQ-085 slice 1)', () => {
    function runLine(row: number, col: number): SimEvent {
      return {
        type: 'runPowerLine',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function eraseLine(row: number, col: number): SimEvent {
      return {
        type: 'eraseLine',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('adds a single line cell', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, runLine(0, 1))
      expect(next.power.lines['0,1']).toBe(true)
    })

    it('returns identity on a duplicate runPowerLine', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, runLine(0, 0))
      const again = applySimEvent(after, runLine(0, 0))
      expect(again).toBe(after)
    })

    it('runs many line cells', () => {
      let s = EMPTY_SIM_STATE
      for (let i = 0; i < 5; i++) s = applySimEvent(s, runLine(0, i))
      expect(Object.keys(s.power.lines)).toHaveLength(5)
    })

    it('eraseLine returns identity when no line at the cell', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, eraseLine(0, 0))
      expect(next).toBe(EMPTY_SIM_STATE)
    })

    it('eraseLine removes a placed line cell', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, runLine(2, 3))
      const erased = applySimEvent(after, eraseLine(2, 3))
      expect(erased.power.lines['2,3']).toBeUndefined()
    })

    it('eraseLine only removes the targeted cell', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, runLine(0, 0))
      s = applySimEvent(s, runLine(0, 1))
      const erased = applySimEvent(s, eraseLine(0, 0))
      expect(erased.power.lines['0,0']).toBeUndefined()
      expect(erased.power.lines['0,1']).toBe(true)
    })

    it('two replays of the same power event log derive identical state', () => {
      const events: SimEvent[] = [
        { type: 'placePowerPlant', payload: { kind: 'coal', row: 0, col: 0 }, clientCreatedAt: 0, authorBuilderId: A_BUILDER },
        runLine(0, 1),
        runLine(0, 2),
        runLine(0, 3),
        eraseLine(0, 2),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a).toEqual(b)
    })
  })

  describe('placeZone (REQ-080 slice 1)', () => {
    function placeZone(
      kind: 'residential' | 'commercial' | 'industrial',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('adds a new zoned cell at density 0', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 3, 4))
      expect(next.zones.cells['3,4']).toEqual({
        kind: 'residential',
        density: 0,
      })
    })

    it('returns identity when painting the same kind on the same cell', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      const again = applySimEvent(after, placeZone('residential', 0, 0))
      expect(again).toBe(after)
    })

    it('overwrites the kind on an existing zoned cell', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 1, 1))
      const retyped = applySimEvent(after, placeZone('commercial', 1, 1))
      expect(retyped.zones.cells['1,1']?.kind).toBe('commercial')
    })

    it('preserves density when retyping a zoned cell', () => {
      // Land a cell, then forge a density bump to simulate the per-tick
      // growth reducer's effect (REQ-081, follow-on slice). Then retype
      // and confirm density survives.
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = {
        ...s,
        zones: {
          cells: {
            ...s.zones.cells,
            '0,0': { kind: 'residential', density: 2 },
          },
        },
      }
      const retyped = applySimEvent(s, placeZone('commercial', 0, 0))
      expect(retyped.zones.cells['0,0']).toEqual({
        kind: 'commercial',
        density: 2,
      })
    })

    it('does not mutate the input state', () => {
      const before = JSON.parse(JSON.stringify(EMPTY_SIM_STATE))
      applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      expect(EMPTY_SIM_STATE).toEqual(before)
    })

    it('places multiple cells in independent positions', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeZone('commercial', 0, 1))
      s = applySimEvent(s, placeZone('industrial', 1, 0))
      expect(Object.keys(s.zones.cells)).toHaveLength(3)
      expect(s.zones.cells['0,0']?.kind).toBe('residential')
      expect(s.zones.cells['0,1']?.kind).toBe('commercial')
      expect(s.zones.cells['1,0']?.kind).toBe('industrial')
    })

    it('handles negative coordinates', () => {
      const next = applySimEvent(
        EMPTY_SIM_STATE,
        placeZone('residential', -3, -5),
      )
      expect(next.zones.cells['-3,-5']?.kind).toBe('residential')
    })
  })

  describe('eraseZone (REQ-080 slice 1)', () => {
    function eraseZone(row: number, col: number): SimEvent {
      return {
        type: 'eraseZone',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function placeZone(
      kind: 'residential' | 'commercial' | 'industrial',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('returns identity on a fresh slug (no cell to erase)', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, eraseZone(0, 0))
      expect(next).toBe(EMPTY_SIM_STATE)
    })

    it('removes a zoned cell', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 2, 3))
      const erased = applySimEvent(after, eraseZone(2, 3))
      expect(erased.zones.cells['2,3']).toBeUndefined()
    })

    it('only removes the targeted cell (other cells survive)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeZone('commercial', 0, 1))
      const erased = applySimEvent(s, eraseZone(0, 0))
      expect(erased.zones.cells['0,0']).toBeUndefined()
      expect(erased.zones.cells['0,1']?.kind).toBe('commercial')
    })

    it('returns identity when erasing a cell that does not exist', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      const erased = applySimEvent(after, eraseZone(99, 99))
      expect(erased).toBe(after)
    })
  })

  describe('population follows zone density (REQ-075 slice 1)', () => {
    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    function placeZone(
      kind: 'residential' | 'commercial' | 'industrial',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('placing a residential zone keeps residents at 0 (density 0 has 0 capacity)', () => {
      const s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      // placeZone alone does not run a growth tick, so density stays 0
      // and population stays empty.
      expect(s.population.cells['0,0']).toBeUndefined()
      expect(s.population.totalPopulation).toBe(0)
    })

    it('first growth tick on a residential zone bumps residents to 4 (density 1 capacity)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
      expect(s.population.cells['0,0']?.residents).toBe(4)
      expect(s.population.totalPopulation).toBe(4)
    })

    it('density 2 bumps residents to 12; density 3 to 40', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(40, s)
      expect(s.zones.cells['0,0']?.density).toBe(2)
      expect(s.population.cells['0,0']?.residents).toBe(12)
      expect(s.population.totalPopulation).toBe(12)
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(3)
      expect(s.population.cells['0,0']?.residents).toBe(40)
      expect(s.population.totalPopulation).toBe(40)
    })

    it('commercial and industrial zones do not contribute to residents', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('commercial', 0, 0))
      s = applySimEvent(s, placeZone('industrial', 1, 1))
      s = tickN(20, s)
      expect(s.population.totalPopulation).toBe(0)
    })

    it('totalPopulation sums across multiple residential cells', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeZone('residential', 1, 1))
      s = applySimEvent(s, placeZone('residential', 2, 2))
      s = tickN(20, s)
      // 3 cells at density 1 = 3 * 4 = 12
      expect(s.population.totalPopulation).toBe(12)
    })

    it('eraseZone removes the cell from the population bucket', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(20, s)
      expect(s.population.cells['0,0']?.residents).toBe(4)
      s = applySimEvent(s, {
        type: 'eraseZone',
        payload: { row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      // After eraseZone the population bucket still carries the prior
      // resident count until the next growth tick syncs it back to
      // zone density. This is acceptable for slice 1 (the population
      // is eventually consistent with zones); slice 2 can choose to
      // sync immediately on eraseZone if the lag becomes a felt bug.
      expect(s.population.cells['0,0']?.residents).toBe(4)
      // Next tick re-syncs (density 0 = 0, but zone is now gone).
      s = tickN(20, s)
      expect(s.population.cells['0,0']).toBeUndefined()
      expect(s.population.totalPopulation).toBe(0)
    })

    it('paused sim does not advance population', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, {
        type: 'setSpeed',
        payload: { speed: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(20, s)
      expect(s.population.totalPopulation).toBe(0)
    })

    it('two replays of the same event log derive identical population', () => {
      const events: SimEvent[] = [
        placeZone('residential', 0, 0),
        placeZone('residential', 1, 0),
        placeZone('commercial', 0, 1),
        ...Array.from({ length: 20 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.population).toEqual(b.population)
    })
  })

  describe('water layer events (REQ-090 slice 1)', () => {
    function placeSource(
      kind: 'water-tower' | 'pump-station',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeWaterSource',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function runPipe(
      kind: 'water' | 'sewage',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'runWaterPipe',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function erasePipe(row: number, col: number): SimEvent {
      return {
        type: 'eraseWaterPipe',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('appends a single water tower', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, placeSource('water-tower', 0, 0))
      expect(next.water.sources).toHaveLength(1)
      expect(next.water.sources[0]).toEqual({
        kind: 'water-tower',
        row: 0,
        col: 0,
      })
    })

    it('returns identity on duplicate water source anchor + kind', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, placeSource('pump-station', 0, 0))
      const again = applySimEvent(after, placeSource('pump-station', 0, 0))
      expect(again).toBe(after)
    })

    it('runs a water pipe', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, runPipe('water', 0, 1))
      expect(next.water.pipes['0,1']).toBe('water')
    })

    it('runs a sewage pipe', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, runPipe('sewage', 0, 2))
      expect(next.water.pipes['0,2']).toBe('sewage')
    })

    it('returns identity on duplicate same-kind pipe', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, runPipe('water', 0, 0))
      const again = applySimEvent(after, runPipe('water', 0, 0))
      expect(again).toBe(after)
    })

    it('overwrites pipe kind when a different kind is run on the same cell', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, runPipe('water', 0, 0))
      s = applySimEvent(s, runPipe('sewage', 0, 0))
      expect(s.water.pipes['0,0']).toBe('sewage')
    })

    it('eraseWaterPipe removes a placed pipe', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, runPipe('water', 0, 0))
      s = applySimEvent(s, erasePipe(0, 0))
      expect(s.water.pipes['0,0']).toBeUndefined()
    })

    it('eraseWaterPipe is identity when no pipe at the cell', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, erasePipe(0, 0))
      expect(next).toBe(EMPTY_SIM_STATE)
    })

    it('two replays of the same water event log derive identical state', () => {
      const events: SimEvent[] = [
        placeSource('water-tower', 0, 0),
        runPipe('water', 0, 1),
        runPipe('water', 0, 2),
        runPipe('sewage', 1, 2),
        erasePipe(0, 1),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.water).toEqual(b.water)
    })
  })

  describe('sewage treatment plant events (REQ-092 sewage slice 1)', () => {
    function placePlant(row: number, col: number): SimEvent {
      return {
        type: 'placeSewageTreatmentPlant',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function erasePlant(row: number, col: number): SimEvent {
      return {
        type: 'eraseSewageTreatmentPlant',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('appends a single sewage treatment plant', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, placePlant(2, 3))
      expect(next.water.treatmentPlants).toHaveLength(1)
      expect(next.water.treatmentPlants[0]).toEqual({ row: 2, col: 3 })
    })

    it('returns identity on duplicate plant anchor', () => {
      const after = applySimEvent(EMPTY_SIM_STATE, placePlant(0, 0))
      const again = applySimEvent(after, placePlant(0, 0))
      expect(again).toBe(after)
    })

    it('eraseSewageTreatmentPlant removes a placed plant', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placePlant(0, 0))
      s = applySimEvent(s, erasePlant(0, 0))
      expect(s.water.treatmentPlants).toEqual([])
    })

    it('eraseSewageTreatmentPlant is identity when no plant at the cell', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, erasePlant(7, 7))
      expect(next).toBe(EMPTY_SIM_STATE)
    })

    it('two replays of a mixed sewage plant event log derive identical state', () => {
      const events: SimEvent[] = [
        placePlant(0, 0),
        placePlant(5, 5),
        placePlant(0, 0),
        erasePlant(5, 5),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.water).toEqual(b.water)
      expect(a.water.treatmentPlants).toEqual([{ row: 0, col: 0 }])
    })
  })

  describe('placeServiceBuilding + eraseServiceBuilding (REQ-100 slice 1)', () => {
    function placeService(
      kind:
        | 'police-station'
        | 'fire-station'
        | 'hospital'
        | 'school'
        | 'garbage-depot',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeServiceBuilding',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function eraseService(row: number, col: number): SimEvent {
      return {
        type: 'eraseServiceBuilding',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('appends a single police station', () => {
      const next = applySimEvent(
        EMPTY_SIM_STATE,
        placeService('police-station', 0, 0),
      )
      expect(next.services.buildings).toHaveLength(1)
      expect(next.services.buildings[0]).toEqual({
        kind: 'police-station',
        row: 0,
        col: 0,
      })
    })

    it('returns identity on duplicate anchor + kind', () => {
      const after = applySimEvent(
        EMPTY_SIM_STATE,
        placeService('police-station', 0, 0),
      )
      const again = applySimEvent(after, placeService('police-station', 0, 0))
      expect(again).toBe(after)
    })

    it('allows different service kinds at the same anchor', () => {
      let s = applySimEvent(
        EMPTY_SIM_STATE,
        placeService('police-station', 0, 0),
      )
      s = applySimEvent(s, placeService('fire-station', 0, 0))
      expect(s.services.buildings).toHaveLength(2)
    })

    it('appends multiple buildings at distinct anchors', () => {
      let s = applySimEvent(
        EMPTY_SIM_STATE,
        placeService('police-station', 0, 0),
      )
      s = applySimEvent(s, placeService('fire-station', 5, 5))
      s = applySimEvent(s, placeService('hospital', 2, 7))
      s = applySimEvent(s, placeService('school', -3, 1))
      s = applySimEvent(s, placeService('garbage-depot', 4, -2))
      expect(s.services.buildings).toHaveLength(5)
    })

    it('eraseServiceBuilding removes a placed service', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeService('hospital', 2, 3))
      s = applySimEvent(s, eraseService(2, 3))
      expect(s.services.buildings).toHaveLength(0)
    })

    it('eraseServiceBuilding returns identity when no service at the cell', () => {
      const next = applySimEvent(EMPTY_SIM_STATE, eraseService(0, 0))
      expect(next).toBe(EMPTY_SIM_STATE)
    })

    it('eraseServiceBuilding with multiple-kinds-at-same-anchor removes all of them', () => {
      let s = applySimEvent(
        EMPTY_SIM_STATE,
        placeService('police-station', 0, 0),
      )
      s = applySimEvent(s, placeService('fire-station', 0, 0))
      expect(s.services.buildings).toHaveLength(2)
      s = applySimEvent(s, eraseService(0, 0))
      expect(s.services.buildings).toHaveLength(0)
    })

    it('two replays of the same event log derive identical services state', () => {
      const events: SimEvent[] = [
        placeService('police-station', 0, 0),
        placeService('hospital', 5, 5),
        placeService('school', -2, 3),
        eraseService(0, 0),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.services).toEqual(b.services)
    })
  })

  describe('per-tick economy (REQ-095 slice 1)', () => {
    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    function placeZone(
      kind: 'residential' | 'commercial' | 'industrial',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('treasury starts at INITIAL_TREASURY (20000)', () => {
      expect(EMPTY_SIM_STATE.economy.treasury).toBe(20000)
    })

    it('treasury stays at initial when paused (no ticks fire)', () => {
      const paused = applySimEvent(EMPTY_SIM_STATE, {
        type: 'setSpeed',
        payload: { speed: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      const next = tickN(10, paused)
      expect(next.economy.treasury).toBe(20000)
    })

    it('a tick with no infrastructure produces no income and no maintenance', () => {
      const next = tickN(1, EMPTY_SIM_STATE)
      expect(next.economy.treasury).toBe(20000)
      expect(next.economy.lastTickIncome).toBe(0)
      expect(next.economy.lastTickMaintenance).toBe(0)
    })

    it('a single power line drains maintenance per tick', () => {
      const s = applySimEvent(EMPTY_SIM_STATE, {
        type: 'runPowerLine',
        payload: { row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      const next = tickN(1, s)
      // 1 line * 0.05 = 0.05 maintenance per tick. Treasury already
      // dropped by POWER_LINE_BUILD_COST = 5 on the placement (REQ-095
      // slice 2): 20000 - 5 - 0.05 = 19994.95.
      expect(next.economy.lastTickMaintenance).toBeCloseTo(0.05, 5)
      expect(next.economy.treasury).toBeCloseTo(19994.95, 5)
    })

    it('a coal plant drains plant maintenance per tick', () => {
      const s = applySimEvent(EMPTY_SIM_STATE, {
        type: 'placePowerPlant',
        payload: { kind: 'coal', row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      const next = tickN(1, s)
      // 1 plant * 0.5 = 0.5 maintenance per tick. Treasury already
      // dropped by POWER_PLANT_BUILD_COST.coal = 4000 on the
      // placement (REQ-095 slice 2): 20000 - 4000 - 0.5 = 15999.5.
      expect(next.economy.lastTickMaintenance).toBeCloseTo(0.5, 5)
      expect(next.economy.treasury).toBeCloseTo(15999.5, 5)
    })

    it('residents generate income per tick at the residential tax rate', () => {
      // Place residential, advance to density 1 (4 residents), one
      // more tick to see income accumulate against the new pop.
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(20, s) // grows to density 1, residents = 4
      const beforeTreasury = s.economy.treasury
      s = tickN(1, s)
      // 4 residents * 0.07 = 0.28 income, no maintenance
      expect(s.economy.lastTickIncome).toBeCloseTo(0.28, 5)
      expect(s.economy.treasury - beforeTreasury).toBeCloseTo(0.28, 5)
    })

    it('two replays of the same event log produce identical economy state', () => {
      const events: SimEvent[] = [
        placeZone('residential', 0, 0),
        {
          type: 'placePowerPlant',
          payload: { kind: 'coal', row: 5, col: 5 },
          clientCreatedAt: 0,
          authorBuilderId: A_BUILDER,
        },
        ...Array.from({ length: 30 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.economy).toEqual(b.economy)
    })

    it('a setTaxRate event changes the residential rate and per-tick income reflects it on the next tick', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(20, s) // 4 residents
      // Bump residential rate from 7% to 14%
      s = applySimEvent(s, {
        type: 'setTaxRate',
        payload: { kind: 'residential', rate: 0.14 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(1, s)
      // 4 * 0.14 = 0.56
      expect(s.economy.lastTickIncome).toBeCloseTo(0.56, 5)
    })
  })

  describe('per-tick zone growth (REQ-081 slice 1)', () => {
    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    function placeZone(
      kind: 'residential' | 'commercial' | 'industrial',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('does not grow before the first growth tick (tick 1..19 keep density 0)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(19, s)
      expect(s.zones.cells['0,0']?.density).toBe(0)
    })

    it('advances density by 1 at exactly the first growth tick (tick 20)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(20, s)
      expect(s.tick).toBe(20)
      expect(s.zones.cells['0,0']?.density).toBe(1)
    })

    it('keeps density 1 between growth ticks (tick 21..39)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(39, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
    })

    it('advances density by 1 at each growth tick (40 -> 2, 60 -> 3)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(40, s)
      expect(s.zones.cells['0,0']?.density).toBe(2)
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(3)
    })

    it('caps density at 3 (further growth ticks are no-ops)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(60, s)
      expect(s.zones.cells['0,0']?.density).toBe(3)
      const before = s
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(3)
      // Identity preservation: no work to do, so the state object is
      // structurally equal but the zones bucket and the wrapping cell
      // can be the same reference.
      expect(s.zones).toBe(before.zones)
    })

    it('advances every cell on a growth tick (multi-cell)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeZone('commercial', 1, 1))
      s = applySimEvent(s, placeZone('industrial', 2, 2))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
      expect(s.zones.cells['1,1']?.density).toBe(1)
      expect(s.zones.cells['2,2']?.density).toBe(1)
    })

    function placeTreatmentPlantGrowth(row: number, col: number): SimEvent {
      return {
        type: 'placeSewageTreatmentPlant',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('does not advance density when cityHappiness sits in the stagnant band (REQ-076 follow-on)', () => {
      // Residential tax 35% + adjacent treatment plant: tick-20
      // happiness = 100 - 0(waste, drained) - 20(coverage) -
      // 50(tax) = 30, which sits in the stagnant band
      // (DECLINE_HAPPINESS_THRESHOLD 25 < 30 <=
      // GROWTH_HAPPINESS_THRESHOLD 50). Tick 20 still grows to
      // density 1 because pre-tick happiness reads the empty-state
      // 100 baseline; penalties only kick in once residents exist.
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeTreatmentPlantGrowth(0, 1))
      s = applySimEvent(s, {
        type: 'setTaxRate',
        payload: { kind: 'residential', rate: 0.35 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
      expect(s.population.cityHappiness).toBeGreaterThan(25)
      expect(s.population.cityHappiness).toBeLessThanOrEqual(50)
      const before = s
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
      expect(s.zones).toBe(before.zones)
    })

    it('density steps DOWN when cityHappiness drops to the miserable band (REQ-079 follow-on)', () => {
      // Residential tax 50% + drained sewage: tick-20 happiness =
      // 100 - 0 - 20 - 80 = 0, which sits in the miserable band
      // (<= DECLINE_HAPPINESS_THRESHOLD 25). Every zoned cell with
      // density > 0 steps down by 1 on the next growth tick
      // regardless of kind (commercial / industrial included).
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeTreatmentPlantGrowth(0, 1))
      s = applySimEvent(s, {
        type: 'setTaxRate',
        payload: { kind: 'residential', rate: 0.5 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
      expect(s.population.cityHappiness).toBeLessThanOrEqual(25)
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(0)
    })

    it('maybeGrowZones in the miserable band returns identity when every cell is already at density 0', () => {
      // Direct unit test: a bucket of density-0 cells with a
      // miserable cityHappiness must not decline below 0. The
      // helper returns the input bucket reference unchanged.
      const zones = {
        cells: {
          '0,0': { kind: 'residential' as const, density: 0 as const },
          '0,1': { kind: 'commercial' as const, density: 0 as const },
        },
      }
      const next = maybeGrowZones(zones, 20, 10, {}, {})
      expect(next).toBe(zones)
    })

    it('growth resumes once happiness recovers above the threshold (tax cut path)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeTreatmentPlantGrowth(0, 1))
      s = applySimEvent(s, {
        type: 'setTaxRate',
        payload: { kind: 'residential', rate: 0.35 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(40, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
      // Player cuts the tax back below TAX_NEUTRAL_RATE so the tax
      // penalty drops to 0; coverage penalty alone (20) keeps
      // happiness at 80, comfortably above the 50 threshold.
      s = applySimEvent(s, {
        type: 'setTaxRate',
        payload: { kind: 'residential', rate: 0.07 },
        clientCreatedAt: 1,
        authorBuilderId: A_BUILDER,
      })
      // One non-growth tick lets happiness recompute under the new
      // tax rate before the next growth tick at tick 60.
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(2)
    })

    it('mixed-density bucket: only <3 cells advance', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeZone('commercial', 1, 1))
      // Force one cell to max density to test the cap-and-skip behavior.
      s = {
        ...s,
        zones: {
          cells: {
            ...s.zones.cells,
            '0,0': { kind: 'residential', density: 3 },
          },
        },
      }
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(3)
      expect(s.zones.cells['1,1']?.density).toBe(1)
    })

    it('paused sim does not grow', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, {
        type: 'setSpeed',
        payload: { speed: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(20, s)
      expect(s.tick).toBe(0)
      expect(s.zones.cells['0,0']?.density).toBe(0)
    })

    it('two replays of the same event log derive identical density progression', () => {
      const events: SimEvent[] = [
        placeZone('residential', 0, 0),
        ...Array.from({ length: 20 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a).toEqual(b)
    })
  })

  describe('per-tick zone growth power gating (REQ-081 power gate)', () => {
    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    function placeZone(
      kind: 'residential' | 'commercial' | 'industrial',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function placePlant(
      kind: 'coal' | 'solar',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placePowerPlant',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function runLine(row: number, col: number): SimEvent {
      return {
        type: 'runPowerLine',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function eraseLineEvent(row: number, col: number): SimEvent {
      return {
        type: 'eraseLine',
        payload: { row, col },
        clientCreatedAt: 1,
        authorBuilderId: A_BUILDER,
      }
    }

    it('city with no power infrastructure grows normally (back-compat)', () => {
      // Pre-electrical city: no plants, no lines. The call site
      // short-circuits the solve so `maybeGrowZones` sees an empty
      // `{}` powerStatus map; `undefined` is treated as no gate.
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
    })

    it('powered residential cell advances; unpowered residential stalls', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      // Drop a plant at (0,1). The 4-adjacent (0,0) cell becomes
      // 'powered'.
      s = applySimEvent(s, placePlant('coal', 0, 1))
      // Place a second zoned cell far from the plant (distance > 1
      // in 4-adjacency). It reads 'unpowered' from the solver.
      s = applySimEvent(s, placeZone('residential', 5, 5))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
      expect(s.zones.cells['5,5']?.density).toBe(0)
    })

    it('cutting power mid-game stalls a previously-growing cell', () => {
      // Plant is too far for direct 4-adjacency. A single power
      // line at (0,1) bridges the gap. Erasing that line takes
      // (0,0) back to 'unpowered'.
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placePlant('coal', 0, 3))
      s = applySimEvent(s, runLine(0, 1))
      s = applySimEvent(s, runLine(0, 2))
      s = tickN(40, s)
      expect(s.zones.cells['0,0']?.density).toBe(2)
      s = applySimEvent(s, eraseLineEvent(0, 1))
      s = tickN(20, s)
      // Density holds at 2; no decline because cityHappiness stays
      // in the stagnant or happy band (no severe penalty cascade).
      expect(s.zones.cells['0,0']?.density).toBe(2)
    })

    it('restoring power resumes a stalled cell', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      // Plant out of reach; (0,0) starts unpowered.
      s = applySimEvent(s, placePlant('coal', 5, 5))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(0)
      // Drop a plant adjacent to (0,0). The next growth tick advances.
      s = applySimEvent(s, placePlant('coal', 0, 1))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
    })

    it('miserable-band decline ignores power status (direct unit call)', () => {
      // Direct unit test of `maybeGrowZones` in the miserable band
      // with an 'unpowered' cell. The decline branch reads
      // cityHappiness, not powerStatus, so the cell still steps
      // down from density 1 to 0 even though it would be blocked
      // by the power gate in the growth branch.
      const zones = {
        cells: {
          '0,0': { kind: 'residential' as const, density: 1 as const },
        },
      }
      const powerStatus = { '0,0': 'unpowered' as const }
      const next = maybeGrowZones(zones, 20, 10, powerStatus, {})
      expect(next.cells['0,0']?.density).toBe(0)
    })

    it('happy band: powered cell grows; unpowered same-bucket cell stalls', () => {
      // Direct unit test of `maybeGrowZones` in the happy band
      // (cityHappiness 100) with a mixed-power bucket. Confirms the
      // gate operates per-cell, not bucket-wide.
      const zones = {
        cells: {
          '0,0': { kind: 'residential' as const, density: 1 as const },
          '5,5': { kind: 'residential' as const, density: 1 as const },
        },
      }
      const powerStatus = {
        '0,0': 'powered' as const,
        '5,5': 'unpowered' as const,
      }
      const next = maybeGrowZones(zones, 20, 100, powerStatus, {})
      expect(next.cells['0,0']?.density).toBe(2)
      expect(next.cells['5,5']?.density).toBe(1)
    })

    it('brownout status blocks growth same as unpowered', () => {
      const zones = {
        cells: {
          '0,0': { kind: 'residential' as const, density: 1 as const },
        },
      }
      const powerStatus = { '0,0': 'brownout' as const }
      const next = maybeGrowZones(zones, 20, 100, powerStatus, {})
      expect(next).toBe(zones)
    })
  })

  describe('per-tick zone growth water gating (REQ-090 water gate)', () => {
    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    function placeZone(
      kind: 'residential' | 'commercial' | 'industrial',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function placeWaterSource(
      kind: 'water-tower' | 'pump-station',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeWaterSource',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function runWaterPipe(row: number, col: number): SimEvent {
      return {
        type: 'runWaterPipe',
        payload: { kind: 'water', row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function eraseWaterPipeEvent(row: number, col: number): SimEvent {
      return {
        type: 'eraseWaterPipe',
        payload: { row, col },
        clientCreatedAt: 1,
        authorBuilderId: A_BUILDER,
      }
    }

    it('city with no water infrastructure grows normally (back-compat)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
    })

    it('served residential cell advances; unserved residential stalls', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeWaterSource('water-tower', 0, 1))
      s = applySimEvent(s, placeZone('residential', 5, 5))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(1)
      expect(s.zones.cells['5,5']?.density).toBe(0)
    })

    it('cutting water mid-game stalls a previously-growing cell', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeWaterSource('water-tower', 0, 3))
      s = applySimEvent(s, runWaterPipe(0, 1))
      s = applySimEvent(s, runWaterPipe(0, 2))
      s = tickN(40, s)
      expect(s.zones.cells['0,0']?.density).toBe(2)
      s = applySimEvent(s, eraseWaterPipeEvent(0, 1))
      s = tickN(20, s)
      expect(s.zones.cells['0,0']?.density).toBe(2)
    })

    it('water-only gate: powered + unserved cell stalls (direct unit call)', () => {
      // Both gates run in series. A cell with powered=powered but
      // waterStatus=unserved must still stall.
      const zones = {
        cells: {
          '0,0': { kind: 'residential' as const, density: 1 as const },
        },
      }
      const next = maybeGrowZones(
        zones,
        20,
        100,
        { '0,0': 'powered' as const },
        { '0,0': 'unserved' as const },
      )
      expect(next).toBe(zones)
    })

    it('both gates passing: powered + served cell advances', () => {
      const zones = {
        cells: {
          '0,0': { kind: 'residential' as const, density: 1 as const },
        },
      }
      const next = maybeGrowZones(
        zones,
        20,
        100,
        { '0,0': 'powered' as const },
        { '0,0': 'served' as const },
      )
      expect(next.cells['0,0']?.density).toBe(2)
    })

    it('water brownout blocks growth same as unserved', () => {
      const zones = {
        cells: {
          '0,0': { kind: 'residential' as const, density: 1 as const },
        },
      }
      const next = maybeGrowZones(
        zones,
        20,
        100,
        {},
        { '0,0': 'brownout' as const },
      )
      expect(next).toBe(zones)
    })
  })

  describe('per-tick waste accumulation (REQ-092 sewage slice 4)', () => {
    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    function placeRes(row: number, col: number): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind: 'residential', row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function placeTreatmentPlant(row: number, col: number): SimEvent {
      return {
        type: 'placeSewageTreatmentPlant',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function eraseZone(row: number, col: number): SimEvent {
      return {
        type: 'eraseZone',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('keeps wasteAccumulation empty before any populated cell exists', () => {
      const s = tickN(20, EMPTY_SIM_STATE)
      expect(s.water.wasteAccumulation).toEqual({})
    })

    it('increments waste each tick on an unmanaged populated cell', () => {
      // Place res at (0, 0). Wait 20 ticks for the first growth pass to
      // populate it, then 3 more ticks to accumulate waste.
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      s = tickN(20, s)
      // After growth, the cell is populated. The growth tick itself
      // bumps waste to 1 (cell is unmanaged, no sewage).
      expect(s.water.wasteAccumulation['0,0']).toBe(1)
      s = tickN(3, s)
      expect(s.water.wasteAccumulation['0,0']).toBe(4)
    })

    it('resets waste to 0 when the populated cell is drained', () => {
      // Res at (0, 1) adjacent to a treatment plant at (0, 0).
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 1))
      s = applySimEvent(s, placeTreatmentPlant(0, 0))
      s = tickN(20, s)
      expect(s.water.wasteAccumulation['0,1']).toBe(0)
    })

    it('caps waste at WASTE_MAX_PER_CELL after long unmanaged accumulation', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      // 20 ticks to grow + 200 ticks of unmanaged accumulation.
      // First growth bump = 1, then 199 more ticks adds up to 200 raw
      // but cap is 100, so we stop at 100.
      s = tickN(220, s)
      expect(s.water.wasteAccumulation['0,0']).toBe(100)
    })

    it('drops a waste entry for a cell that is no longer populated', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      s = tickN(20, s)
      expect(s.water.wasteAccumulation['0,0']).toBe(1)
      // Erasing the zone clears population on the next growth tick.
      s = applySimEvent(s, eraseZone(0, 0))
      s = tickN(20, s)
      expect(s.water.wasteAccumulation['0,0']).toBeUndefined()
    })

    it('two replays of a mixed waste event log derive identical state', () => {
      const events: SimEvent[] = [
        placeRes(0, 1),
        placeTreatmentPlant(0, 0),
        ...Array.from({ length: 25 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.water).toEqual(b.water)
    })
  })

  describe('earthquake happiness penalty (REQ-105 slice 6)', () => {
    function spawnEarthquake(row: number, col: number): SimEvent {
      return {
        type: 'spawnDisaster',
        payload: { kind: 'earthquake', row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    it('a single active earthquake drops happiness by EARTHQUAKE_HAPPINESS_PENALTY', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, spawnEarthquake(0, 0))
      // Tick once so the happiness reducer fires.
      s = tickN(1, s)
      expect(s.population.cityHappiness).toBe(75) // 100 - 25
    })

    it('two simultaneous earthquakes stack their penalties', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, spawnEarthquake(0, 0))
      s = applySimEvent(s, spawnEarthquake(1, 1))
      s = tickN(1, s)
      expect(s.population.cityHappiness).toBe(50) // 100 - 50
    })

    it('happiness rebounds when the earthquake expires', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, spawnEarthquake(0, 0))
      // Earthquake default duration = 20 ticks.
      s = tickN(20, s)
      expect(s.disasters.active).toHaveLength(0)
      expect(s.population.cityHappiness).toBe(100)
    })

    it('floors at 0 when penalties exceed the base score', () => {
      // Five earthquakes = 125 penalty; floors at 0.
      let s: SimState = EMPTY_SIM_STATE
      for (let i = 0; i < 5; i++) {
        s = applySimEvent(s, spawnEarthquake(i, 0))
      }
      s = tickN(1, s)
      expect(s.population.cityHappiness).toBe(0)
    })

    it('two replays of an earthquake event log produce identical happiness', () => {
      const events: SimEvent[] = [
        spawnEarthquake(0, 0),
        ...Array.from({ length: 10 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.population.cityHappiness).toBe(b.population.cityHappiness)
    })
  })

  describe('per-tick city happiness (REQ-092 sewage slice 5)', () => {
    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    function placeRes(row: number, col: number): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind: 'residential', row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function placeTreatmentPlant(row: number, col: number): SimEvent {
      return {
        type: 'placeSewageTreatmentPlant',
        payload: { row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('starts at 100 with no populated cells', () => {
      const s = tickN(20, EMPTY_SIM_STATE)
      expect(s.population.cityHappiness).toBe(100)
    })

    it('drops below 100 when an unmanaged populated cell accumulates waste', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      s = tickN(20, s) // grows + 1 waste tick
      expect(s.population.cityHappiness).toBeLessThan(100)
    })

    it('drained-but-uncovered city sits at 80 (REQ-076 coverage penalty)', () => {
      // Drained sewage = 0 waste penalty, but no services within
      // coverage = full 20 service-coverage penalty.
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 1))
      s = applySimEvent(s, placeTreatmentPlant(0, 0))
      s = tickN(20, s)
      expect(s.population.cityHappiness).toBe(80)
    })

    it('drops to 30 when every populated cell sits at WASTE_MAX_PER_CELL with no services (REQ-076 weights)', () => {
      // waste penalty = WASTE_HAPPINESS_WEIGHT (50) + service penalty
      // = 5 * COVERAGE_HAPPINESS_WEIGHT (20). 100 - 50 - 20 = 30.
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      s = tickN(220, s)
      expect(s.water.wasteAccumulation['0,0']).toBe(100)
      expect(s.population.cityHappiness).toBe(30)
    })

    it('residential tax above TAX_NEUTRAL_RATE drops happiness by (rate - neutral) * TAX_HAPPINESS_WEIGHT', () => {
      // Drained sewage + treatment plant in coverage = 80 baseline (no
      // tax penalty at default 7% since 7% < TAX_NEUTRAL_RATE 10%).
      // Raising residential tax to 14% adds tax penalty
      // = (0.14 - 0.10) * 200 = 8, so happiness drops to 72.
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 1))
      s = applySimEvent(s, placeTreatmentPlant(0, 0))
      s = applySimEvent(s, setTax('residential', 0.14))
      s = tickN(20, s)
      expect(s.population.cityHappiness).toBe(72)
    })

    it('two replays of the same event log derive identical happiness', () => {
      const events: SimEvent[] = [
        placeRes(0, 0),
        placeRes(0, 1),
        placeTreatmentPlant(0, 2),
        ...Array.from({ length: 30 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.population.cityHappiness).toBe(b.population.cityHappiness)
    })

    it('crossing a population milestone for the first time records highestMilestoneReached + lastMilestoneTick (mass-appeal slice)', () => {
      // First small house tips totalPopulation from 0 -> 4, which
      // crosses the 4-resident milestone at tick 20. Tax 0.35 +
      // treatment plant lands tick-20 happiness in the stagnant
      // band so density stays 1 and the milestone does not advance
      // past 4 on the next growth tick.
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      s = applySimEvent(s, placeTreatmentPlant(0, 1))
      s = applySimEvent(s, {
        type: 'setTaxRate',
        payload: { kind: 'residential', rate: 0.35 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(20, s)
      expect(s.population.totalPopulation).toBe(4)
      expect(s.population.highestMilestoneReached).toBe(4)
      expect(s.population.lastMilestoneTick).toBe(20)
      const beforeRetrigger = s.population.lastMilestoneTick
      // Stagnant band: density holds at 1, totalPopulation stays 4.
      // The milestone does not retrigger at the same population.
      s = tickN(20, s)
      expect(s.population.totalPopulation).toBe(4)
      expect(s.population.lastMilestoneTick).toBe(beforeRetrigger)
    })

    it('decline that drops totalPopulation below a previous milestone does NOT clear the record (mass-appeal slice)', () => {
      // Place residential, set tax to 50% so the city declines back
      // to density 0 + residents 0. The 4-resident milestone was
      // already crossed at tick 20; after the decline at tick 40 it
      // stays recorded.
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      s = applySimEvent(s, placeTreatmentPlant(0, 1))
      s = applySimEvent(s, {
        type: 'setTaxRate',
        payload: { kind: 'residential', rate: 0.5 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(40, s)
      expect(s.population.totalPopulation).toBe(0)
      expect(s.population.highestMilestoneReached).toBe(4)
    })

    it('placing residentials that cross multiple milestones at once records the HIGHEST one (mass-appeal slice)', () => {
      // Forge zone state into a single density-3 cell (40 residents)
      // by manually nudging the bucket, then verify the milestone
      // jumps directly to 40 instead of stopping at 4 / 12.
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      s = {
        ...s,
        zones: {
          cells: { '0,0': { kind: 'residential', density: 3 } },
        },
      }
      s = tickN(20, s)
      expect(s.population.totalPopulation).toBe(40)
      expect(s.population.highestMilestoneReached).toBe(40)
    })

    it('abandoned cells damp happiness so the post-decline oscillation slows (REQ-079 follow-on)', () => {
      // Place a residential cell, set tax to 50%, drain sewage so
      // happiness only suffers from coverage + tax. Tick 20 grows
      // (density 1, residents=4), happiness post-tick = 0
      // (miserable). Tick 40 declines back to density 0;
      // syncPopulationToZones sets residents=0 on the same tick.
      // After tick 40 happiness recomputes: populatedKeys is empty
      // (no residents) so waste / coverage / tax all read 0; the
      // abandoned-cell penalty (zone density 0 + population entry
      // present) drops happiness from 100 to 100 - 6 = 94.
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      s = applySimEvent(s, placeTreatmentPlant(0, 1))
      s = applySimEvent(s, {
        type: 'setTaxRate',
        payload: { kind: 'residential', rate: 0.5 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(40, s)
      expect(s.zones.cells['0,0']?.density).toBe(0)
      expect(s.population.cells['0,0']?.residents).toBe(0)
      expect(s.population.cityHappiness).toBe(94)
    })

    it('abandoned penalty scales linearly per cell up to the cap (REQ-079 calibration)', () => {
      // Direct call to computeCityHappiness with a hand-built state
      // proving the penalty boundaries: 1 cell = 6, 5 cells = 30,
      // 10 cells = 60 (cap), 20 cells = 60 (cap held).
      const buildState = (
        abandonedCount: number,
      ): {
        water: SimState['water']
        population: SimState['population']
        disasters: SimState['disasters']
        services: SimState['services']
        zones: SimState['zones']
        taxRates: SimState['taxRates']
      } => {
        const zoneCells: Record<string, { kind: 'residential'; density: 0 }> =
          {}
        const popCells: Record<string, { residents: 0; tripDemand: 0 }> = {}
        for (let i = 0; i < abandonedCount; i++) {
          const key = `0,${i}`
          zoneCells[key] = { kind: 'residential', density: 0 }
          popCells[key] = { residents: 0, tripDemand: 0 }
        }
        return {
          water: {
            sources: [],
            pipes: {},
            treatmentPlants: [],
            wasteAccumulation: {},
          },
          population: {
            cells: popCells,
            totalPopulation: 0,
            totalTripDemand: 0,
            cityHappiness: 100,
            highestMilestoneReached: 0,
            lastMilestoneTick: 0,
          },
          disasters: { active: [] },
          services: { buildings: [] },
          zones: { cells: zoneCells },
          taxRates: { residential: 0.07, commercial: 0.07, industrial: 0.05 },
        }
      }
      const callForCount = (n: number): number => {
        const s = buildState(n)
        return computeCityHappiness(
          s.water,
          s.population,
          s.disasters,
          s.services,
          s.zones,
          s.taxRates,
        )
      }
      expect(callForCount(0)).toBe(100)
      expect(callForCount(1)).toBe(94)
      expect(callForCount(5)).toBe(70)
      expect(callForCount(10)).toBe(40)
      expect(callForCount(11)).toBe(40)
      expect(callForCount(20)).toBe(40)
    })

    it('orphan-populated cell (zone erased, population not yet resynced) contributes 0 coverage (F-017 regression)', () => {
      // Stand up a residential cell at (0, 1), drain its waste with
      // a treatment plant at (0, 0), and place a fire-station at
      // (0, 2) within fire-station Manhattan radius. Grow once so
      // residents=4 and populatedKeys has a single entry. With the
      // fire-station in range, baseline happiness would compute
      // coverageCount=1 -> avgCoverage=1 -> coveragePenalty=16, so
      // happiness sits at 84 (100 - 0 waste - 16 coverage).
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 1))
      s = applySimEvent(s, placeTreatmentPlant(0, 0))
      s = applySimEvent(s, {
        type: 'placeServiceBuilding',
        payload: { kind: 'fire-station', row: 0, col: 2 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      s = tickN(20, s)
      expect(s.zones.cells['0,1']?.density).toBe(1)
      expect(s.population.cells['0,1']?.residents).toBe(4)
      expect(s.population.cityHappiness).toBe(84)
      // Erase the zone mid-cycle (between tick 20 and tick 40, when
      // syncPopulationToZones would next run).
      s = applySimEvent(s, {
        type: 'eraseZone',
        payload: { row: 0, col: 1 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(s.zones.cells['0,1']).toBeUndefined()
      expect(s.population.cells['0,1']?.residents).toBe(4)
      // Direct call avoids the wasteTick + happiness reducer path
      // and isolates the membership-gate behavior. With the gate,
      // the orphan contributes 0 coverage (the implicit 0 from the
      // prior `coverageMap[key] === undefined` branch), so
      // coveragePenalty = (5 - 0) * 4 = 20 and happiness drops to
      // 80. Without the gate, the fire-station at (0, 2) would
      // raise the orphan's coverageCount to 1, coveragePenalty to
      // 16, and happiness back to 84 (matching the pre-erase
      // baseline). The 80-vs-84 gap is the gate doing its job.
      const happinessOrphan = computeCityHappiness(
        s.water,
        s.population,
        s.disasters,
        s.services,
        s.zones,
        s.taxRates,
      )
      expect(happinessOrphan).toBe(80)
    })
  })

  describe('commercial / industrial revenue (REQ-083 slice 1)', () => {
    function placeZone(
      kind: 'residential' | 'commercial' | 'industrial',
      row: number,
      col: number,
    ): SimEvent {
      return {
        type: 'placeZone',
        payload: { kind, row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    it('commercial zone at density 1 generates jobs * tax-rate per tick', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('commercial', 0, 0))
      // 20 ticks to grow from 0 to density 1.
      s = tickN(20, s)
      // Commercial density 1 = 3 jobs. Default rate = 0.07. Income = 0.21/tick.
      expect(s.economy.lastTickIncome).toBeCloseTo(0.21, 5)
    })

    it('industrial zone at density 1 generates jobs * industrial-rate per tick', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeZone('industrial', 0, 0))
      s = tickN(20, s)
      // Industrial density 1 = 4 jobs. Default rate = 0.05. Income = 0.20/tick.
      expect(s.economy.lastTickIncome).toBeCloseTo(0.20, 5)
    })

    it('residential + commercial + industrial all stack additively', () => {
      let s: SimState = EMPTY_SIM_STATE
      s = applySimEvent(s, placeZone('residential', 0, 0))
      s = applySimEvent(s, placeZone('commercial', 0, 1))
      s = applySimEvent(s, placeZone('industrial', 0, 2))
      s = tickN(20, s)
      // Residential density 1: 4 residents * 0.07 = 0.28
      // Commercial density 1: 3 jobs * 0.07 = 0.21
      // Industrial density 1: 4 jobs * 0.05 = 0.20
      // Total: 0.69
      expect(s.economy.lastTickIncome).toBeCloseTo(0.69, 5)
    })

    it('two replays of a mixed-zone event log produce identical economy state', () => {
      const events: SimEvent[] = [
        placeZone('residential', 0, 0),
        placeZone('commercial', 0, 1),
        placeZone('industrial', 0, 2),
        ...Array.from({ length: 25 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.economy).toEqual(b.economy)
    })
  })

  describe('bankruptcy countdown (REQ-095 slice 3)', () => {
    function tickN(times: number, start: SimState): SimState {
      let s = start
      for (let i = 0; i < times; i++) {
        s = applySimEvent(s, {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      return s
    }

    function placeCoal(row: number, col: number): SimEvent {
      return {
        type: 'placePowerPlant',
        payload: { kind: 'coal', row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('counter is 0 when treasury is positive', () => {
      const s = tickN(5, EMPTY_SIM_STATE)
      expect(s.economy.bankruptcyTickCounter).toBe(0)
    })

    it('counter increments per tick once treasury drops below 0', () => {
      // Six coal plants drives treasury negative (-4000); per-tick
      // maintenance keeps it negative.
      let s: SimState = EMPTY_SIM_STATE
      for (let i = 0; i < 6; i++) s = applySimEvent(s, placeCoal(i, 0))
      // Treasury is -4000 here but no tick has fired yet, so counter
      // is still 0.
      expect(s.economy.bankruptcyTickCounter).toBe(0)
      s = tickN(1, s)
      expect(s.economy.bankruptcyTickCounter).toBe(1)
      s = tickN(4, s)
      expect(s.economy.bankruptcyTickCounter).toBe(5)
    })

    it('full economy bucket auto-resets at the bailout tick (REQ-095 slice 4 follow-on)', () => {
      // Six coal plants put treasury at -4000 immediately; per-tick
      // maintenance keeps it negative. Run BANKRUPTCY_THRESHOLD_TICKS
      // ticks; the bailout fires on the threshold-th tick and the
      // economy bucket flips to the full EMPTY_ECONOMY_BUCKET shape:
      // treasury back to INITIAL_TREASURY, counter zeroed, last-tick
      // readouts zeroed.
      let s: SimState = EMPTY_SIM_STATE
      for (let i = 0; i < 6; i++) s = applySimEvent(s, placeCoal(i, 0))
      s = tickN(BANKRUPTCY_THRESHOLD_TICKS, s)
      expect(s.economy.bankruptcyTickCounter).toBe(0)
      expect(s.economy.treasury).toBe(20000)
      expect(s.economy.lastTickIncome).toBe(0)
      expect(s.economy.lastTickMaintenance).toBe(0)
    })

    it('treasury restores to INITIAL_TREASURY at the auto-reset tick (REQ-095 slice 4 follow-on)', () => {
      // applyEconomyTick called directly with a bucket one tick away
      // from saturation under a deficit configuration. The next tick
      // increments the counter to BANKRUPTCY_THRESHOLD_TICKS, which
      // triggers the auto-reset path: the returned bucket is the
      // EMPTY_ECONOMY_BUCKET shape (treasury 20000, counter 0).
      const oneTickAway: EconomyBucket = {
        treasury: -100,
        lastTickIncome: 0,
        lastTickMaintenance: 0.5,
        bankruptcyTickCounter: BANKRUPTCY_THRESHOLD_TICKS - 1,
        lastAutoBailoutTick: 0,
      }
      const next = applyEconomyTick(
        oneTickAway,
        {
          cells: {},
          totalPopulation: 0,
          totalTripDemand: 0,
          cityHappiness: 100,
          highestMilestoneReached: 0,
          lastMilestoneTick: 0,
        },
        { plants: [{ kind: 'coal', row: 0, col: 0 }], lines: {} },
        { residential: 0.07, commercial: 0.07, industrial: 0.05 },
        { cells: {} },
      )
      expect(next.bankruptcyTickCounter).toBe(0)
      expect(next.treasury).toBe(20000)
      expect(next.lastTickIncome).toBe(0)
      expect(next.lastTickMaintenance).toBe(0)
    })

    it('lastAutoBailoutTick is set to the firing tick when the bailout fires (REQ-095 slice 4 follow-on)', () => {
      const oneTickAway: EconomyBucket = {
        treasury: -100,
        lastTickIncome: 0,
        lastTickMaintenance: 0.5,
        bankruptcyTickCounter: BANKRUPTCY_THRESHOLD_TICKS - 1,
        lastAutoBailoutTick: 0,
      }
      const FIRING_TICK = 12345
      const next = applyEconomyTick(
        oneTickAway,
        {
          cells: {},
          totalPopulation: 0,
          totalTripDemand: 0,
          cityHappiness: 100,
          highestMilestoneReached: 0,
          lastMilestoneTick: 0,
        },
        { plants: [{ kind: 'coal', row: 0, col: 0 }], lines: {} },
        { residential: 0.07, commercial: 0.07, industrial: 0.05 },
        { cells: {} },
        FIRING_TICK,
      )
      expect(next.lastAutoBailoutTick).toBe(FIRING_TICK)
    })

    it('per-tick reducer resets the counter when treasury is non-negative', () => {
      // applyEconomyTick called directly to exercise both branches.
      const seed: EconomyBucket = {
        treasury: 100,
        lastTickIncome: 0,
        lastTickMaintenance: 0,
        bankruptcyTickCounter: 5,
        lastAutoBailoutTick: 0,
      }
      const next = applyEconomyTick(
        seed,
        {
          cells: {},
          totalPopulation: 0,
          totalTripDemand: 0,
          cityHappiness: 100,
          highestMilestoneReached: 0,
          lastMilestoneTick: 0,
        },
        { plants: [], lines: {} },
        { residential: 0.07, commercial: 0.07, industrial: 0.05 },
        { cells: {} },
      )
      expect(next.bankruptcyTickCounter).toBe(0)
    })

    it('two replays of an event log driving negative treasury produce identical counters', () => {
      const events: SimEvent[] = [
        placeCoal(0, 0),
        placeCoal(1, 0),
        placeCoal(2, 0),
        placeCoal(3, 0),
        placeCoal(4, 0),
        placeCoal(5, 0),
        ...Array.from({ length: 30 }, (_, i) => ({
          type: 'tick' as const,
          payload: { deltaMs: 250 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })),
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a.economy.bankruptcyTickCounter).toBe(
        b.economy.bankruptcyTickCounter,
      )
      expect(a.economy.bankruptcyTickCounter).toBeGreaterThan(0)
    })
  })

  describe('resetBudget + resetCity (REQ-095 slice 4)', () => {
    function placeCoal(row: number, col: number): SimEvent {
      return {
        type: 'placePowerPlant',
        payload: { kind: 'coal', row, col },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
    }

    it('resetBudget restores treasury to INITIAL_TREASURY', () => {
      // Drive treasury negative with 6 coal plants ($24,000 vs $20,000).
      let s: SimState = EMPTY_SIM_STATE
      for (let i = 0; i < 6; i++) s = applySimEvent(s, placeCoal(i, 0))
      expect(s.economy.treasury).toBe(-4000)
      const next = applySimEvent(s, {
        type: 'resetBudget',
        payload: {},
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(next.economy.treasury).toBe(20000)
    })

    it('resetBudget zeros bankruptcyTickCounter', () => {
      let s: SimState = EMPTY_SIM_STATE
      for (let i = 0; i < 6; i++) s = applySimEvent(s, placeCoal(i, 0))
      // One tick to set the counter.
      s = applySimEvent(s, {
        type: 'tick',
        payload: { deltaMs: 250 },
        clientCreatedAt: 1,
        authorBuilderId: A_BUILDER,
      })
      expect(s.economy.bankruptcyTickCounter).toBe(1)
      const next = applySimEvent(s, {
        type: 'resetBudget',
        payload: {},
        clientCreatedAt: 2,
        authorBuilderId: A_BUILDER,
      })
      expect(next.economy.bankruptcyTickCounter).toBe(0)
    })

    it('resetBudget preserves placed infrastructure (other layers untouched)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeCoal(0, 0))
      s = applySimEvent(s, {
        type: 'placeZone',
        payload: { kind: 'residential', row: 1, col: 1 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      const next = applySimEvent(s, {
        type: 'resetBudget',
        payload: {},
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(next.power.plants).toHaveLength(1)
      expect(next.zones.cells['1,1']).toBeDefined()
    })

    it('resetCity returns the EMPTY_SIM_STATE reference', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeCoal(0, 0))
      s = applySimEvent(s, {
        type: 'placeZone',
        payload: { kind: 'residential', row: 1, col: 1 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      const next = applySimEvent(s, {
        type: 'resetCity',
        payload: {},
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(next).toBe(EMPTY_SIM_STATE)
    })

    it('two replays of an event log including resetBudget produce identical state', () => {
      const events: SimEvent[] = [
        placeCoal(0, 0),
        placeCoal(1, 0),
        placeCoal(2, 0),
        placeCoal(3, 0),
        placeCoal(4, 0),
        placeCoal(5, 0),
        {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: 0,
          authorBuilderId: A_BUILDER,
        },
        {
          type: 'resetBudget',
          payload: {},
          clientCreatedAt: 1,
          authorBuilderId: A_BUILDER,
        },
        {
          type: 'tick',
          payload: { deltaMs: 250 },
          clientCreatedAt: 2,
          authorBuilderId: A_BUILDER,
        },
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a).toEqual(b)
    })
  })

  describe('build cost on placement (REQ-095 slice 2)', () => {
    it('placing a residential zone deducts ZONE_BUILD_COST.residential', () => {
      const s = applySimEvent(EMPTY_SIM_STATE, {
        type: 'placeZone',
        payload: { kind: 'residential', row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(s.economy.treasury).toBe(19950)
    })

    it('placing a coal plant deducts POWER_PLANT_BUILD_COST.coal', () => {
      const s = applySimEvent(EMPTY_SIM_STATE, {
        type: 'placePowerPlant',
        payload: { kind: 'coal', row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(s.economy.treasury).toBe(16000)
    })

    it('running a power line deducts POWER_LINE_BUILD_COST', () => {
      const s = applySimEvent(EMPTY_SIM_STATE, {
        type: 'runPowerLine',
        payload: { row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(s.economy.treasury).toBe(19995)
    })

    it('placing a hospital deducts SERVICE_BUILD_COST.hospital', () => {
      const s = applySimEvent(EMPTY_SIM_STATE, {
        type: 'placeServiceBuilding',
        payload: { kind: 'hospital', row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(s.economy.treasury).toBe(18500)
    })

    it('placing a sewage treatment plant deducts SEWAGE_TREATMENT_BUILD_COST', () => {
      const s = applySimEvent(EMPTY_SIM_STATE, {
        type: 'placeSewageTreatmentPlant',
        payload: { row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      expect(s.economy.treasury).toBe(17500)
    })

    it('does NOT charge again on a duplicate place (idempotent path)', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, {
        type: 'placePowerPlant',
        payload: { kind: 'coal', row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      })
      const after = s
      s = applySimEvent(s, {
        type: 'placePowerPlant',
        payload: { kind: 'coal', row: 0, col: 0 },
        clientCreatedAt: 1,
        authorBuilderId: A_BUILDER,
      })
      expect(s).toBe(after) // identity on duplicate
      expect(s.economy.treasury).toBe(16000)
    })

    it('treasury is allowed to go negative when build cost exceeds balance', () => {
      // Five coal plants = 20000 spent, sixth pushes treasury negative.
      let s: SimState = EMPTY_SIM_STATE
      for (let i = 0; i < 6; i++) {
        s = applySimEvent(s, {
          type: 'placePowerPlant',
          payload: { kind: 'coal', row: i, col: 0 },
          clientCreatedAt: i,
          authorBuilderId: A_BUILDER,
        })
      }
      expect(s.economy.treasury).toBe(20000 - 6 * 4000)
      expect(s.economy.treasury).toBeLessThan(0)
    })
  })

  describe('reduceSimEvents over the full zoning vocabulary', () => {
    it('replays place + erase deterministically', () => {
      const events: SimEvent[] = [
        {
          type: 'placeZone',
          payload: { kind: 'residential', row: 0, col: 0 },
          clientCreatedAt: 0,
          authorBuilderId: A_BUILDER,
        },
        {
          type: 'placeZone',
          payload: { kind: 'commercial', row: 0, col: 1 },
          clientCreatedAt: 1,
          authorBuilderId: A_BUILDER,
        },
        {
          type: 'eraseZone',
          payload: { row: 0, col: 0 },
          clientCreatedAt: 2,
          authorBuilderId: A_BUILDER,
        },
      ]
      const final = applyMany(EMPTY_SIM_STATE, events)
      expect(final.zones.cells['0,0']).toBeUndefined()
      expect(final.zones.cells['0,1']?.kind).toBe('commercial')
    })

    it('two replays of the same event log produce identical zoning state', () => {
      const events: SimEvent[] = [
        {
          type: 'placeZone',
          payload: { kind: 'residential', row: 0, col: 0 },
          clientCreatedAt: 0,
          authorBuilderId: A_BUILDER,
        },
        {
          type: 'placeZone',
          payload: { kind: 'industrial', row: 5, col: 5 },
          clientCreatedAt: 1,
          authorBuilderId: B_BUILDER,
        },
      ]
      const a = applyMany(EMPTY_SIM_STATE, events)
      const b = applyMany(EMPTY_SIM_STATE, events)
      expect(a).toEqual(b)
    })
  })
})

function applyMany(
  start: import('@/lib/sim/state').SimState,
  events: SimEvent[],
): import('@/lib/sim/state').SimState {
  let s = start
  for (const event of events) {
    s = applySimEvent(s, event)
  }
  return s
}

describe('reduceSimEvents', () => {
  it('returns the empty state for an empty event list', () => {
    expect(reduceSimEvents([])).toEqual(EMPTY_SIM_STATE)
  })

  it('replays a sequence of ticks deterministically', () => {
    const events = [tick(250, 0), tick(250, 1), tick(250, 2)]
    const final = reduceSimEvents(events)
    expect(final.tick).toBe(3)
    expect(final.simTimeMs).toBe(750)
  })

  it('honors setSpeed pausing mid-sequence', () => {
    const events = [
      tick(250, 0),
      setSpeed(0, 1),
      tick(250, 2),
      tick(250, 3),
      setSpeed(1, 4),
      tick(250, 5),
    ]
    const final = reduceSimEvents(events)
    expect(final.tick).toBe(2)
    expect(final.simTimeMs).toBe(500)
    expect(final.speed).toBe(1)
  })

  it('honors a tax-rate change mid-sequence', () => {
    const events = [
      setTax('industrial', 0.08, 0),
      tick(250, 1),
    ]
    const final = reduceSimEvents(events)
    expect(final.taxRates.industrial).toBeCloseTo(0.08, 5)
  })

  it('produces identical state for two replays of the same events (determinism)', () => {
    const events: SimEvent[] = [
      tick(250, 0),
      setSpeed(2, 1),
      tick(250, 2),
      setTax('residential', 0.09, 3),
      tick(250, 4),
    ]
    const a = reduceSimEvents(events)
    const b = reduceSimEvents(events)
    expect(a).toEqual(b)
  })

  it('produces identical state regardless of which client replays the same log', () => {
    const events: SimEvent[] = [
      { ...tick(250, 0), authorBuilderId: A_BUILDER },
      { ...setSpeed(2, 1), authorBuilderId: B_BUILDER },
      { ...tick(250, 2), authorBuilderId: A_BUILDER },
    ]
    const a = reduceSimEvents(events)
    const b = reduceSimEvents(events)
    expect(a).toEqual(b)
  })

  it('starts from a non-empty initial state when one is provided', () => {
    const start: SimState = { ...EMPTY_SIM_STATE, tick: 100, simTimeMs: 25000 }
    const final = reduceSimEvents([tick(250, 0)], start)
    expect(final.tick).toBe(101)
    expect(final.simTimeMs).toBe(25250)
  })
})
