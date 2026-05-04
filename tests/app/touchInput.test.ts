import { describe, expect, it } from 'vitest'
import {
  JOYSTICK_DEADZONE,
  JOYSTICK_RADIUS,
  beginJoystick,
  createJoystick,
  endJoystick,
  joystickForTouch,
  joysticksToInput,
  mergeDriveInputs,
  moveJoystick,
  readJoystick,
} from '@/app/[slug]/touchInput'
import { emptyInput, type DriveInput } from '@/app/[slug]/driveControls'

/**
 * REQ-035: drive-mode touch input. The listener wiring lives on the
 * drive scene client; this module is the float-where-you-tap virtual
 * joystick state machine plus the joystick-to-input mapper. Tests
 * cover the state transitions, the read magnitudes / clamps, the
 * dual-stick / single-stick contract, the deadzone, the merge, and
 * the touch-to-stick routing.
 */

describe('joystick constants', () => {
  it('JOYSTICK_RADIUS is a positive integer pixel value', () => {
    expect(Number.isInteger(JOYSTICK_RADIUS)).toBe(true)
    expect(JOYSTICK_RADIUS).toBeGreaterThan(0)
  })

  it('JOYSTICK_DEADZONE is a fractional positive value below 1', () => {
    expect(JOYSTICK_DEADZONE).toBeGreaterThan(0)
    expect(JOYSTICK_DEADZONE).toBeLessThan(1)
  })

  it('mirrors VibeRacer values so cross-project users land on the same feel', () => {
    expect(JOYSTICK_RADIUS).toBe(64)
    expect(JOYSTICK_DEADZONE).toBe(0.25)
  })
})

describe('createJoystick', () => {
  it('builds a fresh inactive joystick state', () => {
    const js = createJoystick()
    expect(js.active).toBe(false)
    expect(js.pointerId).toBe(null)
    expect(js.originX).toBe(0)
    expect(js.originY).toBe(0)
    expect(js.currentX).toBe(0)
    expect(js.currentY).toBe(0)
  })

  it('returns a fresh object each call so two sticks do not alias', () => {
    const a = createJoystick()
    const b = createJoystick()
    expect(a).not.toBe(b)
    a.active = true
    expect(b.active).toBe(false)
  })
})

describe('beginJoystick', () => {
  it('anchors the origin and current position to the touch-down point', () => {
    const js = createJoystick()
    beginJoystick(js, 7, 100, 200)
    expect(js.active).toBe(true)
    expect(js.pointerId).toBe(7)
    expect(js.originX).toBe(100)
    expect(js.originY).toBe(200)
    expect(js.currentX).toBe(100)
    expect(js.currentY).toBe(200)
  })

  it('overwrites a prior anchor when called again', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 10, 10)
    beginJoystick(js, 2, 50, 50)
    expect(js.pointerId).toBe(2)
    expect(js.originX).toBe(50)
    expect(js.originY).toBe(50)
    expect(js.currentX).toBe(50)
    expect(js.currentY).toBe(50)
  })
})

describe('moveJoystick', () => {
  it('updates current position on an active joystick', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 100, 200)
    moveJoystick(js, 130, 220)
    expect(js.currentX).toBe(130)
    expect(js.currentY).toBe(220)
    expect(js.originX).toBe(100)
    expect(js.originY).toBe(200)
  })

  it('ignores moves on an inactive joystick (defends against late events)', () => {
    const js = createJoystick()
    moveJoystick(js, 50, 50)
    expect(js.currentX).toBe(0)
    expect(js.currentY).toBe(0)
    expect(js.active).toBe(false)
  })
})

describe('endJoystick', () => {
  it('clears active flag and pointer id; preserves last position', () => {
    const js = createJoystick()
    beginJoystick(js, 5, 100, 100)
    moveJoystick(js, 120, 80)
    endJoystick(js)
    expect(js.active).toBe(false)
    expect(js.pointerId).toBe(null)
    expect(js.currentX).toBe(120)
    expect(js.currentY).toBe(80)
  })

  it('is idempotent on an already-inactive joystick', () => {
    const js = createJoystick()
    endJoystick(js)
    expect(js.active).toBe(false)
    expect(js.pointerId).toBe(null)
  })
})

