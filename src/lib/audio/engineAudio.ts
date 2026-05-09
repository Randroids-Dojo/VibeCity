/**
 * Engine audio synthesis. Game-agnostic.
 *
 * A simple Web Audio rig that maps a scalar `speed` to engine pitch
 * + gain so any game with a vehicle-like motion model can emit a
 * familiar low-rumble-to-revving-pitch engine sound. VibeCity's
 * drive scene (REQ-068) is the v1 consumer.
 *
 * Pure helpers (frequency / gain mapping) live alongside the runtime
 * rig class; the consumer owns the audio context and the per-frame
 * `update(speed)` call. The math is fully unit-testable.
 *
 * The v1 engine sound is a single sawtooth oscillator whose frequency
 * tracks the speed magnitude with an idle floor so a parked car still
 * emits a low rumble, plus a gain envelope that ramps up with speed so
 * the sound does not blast at idle. A high-cut biquad filter softens
 * the sawtooth so it reads as engine rumble instead of buzzsaw. The
 * synthesis is deliberately cheap (one oscillator, one filter, one
 * gain node) so it works on every browser without spinning up an audio
 * worklet.
 *
 * Browsers gate audio context creation on the first user gesture. The
 * drive scene client lazily creates the rig on the first throttle /
 * brake / steer keydown so the page does not log an autoplay warning
 * on load. A user-facing mute toggle (REQ-068) silences the rig
 * without tearing it down so resume is instant.
 */

/** Idle frequency (Hz). The engine hums at this pitch when the car is parked. */
export const ENGINE_IDLE_FREQUENCY_HZ = 80

/**
 * Peak frequency (Hz) the oscillator reaches at MAX_SPEED. Picked so
 * the highest pitch stays in the rumble range and does not become
 * piercing on a large speaker setup.
 */
export const ENGINE_MAX_FREQUENCY_HZ = 360

/**
 * Idle gain (linear, [0, 1]). The engine sits at this level when the
 * car is parked so an attentive listener can tell the rig is alive
 * without it dominating a quiet room.
 */
export const ENGINE_IDLE_GAIN = 0.04

/**
 * Peak gain (linear, [0, 1]). Reached at MAX_SPEED. Capped well below
 * 1 so the sawtooth does not clip the master output even when other
 * future audio sources (UI clicks, collisions) layer on top.
 */
export const ENGINE_MAX_GAIN = 0.18

/**
 * High-cut filter cutoff (Hz). The sawtooth's harmonics above this
 * pitch get attenuated so the rig reads as engine rumble instead of a
 * buzzsaw.
 */
export const ENGINE_FILTER_CUTOFF_HZ = 1200

/**
 * Smoothing time constant (seconds) for the AudioParam ramps. The
 * runtime calls `setTargetAtTime` with this constant so a sudden speed
 * change eases into the new pitch / gain instead of clicking.
 */
export const ENGINE_SMOOTHING_SECONDS = 0.08

/**
 * Compute the oscillator frequency for the given speed magnitude.
 * Linear interpolation between `ENGINE_IDLE_FREQUENCY_HZ` (at rest) and
 * `ENGINE_MAX_FREQUENCY_HZ` (at MAX_SPEED). Reverse uses the magnitude
 * so the rig pitches up the same way in both directions; the v1 rig
 * does not differentiate forward and reverse engine notes.
 *
 * The optional `maxSpeed` override is exposed so a future settings
 * slice (REQ-040) can swap the cap without rewriting the helper. A
 * non-finite or non-positive `maxSpeed` collapses to the idle pitch so
 * a tuning bug cannot leak `NaN` into the AudioParam.
 */
export function engineFrequencyForSpeed(
  speed: number,
  maxSpeed: number,
): number {
  if (!Number.isFinite(speed)) return ENGINE_IDLE_FREQUENCY_HZ
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) {
    return ENGINE_IDLE_FREQUENCY_HZ
  }
  const magnitude = Math.abs(speed)
  const t = magnitude >= maxSpeed ? 1 : magnitude / maxSpeed
  return (
    ENGINE_IDLE_FREQUENCY_HZ +
    (ENGINE_MAX_FREQUENCY_HZ - ENGINE_IDLE_FREQUENCY_HZ) * t
  )
}

/**
 * Compute the engine gain (linear, [0, 1]) for the given speed
 * magnitude. Linear interpolation between `ENGINE_IDLE_GAIN` (at rest)
 * and `ENGINE_MAX_GAIN` (at MAX_SPEED). Mirrors `engineFrequencyForSpeed`
 * so the sound climbs in step with the pitch.
 */
export function engineGainForSpeed(
  speed: number,
  maxSpeed: number,
): number {
  if (!Number.isFinite(speed)) return ENGINE_IDLE_GAIN
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) {
    return ENGINE_IDLE_GAIN
  }
  const magnitude = Math.abs(speed)
  const t = magnitude >= maxSpeed ? 1 : magnitude / maxSpeed
  return ENGINE_IDLE_GAIN + (ENGINE_MAX_GAIN - ENGINE_IDLE_GAIN) * t
}

/**
 * The keyboard event code that toggles the engine mute state. Matches
 * the conventional arcade-driving mute key. Does not collide with any
 * binding in `DEFAULT_KEY_BINDINGS` from `driveControls.ts`, the Esc
 * pause key (REQ-039), or the R respawn key (REQ-067).
 */
