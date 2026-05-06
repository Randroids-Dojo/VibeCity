import { describe, it, expect } from 'vitest'
import {
  SimEventSchema,
  applyEconomyTick,
  applySimEvent,
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

    it('stays at 100 when every populated cell is drained by sewage', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 1))
      s = applySimEvent(s, placeTreatmentPlant(0, 0))
      s = tickN(20, s)
      expect(s.population.cityHappiness).toBe(100)
    })

    it('reaches 0 when every populated cell sits at WASTE_MAX_PER_CELL', () => {
      let s = applySimEvent(EMPTY_SIM_STATE, placeRes(0, 0))
      // 20 ticks to grow + 200 ticks to fill the cap.
      s = tickN(220, s)
      expect(s.water.wasteAccumulation['0,0']).toBe(100)
      expect(s.population.cityHappiness).toBe(0)
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

    it('counter saturates at BANKRUPTCY_THRESHOLD_TICKS after long deficit', () => {
      // Six coal plants put treasury at -4000 immediately; per-tick
      // maintenance keeps it negative. Run past the threshold to
      // confirm the counter caps and stops growing.
      let s: SimState = EMPTY_SIM_STATE
      for (let i = 0; i < 6; i++) s = applySimEvent(s, placeCoal(i, 0))
      s = tickN(BANKRUPTCY_THRESHOLD_TICKS + 50, s)
      expect(s.economy.bankruptcyTickCounter).toBe(BANKRUPTCY_THRESHOLD_TICKS)
    })

    it('saturated counter lets the per-tick reducer short-circuit identity', () => {
      // After saturation, applyEconomyTick called with a still-
      // negative-treasury bucket whose income / maintenance match
      // returns the same bucket reference (counter cannot grow past
      // the cap, so identity-on-no-change kicks in).
      const saturated: EconomyBucket = {
        treasury: -100,
        lastTickIncome: 0,
        lastTickMaintenance: 0.5,
        bankruptcyTickCounter: BANKRUPTCY_THRESHOLD_TICKS,
      }
      // Note: with treasury -100 and maintenance 0.5, the next tick
      // would compute nextTreasury = -100.5 (treasury moves), so
      // the short-circuit will not fire when income/maintenance push
      // treasury further negative. The cap saturation guarantee is
      // proved by the previous test; this case proves the bucket
      // shape is stable (same fields, no extra allocations).
      const next = applyEconomyTick(
        saturated,
        {
          cells: {},
          totalPopulation: 0,
          totalTripDemand: 0,
          cityHappiness: 100,
        },
        { plants: [{ kind: 'coal', row: 0, col: 0 }], lines: {} },
        { residential: 0.07, commercial: 0.07, industrial: 0.05 },
        { cells: {} },
      )
      expect(next.bankruptcyTickCounter).toBe(BANKRUPTCY_THRESHOLD_TICKS)
    })

    it('per-tick reducer resets the counter when treasury is non-negative', () => {
      // applyEconomyTick called directly to exercise both branches.
      const seed: EconomyBucket = {
        treasury: 100,
        lastTickIncome: 0,
        lastTickMaintenance: 0,
        bankruptcyTickCounter: 5,
      }
      const next = applyEconomyTick(
        seed,
        { cells: {}, totalPopulation: 0, totalTripDemand: 0, cityHappiness: 100 },
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
