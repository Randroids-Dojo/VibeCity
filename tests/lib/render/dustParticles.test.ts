import { describe, expect, it } from 'vitest'
import {
  DUST_PARTICLE_LIFETIME_SECONDS,
  DUST_PARTICLE_MIN_SPEED,
  DUST_PARTICLE_OPACITY_PEAK,
  DUST_PARTICLE_RISE_VELOCITY,
  DUST_PARTICLE_SPAWN_INTERVAL_SECONDS,
  DUST_PARTICLES_PER_WHEEL,
  dustParticleOpacity,
  dustParticleRise,
  shouldSpawnDust,
} from '@/lib/render/dustParticles'

describe('dust particle constants', () => {
  it('lifetime is positive and short enough to recycle', () => {
    expect(DUST_PARTICLE_LIFETIME_SECONDS).toBeGreaterThan(0)
    expect(DUST_PARTICLE_LIFETIME_SECONDS).toBeLessThan(1)
  })

  it('spawn interval is shorter than lifetime so puffs can layer', () => {
    expect(DUST_PARTICLE_SPAWN_INTERVAL_SECONDS).toBeGreaterThan(0)
    expect(DUST_PARTICLE_SPAWN_INTERVAL_SECONDS).toBeLessThan(
      DUST_PARTICLE_LIFETIME_SECONDS,
    )
  })

  it('pool size covers lifetime / interval simultaneous puffs', () => {
    const required = Math.ceil(
      DUST_PARTICLE_LIFETIME_SECONDS / DUST_PARTICLE_SPAWN_INTERVAL_SECONDS,
    )
    expect(DUST_PARTICLES_PER_WHEEL).toBeGreaterThanOrEqual(required)
  })

  it('peak opacity is in (0, 1) so the puff reads without occluding', () => {
    expect(DUST_PARTICLE_OPACITY_PEAK).toBeGreaterThan(0)
    expect(DUST_PARTICLE_OPACITY_PEAK).toBeLessThan(1)
  })
})

describe('shouldSpawnDust', () => {
  it('returns false when wheel is on-street', () => {
    expect(shouldSpawnDust(false, 10, 0, 1)).toBe(false)
  })

  it('returns false below the minimum speed even when off-street', () => {
    expect(
      shouldSpawnDust(true, DUST_PARTICLE_MIN_SPEED / 2, 0, 10),
    ).toBe(false)
  })

  it('returns true when off-street, above min speed, and interval has elapsed', () => {
    expect(shouldSpawnDust(true, 10, 0, 0.2)).toBe(true)
  })

  it('returns false when interval has not yet elapsed', () => {
    expect(shouldSpawnDust(true, 10, 0, 0.05)).toBe(false)
  })

  it('treats reverse motion (negative speed) the same as forward', () => {
    expect(shouldSpawnDust(true, -10, 0, 0.2)).toBe(true)
  })

  it('returns true on first spawn even with non-finite last-spawn timestamp', () => {
    expect(shouldSpawnDust(true, 10, Number.NaN, 0.2)).toBe(true)
  })

  it('returns false on non-finite current time (defensive)', () => {
    expect(shouldSpawnDust(true, 10, 0, Number.NaN)).toBe(false)
  })

  it('returns false on non-finite or non-positive interval (defensive)', () => {
    expect(shouldSpawnDust(true, 10, 0, 1, 0)).toBe(false)
    expect(shouldSpawnDust(true, 10, 0, 1, Number.NaN)).toBe(false)
  })
})

describe('dustParticleOpacity', () => {
  it('starts at the peak opacity at age 0', () => {
    expect(dustParticleOpacity(0)).toBeCloseTo(DUST_PARTICLE_OPACITY_PEAK)
  })

  it('reaches 0 at lifetime', () => {
    expect(dustParticleOpacity(DUST_PARTICLE_LIFETIME_SECONDS)).toBe(0)
  })

  it('returns 0 for age past the lifetime', () => {
    expect(
      dustParticleOpacity(DUST_PARTICLE_LIFETIME_SECONDS * 2),
    ).toBe(0)
  })

  it('returns half the peak at half lifetime', () => {
    expect(
      dustParticleOpacity(DUST_PARTICLE_LIFETIME_SECONDS / 2),
    ).toBeCloseTo(DUST_PARTICLE_OPACITY_PEAK / 2)
  })

  it('returns 0 for negative or non-finite age', () => {
    expect(dustParticleOpacity(-1)).toBe(0)
    expect(dustParticleOpacity(Number.NaN)).toBe(0)
  })

  it('clamps peak opacity to the [0, 1] range', () => {
    expect(dustParticleOpacity(0, 1, 2)).toBe(1)
    expect(dustParticleOpacity(0, 1, -1)).toBe(0)
  })
})

describe('dustParticleRise', () => {
  it('returns 0 at age 0', () => {
    expect(dustParticleRise(0)).toBe(0)
  })

  it('returns rise velocity * age below the lifetime', () => {
    expect(
      dustParticleRise(0.1, 0.4, DUST_PARTICLE_RISE_VELOCITY),
    ).toBeCloseTo(0.1 * DUST_PARTICLE_RISE_VELOCITY)
  })

  it('caps at lifetime * velocity past expiration', () => {
    expect(dustParticleRise(10, 0.4, 1)).toBe(0.4)
  })

  it('returns 0 for non-positive or non-finite inputs', () => {
    expect(dustParticleRise(-1)).toBe(0)
    expect(dustParticleRise(Number.NaN)).toBe(0)
    expect(dustParticleRise(0.1, 0, 1)).toBe(0)
    expect(dustParticleRise(0.1, 0.4, 0)).toBe(0)
  })
})
