import { describe, it, expect } from 'vitest'
import {
  EMPTY_ENGINE_RUNTIME,
  TICK_INTERVAL_MS_BASE,
  FLUSH_IDLE_MS,
  FLUSH_BATCH_MAX,
  tickIntervalMs,
  buildTickEvent,
  enqueueEvent,
  shouldFlush,
  commitFlush,
  foldServerEvents,
  loadFromColdResponse,
  type EngineRuntime,
} from '@/lib/sim/engine'
import type { SimEvent } from '@/lib/sim/events'
import { EMPTY_SIM_STATE, type SimState } from '@/lib/sim/state'
import type { BuilderId } from '@/lib/schemas'

const A_BUILDER = '11111111-2222-3333-4444-555555555555' as BuilderId
const B_BUILDER = '99999999-8888-7777-6666-555555555555' as BuilderId

function tick(deltaMs: number, t = 0, builderId = A_BUILDER): SimEvent {
  return {
    type: 'tick',
    payload: { deltaMs },
    clientCreatedAt: t,
    authorBuilderId: builderId,
  }
}

function setSpeed(
  speed: 0 | 1 | 2 | 4,
  t = 0,
  builderId = A_BUILDER,
): SimEvent {
  return {
    type: 'setSpeed',
    payload: { speed },
    clientCreatedAt: t,
    authorBuilderId: builderId,
  }
}

describe('constants', () => {
  it('TICK_INTERVAL_MS_BASE is 250 (4Hz)', () => {
    expect(TICK_INTERVAL_MS_BASE).toBe(250)
  })

  it('FLUSH_IDLE_MS is 5000 (5s)', () => {
    expect(FLUSH_IDLE_MS).toBe(5000)
  })

  it('FLUSH_BATCH_MAX is 256 (matches server cap)', () => {
    expect(FLUSH_BATCH_MAX).toBe(256)
  })
})

describe('tickIntervalMs', () => {
  it('returns 250ms at 1x speed', () => {
    expect(tickIntervalMs(1)).toBe(250)
  })

  it('returns 125ms at 2x speed', () => {
    expect(tickIntervalMs(2)).toBe(125)
  })

  it('returns 62.5ms at 4x speed', () => {
    expect(tickIntervalMs(4)).toBe(62.5)
  })

  it('returns null when paused (speed = 0)', () => {
    expect(tickIntervalMs(0)).toBeNull()
  })
})

describe('buildTickEvent', () => {
  it('builds a tick event with the runtime speed interval at 1x', () => {
    const event = buildTickEvent(EMPTY_ENGINE_RUNTIME, A_BUILDER, 1000)
    expect(event).not.toBeNull()
    if (!event) return
    expect(event.type).toBe('tick')
    expect(event.payload.deltaMs).toBe(250)
    expect(event.clientCreatedAt).toBe(1000)
    expect(event.authorBuilderId).toBe(A_BUILDER)
  })

  it('builds a tick event with the runtime speed interval at 2x', () => {
    const runtime: EngineRuntime = {
      ...EMPTY_ENGINE_RUNTIME,
      state: { ...EMPTY_SIM_STATE, speed: 2 },
    }
    const event = buildTickEvent(runtime, A_BUILDER, 1000)
    expect(event?.payload.deltaMs).toBe(125)
  })

  it('returns null when paused', () => {
    const runtime: EngineRuntime = {
      ...EMPTY_ENGINE_RUNTIME,
      state: { ...EMPTY_SIM_STATE, speed: 0 },
    }
    expect(buildTickEvent(runtime, A_BUILDER, 1000)).toBeNull()
  })
})

describe('EMPTY_ENGINE_RUNTIME', () => {
  it('starts with the empty sim state', () => {
    expect(EMPTY_ENGINE_RUNTIME.state).toEqual(EMPTY_SIM_STATE)
  })

  it('starts with no pending events', () => {
    expect(EMPTY_ENGINE_RUNTIME.pendingEvents).toEqual([])
  })

  it('starts with serverCursor 0', () => {
    expect(EMPTY_ENGINE_RUNTIME.serverCursor).toBe(0)
  })

  it('starts with lastEnqueueAtMs null', () => {
    expect(EMPTY_ENGINE_RUNTIME.lastEnqueueAtMs).toBeNull()
  })

  it('is frozen at the top level', () => {
    expect(Object.isFrozen(EMPTY_ENGINE_RUNTIME)).toBe(true)
  })
})

