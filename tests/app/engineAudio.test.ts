import { describe, expect, it, vi } from 'vitest'
import {
  ENGINE_FILTER_CUTOFF_HZ,
  ENGINE_IDLE_FREQUENCY_HZ,
  ENGINE_IDLE_GAIN,
  ENGINE_MAX_FREQUENCY_HZ,
  ENGINE_MAX_GAIN,
  ENGINE_MUTE_KEY_CODE,
  ENGINE_SMOOTHING_SECONDS,
  EngineAudioRig,
  type EngineAudioContextLike,
  engineFrequencyForSpeed,
  engineGainForSpeed,
} from '@/app/[slug]/engineAudio'
import { DEFAULT_KEY_BINDINGS, MAX_SPEED } from '@/app/[slug]/driveControls'
import { PAUSE_KEY_CODE } from '@/app/[slug]/pauseMenu'
import { RESPAWN_KEY_CODE } from '@/app/[slug]/respawn'

/**
 * REQ-068 drive engine audio. The pure module is the unit-tested
 * surface here; the live `AudioContext` rig hangs off `EngineAudioRig`
 * which uses a fake context built from `vi.fn` mocks so the tests run
 * without spinning up Web Audio.
 */

describe('engine audio constants', () => {
  it('idle frequency is below the peak frequency so speed climbs in pitch', () => {
    expect(ENGINE_IDLE_FREQUENCY_HZ).toBeGreaterThan(0)
    expect(ENGINE_MAX_FREQUENCY_HZ).toBeGreaterThan(ENGINE_IDLE_FREQUENCY_HZ)
  })

  it('idle gain is below the peak gain so speed climbs in volume', () => {
    expect(ENGINE_IDLE_GAIN).toBeGreaterThanOrEqual(0)
    expect(ENGINE_MAX_GAIN).toBeGreaterThan(ENGINE_IDLE_GAIN)
  })

  it('peak gain stays well below clipping (1.0) so other audio can layer on top', () => {
    expect(ENGINE_MAX_GAIN).toBeLessThan(0.5)
  })

  it('filter cutoff is above the peak oscillator pitch so the sound has body', () => {
    expect(ENGINE_FILTER_CUTOFF_HZ).toBeGreaterThan(ENGINE_MAX_FREQUENCY_HZ)
  })

  it('smoothing time is positive and short enough to track the integrator', () => {
    expect(ENGINE_SMOOTHING_SECONDS).toBeGreaterThan(0)
    expect(ENGINE_SMOOTHING_SECONDS).toBeLessThan(0.5)
  })
})

describe('ENGINE_MUTE_KEY_CODE', () => {
  it('is the KeyM keyboard event code', () => {
    expect(ENGINE_MUTE_KEY_CODE).toBe('KeyM')
  })

  it('does not collide with any default drive binding', () => {
    expect(DEFAULT_KEY_BINDINGS).not.toHaveProperty(ENGINE_MUTE_KEY_CODE)
  })

  it('does not collide with the Escape pause key (REQ-039)', () => {
    expect(ENGINE_MUTE_KEY_CODE).not.toBe(PAUSE_KEY_CODE)
  })

  it('does not collide with the R respawn key (REQ-067)', () => {
    expect(ENGINE_MUTE_KEY_CODE).not.toBe(RESPAWN_KEY_CODE)
  })
})