describe('readJoystick', () => {
  it('reports zero on an inactive joystick', () => {
    const js = createJoystick()
    expect(readJoystick(js)).toEqual({ x: 0, y: 0 })
  })

  it('reports zero at the anchor', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 100, 100)
    expect(readJoystick(js)).toEqual({ x: 0, y: 0 })
  })

  it('reports a fractional magnitude for a thumb inside the radius', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 100, 100)
    moveJoystick(js, 100 + JOYSTICK_RADIUS / 2, 100)
    const v = readJoystick(js)
    expect(v.x).toBeCloseTo(0.5, 5)
    expect(v.y).toBeCloseTo(0, 5)
  })

  it('clamps to magnitude 1 for a thumb beyond the radius', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 100, 100)
    moveJoystick(js, 100 + JOYSTICK_RADIUS * 4, 100)
    const v = readJoystick(js)
    expect(v.x).toBeCloseTo(1, 5)
    expect(v.y).toBeCloseTo(0, 5)
  })

  it('clamps along the angle of travel beyond the radius', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 100, 100)
    // 45deg up-and-right at distance 4 * radius.
    const dx = JOYSTICK_RADIUS * 4
    const dy = -JOYSTICK_RADIUS * 4
    moveJoystick(js, 100 + dx, 100 + dy)
    const v = readJoystick(js)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5)
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 5)
    expect(v.y).toBeCloseTo(-Math.SQRT1_2, 5)
  })

  it('y is positive when the thumb moves down (CSS pixel space)', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 100, 100)
    moveJoystick(js, 100, 100 + JOYSTICK_RADIUS / 2)
    const v = readJoystick(js)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(0.5, 5)
  })
})

describe('joysticksToInput dual-stick', () => {
  it('zero on two inactive sticks', () => {
    const steer = createJoystick()
    const throttle = createJoystick()
    expect(joysticksToInput(steer, throttle, 'dual-stick')).toEqual(emptyInput())
  })

  it('left-thumb steers left', () => {
    const steer = createJoystick()
    beginJoystick(steer, 1, 100, 100)
    moveJoystick(steer, 100 - JOYSTICK_RADIUS, 100)
    const throttle = createJoystick()
    const input = joysticksToInput(steer, throttle, 'dual-stick')
    expect(input.steerLeft).toBe(true)
    expect(input.steerRight).toBe(false)
    expect(input.throttle).toBe(false)
    expect(input.brake).toBe(false)
  })

  it('right-thumb steers right', () => {
    const steer = createJoystick()
    beginJoystick(steer, 1, 100, 100)
    moveJoystick(steer, 100 + JOYSTICK_RADIUS, 100)
    const throttle = createJoystick()
    const input = joysticksToInput(steer, throttle, 'dual-stick')
    expect(input.steerRight).toBe(true)
    expect(input.steerLeft).toBe(false)
  })

  it('throttle stick up is throttle on', () => {
    const steer = createJoystick()
    const throttle = createJoystick()
    beginJoystick(throttle, 2, 300, 300)
    moveJoystick(throttle, 300, 300 - JOYSTICK_RADIUS)
    const input = joysticksToInput(steer, throttle, 'dual-stick')
    expect(input.throttle).toBe(true)
    expect(input.brake).toBe(false)
    expect(input.steerLeft).toBe(false)
    expect(input.steerRight).toBe(false)
  })

  it('throttle stick down is brake on', () => {
    const steer = createJoystick()
    const throttle = createJoystick()
    beginJoystick(throttle, 2, 300, 300)
    moveJoystick(throttle, 300, 300 + JOYSTICK_RADIUS)
    const input = joysticksToInput(steer, throttle, 'dual-stick')
    expect(input.brake).toBe(true)
    expect(input.throttle).toBe(false)
  })

  it('inside the deadzone reports no action on either axis', () => {
    const steer = createJoystick()
    beginJoystick(steer, 1, 100, 100)
    moveJoystick(
      steer,
      100 + JOYSTICK_RADIUS * (JOYSTICK_DEADZONE / 2),
      100 + JOYSTICK_RADIUS * (JOYSTICK_DEADZONE / 2),
    )
    const throttle = createJoystick()
    const input = joysticksToInput(steer, throttle, 'dual-stick')
    expect(input).toEqual(emptyInput())
  })

  it('exactly at the deadzone boundary still reports no action (strict inequality)', () => {
    const steer = createJoystick()
    beginJoystick(steer, 1, 100, 100)
    moveJoystick(steer, 100 + JOYSTICK_RADIUS * JOYSTICK_DEADZONE, 100)
    const throttle = createJoystick()
    const input = joysticksToInput(steer, throttle, 'dual-stick')
    expect(input.steerRight).toBe(false)
    expect(input.steerLeft).toBe(false)
  })

  it('combines steer and throttle independently across both sticks', () => {
    const steer = createJoystick()
    beginJoystick(steer, 1, 100, 100)
    moveJoystick(steer, 100 - JOYSTICK_RADIUS, 100)
    const throttle = createJoystick()
    beginJoystick(throttle, 2, 300, 300)
    moveJoystick(throttle, 300, 300 - JOYSTICK_RADIUS)
    const input = joysticksToInput(steer, throttle, 'dual-stick')
    expect(input.steerLeft).toBe(true)
    expect(input.throttle).toBe(true)
    expect(input.steerRight).toBe(false)
    expect(input.brake).toBe(false)
  })

  it('ignores throttle stick vertical when only the steer stick is active', () => {
    const steer = createJoystick()
    beginJoystick(steer, 1, 100, 100)
    moveJoystick(steer, 100, 100 - JOYSTICK_RADIUS)
    const throttle = createJoystick()
    const input = joysticksToInput(steer, throttle, 'dual-stick')
    // The steer stick's vertical axis is NOT throttle in dual mode.
    expect(input.throttle).toBe(false)
    expect(input.brake).toBe(false)
  })
})

