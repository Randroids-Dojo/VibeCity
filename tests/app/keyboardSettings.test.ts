import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEY_BINDINGS,
  DRIVE_ACTION_OPTIONS,
  REBINDABLE_KEY_CODES,
  RESERVED_KEY_CODES,
  bindingsByAction,
  clampKeyBindings,
  clearBinding,
  isRebindableKeyCode,
  keyBindingSignature,
  keyCodeDisplayLabel,
  setBinding,
} from '@/app/[slug]/keyboardSettings'
import {
  DriveActionSchema,
  KeyBindingsSchema,
  type KeyBindings,
} from '@/lib/controlsPersistence'

/**
 * REQ-041: keyboard rebinding panel. The persistence layer (REQ-043)
 * ships `KeyBindingsSchema` (a record from `KeyboardEvent.code` to the
 * closed `DriveActionSchema` enum) and `DEFAULT_KEY_BINDINGS`; this
 * module narrows that surface to UI-friendly per-action option metadata
 * plus defensive helpers the panel uses to keep the bindings state
 * valid across rebinds and resets.
 */

describe('DRIVE_ACTION_OPTIONS', () => {
  it('exposes an option for every action in the persistence enum', () => {
    const enumValues = DriveActionSchema.options
    const optionActions = DRIVE_ACTION_OPTIONS.map((option) => option.action)
    for (const value of enumValues) {
      expect(optionActions).toContain(value)
    }
    expect(optionActions.length).toBe(enumValues.length)
  })

  it('every option carries a non-empty label and description', () => {
    for (const option of DRIVE_ACTION_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.description.length).toBeGreaterThan(0)
    }
  })

  it('option actions are unique', () => {
    const actions = DRIVE_ACTION_OPTIONS.map((option) => option.action)
    const set = new Set(actions)
    expect(set.size).toBe(actions.length)
  })

  it('throttle and brake render before steerLeft and steerRight so go-then-turn ordering reads naturally', () => {
    const order = DRIVE_ACTION_OPTIONS.map((option) => option.action)
    expect(order.indexOf('throttle')).toBeLessThan(order.indexOf('steerLeft'))
    expect(order.indexOf('brake')).toBeLessThan(order.indexOf('steerLeft'))
    expect(order.indexOf('throttle')).toBeLessThan(order.indexOf('steerRight'))
  })

  it('label and description vocabulary stays free of race terminology so REQ-037 does not regress', () => {
    const RACE_TERMS = ['lap', 'race', 'checkpoint', 'finish', 'leaderboard']
    for (const option of DRIVE_ACTION_OPTIONS) {
      const lowerLabel = option.label.toLowerCase()
      const lowerDescription = option.description.toLowerCase()
      for (const term of RACE_TERMS) {
        expect(lowerLabel.includes(term)).toBe(false)
        expect(lowerDescription.includes(term)).toBe(false)
      }
    }
  })
})

describe('clampKeyBindings', () => {
  it('returns a fresh DEFAULT_KEY_BINDINGS for a non-object input', () => {
    expect(clampKeyBindings(undefined)).toEqual(DEFAULT_KEY_BINDINGS)
    expect(clampKeyBindings(null)).toEqual(DEFAULT_KEY_BINDINGS)
    expect(clampKeyBindings(123)).toEqual(DEFAULT_KEY_BINDINGS)
    expect(clampKeyBindings('keys')).toEqual(DEFAULT_KEY_BINDINGS)
  })

  it('returns the defaults for a malformed map (unknown action)', () => {
    expect(clampKeyBindings({ KeyW: 'fly' })).toEqual(DEFAULT_KEY_BINDINGS)
  })

  it('returns the input verbatim for a valid map', () => {
    const input: KeyBindings = {
      KeyJ: 'throttle',
      KeyL: 'brake',
    }
    const out = clampKeyBindings(input)
    expect(out).toEqual(input)
  })

  it('passes the defaults through unchanged', () => {
    expect(clampKeyBindings(DEFAULT_KEY_BINDINGS)).toEqual(DEFAULT_KEY_BINDINGS)
  })

  it('returns a fresh object so the caller does not have to clone', () => {
    const input: KeyBindings = { KeyW: 'throttle' }
    const out = clampKeyBindings(input)
    expect(out).not.toBe(input)
  })

  it('accepts an empty map (every action unbound)', () => {
    expect(clampKeyBindings({})).toEqual({})
  })

  it('is idempotent on a valid input', () => {
    const first = clampKeyBindings(DEFAULT_KEY_BINDINGS)
    const second = clampKeyBindings(first)
    expect(second).toEqual(first)
  })
})