describe('engineFrequencyForSpeed', () => {
  it('returns the idle frequency at rest', () => {
    expect(engineFrequencyForSpeed(0)).toBe(ENGINE_IDLE_FREQUENCY_HZ)
  })

  it('returns the peak frequency at MAX_SPEED', () => {
    expect(engineFrequencyForSpeed(MAX_SPEED)).toBe(ENGINE_MAX_FREQUENCY_HZ)
  })

  it('clamps to the peak frequency above MAX_SPEED', () => {
    expect(engineFrequencyForSpeed(MAX_SPEED * 2)).toBe(ENGINE_MAX_FREQUENCY_HZ)
  })

  it('uses the speed magnitude for reverse so reverse pitches up too', () => {
    expect(engineFrequencyForSpeed(-MAX_SPEED / 2)).toBeCloseTo(
      (ENGINE_IDLE_FREQUENCY_HZ + ENGINE_MAX_FREQUENCY_HZ) / 2,
      6,
    )
    expect(engineFrequencyForSpeed(-MAX_SPEED)).toBe(ENGINE_MAX_FREQUENCY_HZ)
  })

  it('interpolates linearly between idle and peak', () => {
    expect(engineFrequencyForSpeed(MAX_SPEED / 4)).toBeCloseTo(
      ENGINE_IDLE_FREQUENCY_HZ +
        (ENGINE_MAX_FREQUENCY_HZ - ENGINE_IDLE_FREQUENCY_HZ) * 0.25,
      6,
    )
  })

  it('returns the idle frequency for non-finite speed inputs', () => {
    expect(engineFrequencyForSpeed(Number.NaN)).toBe(ENGINE_IDLE_FREQUENCY_HZ)
    expect(engineFrequencyForSpeed(Number.POSITIVE_INFINITY)).toBe(
      ENGINE_IDLE_FREQUENCY_HZ,
    )
    expect(engineFrequencyForSpeed(Number.NEGATIVE_INFINITY)).toBe(
      ENGINE_IDLE_FREQUENCY_HZ,
    )
  })

  it('returns the idle frequency when the maxSpeed override is non-positive or non-finite', () => {
    expect(engineFrequencyForSpeed(5, 0)).toBe(ENGINE_IDLE_FREQUENCY_HZ)
    expect(engineFrequencyForSpeed(5, -1)).toBe(ENGINE_IDLE_FREQUENCY_HZ)
    expect(engineFrequencyForSpeed(5, Number.NaN)).toBe(
      ENGINE_IDLE_FREQUENCY_HZ,
    )
  })

  it('respects a custom maxSpeed override (REQ-040 future settings)', () => {
    expect(engineFrequencyForSpeed(5, 10)).toBeCloseTo(
      ENGINE_IDLE_FREQUENCY_HZ +
        (ENGINE_MAX_FREQUENCY_HZ - ENGINE_IDLE_FREQUENCY_HZ) * 0.5,
      6,
    )
    expect(engineFrequencyForSpeed(20, 10)).toBe(ENGINE_MAX_FREQUENCY_HZ)
  })
})

describe('engineGainForSpeed', () => {
  it('returns the idle gain at rest', () => {
    expect(engineGainForSpeed(0)).toBe(ENGINE_IDLE_GAIN)
  })

  it('returns the peak gain at MAX_SPEED', () => {
    expect(engineGainForSpeed(MAX_SPEED)).toBe(ENGINE_MAX_GAIN)
  })

  it('clamps to the peak gain above MAX_SPEED', () => {
    expect(engineGainForSpeed(MAX_SPEED * 2)).toBe(ENGINE_MAX_GAIN)
  })

  it('uses the magnitude for reverse so the gain climbs in both directions', () => {
    expect(engineGainForSpeed(-MAX_SPEED / 2)).toBeCloseTo(
      (ENGINE_IDLE_GAIN + ENGINE_MAX_GAIN) / 2,
      6,
    )
    expect(engineGainForSpeed(-MAX_SPEED)).toBe(ENGINE_MAX_GAIN)
  })

  it('returns the idle gain for non-finite speed inputs', () => {
    expect(engineGainForSpeed(Number.NaN)).toBe(ENGINE_IDLE_GAIN)
    expect(engineGainForSpeed(Number.POSITIVE_INFINITY)).toBe(ENGINE_IDLE_GAIN)
  })

  it('returns the idle gain when the maxSpeed override is non-positive or non-finite', () => {
    expect(engineGainForSpeed(5, 0)).toBe(ENGINE_IDLE_GAIN)
    expect(engineGainForSpeed(5, Number.NaN)).toBe(ENGINE_IDLE_GAIN)
  })
})

interface FakeAudioParam {
  value: number
  setTargetAtTime: ReturnType<typeof vi.fn>
}

