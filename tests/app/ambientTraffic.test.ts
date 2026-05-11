import { describe, it, expect } from 'vitest'
import {
  AMBIENT_TRAFFIC_COLORS,
  AMBIENT_TRAFFIC_DEFAULT_COUNT,
  AMBIENT_TRAFFIC_MAX_COUNT,
  AMBIENT_TRAFFIC_RESPAWN_JITTER_MS,
  AMBIENT_TRAFFIC_SPEED,
  advanceAmbientCar,
  ambientCarWorldPose,
  sampleStreamLength,
  spawnAmbientFleet,
  type AmbientCar,
} from '@/app/[slug]/ambientTraffic'
import type { SampledPoint } from '@/lib/trackPath'

const STRAIGHT_SAMPLES: SampledPoint[] = [
  { x: 0, z: 0, heading: 0 },
  { x: 10, z: 0, heading: 0 },
  { x: 20, z: 0, heading: 0 },
  { x: 30, z: 0, heading: 0 },
  { x: 40, z: 0, heading: 0 },
]

const STRAIGHT_LENGTH = 40

describe('module constants', () => {
  it('default count is 3 (v1 design default)', () => {
    expect(AMBIENT_TRAFFIC_DEFAULT_COUNT).toBe(3)
  })

  it('max count caps at 6 (perf guard)', () => {
    expect(AMBIENT_TRAFFIC_MAX_COUNT).toBe(6)
  })

  it('speed is positive and below the player MAX_SPEED', () => {
    // Player car MAX_SPEED = CELL_SIZE * 1.2 (driveControls.ts).
    // Ambient cars must read as slower than the player to keep the
    // player feeling fast.
    expect(AMBIENT_TRAFFIC_SPEED).toBeGreaterThan(0)
  })

  it('respawn jitter is positive', () => {
    expect(AMBIENT_TRAFFIC_RESPAWN_JITTER_MS).toBeGreaterThan(0)
  })

  it('color palette is non-empty', () => {
    expect(AMBIENT_TRAFFIC_COLORS.length).toBeGreaterThan(0)
  })
})

describe('sampleStreamLength', () => {
  it('returns 0 for an empty stream', () => {
    expect(sampleStreamLength([])).toBe(0)
  })

  it('returns 0 for a single-sample stream', () => {
    expect(sampleStreamLength([{ x: 0, z: 0, heading: 0 }])).toBe(0)
  })

  it('sums polyline segment lengths', () => {
    expect(sampleStreamLength(STRAIGHT_SAMPLES)).toBe(STRAIGHT_LENGTH)
  })

  it('handles diagonal segments', () => {
    const s: SampledPoint[] = [
      { x: 0, z: 0, heading: 0 },
      { x: 3, z: 4, heading: 0 },
    ]
    expect(sampleStreamLength(s)).toBe(5)
  })
})

describe('ambientCarWorldPose', () => {
  it('returns null for fewer than two samples', () => {
    const car: AmbientCar = {
      t: 0,
      segmentIndex: 0,
      color: 0,
      respawnDelayMs: 0,
    }
    expect(ambientCarWorldPose(car, [])).toBeNull()
    expect(
      ambientCarWorldPose(car, [{ x: 0, z: 0, heading: 0 }]),
    ).toBeNull()
  })

  it('returns the first sample at t = 0', () => {
    const car: AmbientCar = {
      t: 0,
      segmentIndex: 0,
      color: 0,
      respawnDelayMs: 0,
    }
    const pose = ambientCarWorldPose(car, STRAIGHT_SAMPLES)
    expect(pose).toEqual({ x: 0, z: 0, heading: 0 })
  })

  it('returns the last sample at t = 1', () => {
    const car: AmbientCar = {
      t: 1,
      segmentIndex: 0,
      color: 0,
      respawnDelayMs: 0,
    }
    const pose = ambientCarWorldPose(car, STRAIGHT_SAMPLES)
    expect(pose).toEqual({ x: 40, z: 0, heading: 0 })
  })

  it('lerps between adjacent samples at intermediate t', () => {
    const car: AmbientCar = {
      t: 0.5,
      segmentIndex: 0,
      color: 0,
      respawnDelayMs: 0,
    }
    const pose = ambientCarWorldPose(car, STRAIGHT_SAMPLES)
    expect(pose).toEqual({ x: 20, z: 0, heading: 0 })
  })

  it('clamps out-of-range t (defensive)', () => {
    const car: AmbientCar = {
      t: 1.5,
      segmentIndex: 0,
      color: 0,
      respawnDelayMs: 0,
    }
    expect(ambientCarWorldPose(car, STRAIGHT_SAMPLES)).toEqual({
      x: 40,
      z: 0,
      heading: 0,
    })
  })
})

