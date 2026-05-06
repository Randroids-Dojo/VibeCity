import { describe, it, expect } from 'vitest'
import {
  SNAPSHOT_EVERY_N_EVENTS,
  shouldSnapshot,
  buildSnapshot,
  parseEventStrings,
} from '@/lib/sim/snapshot'
import { EMPTY_SIM_STATE, type SimState } from '@/lib/sim/state'
import type { SimEvent } from '@/lib/sim/events'

const A_BUILDER = '11111111-2222-3333-4444-555555555555'

function tick(deltaMs: number, t = 0): SimEvent {
  return {
    type: 'tick',
    payload: { deltaMs },
    clientCreatedAt: t,
    authorBuilderId: A_BUILDER,
  }
}

function setSpeed(speed: 0 | 1 | 2 | 4, t = 0): SimEvent {
  return {
    type: 'setSpeed',
    payload: { speed },
    clientCreatedAt: t,
    authorBuilderId: A_BUILDER,
  }
}

describe('SNAPSHOT_EVERY_N_EVENTS', () => {
  it('matches the Q-013 default (1000)', () => {
    expect(SNAPSHOT_EVERY_N_EVENTS).toBe(1000)
  })
})

describe('shouldSnapshot', () => {
  it('returns false when below threshold', () => {
    expect(shouldSnapshot(999, 0)).toBe(false)
  })

  it('returns true at exactly the threshold', () => {
    expect(shouldSnapshot(1000, 0)).toBe(true)
  })

  it('returns true past the threshold', () => {
    expect(shouldSnapshot(1500, 0)).toBe(true)
  })

  it('returns false when threshold not crossed since last snapshot', () => {
    expect(shouldSnapshot(1500, 1000)).toBe(false)
  })

  it('returns true when threshold crossed since last snapshot', () => {
    expect(shouldSnapshot(2000, 1000)).toBe(true)
  })

  it('treats negative cursor as 0 (defensive against KV NaN)', () => {
    expect(shouldSnapshot(1000, -5)).toBe(true)
  })

  it('returns false on negative current length', () => {
    expect(shouldSnapshot(-1, 0)).toBe(false)
  })

  it('returns false on non-finite current length', () => {
    expect(shouldSnapshot(Number.NaN, 0)).toBe(false)
  })
})

describe('buildSnapshot', () => {
  it('returns the empty sim state when no previous + no events', () => {
    expect(buildSnapshot(null, [])).toEqual(EMPTY_SIM_STATE)
  })

  it('returns the previous snapshot unchanged when no events', () => {
    const prev: SimState = {
      ...EMPTY_SIM_STATE,
      tick: 100,
      simTimeMs: 25000,
    }
    expect(buildSnapshot(prev, [])).toEqual(prev)
  })

  it('folds events on top of the empty state when no previous', () => {
    const result = buildSnapshot(null, [tick(250, 0), tick(250, 1)])
    expect(result.tick).toBe(2)
    expect(result.simTimeMs).toBe(500)
  })

  it('folds events on top of a previous snapshot', () => {
    const prev: SimState = {
      ...EMPTY_SIM_STATE,
      tick: 100,
      simTimeMs: 25000,
    }
    const result = buildSnapshot(prev, [tick(250, 0), setSpeed(2, 1)])
    expect(result.tick).toBe(101)
    expect(result.simTimeMs).toBe(25250)
    expect(result.speed).toBe(2)
  })

  it('produces deterministic snapshots across two builds (replay invariant)', () => {
    const events: SimEvent[] = [tick(250, 0), setSpeed(2, 1), tick(250, 2)]
    const a = buildSnapshot(null, events)
    const b = buildSnapshot(null, events)
    expect(a).toEqual(b)
  })
})

describe('parseEventStrings', () => {
  it('returns an empty array on empty input', () => {
    expect(parseEventStrings([])).toEqual([])
  })

  it('parses a single valid event', () => {
    const raw = JSON.stringify(tick(250, 0))
    const result = parseEventStrings([raw])
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('tick')
  })

  it('parses a sequence of valid events in order', () => {
    const raws = [
      JSON.stringify(tick(250, 0)),
      JSON.stringify(setSpeed(2, 1)),
      JSON.stringify(tick(250, 2)),
    ]
    const result = parseEventStrings(raws)
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('tick')
    expect(result[1].type).toBe('setSpeed')
    expect(result[2].type).toBe('tick')
  })

  it('drops invalid JSON silently', () => {
    const raws = [
      JSON.stringify(tick(250, 0)),
      'not json',
      JSON.stringify(tick(250, 1)),
    ]
    const result = parseEventStrings(raws)
    expect(result).toHaveLength(2)
  })

  it('drops events that fail schema validation silently', () => {
    const raws = [
      JSON.stringify(tick(250, 0)),
      JSON.stringify({ type: 'unknownEvent', payload: {} }),
      JSON.stringify(tick(250, 1)),
    ]
    const result = parseEventStrings(raws)
    expect(result).toHaveLength(2)
  })

  it('drops events with bad payload silently', () => {
    const raws = [
      JSON.stringify({
        type: 'tick',
        payload: { deltaMs: 1.5 },
        clientCreatedAt: 0,
        authorBuilderId: A_BUILDER,
      }),
    ]
    expect(parseEventStrings(raws)).toEqual([])
  })
})