describe('bindingsByAction', () => {
  it('groups every default binding into its action bucket', () => {
    const grouped = bindingsByAction(DEFAULT_KEY_BINDINGS)
    expect(grouped.throttle).toContain('KeyW')
    expect(grouped.throttle).toContain('ArrowUp')
    expect(grouped.brake).toContain('KeyS')
    expect(grouped.brake).toContain('ArrowDown')
    expect(grouped.steerLeft).toContain('KeyA')
    expect(grouped.steerLeft).toContain('ArrowLeft')
    expect(grouped.steerRight).toContain('KeyD')
    expect(grouped.steerRight).toContain('ArrowRight')
  })

  it('sorts codes alphabetically so two equivalent maps render in the same order', () => {
    const grouped = bindingsByAction({
      KeyW: 'throttle',
      ArrowUp: 'throttle',
    })
    expect(grouped.throttle).toEqual(['ArrowUp', 'KeyW'])
  })

  it('empty map returns empty arrays for every action', () => {
    const grouped = bindingsByAction({})
    expect(grouped.throttle).toEqual([])
    expect(grouped.brake).toEqual([])
    expect(grouped.steerLeft).toEqual([])
    expect(grouped.steerRight).toEqual([])
  })

  it('returns a fresh object each call', () => {
    const a = bindingsByAction(DEFAULT_KEY_BINDINGS)
    const b = bindingsByAction(DEFAULT_KEY_BINDINGS)
    expect(a).not.toBe(b)
  })
})

describe('REBINDABLE_KEY_CODES', () => {
  it('contains the default-binding codes (so reset-then-rebind is a closed cycle)', () => {
    for (const code of Object.keys(DEFAULT_KEY_BINDINGS)) {
      expect(REBINDABLE_KEY_CODES).toContain(code)
    }
  })

  it('reserved key codes never pass `isRebindableKeyCode`', () => {
    for (const reserved of RESERVED_KEY_CODES) {
      expect(isRebindableKeyCode(reserved)).toBe(false)
    }
  })

  it('every rebindable code is unique', () => {
    const set = new Set(REBINDABLE_KEY_CODES)
    expect(set.size).toBe(REBINDABLE_KEY_CODES.length)
  })
})

describe('isRebindableKeyCode', () => {
  it('accepts the WASD letters', () => {
    expect(isRebindableKeyCode('KeyW')).toBe(true)
    expect(isRebindableKeyCode('KeyA')).toBe(true)
    expect(isRebindableKeyCode('KeyS')).toBe(true)
    expect(isRebindableKeyCode('KeyD')).toBe(true)
  })

  it('accepts the four arrow keys', () => {
    expect(isRebindableKeyCode('ArrowUp')).toBe(true)
    expect(isRebindableKeyCode('ArrowDown')).toBe(true)
    expect(isRebindableKeyCode('ArrowLeft')).toBe(true)
    expect(isRebindableKeyCode('ArrowRight')).toBe(true)
  })

  it('rejects the reserved keys (Esc, M, R)', () => {
    expect(isRebindableKeyCode('Escape')).toBe(false)
    expect(isRebindableKeyCode('KeyM')).toBe(false)
    expect(isRebindableKeyCode('KeyR')).toBe(false)
  })

  it('rejects a code outside the allowlist (a media key, a digit)', () => {
    expect(isRebindableKeyCode('Digit1')).toBe(false)
    expect(isRebindableKeyCode('MediaPlayPause')).toBe(false)
    expect(isRebindableKeyCode('')).toBe(false)
  })
})

describe('keyCodeDisplayLabel', () => {
  it('strips the Key prefix from letter codes', () => {
    expect(keyCodeDisplayLabel('KeyW')).toBe('W')
    expect(keyCodeDisplayLabel('KeyA')).toBe('A')
    expect(keyCodeDisplayLabel('KeyZ')).toBe('Z')
  })

  it('strips the Digit prefix from number codes', () => {
    expect(keyCodeDisplayLabel('Digit0')).toBe('0')
    expect(keyCodeDisplayLabel('Digit9')).toBe('9')
  })

  it('renders the four arrow codes as their compass labels', () => {
    expect(keyCodeDisplayLabel('ArrowUp')).toBe('Up')
    expect(keyCodeDisplayLabel('ArrowDown')).toBe('Down')
    expect(keyCodeDisplayLabel('ArrowLeft')).toBe('Left')
    expect(keyCodeDisplayLabel('ArrowRight')).toBe('Right')
  })

  it('renders Space verbatim', () => {
    expect(keyCodeDisplayLabel('Space')).toBe('Space')
  })

  it('falls back to the raw code for an unknown shape', () => {
    expect(keyCodeDisplayLabel('F1')).toBe('F1')
    expect(keyCodeDisplayLabel('NumpadEnter')).toBe('NumpadEnter')
  })

  it('returns empty string for empty input', () => {
    expect(keyCodeDisplayLabel('')).toBe('')
  })
})

