import { CELL_SIZE } from '@/lib/cellSize'
import type { SampledPoint } from '@/lib/trackPath'

/**
 * Ambient AI traffic (drive-mode visual fun). N small cars cruise the
 * placed streets while the player is in drive mode. v1 follows the
 * sampled centerline of `TrackPath.segments[0]` (the `main` segment):
 * each car advances along the segment by world-units-per-second, reads
 * its world pose from the sampled points, and despawns when it reaches
 * the segment end. After a small jitter delay it respawns at the
 * segment start. No turning logic, no collision, no path-finding, no
 * interaction with the player's vehicle.
 *
 * The module is pure so the per-frame step is unit-testable with no
 * three.js scene dependency. The caller (DriveSceneClient) owns the
 * mesh group lifecycle and reads `{ x, z, heading }` per car each
 * frame via `ambientCarWorldPose`.
 *
 * v1 explicitly skips the demand-driven population coupling that the
 * citizens layer (REQ-075) will eventually provide; spawn count is a
 * constant 3 (capped at 6). The demand-driven angle lands as a
 * follow-on slice once REQ-070 / REQ-075 are in.
 */

export interface AmbientCar {
  /** Parametric position along the segment in `[0, 1]`. */
  t: number
  /** Index into `TrackPath.segments`. v1 always uses segment 0. */
  segmentIndex: number
  /** Body color (hex). */
  color: number
  /**
   * Milliseconds of respawn delay remaining. Zero (or negative) means
   * the car is live and advancing along the segment. Positive means
   * the car has reached the segment end and is waiting to respawn.
   */
  respawnDelayMs: number
}

/**
 * Default ambient car count for v1 (no population coupling). 3 cars
 * read as "a few cars on the streets" without dominating the scene.
 */
export const AMBIENT_TRAFFIC_DEFAULT_COUNT = 3

/**
 * Hard cap on simultaneous ambient cars. Perf guard, not a design
 * statement; bump if playtest reveals it as a fun blocker. Capped at
 * 6 in v1 because the body geometry is a primitive `BoxGeometry` and
 * the per-frame integration is cheap.
 */
export const AMBIENT_TRAFFIC_MAX_COUNT = 6

/**
 * Cruising speed in world units per second. Picked at ~0.8 cells/sec
 * so ambient cars look measured against the player car's
 * `MAX_SPEED = CELL_SIZE * 1.2` (post-PR-#210 tuning): the player is
 * always faster than ambient traffic, ambient cars do not blur past
 * the camera, and a city with two or three pieces still gets visible
 * motion at chase-camera distance.
 */
export const AMBIENT_TRAFFIC_SPEED = CELL_SIZE * 0.8

/**
 * Maximum extra delay added before a car respawns at the segment
 * start. The actual delay for a car is `rng() * JITTER_MS` so two
 * cars rarely respawn on the same frame.
 */
export const AMBIENT_TRAFFIC_RESPAWN_JITTER_MS = 1500

/**
 * Body color palette. Cars are colored by index modulo this array so
 * a small fleet reads as varied rather than uniform.
 */
export const AMBIENT_TRAFFIC_COLORS = [
  0xc44d56, 0x4d8bc4, 0x4dc476, 0xd4b34d, 0x9d4dc4, 0xd47e4d, 0x4dc4c4,
] as const

/**
 * Deterministic rng for tests. Production passes `Math.random`.
 */
export type Rng = () => number

/**
 * Pose a car would read at its current `t` along the supplied
 * sample stream. Returns `null` when the segment has fewer than two
 * samples (so the caller can leave the mesh hidden / skip the
 * update). The `samples` argument is the flattened sample stream for
 * a segment, in the same shape that `continuousTrackSamples`
 * produces in `src/lib/render/trackSurface.ts`.
 */
export interface AmbientPose {
  x: number
  z: number
  heading: number
}

