import type { EngineAudioContextLike } from '@/lib/audio/engineAudio'

/**
 * Tire-screech audio rig. Game-agnostic.
 *
 * A high-frequency square-wave oscillator filtered into a piercing
 * bandpass squeal that gates on a per-frame `active` flag. Mirrors
 * the `EngineAudioRig` lifecycle so the consumer wires both rigs
 * the same way: `start()` after a user gesture, `update(active)`
 * per frame to flip the gain, `setMuted(muted)` shares any mute
 * toggle, `stop()` on teardown.
 *
 * VibeCity's drive scene (F-013 slice 3) is the v1 consumer; the
 * lateral-acceleration estimator that drives the `active` flag
 * lives in the consumer.
 *
 * Constants are tuned conservative: the screech is a subtle skill
 * cue ("you took that turn hard"), not a constant assault. Gain
 * stays well below typical engine max so the cue layers on top
 * rather than drowning it.
 */

export const TIRE_SCREECH_FREQUENCY_HZ = 1200
export const TIRE_SCREECH_FILTER_FREQUENCY_HZ = 1400
export const TIRE_SCREECH_FILTER_Q = 6
export const TIRE_SCREECH_GAIN = 0.05
export const TIRE_SCREECH_SMOOTHING_SECONDS = 0.04

/**
 * Live tire-screech audio rig. Owns a square-wave oscillator + bandpass
 * filter + gain chain. The gain is 0 by default; `update(true)` ramps
 * it to `TIRE_SCREECH_GAIN`, `update(false)` ramps it back to 0. The
 * oscillator runs continuously after `start()` so the gain ramp is the
 * only per-frame change (no oscillator restart click).
 */
export class TireScreechAudioRig {
  private readonly context: EngineAudioContextLike
  private readonly oscillator: OscillatorNode
  private readonly filter: BiquadFilterNode
  private readonly gain: GainNode
  private started = false
  private muted = false
  private active = false

  constructor(context: EngineAudioContextLike) {
    this.context = context
    this.oscillator = context.createOscillator()
    this.oscillator.type = 'square'
    this.oscillator.frequency.value = TIRE_SCREECH_FREQUENCY_HZ
    this.filter = context.createBiquadFilter()
    this.filter.type = 'bandpass'
    this.filter.frequency.value = TIRE_SCREECH_FILTER_FREQUENCY_HZ
    this.filter.Q.value = TIRE_SCREECH_FILTER_Q
    this.gain = context.createGain()
    this.gain.gain.value = 0
    this.oscillator.connect(this.filter)
    this.filter.connect(this.gain)
    this.gain.connect(context.destination)
  }

  /**
   * Start the oscillator. Resumes the audio context if suspended
   * (browser autoplay policy). Idempotent: a second call is a no-op.
   * Gain stays at 0 until `update(true)` flips it on.
   */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      if (this.context.state === 'suspended') {
        await this.context.resume()
      }
      this.oscillator.start()
    } catch (error) {
      // Reset the flag so a subsequent gesture can retry; without this
      // a transient resume / start failure would lock the rig out for
      // the entire session.
      this.started = false
      throw error
    }
  }

  /**
   * Update the rig with the live screech-active flag from the
   * substrate. Ramps the gain via `setTargetAtTime` so a short hard
   * turn does not click on / off. No-op when the rig is muted or has
   * not been started yet so the integration loop can call this
   * unconditionally.
   */
  update(active: boolean): void {
    if (!this.started || this.muted) {
      this.active = active
      return
    }
    this.active = active
    this.applyGainTarget(active ? TIRE_SCREECH_GAIN : 0)
  }

  /**
   * Mute or unmute the rig without tearing down the chain. The gain
   * ramps to zero on mute and back to the live screech gain on unmute
   * so the transition does not click. The next `update(active)` call
   * after unmute restores the active-driven gain.
   */
  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) {
      this.applyGainTarget(0)
    } else if (this.started) {
      this.applyGainTarget(this.active ? TIRE_SCREECH_GAIN : 0)
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
   * the engine rig can keep running. Idempotent: a second call is a
   * no-op so the unmount cleanup branch does not have to track state.
   */
  stop(): void {
    if (!this.started) return
    this.started = false
    this.applyGainTarget(0)
    try {
      this.oscillator.stop()
    } catch {
      // Some browsers throw if the oscillator was never started; the
      // public-facing `start()` guard means this is a defensive catch.
    }
    this.oscillator.disconnect()
    this.filter.disconnect()
    this.gain.disconnect()
  }

  private applyGainTarget(target: number): void {
    this.gain.gain.setTargetAtTime(
      target,
      this.context.currentTime,
      TIRE_SCREECH_SMOOTHING_SECONDS,
    )
  }
}