describe('setBinding', () => {
  it('adds a fresh binding for a previously-unbound code', () => {
    const out = setBinding({}, 'KeyJ', 'throttle')
    expect(out.KeyJ).toBe('throttle')
  })

  it('replaces an existing binding for the same code', () => {
    const start: KeyBindings = { KeyW: 'throttle' }
    const out = setBinding(start, 'KeyW', 'brake')
    expect(out.KeyW).toBe('brake')
  })

  it('does not mutate the input map', () => {
    const start: KeyBindings = { KeyW: 'throttle' }
    setBinding(start, 'KeyA', 'steerLeft')
    expect(start.KeyA).toBeUndefined()
  })

  it('returns a no-op fresh map for a non-rebindable code', () => {
    const start: KeyBindings = { KeyW: 'throttle' }
    const out = setBinding(start, 'Escape', 'brake')
    expect(out).toEqual(start)
    expect(out).not.toBe(start)
  })

  it('returns a no-op fresh map for an unknown action', () => {
    const start: KeyBindings = { KeyW: 'throttle' }
    // The action parameter is typed `DriveActionName`; this cast
    // mirrors what a stale persisted payload could feed in.
    const out = setBinding(start, 'KeyJ', 'fly' as never)
    expect(out).toEqual(start)
  })

  it('preserves other bindings when adding a new one', () => {
    const start: KeyBindings = { KeyW: 'throttle', KeyS: 'brake' }
    const out = setBinding(start, 'KeyA', 'steerLeft')
    expect(out.KeyW).toBe('throttle')
    expect(out.KeyS).toBe('brake')
    expect(out.KeyA).toBe('steerLeft')
  })

  it('the resulting map passes KeyBindingsSchema', () => {
    const out = setBinding(DEFAULT_KEY_BINDINGS, 'KeyJ', 'throttle')
    expect(KeyBindingsSchema.safeParse(out).success).toBe(true)
  })
})

describe('clearBinding', () => {
  it('removes the binding for the given code', () => {
    const out = clearBinding(DEFAULT_KEY_BINDINGS, 'KeyW')
    expect(out.KeyW).toBeUndefined()
  })

  it('does not mutate the input map', () => {
    const start: KeyBindings = { KeyW: 'throttle' }
    clearBinding(start, 'KeyW')
    expect(start.KeyW).toBe('throttle')
  })

  it('is a no-op for a code that is not bound', () => {
    const start: KeyBindings = { KeyW: 'throttle' }
    const out = clearBinding(start, 'KeyJ')
    expect(out).toEqual(start)
    expect(out).not.toBe(start)
  })

  it('preserves other bindings', () => {
    const out = clearBinding(DEFAULT_KEY_BINDINGS, 'KeyW')
    expect(out.KeyA).toBe('steerLeft')
    expect(out.KeyS).toBe('brake')
    expect(out.KeyD).toBe('steerRight')
  })
})

describe('keyBindingSignature', () => {
  it('produces a sorted, comma-separated `code:action` string', () => {
    expect(keyBindingSignature({ KeyW: 'throttle', KeyA: 'steerLeft' })).toBe(
      'KeyA:steerLeft,KeyW:throttle',
    )
  })

  it('is order-independent (two equivalent maps produce the same signature)', () => {
    const a = keyBindingSignature({ KeyW: 'throttle', KeyA: 'steerLeft' })
    const b = keyBindingSignature({ KeyA: 'steerLeft', KeyW: 'throttle' })
    expect(a).toBe(b)
  })

  it('returns empty string for an empty map', () => {
    expect(keyBindingSignature({})).toBe('')
  })

  it('the default signature matches the v1 default bindings', () => {
    expect(keyBindingSignature(DEFAULT_KEY_BINDINGS)).toBe(
      'ArrowDown:brake,ArrowLeft:steerLeft,ArrowRight:steerRight,ArrowUp:throttle,KeyA:steerLeft,KeyD:steerRight,KeyS:brake,KeyW:throttle',
    )
  })
})

describe('DEFAULT_KEY_BINDINGS re-export', () => {
  it('matches the persistence-layer default verbatim', () => {
    // Re-export pattern keeps the panel from importing from two
    // modules; the value must stay in sync with controlsPersistence.
    expect(KeyBindingsSchema.safeParse(DEFAULT_KEY_BINDINGS).success).toBe(true)
    expect(DEFAULT_KEY_BINDINGS.KeyW).toBe('throttle')
    expect(DEFAULT_KEY_BINDINGS.ArrowUp).toBe('throttle')
    expect(DEFAULT_KEY_BINDINGS.KeyS).toBe('brake')
    expect(DEFAULT_KEY_BINDINGS.ArrowDown).toBe('brake')
    expect(DEFAULT_KEY_BINDINGS.KeyA).toBe('steerLeft')
    expect(DEFAULT_KEY_BINDINGS.ArrowLeft).toBe('steerLeft')
    expect(DEFAULT_KEY_BINDINGS.KeyD).toBe('steerRight')
    expect(DEFAULT_KEY_BINDINGS.ArrowRight).toBe('steerRight')
  })
})
