import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEY_BINDINGS,
  emptyInput,
  inputFromPressedKeys,
  type DriveAction,
  type DriveInput,
} from '@/lib/input/vehicleControls'

describe('emptyInput', () => {
  it('returns all-false input snapshot', () => {
    const input: DriveInput = emptyInput()
    expect(input.throttle).toBe(false)
    expect(input.brake).toBe(false)
    expect(input.steerLeft).toBe(false)
    expect(input.steerRight).toBe(false)
  })

  it('returns a fresh object on each call', () => {
    expect(emptyInput()).not.toBe(emptyInput())
  })
})

describe('DEFAULT_KEY_BINDINGS', () => {
  it('maps WASD to the four actions', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyW).toBe('throttle')
    expect(DEFAULT_KEY_BINDINGS.KeyS).toBe('brake')
    expect(DEFAULT_KEY_BINDINGS.KeyA).toBe('steerLeft')
    expect(DEFAULT_KEY_BINDINGS.KeyD).toBe('steerRight')
  })

  it('maps arrow keys to the four actions', () => {
    expect(DEFAULT_KEY_BINDINGS.ArrowUp).toBe('throttle')
    expect(DEFAULT_KEY_BINDINGS.ArrowDown).toBe('brake')
    expect(DEFAULT_KEY_BINDINGS.ArrowLeft).toBe('steerLeft')
    expect(DEFAULT_KEY_BINDINGS.ArrowRight).toBe('steerRight')
  })
})

describe('inputFromPressedKeys', () => {
  it('flips the action flags for pressed keys via the default bindings', () => {
    const input = inputFromPressedKeys(new Set(['KeyW', 'KeyA']))
    expect(input.throttle).toBe(true)
    expect(input.steerLeft).toBe(true)
    expect(input.brake).toBe(false)
    expect(input.steerRight).toBe(false)
  })

  it('returns all-false snapshot for an empty key set', () => {
    expect(inputFromPressedKeys(new Set())).toEqual(emptyInput())
  })

  it('ignores unknown keys', () => {
    const input = inputFromPressedKeys(new Set(['KeyZ', 'Space']))
    expect(input).toEqual(emptyInput())
  })

  it('honors a custom binding table override', () => {
    const custom: Readonly<Record<string, DriveAction>> = {
      Space: 'throttle',
      ShiftLeft: 'brake',
    }
    const input = inputFromPressedKeys(new Set(['Space', 'KeyW']), custom)
    expect(input.throttle).toBe(true) // Space is bound; KeyW is unknown in custom table
    expect(input.brake).toBe(false)
  })

  it('treats arrow + WASD for the same action as a single OR (idempotent)', () => {
    const both = inputFromPressedKeys(new Set(['KeyW', 'ArrowUp']))
    const wasd = inputFromPressedKeys(new Set(['KeyW']))
    expect(both.throttle).toBe(true)
    expect(wasd.throttle).toBe(true)
    expect(both).toEqual(wasd)
  })
})
