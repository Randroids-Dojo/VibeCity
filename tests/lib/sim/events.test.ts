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
    it('returns state unchanged for placeZone (REQ-080 not landed yet)', () => {
      const event: SimEvent = {
        type: 'placeZone',
        payload: { kind: 'residential', row: 0, col: 0 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }
      const next = applySimEvent(EMPTY_SIM_STATE, event)
      expect(next).toBe(EMPTY_SIM_STATE)
    })

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
})

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
