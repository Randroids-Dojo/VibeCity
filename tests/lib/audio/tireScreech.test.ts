import { describe, expect, it, vi } from 'vitest'
import {
  TIRE_SCREECH_FILTER_FREQUENCY_HZ,
  TIRE_SCREECH_FILTER_Q,
  TIRE_SCREECH_FREQUENCY_HZ,
  TIRE_SCREECH_GAIN,
  TIRE_SCREECH_SMOOTHING_SECONDS,
  TireScreechAudioRig,
} from '@/lib/audio/tireScreech'
import {
  ENGINE_MAX_GAIN,
  type EngineAudioContextLike,
} from '@/lib/audio/engineAudio'

interface FakeAudioParam {
  value: number
  setTargetAtTime: (target: number, at: number, smoothing: number) => void
}

interface FakeOscillator {
  type: OscillatorType
  frequency: FakeAudioParam
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

interface FakeFilter {
  type: BiquadFilterType
  frequency: FakeAudioParam
  Q: FakeAudioParam
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
        Q: makeAudioParam(1),
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

describe('TireScreechAudio constants (F-013 slice 3 audio)', () => {
  it('frequency, filter, Q, gain, smoothing are all positive', () => {
    expect(TIRE_SCREECH_FREQUENCY_HZ).toBeGreaterThan(0)
    expect(TIRE_SCREECH_FILTER_FREQUENCY_HZ).toBeGreaterThan(0)
    expect(TIRE_SCREECH_FILTER_Q).toBeGreaterThan(0)
    expect(TIRE_SCREECH_GAIN).toBeGreaterThan(0)
    expect(TIRE_SCREECH_SMOOTHING_SECONDS).toBeGreaterThan(0)
  })

  it('gain is well below the engine-rig max (subtle layered cue)', () => {
    // Screech gain should sit below the engine's max so the screech
    // does not drown the engine sound; reading the value through the
    // shared constant keeps this invariant aligned if the engine rig
    // is retuned.
    expect(TIRE_SCREECH_GAIN).toBeLessThan(ENGINE_MAX_GAIN)
  })
})

describe('TireScreechAudioRig construction', () => {
  it('builds an oscillator + filter + gain chain', () => {
    const ctx = makeFakeContext()
    new TireScreechAudioRig(ctx)
    expect(ctx.oscillators).toHaveLength(1)
    expect(ctx.filters).toHaveLength(1)
    expect(ctx.gains).toHaveLength(1)
  })

  it('oscillator is a square wave at the screech frequency', () => {
    const ctx = makeFakeContext()
    new TireScreechAudioRig(ctx)
    expect(ctx.oscillators[0].type).toBe('square')
    expect(ctx.oscillators[0].frequency.value).toBe(TIRE_SCREECH_FREQUENCY_HZ)
  })

  it('filter is bandpass tuned for the screech band', () => {
    const ctx = makeFakeContext()
    new TireScreechAudioRig(ctx)
    expect(ctx.filters[0].type).toBe('bandpass')
    expect(ctx.filters[0].frequency.value).toBe(
      TIRE_SCREECH_FILTER_FREQUENCY_HZ,
    )
    expect(ctx.filters[0].Q.value).toBe(TIRE_SCREECH_FILTER_Q)
  })

  it('gain starts silent (no click on first start)', () => {
    const ctx = makeFakeContext()
    new TireScreechAudioRig(ctx)
    expect(ctx.gains[0].gain.value).toBe(0)
  })

  it('connects oscillator -> filter -> gain -> destination', () => {
    const ctx = makeFakeContext()
    new TireScreechAudioRig(ctx)
    expect(ctx.oscillators[0].connect).toHaveBeenCalledWith(
      ctx.filters[0] as unknown as BiquadFilterNode,
    )
    expect(ctx.filters[0].connect).toHaveBeenCalledWith(
      ctx.gains[0] as unknown as GainNode,
    )
    expect(ctx.gains[0].connect).toHaveBeenCalledWith(ctx.destination)
  })
})

describe('TireScreechAudioRig.start', () => {
  it('starts the oscillator and is idempotent', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    expect(rig.isStarted()).toBe(true)
    expect(ctx.oscillators[0].start).toHaveBeenCalledTimes(1)
    await rig.start()
    expect(ctx.oscillators[0].start).toHaveBeenCalledTimes(1)
  })

  it('resumes a suspended context before starting the oscillator', async () => {
    const ctx = makeFakeContext('suspended')
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.oscillators[0].start).toHaveBeenCalledTimes(1)
  })