interface FakeOscillator {
  type: string
  frequency: FakeAudioParam
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

interface FakeFilter {
  type: string
  frequency: FakeAudioParam
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

interface FakeGain {
  gain: FakeAudioParam
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

interface FakeContext extends EngineAudioContextLike {
  oscillators: FakeOscillator[]
  filters: FakeFilter[]
  gains: FakeGain[]
  resumeCalls: number
}

function makeAudioParam(value: number): FakeAudioParam {
  const param: FakeAudioParam = {
    value,
    setTargetAtTime: vi.fn((target: number) => {
      // Simulate the AudioParam ramp settling at the target so the
      // tests can assert the final value via `value`.
      param.value = target
    }),
  }
  return param
}

function makeFakeContext(state: AudioContextState = 'running'): FakeContext {
  let mutableState: AudioContextState = state
  const oscillators: FakeOscillator[] = []
  const filters: FakeFilter[] = []
  const gains: FakeGain[] = []
  let resumeCalls = 0
  const ctx: FakeContext = {
    currentTime: 0,
    destination: {} as AudioNode,
    get state() {
      return mutableState
    },
    oscillators,
    filters,
    gains,
    get resumeCalls() {
      return resumeCalls
    },
    async resume() {
      resumeCalls += 1
      mutableState = 'running'
    },
    createOscillator() {
      const osc: FakeOscillator = {
        type: 'sine',
        frequency: makeAudioParam(440),
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      oscillators.push(osc)
      return osc as unknown as OscillatorNode
    },
    createGain() {
      const gain: FakeGain = {
        gain: makeAudioParam(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      gains.push(gain)
      return gain as unknown as GainNode
    },
    createBiquadFilter() {
      const filter: FakeFilter = {
        type: 'lowpass',
        frequency: makeAudioParam(350),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      filters.push(filter)
      return filter as unknown as BiquadFilterNode
    },
    async close() {
      mutableState = 'closed'
    },
  }
  return ctx
}

describe('EngineAudioRig construction', () => {
  it('builds the oscillator at the idle frequency with sawtooth shape', () => {
    const ctx = makeFakeContext()
    new EngineAudioRig(ctx)
    expect(ctx.oscillators).toHaveLength(1)
    expect(ctx.oscillators[0].type).toBe('sawtooth')
    expect(ctx.oscillators[0].frequency.value).toBe(ENGINE_IDLE_FREQUENCY_HZ)
  })

  it('builds the filter as a lowpass at the cutoff frequency', () => {
    const ctx = makeFakeContext()
    new EngineAudioRig(ctx)
    expect(ctx.filters).toHaveLength(1)
    expect(ctx.filters[0].type).toBe('lowpass')
    expect(ctx.filters[0].frequency.value).toBe(ENGINE_FILTER_CUTOFF_HZ)
  })

  it('starts the gain at zero so the resume ramp does not click', () => {
    const ctx = makeFakeContext()
    new EngineAudioRig(ctx)
    expect(ctx.gains).toHaveLength(1)
    expect(ctx.gains[0].gain.value).toBe(0)
  })

  it('connects the chain oscillator -> filter -> gain -> destination', () => {
    const ctx = makeFakeContext()
    new EngineAudioRig(ctx)
    expect(ctx.oscillators[0].connect).toHaveBeenCalledWith(ctx.filters[0])
    expect(ctx.filters[0].connect).toHaveBeenCalledWith(ctx.gains[0])
    expect(ctx.gains[0].connect).toHaveBeenCalledWith(ctx.destination)
  })

  it('does not start the oscillator at construction (browsers require a user gesture)', () => {
    const ctx = makeFakeContext()
    new EngineAudioRig(ctx)
    expect(ctx.oscillators[0].start).not.toHaveBeenCalled()
  })

  it('reports not-started before start() runs', () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    expect(rig.isStarted()).toBe(false)
    expect(rig.isMuted()).toBe(false)
  })
})

describe('EngineAudioRig.start', () => {
  it('starts the oscillator and ramps the gain to the idle level', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    expect(ctx.oscillators[0].start).toHaveBeenCalledTimes(1)
    expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenCalled()
    expect(ctx.gains[0].gain.value).toBe(ENGINE_IDLE_GAIN)
    expect(rig.isStarted()).toBe(true)
  })

  it('resumes a suspended audio context before starting the oscillator', async () => {
    const ctx = makeFakeContext('suspended')
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.state).toBe('running')
    expect(ctx.oscillators[0].start).toHaveBeenCalled()
  })

  it('does not call resume on an already-running context', async () => {
    const ctx = makeFakeContext('running')
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    expect(ctx.resumeCalls).toBe(0)
  })

  it('is idempotent so a second start() is a no-op', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    await rig.start()
    expect(ctx.oscillators[0].start).toHaveBeenCalledTimes(1)
  })
})

describe('EngineAudioRig.update', () => {
  it('updates the oscillator frequency and the gain to track the live speed', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.update(MAX_SPEED / 2)
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(
      engineFrequencyForSpeed(MAX_SPEED / 2),
      6,
    )
    expect(ctx.gains[0].gain.value).toBeCloseTo(
      engineGainForSpeed(MAX_SPEED / 2),
      6,
    )
  })

  it('clamps to the peak frequency and gain at MAX_SPEED', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.update(MAX_SPEED * 2)
    expect(ctx.oscillators[0].frequency.value).toBe(ENGINE_MAX_FREQUENCY_HZ)
    expect(ctx.gains[0].gain.value).toBe(ENGINE_MAX_GAIN)
  })

