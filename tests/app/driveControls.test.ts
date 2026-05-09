import { describe, expect, it } from 'vitest'
import {
  ACCELERATION,
  BRAKE_DECELERATION,
  COAST_DRAG,
  DEFAULT_KEY_BINDINGS,
  MAX_DELTA_SECONDS,
  MAX_REVERSE_SPEED,
  MAX_SPEED,
  STEER_RATE_AT_MAX_SPEED,
  STEER_RATE_AT_REST,
  applyDriveStep,
  createVehicleState,
  emptyInput,
  inputFromPressedKeys,
  steerRateForSpeed,
} from '@/app/[slug]/driveControls'
import { CELL_SIZE } from '@/app/[slug]/driveScene'

/**
 * REQ-034 (keyboard input) and REQ-031 first slice (kinematic vehicle
 * integration). The pure helpers in `driveControls.ts` are covered
 * here; the three.js mount in `DriveSceneClient.tsx` wires them to the
 * window key listeners and the requestAnimationFrame loop.
 */

describe('DEFAULT_KEY_BINDINGS (REQ-034)', () => {
  it('binds throttle to KeyW and ArrowUp', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyW).toBe('throttle')
    expect(DEFAULT_KEY_BINDINGS.ArrowUp).toBe('throttle')
  })

  it('binds brake to KeyS and ArrowDown', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyS).toBe('brake')
    expect(DEFAULT_KEY_BINDINGS.ArrowDown).toBe('brake')
  })

  it('binds steerLeft to KeyA and ArrowLeft', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyA).toBe('steerLeft')
    expect(DEFAULT_KEY_BINDINGS.ArrowLeft).toBe('steerLeft')
  })

  it('binds steerRight to KeyD and ArrowRight', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyD).toBe('steerRight')
    expect(DEFAULT_KEY_BINDINGS.ArrowRight).toBe('steerRight')
  })

  it('every binding maps to one of the four DriveAction values', () => {
    const allowed = new Set(['throttle', 'brake', 'steerLeft', 'steerRight'])
    for (const action of Object.values(DEFAULT_KEY_BINDINGS)) {
      expect(allowed.has(action)).toBe(true)
    }
  })
})

describe('inputFromPressedKeys', () => {
  it('returns an all-false snapshot when no keys are pressed', () => {
    const input = inputFromPressedKeys(new Set())
    expect(input).toEqual({
      throttle: false,
      brake: false,
      steerLeft: false,
      steerRight: false,
    })
  })

  it('flips throttle on when KeyW is pressed', () => {
    const input = inputFromPressedKeys(new Set(['KeyW']))
    expect(input.throttle).toBe(true)
    expect(input.brake).toBe(false)
  })

  it('flips throttle on when either KeyW or ArrowUp is pressed', () => {
    const fromKey = inputFromPressedKeys(new Set(['KeyW']))
    const fromArrow = inputFromPressedKeys(new Set(['ArrowUp']))
    expect(fromKey.throttle).toBe(true)
    expect(fromArrow.throttle).toBe(true)
  })

  it('combines simultaneous bindings into a single snapshot', () => {
    const input = inputFromPressedKeys(new Set(['KeyW', 'KeyA']))
    expect(input.throttle).toBe(true)
    expect(input.steerLeft).toBe(true)
    expect(input.brake).toBe(false)
    expect(input.steerRight).toBe(false)
  })

  it('ignores unbound keys', () => {
    const input = inputFromPressedKeys(new Set(['KeyQ', 'Space', 'Enter']))
    expect(input).toEqual(emptyInput())
  })

  it('accepts a custom binding table without touching the default map', () => {
    const custom = { Space: 'throttle' as const }
    const input = inputFromPressedKeys(new Set(['Space']), custom)
    expect(input.throttle).toBe(true)
    // Default still binds Space to nothing.
    expect(DEFAULT_KEY_BINDINGS.Space).toBeUndefined()
  })
})