describe('joysticksToInput single-stick', () => {
  it('zero on an inactive stick', () => {
    const steer = createJoystick()
    const throttle = createJoystick()
    expect(joysticksToInput(steer, throttle, 'single-stick')).toEqual(
      emptyInput(),
    )
  })

  it('horizontal axis steers; vertical axis throttles / brakes from the same stick', () => {
    const steer = createJoystick()
    beginJoystick(steer, 1, 200, 200)
    moveJoystick(steer, 200 - JOYSTICK_RADIUS, 200 - JOYSTICK_RADIUS)
    const throttle = createJoystick()
    const input = joysticksToInput(steer, throttle, 'single-stick')
    expect(input.steerLeft).toBe(true)
    expect(input.throttle).toBe(true)
    expect(input.steerRight).toBe(false)
    expect(input.brake).toBe(false)
  })

  it('down-and-right steers right and brakes', () => {
    const steer = createJoystick()
    beginJoystick(steer, 1, 200, 200)
    moveJoystick(steer, 200 + JOYSTICK_RADIUS, 200 + JOYSTICK_RADIUS)
    const throttle = createJoystick()
    const input = joysticksToInput(steer, throttle, 'single-stick')
    expect(input.steerRight).toBe(true)
    expect(input.brake).toBe(true)
  })

  it('ignores the throttle stick entirely (single-stick contract)', () => {
    const steer = createJoystick()
    const throttle = createJoystick()
    beginJoystick(throttle, 2, 400, 400)
    moveJoystick(throttle, 400, 400 - JOYSTICK_RADIUS)
    const input = joysticksToInput(steer, throttle, 'single-stick')
    expect(input).toEqual(emptyInput())
  })
})

