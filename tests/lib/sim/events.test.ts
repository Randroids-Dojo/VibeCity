import { describe, it, expect } from 'vitest'
import {
  SimEventSchema,
  applySimEvent,
  reduceSimEvents,
  type SimEvent,
  type TickEvent,
  type SetSpeedEvent,
  type SetTaxRateEvent,
} from '@/lib/sim/events'
import { EMPTY_SIM_STATE, type SimState } from '@/lib/sim/state'

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

  describe('layer-specific events (forward-compat)', () => {
    it('returns state unchanged for placePowerPlant (REQ-085 not landed yet)', () => {
      const event: SimEvent = {
        type: 'placePowerPlant',
        payload: { kind: 'coal', row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
      const next = applySimEvent(EMPTY_SIM_STATE, event)
      expect(next).toBe(EMPTY_SIM_STATE)
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