  it('uses the speed magnitude for reverse so reverse climbs the same way', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.update(-MAX_SPEED / 2)
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(
      engineFrequencyForSpeed(MAX_SPEED / 2),
      6,
    )
  })

  it('is a no-op before start() so the integration loop can call it unconditionally', () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    rig.update(MAX_SPEED / 2)
    expect(ctx.oscillators[0].frequency.setTargetAtTime).not.toHaveBeenCalled()
  })

  it('is a no-op while muted so a muted rig stays silent across speed changes', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.setMuted(true)
    const callsBefore = ctx.gains[0].gain.setTargetAtTime.mock.calls.length
    rig.update(MAX_SPEED / 2)
    // setMuted ramps to zero but the subsequent update should not bump
    // the oscillator frequency.
    expect(ctx.oscillators[0].frequency.setTargetAtTime).not.toHaveBeenCalled()
    expect(ctx.gains[0].gain.setTargetAtTime.mock.calls.length).toBe(
      callsBefore,
    )
  })
})

describe('EngineAudioRig.setMuted', () => {
  it('ramps the gain to zero on mute', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.setMuted(true)
    expect(ctx.gains[0].gain.value).toBe(0)
    expect(rig.isMuted()).toBe(true)
  })

  it('ramps the gain back to idle on unmute (so the next update restores speed)', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.setMuted(true)
    rig.setMuted(false)
    expect(ctx.gains[0].gain.value).toBe(ENGINE_IDLE_GAIN)
    expect(rig.isMuted()).toBe(false)
  })

  it('does not start the oscillator when unmuting before start()', () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    rig.setMuted(false)
    expect(ctx.oscillators[0].start).not.toHaveBeenCalled()
    expect(rig.isStarted()).toBe(false)
  })
})

describe('EngineAudioRig.stop', () => {
  it('stops the oscillator and disconnects the chain', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.stop()
    expect(ctx.oscillators[0].stop).toHaveBeenCalledTimes(1)
    expect(ctx.oscillators[0].disconnect).toHaveBeenCalled()
    expect(ctx.filters[0].disconnect).toHaveBeenCalled()
    expect(ctx.gains[0].disconnect).toHaveBeenCalled()
    expect(rig.isStarted()).toBe(false)
  })

  it('ramps the gain to zero on stop so the cut does not click', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.stop()
    expect(ctx.gains[0].gain.value).toBe(0)
  })

  it('is idempotent so a second stop() is a no-op', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    rig.stop()
    rig.stop()
    expect(ctx.oscillators[0].stop).toHaveBeenCalledTimes(1)
  })

  it('is a no-op before start() so an unmount cleanup before any user gesture stays safe', () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    rig.stop()
    expect(ctx.oscillators[0].stop).not.toHaveBeenCalled()
  })

  it('swallows an OscillatorNode.stop() throw (Safari double-stop guard)', async () => {
    const ctx = makeFakeContext()
    const rig = new EngineAudioRig(ctx)
    await rig.start()
    ctx.oscillators[0].stop = vi.fn(() => {
      throw new Error('already stopped')
    })
    expect(() => rig.stop()).not.toThrow()
  })
})