describe('enqueueEvent', () => {
  it('appends the event to the pending buffer', () => {
    const next = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    expect(next.pendingEvents).toHaveLength(1)
    expect(next.pendingEvents[0].type).toBe('tick')
  })

  it('advances the local state via the pure reducer', () => {
    const next = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    expect(next.state.tick).toBe(1)
    expect(next.state.simTimeMs).toBe(250)
  })

  it('updates lastEnqueueAtMs', () => {
    const next = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    expect(next.lastEnqueueAtMs).toBe(1000)
  })

  it('does not mutate the input runtime', () => {
    const before = JSON.parse(JSON.stringify(EMPTY_ENGINE_RUNTIME))
    enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    expect(EMPTY_ENGINE_RUNTIME).toEqual(before)
  })

  it('preserves serverCursor', () => {
    const runtime: EngineRuntime = { ...EMPTY_ENGINE_RUNTIME, serverCursor: 42 }
    const next = enqueueEvent(runtime, tick(250), 1000)
    expect(next.serverCursor).toBe(42)
  })

  it('appends multiple events in order', () => {
    let r = EMPTY_ENGINE_RUNTIME
    r = enqueueEvent(r, tick(250, 0), 1000)
    r = enqueueEvent(r, tick(250, 1), 1100)
    r = enqueueEvent(r, setSpeed(2, 2), 1200)
    expect(r.pendingEvents).toHaveLength(3)
    expect(r.state.tick).toBe(2)
    expect(r.state.speed).toBe(2)
    expect(r.lastEnqueueAtMs).toBe(1200)
  })

  it('still buffers the event when reducer returns identity (e.g. paused-tick)', () => {
    const paused: EngineRuntime = {
      ...EMPTY_ENGINE_RUNTIME,
      state: { ...EMPTY_SIM_STATE, speed: 0 },
    }
    const next = enqueueEvent(paused, tick(250), 1000)
    // local state stays the same (paused), but the event is still in the buffer
    expect(next.state).toBe(paused.state)
    expect(next.pendingEvents).toHaveLength(1)
    // lastEnqueueAtMs still advances so idle-trigger math is consistent
    expect(next.lastEnqueueAtMs).toBe(1000)
  })
})

describe('shouldFlush', () => {
  it('returns false on an empty buffer', () => {
    expect(shouldFlush(EMPTY_ENGINE_RUNTIME, 999999)).toBe(false)
  })

  it('returns false within the idle window', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    expect(shouldFlush(r, 1000 + FLUSH_IDLE_MS - 1)).toBe(false)
  })

  it('returns true at exactly the idle threshold', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    expect(shouldFlush(r, 1000 + FLUSH_IDLE_MS)).toBe(true)
  })

  it('returns true past the idle threshold', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    expect(shouldFlush(r, 1000 + FLUSH_IDLE_MS + 100)).toBe(true)
  })

  it('returns true when buffer is at the max-batch cap', () => {
    let r = EMPTY_ENGINE_RUNTIME
    for (let i = 0; i < FLUSH_BATCH_MAX; i++) {
      r = enqueueEvent(r, tick(250, i), 1000 + i)
    }
    // even though idle window not reached, batch cap forces flush
    expect(shouldFlush(r, 1000)).toBe(true)
  })

  it('returns true when buffer is past the max-batch cap', () => {
    let r = EMPTY_ENGINE_RUNTIME
    for (let i = 0; i < FLUSH_BATCH_MAX + 5; i++) {
      r = enqueueEvent(r, tick(250, i), 1000 + i)
    }
    expect(shouldFlush(r, 1000)).toBe(true)
  })
})

describe('commitFlush', () => {
  it('clears the pending buffer', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    const next = commitFlush(r, 1)
    expect(next.pendingEvents).toEqual([])
  })

  it('advances the serverCursor', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    const next = commitFlush(r, 42)
    expect(next.serverCursor).toBe(42)
  })

  it('clears lastEnqueueAtMs to null', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    const next = commitFlush(r, 1)
    expect(next.lastEnqueueAtMs).toBeNull()
  })

  it('preserves the local state (state was already advanced by enqueueEvent)', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    const next = commitFlush(r, 1)
    expect(next.state.tick).toBe(1)
    expect(next.state.simTimeMs).toBe(250)
  })

  it('returns identity when the cursor is the same and the buffer is empty', () => {
    const r: EngineRuntime = { ...EMPTY_ENGINE_RUNTIME, serverCursor: 5 }
    const next = commitFlush(r, 5)
    expect(next).toBe(r)
  })

  it('returns identity when the new cursor is below the current cursor (server bug guard)', () => {
    const r: EngineRuntime = { ...EMPTY_ENGINE_RUNTIME, serverCursor: 10 }
    const next = commitFlush(r, 5)
    expect(next).toBe(r)
  })

  it('does not mutate the input runtime', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    const before = { ...r, pendingEvents: [...r.pendingEvents] }
    commitFlush(r, 1)
    expect(r.pendingEvents).toEqual(before.pendingEvents)
    expect(r.serverCursor).toBe(before.serverCursor)
  })
})