describe('city wrapper agrees with lib physics integrator (R24)', () => {
  it('applyDriveStep matches libApplyDriveStep called with the city VEHICLE_TUNING', async () => {
    const lib = await import('@/lib/physics/vehicle')
    const tuning: import('@/lib/physics/vehicle').VehicleTuning = {
      maxSpeed: MAX_SPEED,
      maxReverseSpeed: MAX_REVERSE_SPEED,
      acceleration: ACCELERATION,
      brakeDeceleration: BRAKE_DECELERATION,
      coastDrag: COAST_DRAG,
      steerRateAtRest: STEER_RATE_AT_REST,
      steerRateAtMaxSpeed: STEER_RATE_AT_MAX_SPEED,
      maxDeltaSeconds: MAX_DELTA_SECONDS,
    }
    const state = createVehicleState({ x: 1, z: 2, heading: Math.PI / 4 })
    const input = { ...emptyInput(), throttle: true, steerRight: true }
    // Stay under the dt clamp so both paths exercise the same step.
    const dt = MAX_DELTA_SECONDS / 2
    expect(applyDriveStep(state, input, dt)).toEqual(
      lib.applyDriveStep(state, input, dt, tuning),
    )
  })
})

describe('createVehicleState', () => {
  it('returns a state at the given position with zero speed', () => {
    const state = createVehicleState({ x: 4, z: -8, heading: Math.PI / 2 })
    expect(state).toEqual({ x: 4, z: -8, heading: Math.PI / 2, speed: 0 })
  })

  it('returns a fresh object each call', () => {
    const a = createVehicleState({ x: 0, z: 0, heading: 0 })
    const b = createVehicleState({ x: 0, z: 0, heading: 0 })
    expect(a).not.toBe(b)
  })
})

describe('steerRateForSpeed (REQ-031 steering tuning)', () => {
  it('returns the at-rest rate when speed is zero', () => {
    expect(steerRateForSpeed(0)).toBe(STEER_RATE_AT_REST)
  })

  it('returns the at-max rate when speed is MAX_SPEED', () => {
    expect(steerRateForSpeed(MAX_SPEED)).toBeCloseTo(STEER_RATE_AT_MAX_SPEED, 6)
  })

  it('returns the at-max rate when speed is below -MAX_SPEED', () => {
    expect(steerRateForSpeed(-MAX_SPEED * 2)).toBeCloseTo(
      STEER_RATE_AT_MAX_SPEED,
      6,
    )
  })

  it('interpolates linearly between rest and max', () => {
    const half = steerRateForSpeed(MAX_SPEED / 2)
    const expected =
      STEER_RATE_AT_REST + (STEER_RATE_AT_MAX_SPEED - STEER_RATE_AT_REST) * 0.5
    expect(half).toBeCloseTo(expected, 6)
  })

  it('treats negative speed by magnitude', () => {
    expect(steerRateForSpeed(-MAX_SPEED / 2)).toBeCloseTo(
      steerRateForSpeed(MAX_SPEED / 2),
      6,
    )
  })

  it('rest rate is greater than max-speed rate (sharper at low speed)', () => {
    expect(STEER_RATE_AT_REST).toBeGreaterThan(STEER_RATE_AT_MAX_SPEED)
  })
})