  it('does not resume an already-running context', async () => {
    const ctx = makeFakeContext('running')
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    expect(ctx.resumeCalls).toBe(0)
  })

  it('resets started flag on resume failure so a retry can succeed', async () => {
    // Build a context whose first resume() rejects; the rig should
    // catch the error, clear the started flag, and re-throw so the
    // caller can decide whether to retry.
    const ctx = makeFakeContext('suspended') as FakeContext & {
      _resumeShouldFail: boolean
    }
    ctx._resumeShouldFail = true
    const originalResume = ctx.resume.bind(ctx)
    ctx.resume = async () => {
      if (ctx._resumeShouldFail) {
        ctx._resumeShouldFail = false
        throw new Error('autoplay rejected')
      }
      await originalResume()
    }

    const rig = new TireScreechAudioRig(ctx)
    await expect(rig.start()).rejects.toThrow('autoplay rejected')
    expect(rig.isStarted()).toBe(false)
    // A subsequent gesture retries cleanly.
    await rig.start()
    expect(rig.isStarted()).toBe(true)
    expect(ctx.oscillators[0].start).toHaveBeenCalledTimes(1)
  })
})

describe('TireScreechAudioRig.update', () => {
  it('is a no-op before start', () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    rig.update(true)
    expect(ctx.gains[0].gain.value).toBe(0)
  })

  it('flips gain to TIRE_SCREECH_GAIN when active', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    rig.update(true)
    expect(ctx.gains[0].gain.value).toBe(TIRE_SCREECH_GAIN)
  })

  it('flips gain back to 0 when inactive', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    rig.update(true)
    expect(ctx.gains[0].gain.value).toBe(TIRE_SCREECH_GAIN)
    rig.update(false)
    expect(ctx.gains[0].gain.value).toBe(0)
  })

  it('is a no-op while muted', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    rig.setMuted(true)
    expect(ctx.gains[0].gain.value).toBe(0)
    rig.update(true)
    // Gain stays at 0 because mute trumps active.
    expect(ctx.gains[0].gain.value).toBe(0)
  })
})

describe('TireScreechAudioRig.setMuted', () => {
  it('mute ramps the gain to 0', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    rig.update(true)
    rig.setMuted(true)
    expect(ctx.gains[0].gain.value).toBe(0)
    expect(rig.isMuted()).toBe(true)
  })

  it('unmute restores the live active gain', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    rig.update(true)
    rig.setMuted(true)
    rig.setMuted(false)
    expect(ctx.gains[0].gain.value).toBe(TIRE_SCREECH_GAIN)
    expect(rig.isMuted()).toBe(false)
  })

  it('unmute restores 0 when not active', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    rig.update(false)
    rig.setMuted(true)
    rig.setMuted(false)
    expect(ctx.gains[0].gain.value).toBe(0)
  })

  it('mute before start keeps gain at 0', () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    rig.setMuted(true)
    expect(ctx.gains[0].gain.value).toBe(0)
    expect(rig.isMuted()).toBe(true)
  })
})

describe('TireScreechAudioRig.stop', () => {
  it('stops the oscillator and disconnects the chain', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    rig.stop()
    expect(rig.isStarted()).toBe(false)
    expect(ctx.oscillators[0].stop).toHaveBeenCalledTimes(1)
    expect(ctx.oscillators[0].disconnect).toHaveBeenCalledTimes(1)
    expect(ctx.filters[0].disconnect).toHaveBeenCalledTimes(1)
    expect(ctx.gains[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('is idempotent (a second stop is a no-op)', async () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    await rig.start()
    rig.stop()
    rig.stop()
    expect(ctx.oscillators[0].stop).toHaveBeenCalledTimes(1)
  })

  it('stop before start is a no-op', () => {
    const ctx = makeFakeContext()
    const rig = new TireScreechAudioRig(ctx)
    rig.stop()
    expect(ctx.oscillators[0].stop).not.toHaveBeenCalled()
  })
})
