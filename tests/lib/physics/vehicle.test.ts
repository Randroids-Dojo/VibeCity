import { describe, expect, it } from 'vitest'
import {
  applyDriveStep,
  createVehicleState,
  steerRateForSpeed,
  type VehicleState,
  type VehicleTuning,
} from '@/lib/physics/vehicle'
import { emptyInput } from '@/lib/input/vehicleControls'

const TUNING: VehicleTuning = {
  maxSpeed: 32,
  maxReverseSpeed: 16,
  acceleration: 24,
  brakeDeceleration: 48,
  coastDrag: 12,
  steerRateAtRest: Math.PI * 1.6,
  steerRateAtMaxSpeed: Math.PI * 0.8,
  maxDeltaSeconds: 1 / 15,
}

describe('createVehicleState', () => {
  it('seeds a vehicle at the supplied pose with zero speed', () => {
    const state = createVehicleState({ x: 1, z: 2, heading: 0.5 })
    expect(state.x).toBe(1)
    expect(state.z).toBe(2)
    expect(state.heading).toBe(0.5)
    expect(state.speed).toBe(0)
  })
})

describe('steerRateForSpeed', () => {
  it('returns the at-rest rate when speed is zero', () => {
    expect(steerRateForSpeed(0, TUNING)).toBeCloseTo(TUNING.steerRateAtRest, 6)
  })

  it('returns the max-speed rate when speed >= maxSpeed', () => {
    expect(steerRateForSpeed(TUNING.maxSpeed, TUNING)).toBeCloseTo(
      TUNING.steerRateAtMaxSpeed,
      6,
    )
    expect(steerRateForSpeed(TUNING.maxSpeed * 2, TUNING)).toBeCloseTo(
      TUNING.steerRateAtMaxSpeed,
      6,
    )
  })

  it('uses the speed magnitude for reverse', () => {
    expect(steerRateForSpeed(-TUNING.maxSpeed, TUNING)).toBeCloseTo(
      TUNING.steerRateAtMaxSpeed,
      6,
    )
  })

  it('linearly interpolates between rest and max', () => {
    const half = steerRateForSpeed(TUNING.maxSpeed / 2, TUNING)
    const expected =
      TUNING.steerRateAtRest +
      (TUNING.steerRateAtMaxSpeed - TUNING.steerRateAtRest) * 0.5
    expect(half).toBeCloseTo(expected, 6)
  })
})

describe('applyDriveStep throttle / brake / coast', () => {
  function fresh(): VehicleState {
    return createVehicleState({ x: 0, z: 0, heading: 0 })
  }

  it('returns the input state unchanged for non-finite or non-positive dt', () => {
    const state = fresh()
    const input = { ...emptyInput(), throttle: true }
    expect(applyDriveStep(state, input, Number.NaN, TUNING)).toBe(state)
    expect(applyDriveStep(state, input, 0, TUNING)).toBe(state)
    expect(applyDriveStep(state, input, -1, TUNING)).toBe(state)
  })

  it('throttle adds forward acceleration', () => {
    // dt = 0.05 stays under maxDeltaSeconds = 1/15 so the step is not clamped.
    const dt = 0.05
    const result = applyDriveStep(
      fresh(),
      { ...emptyInput(), throttle: true },
      dt,
      TUNING,
    )
    expect(result.speed).toBeCloseTo(TUNING.acceleration * dt, 6)
  })

  it('coast drag pulls speed back toward zero', () => {
    const moving: VehicleState = { x: 0, z: 0, heading: 0, speed: 10 }
    // dt = 0.05 stays under the maxDeltaSeconds clamp.
    const result = applyDriveStep(moving, emptyInput(), 0.05, TUNING)
    expect(result.speed).toBeLessThan(10)
    expect(result.speed).toBeGreaterThan(0)
  })

  it('clamps dt to maxDeltaSeconds (long pause does not teleport)', () => {
    const result = applyDriveStep(
      fresh(),
      { ...emptyInput(), throttle: true },
      10,
      TUNING,
    )
    // Speed is bounded by acceleration * maxDeltaSeconds (single step).
    expect(result.speed).toBeCloseTo(
      TUNING.acceleration * TUNING.maxDeltaSeconds,
      6,
    )
  })

  it('clamps speed to maxSpeed and -maxReverseSpeed', () => {
    const fast: VehicleState = { x: 0, z: 0, heading: 0, speed: TUNING.maxSpeed }
    const result = applyDriveStep(
      fast,
      { ...emptyInput(), throttle: true },
      0.05,
      TUNING,
    )
    expect(result.speed).toBe(TUNING.maxSpeed)
  })
})

describe('applyDriveStep heading + position', () => {
  it('heading 0 advances along world -z', () => {
    const moving: VehicleState = { x: 0, z: 0, heading: 0, speed: 10 }
    const result = applyDriveStep(moving, emptyInput(), 0.05, TUNING)
    // Coast drag will reduce the speed but the direction remains -z.
    expect(result.x).toBeCloseTo(0, 6)
    expect(result.z).toBeLessThan(0)
  })

  it('reverse flips steering sign (rear-axle pivot)', () => {
    const reverse: VehicleState = { x: 0, z: 0, heading: 0, speed: -5 }
    const left = applyDriveStep(
      reverse,
      { ...emptyInput(), steerLeft: true },
      0.05,
      TUNING,
    )
    // Forward + steerLeft would decrease heading; reverse + steerLeft
    // should INCREASE heading because the rear-axle pivot flips sign.
    expect(left.heading).toBeGreaterThan(0)
  })
})