describe('applyDriveStep coast and bounds', () => {
  const initial = createVehicleState({ x: 0, z: 0, heading: 0 })

  it('returns the input state unchanged when dt is zero', () => {
    const next = applyDriveStep(initial, emptyInput(), 0)
    expect(next).toBe(initial)
  })

  it('returns the input state unchanged when dt is negative', () => {
    const next = applyDriveStep(initial, emptyInput(), -0.5)
    expect(next).toBe(initial)
  })

  it('returns the input state unchanged when dt is NaN', () => {
    const next = applyDriveStep(initial, emptyInput(), Number.NaN)
    expect(next).toBe(initial)
  })

  it('returns a fresh object when dt is positive', () => {
    const next = applyDriveStep(initial, emptyInput(), 0.016)
    expect(next).not.toBe(initial)
  })

  it('clamps dt at MAX_DELTA_SECONDS so a long pause cannot teleport the car', () => {
    const huge = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: MAX_SPEED },
      emptyInput(),
      MAX_DELTA_SECONDS * 100,
    )
    const oneFrame = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: MAX_SPEED },
      emptyInput(),
      MAX_DELTA_SECONDS,
    )
    expect(huge.z).toBeCloseTo(oneFrame.z, 6)
  })

  it('coasts to zero from positive speed under no input', () => {
    let state: ReturnType<typeof applyDriveStep> = {
      x: 0,
      z: 0,
      heading: 0,
      speed: MAX_SPEED / 2,
    }
    const dt = 1 / 60
    const stepsToZero = Math.ceil(state.speed / (COAST_DRAG * dt)) + 5
    for (let i = 0; i < stepsToZero; i += 1) {
      state = applyDriveStep(state, emptyInput(), dt)
    }
    expect(state.speed).toBe(0)
  })

  it('coasts to zero from negative speed under no input', () => {
    let state: ReturnType<typeof applyDriveStep> = {
      x: 0,
      z: 0,
      heading: 0,
      speed: -MAX_REVERSE_SPEED,
    }
    const dt = 1 / 60
    const stepsToZero = Math.ceil(MAX_REVERSE_SPEED / (COAST_DRAG * dt)) + 5
    for (let i = 0; i < stepsToZero; i += 1) {
      state = applyDriveStep(state, emptyInput(), dt)
    }
    expect(state.speed).toBe(0)
  })
})

describe('applyDriveStep throttle (REQ-031)', () => {
  it('accelerates forward under throttle', () => {
    const dt = 0.05
    const next = applyDriveStep(
      createVehicleState({ x: 0, z: 0, heading: 0 }),
      { throttle: true, brake: false, steerLeft: false, steerRight: false },
      dt,
    )
    expect(next.speed).toBeCloseTo(ACCELERATION * dt, 6)
  })

  it('caps forward speed at MAX_SPEED', () => {
    let state: ReturnType<typeof applyDriveStep> = createVehicleState({
      x: 0,
      z: 0,
      heading: 0,
    })
    const input = {
      throttle: true,
      brake: false,
      steerLeft: false,
      steerRight: false,
    }
    for (let i = 0; i < 200; i += 1) {
      state = applyDriveStep(state, input, 1 / 60)
    }
    expect(state.speed).toBe(MAX_SPEED)
  })

  it('moves the car along world -z when heading is 0 and throttle is held', () => {
    const next = applyDriveStep(
      createVehicleState({ x: 0, z: 0, heading: 0 }),
      { throttle: true, brake: false, steerLeft: false, steerRight: false },
      0.05,
    )
    expect(next.x).toBeCloseTo(0, 6)
    expect(next.z).toBeLessThan(0)
  })

  it('moves the car along world +x when heading is Math.PI / 2 and throttle is held', () => {
    const next = applyDriveStep(
      createVehicleState({ x: 0, z: 0, heading: Math.PI / 2 }),
      { throttle: true, brake: false, steerLeft: false, steerRight: false },
      0.05,
    )
    expect(next.x).toBeGreaterThan(0)
    expect(next.z).toBeCloseTo(0, 6)
  })
})

