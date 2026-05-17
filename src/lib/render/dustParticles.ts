/**
 * Off-street dust particle substrate (F-013 close-out). Game-agnostic
 * pure resolvers for spawn and lifecycle. The drive scene consumes
 * these helpers and owns the three.js mesh pool; the math here stays
 * renderable in a unit test without a three.js import.
 *
 * Visible behavior: when any wheel is off-street and the car is
 * moving above a minimum speed, small dust puffs spawn at the wheel
 * world position and fade out over a short lifetime. A bounded pool
 * keeps the per-frame allocation cost flat.
 */

/**
 * Per-particle lifetime in seconds. Tuned so a puff reads as a quick
 * scuff rather than a lingering trail; lifetimes longer than ~0.6s
 * pile up faster than the spawn interval can recycle them.
 */
export const DUST_PARTICLE_LIFETIME_SECONDS = 0.4

/**
 * Spawn interval per wheel in seconds. A wheel that stays off-street
 * spawns at most one puff per interval. Tuned together with the
 * lifetime: lifetime / interval = number of simultaneously visible
 * puffs per wheel. Default (0.4 / 0.12 ≈ 3.3) lands at ~4 puffs per
 * wheel which the pool budget matches.
 */
export const DUST_PARTICLE_SPAWN_INTERVAL_SECONDS = 0.12

/**
 * Pool budget per wheel. Combined with the per-wheel interval / lifetime
 * ratio, four slots is just enough for a held off-street run to never
 * recycle a still-visible puff.
 */
export const DUST_PARTICLES_PER_WHEEL = 4

/**
 * Minimum forward speed (world units per second) below which the dust
 * cue suppresses. A car sitting still on grass should not emit dust;
 * only motion kicks it up. Tuned conservative so a slow crawl off
 * the road still puffs.
 */
export const DUST_PARTICLE_MIN_SPEED = 2

/**
 * Peak opacity at spawn. Particle fades linearly from this value to
 * zero across the lifetime. Kept low so the puff reads as ambient
 * scuff rather than a billboard.
 */
export const DUST_PARTICLE_OPACITY_PEAK = 0.55

/**
 * Vertical rise rate (world units per second). A small upward drift
 * so the puff lifts off the ground as it fades, reading as a real
 * kick-up rather than a static decal.
 */
export const DUST_PARTICLE_RISE_VELOCITY = 0.6

/**
 * Predicate for whether the substrate should fire a new puff at this
 * wheel on this frame. All four conditions must hold:
 *
 *   - The wheel is currently off-street (caller's per-wheel test).
 *   - The car's forward speed exceeds the minimum (cars sitting
 *     stationary do not kick up dust).
 *   - At least `intervalSeconds` has elapsed since the last spawn
 *     for THIS wheel.
 *   - Inputs are finite (defensive against NaN / Infinity leaks).
 */
export function shouldSpawnDust(
  offStreet: boolean,
  speed: number,
  lastSpawnTimeSeconds: number,
  currentTimeSeconds: number,
  intervalSeconds: number = DUST_PARTICLE_SPAWN_INTERVAL_SECONDS,
  minSpeed: number = DUST_PARTICLE_MIN_SPEED,
): boolean {
  if (!offStreet) return false
  if (!Number.isFinite(speed) || Math.abs(speed) < minSpeed) return false
  if (!Number.isFinite(currentTimeSeconds)) return false
  if (!Number.isFinite(lastSpawnTimeSeconds)) return true
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    return false
  }
  return currentTimeSeconds - lastSpawnTimeSeconds >= intervalSeconds
}

/**
 * Compute the opacity for a particle that has been alive for
 * `ageSeconds`. Linear ramp from `DUST_PARTICLE_OPACITY_PEAK` at
 * birth to 0 at `lifetimeSeconds`. Returns 0 for expired particles
 * (age >= lifetime) so a caller can treat zero opacity as "hide".
 */
export function dustParticleOpacity(
  ageSeconds: number,
  lifetimeSeconds: number = DUST_PARTICLE_LIFETIME_SECONDS,
  peakOpacity: number = DUST_PARTICLE_OPACITY_PEAK,
): number {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return 0
  if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0) return 0
  if (ageSeconds >= lifetimeSeconds) return 0
  const safePeak = Number.isFinite(peakOpacity)
    ? Math.max(0, Math.min(1, peakOpacity))
    : DUST_PARTICLE_OPACITY_PEAK
  return safePeak * (1 - ageSeconds / lifetimeSeconds)
}

/**
 * Y-offset (world units) for a particle that has been alive for
 * `ageSeconds`. Rises linearly with age so a fading puff lifts off
 * the ground as it disappears. Capped at lifetime so a particle held
 * past its lifetime does not keep climbing.
 */
export function dustParticleRise(
  ageSeconds: number,
  lifetimeSeconds: number = DUST_PARTICLE_LIFETIME_SECONDS,
  riseVelocity: number = DUST_PARTICLE_RISE_VELOCITY,
): number {
  if (!Number.isFinite(ageSeconds) || ageSeconds <= 0) return 0
  if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0) return 0
  if (!Number.isFinite(riseVelocity) || riseVelocity <= 0) return 0
  const clamped = Math.min(ageSeconds, lifetimeSeconds)
  return riseVelocity * clamped
}