describe('foldServerEvents', () => {
  it('returns identity on an empty server-event tail', () => {
    const next = foldServerEvents(EMPTY_ENGINE_RUNTIME, [], 0)
    expect(next).toBe(EMPTY_ENGINE_RUNTIME)
  })

  it('applies a single server event to local state', () => {
    const next = foldServerEvents(EMPTY_ENGINE_RUNTIME, [tick(250)], 1)
    expect(next.state.tick).toBe(1)
    expect(next.serverCursor).toBe(1)
  })

  it('applies a sequence of server events in order', () => {
    const next = foldServerEvents(
      EMPTY_ENGINE_RUNTIME,
      [tick(250, 0), setSpeed(2, 1), tick(250, 2)],
      3,
    )
    expect(next.state.tick).toBe(2)
    expect(next.state.simTimeMs).toBe(500)
    expect(next.state.speed).toBe(2)
    expect(next.serverCursor).toBe(3)
  })

  it('preserves the local pending buffer (the server tail is independent)', () => {
    const r = enqueueEvent(EMPTY_ENGINE_RUNTIME, tick(250), 1000)
    const next = foldServerEvents(r, [setSpeed(2)], 5)
    expect(next.pendingEvents).toEqual(r.pendingEvents)
  })

  it('produces deterministic state across two folds (other-client convergence)', () => {
    const events: SimEvent[] = [
      tick(250, 0, A_BUILDER),
      setSpeed(2, 1, B_BUILDER),
      tick(250, 2, A_BUILDER),
    ]
    const a = foldServerEvents(EMPTY_ENGINE_RUNTIME, events, 3)
    const b = foldServerEvents(EMPTY_ENGINE_RUNTIME, events, 3)
    expect(a).toEqual(b)
  })
})

describe('loadFromColdResponse', () => {
  it('produces the empty runtime from an empty cold response', () => {
    const r = loadFromColdResponse(null, [], 0)
    expect(r.state).toEqual(EMPTY_SIM_STATE)
    expect(r.pendingEvents).toEqual([])
    expect(r.serverCursor).toBe(0)
    expect(r.lastEnqueueAtMs).toBeNull()
  })

  it('honors a snapshot when provided', () => {
    const snapshot: SimState = {
      ...EMPTY_SIM_STATE,
      tick: 100,
      simTimeMs: 25000,
      speed: 2,
    }
    const r = loadFromColdResponse(snapshot, [], 100)
    expect(r.state.tick).toBe(100)
    expect(r.state.simTimeMs).toBe(25000)
    expect(r.state.speed).toBe(2)
    expect(r.serverCursor).toBe(100)
  })

  it('folds tail events on top of the snapshot', () => {
    const snapshot: SimState = {
      ...EMPTY_SIM_STATE,
      tick: 10,
      simTimeMs: 2500,
    }
    const r = loadFromColdResponse(snapshot, [tick(250, 0), tick(250, 1)], 12)
    expect(r.state.tick).toBe(12)
    expect(r.state.simTimeMs).toBe(3000)
    expect(r.serverCursor).toBe(12)
  })

  it('two clients cold-loading the same response derive identical state', () => {
    const events: SimEvent[] = [tick(250, 0), setSpeed(2, 1), tick(250, 2)]
    const a = loadFromColdResponse(null, events, 3)
    const b = loadFromColdResponse(null, events, 3)
    expect(a).toEqual(b)
  })
})

describe('full flush cycle', () => {
  it('enqueue -> shouldFlush(false within idle) -> shouldFlush(true past idle) -> commitFlush -> empty', () => {
    let r = EMPTY_ENGINE_RUNTIME
    r = enqueueEvent(r, tick(250, 0), 1000)
    r = enqueueEvent(r, setSpeed(2, 1), 1100)
    expect(shouldFlush(r, 1500)).toBe(false) // 400ms after first enqueue
    expect(shouldFlush(r, 1100 + FLUSH_IDLE_MS)).toBe(true) // 5s after last
    r = commitFlush(r, 2)
    expect(r.pendingEvents).toEqual([])
    expect(r.serverCursor).toBe(2)
    expect(r.lastEnqueueAtMs).toBeNull()
    expect(shouldFlush(r, 999999)).toBe(false)
  })

  it('two-client convergence via foldServerEvents after each flush', () => {
    // Client A enqueues + flushes first
    let a = EMPTY_ENGINE_RUNTIME
    a = enqueueEvent(a, tick(250, 0), 1000)
    a = enqueueEvent(a, setSpeed(2, 1), 1100)
    a = commitFlush(a, 2)

    // Client B starts cold-load and gets A's events back as the tail
    const aEvents: SimEvent[] = [tick(250, 0), setSpeed(2, 1)]
    const b = loadFromColdResponse(null, aEvents, 2)

    // A and B converge on the same state
    expect(a.state).toEqual(b.state)
    expect(a.serverCursor).toBe(b.serverCursor)
  })
})