describe('applyDriveStep brake (REQ-031)', () => {
  it('brakes a forward-moving car toward zero', () => {
    const dt = 0.05
    const next = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: MAX_SPEED },
      { throttle: false, brake: true, steerLeft: false, steerRight: false },
      dt,
    )
    expect(next.speed).toBeCloseTo(MAX_SPEED - BRAKE_DECELERATION * dt, 6)
    expect(next.speed).toBeLessThan(MAX_SPEED)
  })

  it('clamps brake at zero before flipping into reverse', () => {
    // Drive enough single-frame brake steps to overshoot zero. The
    // clamp inside `applyDriveStep` should pin the speed at exactly 0.
    let state: ReturnType<typeof applyDriveStep> = {
      x: 0,
      z: 0,
      heading: 0,
      speed: 1,
    }
    const input = {
      throttle: false,
      brake: true,
      steerLeft: false,
      steerRight: false,
    }
    for (let i = 0; i < 60; i += 1) {
      state = applyDriveStep(state, input, 1 / 60)
      if (state.speed === 0) break
    }
    expect(state.speed).toBe(0)
  })

  it('accelerates the car in reverse when brake is held from rest', () => {
    const dt = 0.05
    const next = applyDriveStep(
      createVehicleState({ x: 0, z: 0, heading: 0 }),
      { throttle: false, brake: true, steerLeft: false, steerRight: false },
      dt,
    )
    expect(next.speed).toBeLessThan(0)
    expect(next.speed).toBeCloseTo(-ACCELERATION * dt, 6)
  })

  it('caps reverse speed at MAX_REVERSE_SPEED', () => {
    let state: ReturnType<typeof applyDriveStep> = createVehicleState({
      x: 0,
      z: 0,
      heading: 0,
    })
    const input = {
      throttle: false,
      brake: true,
      steerLeft: false,
      steerRight: false,
    }
    for (let i = 0; i < 200; i += 1) {
      state = applyDriveStep(state, input, 1 / 60)
    }
    expect(state.speed).toBe(-MAX_REVERSE_SPEED)
  })

  it('throttle and brake held together cancel to coast (no acceleration)', () => {
    const dt = 0.05
    const next = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: MAX_SPEED / 2 },
      { throttle: true, brake: true, steerLeft: false, steerRight: false },
      dt,
    )
    // Coast drag pulls speed toward zero by COAST_DRAG * dt.
    expect(next.speed).toBeCloseTo(MAX_SPEED / 2 - COAST_DRAG * dt, 6)
  })
})

describe('applyDriveStep steering (REQ-031)', () => {
  it('rotates heading left under steerLeft', () => {
    const next = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: MAX_SPEED / 2 },
      { throttle: false, brake: false, steerLeft: true, steerRight: false },
      0.05,
    )
    expect(next.heading).toBeLessThan(0)
  })

  it('rotates heading right under steerRight', () => {
    const next = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: MAX_SPEED / 2 },
      { throttle: false, brake: false, steerLeft: false, steerRight: true },
      0.05,
    )
    expect(next.heading).toBeGreaterThan(0)
  })

  it('does not rotate when steerLeft and steerRight are both held', () => {
    const next = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: MAX_SPEED / 2 },
      { throttle: false, brake: false, steerLeft: true, steerRight: true },
      0.05,
    )
    expect(next.heading).toBe(0)
  })

  it('flips steer direction when in reverse so the car pivots from the rear axle', () => {
    const forward = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: MAX_SPEED / 2 },
      { throttle: false, brake: false, steerLeft: false, steerRight: true },
      0.05,
    )
    const reverse = applyDriveStep(
      { x: 0, z: 0, heading: 0, speed: -MAX_REVERSE_SPEED / 2 },
      { throttle: false, brake: false, steerLeft: false, steerRight: true },
      0.05,
    )
    expect(forward.heading).toBeGreaterThan(0)
    expect(reverse.heading).toBeLessThan(0)
  })

  it('still rotates a parked car so the builder can re-aim before driving', () => {
    const next = applyDriveStep(
      createVehicleState({ x: 0, z: 0, heading: 0 }),
      { throttle: false, brake: false, steerLeft: true, steerRight: false },
      0.05,
    )
    expect(next.heading).toBeLessThan(0)
    expect(next.speed).toBe(0)
  })
})