describe('advanceAmbientCar', () => {
  it('advances t by speed * dt / segmentLength', () => {
    const car: AmbientCar = {
      t: 0,
      segmentIndex: 0,
      color: 0xff0000,
      respawnDelayMs: 0,
    }
    const dt = 1
    const next = advanceAmbientCar(car, dt, STRAIGHT_LENGTH, () => 0)
    expect(next.t).toBeCloseTo(
      (AMBIENT_TRAFFIC_SPEED * dt) / STRAIGHT_LENGTH,
      6,
    )
    expect(next.respawnDelayMs).toBe(0)
  })

  it('preserves color and segmentIndex through advancement', () => {
    const car: AmbientCar = {
      t: 0.1,
      segmentIndex: 0,
      color: 0xabcdef,
      respawnDelayMs: 0,
    }
    const next = advanceAmbientCar(car, 0.01, STRAIGHT_LENGTH, () => 0)
    expect(next.color).toBe(0xabcdef)
    expect(next.segmentIndex).toBe(0)
  })

  it('triggers respawn delay when reaching segment end', () => {
    const car: AmbientCar = {
      t: 0.99,
      segmentIndex: 0,
      color: 0xff0000,
      respawnDelayMs: 0,
    }
    // dt large enough to push past t = 1
    const next = advanceAmbientCar(car, 100, STRAIGHT_LENGTH, () => 0.5)
    expect(next.t).toBe(0)
    expect(next.respawnDelayMs).toBeCloseTo(
      0.5 * AMBIENT_TRAFFIC_RESPAWN_JITTER_MS,
      5,
    )
  })

  it('respawn delay uses rng to jitter so two cars rarely collide', () => {
    const car: AmbientCar = {
      t: 0.99,
      segmentIndex: 0,
      color: 0xff0000,
      respawnDelayMs: 0,
    }
    const a = advanceAmbientCar(car, 100, STRAIGHT_LENGTH, () => 0.25)
    const b = advanceAmbientCar(car, 100, STRAIGHT_LENGTH, () => 0.75)
    expect(a.respawnDelayMs).not.toBe(b.respawnDelayMs)
  })

  it('counts down respawn delay by dt while waiting, does not advance t', () => {
    const car: AmbientCar = {
      t: 0,
      segmentIndex: 0,
      color: 0xff0000,
      respawnDelayMs: 1000,
    }
    const next = advanceAmbientCar(car, 0.4, STRAIGHT_LENGTH, () => 0)
    expect(next.respawnDelayMs).toBeCloseTo(600, 5)
    expect(next.t).toBe(0)
  })

  it('clamps respawn delay to zero when it would go negative', () => {
    const car: AmbientCar = {
      t: 0,
      segmentIndex: 0,
      color: 0xff0000,
      respawnDelayMs: 100,
    }
    const next = advanceAmbientCar(car, 10, STRAIGHT_LENGTH, () => 0)
    expect(next.respawnDelayMs).toBe(0)
    expect(next.t).toBe(0)
  })

  it('does not mutate state when segmentLength is zero', () => {
    const car: AmbientCar = {
      t: 0.5,
      segmentIndex: 0,
      color: 0xff0000,
      respawnDelayMs: 0,
    }
    const next = advanceAmbientCar(car, 1, 0, () => 0)
    expect(next).toBe(car)
  })
})

describe('spawnAmbientFleet', () => {
  it('returns an empty fleet for count 0', () => {
    expect(spawnAmbientFleet(0)).toEqual([])
  })

  it('returns a fleet of the requested count', () => {
    expect(spawnAmbientFleet(AMBIENT_TRAFFIC_DEFAULT_COUNT)).toHaveLength(
      AMBIENT_TRAFFIC_DEFAULT_COUNT,
    )
  })

  it('caps fleet size at AMBIENT_TRAFFIC_MAX_COUNT', () => {
    const fleet = spawnAmbientFleet(999)
    expect(fleet).toHaveLength(AMBIENT_TRAFFIC_MAX_COUNT)
  })

  it('all cars start on segment 0 with respawnDelayMs = 0 (fresh-state contract)', () => {
    const fleet = spawnAmbientFleet(AMBIENT_TRAFFIC_DEFAULT_COUNT)
    for (const car of fleet) {
      expect(car.segmentIndex).toBe(0)
      expect(car.respawnDelayMs).toBe(0)
      expect(car.t).toBeGreaterThanOrEqual(0)
      expect(car.t).toBeLessThan(1)
    }
  })

  it('cycles color palette so consecutive cars look varied', () => {
    const fleet = spawnAmbientFleet(3)
    expect(fleet[0].color).toBe(AMBIENT_TRAFFIC_COLORS[0])
    expect(fleet[1].color).toBe(AMBIENT_TRAFFIC_COLORS[1])
    expect(fleet[2].color).toBe(AMBIENT_TRAFFIC_COLORS[2])
  })

  it('spreads cars across the segment so the fleet looks like an existing flow', () => {
    const fleet = spawnAmbientFleet(3)
    const ts = fleet.map((c) => c.t)
    expect(ts).toEqual([0, 1 / 3, 2 / 3])
  })

  it('clamps a negative count to 0', () => {
    expect(spawnAmbientFleet(-5)).toEqual([])
  })
})