export const ENGINE_MUTE_KEY_CODE = 'KeyM'

/**
 * The minimal `AudioContext` shape the runtime rig needs. Defined as a
 * subset interface so the unit tests can pass a fake context without
 * pulling in the full DOM / Web Audio types.
 */
export interface EngineAudioContextLike {
  readonly currentTime: number
  readonly destination: AudioNode
  readonly state: AudioContextState
  resume(): Promise<void>
  createOscillator(): OscillatorNode
  createGain(): GainNode
  createBiquadFilter(): BiquadFilterNode
  close(): Promise<void>
}

/**
 * Live engine audio rig. Owns the oscillator + filter + gain chain and
 * exposes `start` / `stop` / `update` / `setMuted` so the drive scene
 * client can drive it from the integration loop.
 *
 * Lifecycle:
 *   1. `new EngineAudioRig(context)` builds the nodes but does NOT
 *      start the oscillator (browsers require a user gesture).
 *   2. `start()` resumes the context if it is suspended, starts the
 *      oscillator, and ramps the gain to the idle level.
 *   3. `update(speed)` rescales the oscillator frequency and the gain
 *      via `setTargetAtTime` ramps so the sound easeses into the new
 *      values without clicking.
 *   4. `setMuted(true)` ramps the gain to zero without tearing down
 *      the rig so unmute is instant.
 *   5. `stop()` ramps the gain to zero and stops the oscillator. The
 *      context is left open so a future slice (UI clicks, collisions)
 *      can layer on top without a fresh resume.
 */
export class EngineAudioRig {
  private readonly context: EngineAudioContextLike
  private readonly maxSpeed: number
  private readonly oscillator: OscillatorNode
  private readonly filter: BiquadFilterNode
  private readonly gain: GainNode
  private started = false
  private muted = false

  /**
   * @param context Web Audio context (or compatible test fake).
   * @param maxSpeed The speed magnitude the consumer treats as the
   *   peak (peak frequency / peak gain). The rig clamps speeds above
   *   this to the peak so a tuning bug above the design ceiling does
   *   not blow out the gain.
   */
  constructor(context: EngineAudioContextLike, maxSpeed: number) {
    this.context = context
    this.maxSpeed = maxSpeed
    this.oscillator = context.createOscillator()
    this.oscillator.type = 'sawtooth'
    this.oscillator.frequency.value = ENGINE_IDLE_FREQUENCY_HZ
    this.filter = context.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = ENGINE_FILTER_CUTOFF_HZ
    this.gain = context.createGain()
    // Start silent so the resume ramp does not click. The `start()`
    // call ramps the gain up to the idle level after the oscillator
    // begins emitting samples.
    this.gain.gain.value = 0
    this.oscillator.connect(this.filter)
    this.filter.connect(this.gain)
    this.gain.connect(context.destination)
  }

  /**
   * Begin emitting engine sound. Resumes the audio context if it is
   * suspended (browser autoplay policy), starts the oscillator, and
   * ramps the gain to the idle level. Idempotent: a second call is a
   * no-op so the drive scene client does not have to track its own
   * started flag.
   */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
    this.oscillator.start()
    this.applyGainTarget(ENGINE_IDLE_GAIN)
  }

  /**
   * Update the engine to the live speed. Ramps the oscillator frequency
   * and the gain via `setTargetAtTime` so a sudden speed change easeses
   * into the new pitch without clicking. No-op when the rig is muted or
   * has not been started yet so the integration loop can call this
   * unconditionally.
   */
  update(speed: number): void {
    if (!this.started || this.muted) return
    const targetFreq = engineFrequencyForSpeed(speed, this.maxSpeed)
    const targetGain = engineGainForSpeed(speed, this.maxSpeed)
    this.oscillator.frequency.setTargetAtTime(
      targetFreq,
      this.context.currentTime,
      ENGINE_SMOOTHING_SECONDS,
    )
    this.applyGainTarget(targetGain)
  }

  /**
   * Mute or unmute the engine without tearing down the rig. The gain
   * ramps to zero on mute and back to the idle level on unmute so the
   * transition does not click. The next `update(speed)` call after
   * unmute restores the speed-driven gain.
   */
  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) {
      this.applyGainTarget(0)
    } else if (this.started) {
      this.applyGainTarget(ENGINE_IDLE_GAIN)
    }
  }

  /** Whether the rig has been started (after a user gesture). */
  isStarted(): boolean {
    return this.started
  }

  /** Whether the rig is currently muted. */
  isMuted(): boolean {
    return this.muted
  }

  /**
   * Stop the rig and disconnect the chain. The context is left open so
   * future audio surfaces can layer on top without a fresh resume.
   * Idempotent: a second call is a no-op so the unmount cleanup branch
   * does not have to track its own state.
   */
  stop(): void {
    if (!this.started) return
    this.started = false
    this.applyGainTarget(0)
    try {
      this.oscillator.stop()
    } catch {
      // OscillatorNode.stop() throws if already stopped; the cleanup
      // branch can call this even after a manual stop and we swallow
      // the redundant call rather than tracking another state flag.
    }
    this.oscillator.disconnect()
    this.filter.disconnect()
    this.gain.disconnect()
  }

  private applyGainTarget(target: number): void {
    this.gain.gain.setTargetAtTime(
      target,
      this.context.currentTime,
      ENGINE_SMOOTHING_SECONDS,
    )
  }
}