describe('mergeDriveInputs', () => {
  function input(over: Partial<DriveInput> = {}): DriveInput {
    return { ...emptyInput(), ...over }
  }

  it('returns empty when both inputs are empty', () => {
    expect(mergeDriveInputs(emptyInput(), emptyInput())).toEqual(emptyInput())
  })

  it('OR per action; left side wins on the truthy axis', () => {
    const a = input({ throttle: true })
    const b = input({ steerLeft: true })
    expect(mergeDriveInputs(a, b)).toEqual({
      throttle: true,
      brake: false,
      steerLeft: true,
      steerRight: false,
    })
  })

  it('a true on either side propagates', () => {
    expect(
      mergeDriveInputs(input({ brake: true }), input({ brake: false })).brake,
    ).toBe(true)
    expect(
      mergeDriveInputs(input({ brake: false }), input({ brake: true })).brake,
    ).toBe(true)
  })

  it('does not mutate either input', () => {
    const a = input({ throttle: true })
    const b = input({ steerRight: true })
    const aBefore = { ...a }
    const bBefore = { ...b }
    mergeDriveInputs(a, b)
    expect(a).toEqual(aBefore)
    expect(b).toEqual(bBefore)
  })

  it('returns a fresh object each call', () => {
    const a = emptyInput()
    const b = emptyInput()
    const out1 = mergeDriveInputs(a, b)
    const out2 = mergeDriveInputs(a, b)
    expect(out1).not.toBe(out2)
    expect(out1).not.toBe(a)
    expect(out1).not.toBe(b)
  })
})

describe('joystickForTouch', () => {
  it('single-stick: first touch anchors the steer joystick', () => {
    expect(
      joystickForTouch({
        mode: 'single-stick',
        clientX: 100,
        viewportWidth: 800,
        steerActive: false,
        throttleActive: false,
      }),
    ).toBe('steer')
  })

  it('single-stick: second touch is rejected while steer is active', () => {
    expect(
      joystickForTouch({
        mode: 'single-stick',
        clientX: 100,
        viewportWidth: 800,
        steerActive: true,
        throttleActive: false,
      }),
    ).toBe('none')
  })

  it('single-stick: throttle active is irrelevant (the throttle stick is unused)', () => {
    expect(
      joystickForTouch({
        mode: 'single-stick',
        clientX: 100,
        viewportWidth: 800,
        steerActive: false,
        throttleActive: true,
      }),
    ).toBe('steer')
  })

  it('dual-stick: left half anchors steer', () => {
    expect(
      joystickForTouch({
        mode: 'dual-stick',
        clientX: 200,
        viewportWidth: 800,
        steerActive: false,
        throttleActive: false,
      }),
    ).toBe('steer')
  })

  it('dual-stick: right half anchors throttle', () => {
    expect(
      joystickForTouch({
        mode: 'dual-stick',
        clientX: 600,
        viewportWidth: 800,
        steerActive: false,
        throttleActive: false,
      }),
    ).toBe('throttle')
  })

  it('dual-stick: exact center counts as right half (throttle anchor)', () => {
    expect(
      joystickForTouch({
        mode: 'dual-stick',
        clientX: 400,
        viewportWidth: 800,
        steerActive: false,
        throttleActive: false,
      }),
    ).toBe('throttle')
  })

  it('dual-stick: a second touch on the same half is rejected', () => {
    expect(
      joystickForTouch({
        mode: 'dual-stick',
        clientX: 200,
        viewportWidth: 800,
        steerActive: true,
        throttleActive: false,
      }),
    ).toBe('none')
    expect(
      joystickForTouch({
        mode: 'dual-stick',
        clientX: 600,
        viewportWidth: 800,
        steerActive: false,
        throttleActive: true,
      }),
    ).toBe('none')
  })

  it('dual-stick: a touch on the opposite half is allowed regardless of the same-half active flag', () => {
    expect(
      joystickForTouch({
        mode: 'dual-stick',
        clientX: 200,
        viewportWidth: 800,
        steerActive: false,
        throttleActive: true,
      }),
    ).toBe('steer')
    expect(
      joystickForTouch({
        mode: 'dual-stick',
        clientX: 600,
        viewportWidth: 800,
        steerActive: true,
        throttleActive: false,
      }),
    ).toBe('throttle')
  })
})