export function ambientCarWorldPose(
  car: AmbientCar,
  samples: readonly SampledPoint[],
): AmbientPose | null {
  if (samples.length < 2) return null
  const tClamped = car.t < 0 ? 0 : car.t > 1 ? 1 : car.t
  const lastIdx = samples.length - 1
  const scaled = tClamped * lastIdx
  const i0 = Math.floor(scaled)
  const i1 = Math.min(i0 + 1, lastIdx)
  const localT = scaled - i0
  const a = samples[i0]
  const b = samples[i1]
  // Lerp position and heading. Heading wrap is fine for v1 because
  // segments are smooth and adjacent samples never differ by more
  // than a handful of degrees.
  return {
    x: a.x + (b.x - a.x) * localT,
    z: a.z + (b.z - a.z) * localT,
    heading: a.heading + (b.heading - a.heading) * localT,
  }
}

/**
 * Total polyline length of a sample stream. The advancement step uses
 * this to convert "world-units per second" into a `t` delta per frame:
 * `dt_t = speed * dt / segmentLength`.
 */
export function sampleStreamLength(samples: readonly SampledPoint[]): number {
  if (samples.length < 2) return 0
  let total = 0
  for (let i = 1; i < samples.length; i++) {
    total += Math.hypot(
      samples[i].x - samples[i - 1].x,
      samples[i].z - samples[i - 1].z,
    )
  }
  return total
}

/**
 * Advance one ambient car by `dt` seconds along a segment of length
 * `segmentLength` (world units). Returns the next state:
 *
 * - When the car is waiting to respawn (`respawnDelayMs > 0`), the
 *   delay counts down by `dt * 1000` and the car stays at `t = 0`.
 *   The car becomes live when the delay reaches zero.
 * - When the car is live, `t` advances by `(speed * dt) / segmentLength`.
 *   On reaching `t >= 1`, the car switches to waiting state with a
 *   fresh respawn delay drawn from `rng() * AMBIENT_TRAFFIC_RESPAWN_JITTER_MS`.
 *
 * Returns the same car reference when `segmentLength <= 0` (degenerate
 * segment).
 */
export function advanceAmbientCar(
  car: AmbientCar,
  dt: number,
  segmentLength: number,
  rng: Rng,
): AmbientCar {
  if (segmentLength <= 0) return car
  if (car.respawnDelayMs > 0) {
    const nextDelay = car.respawnDelayMs - dt * 1000
    return {
      ...car,
      t: 0,
      respawnDelayMs: nextDelay > 0 ? nextDelay : 0,
    }
  }
  const dtT = (AMBIENT_TRAFFIC_SPEED * dt) / segmentLength
  const nextT = car.t + dtT
  if (nextT >= 1) {
    return {
      ...car,
      t: 0,
      respawnDelayMs: rng() * AMBIENT_TRAFFIC_RESPAWN_JITTER_MS,
    }
  }
  return { ...car, t: nextT }
}

/**
 * Build the initial fleet of `count` ambient cars on segment 0.
 *
 * Cars are spread along the segment so the fleet looks like an
 * existing traffic flow rather than every car spawning on top of each
 * other at `t = 0`. The spread is uniform across `[0, 1)`. Color is
 * picked by index modulo `AMBIENT_TRAFFIC_COLORS` so a small fleet
 * reads as varied. `count` is clamped to `AMBIENT_TRAFFIC_MAX_COUNT`.
 */
export function spawnAmbientFleet(count: number): AmbientCar[] {
  const clamped = Math.max(0, Math.min(AMBIENT_TRAFFIC_MAX_COUNT, count | 0))
  const fleet: AmbientCar[] = []
  for (let i = 0; i < clamped; i++) {
    fleet.push({
      t: clamped <= 1 ? 0 : i / clamped,
      segmentIndex: 0,
      color: AMBIENT_TRAFFIC_COLORS[i % AMBIENT_TRAFFIC_COLORS.length],
      respawnDelayMs: 0,
    })
  }
  return fleet
}
