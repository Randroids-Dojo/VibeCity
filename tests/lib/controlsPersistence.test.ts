import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONTROLS_STORAGE_KEY,
  CONTROLS_STORAGE_VERSION,
  ControlsEnvelopeSchema,
  ControlsPayloadSchema,
  CameraTuningSchema,
  KeyBindingsSchema,
  TouchModeSchema,
  DEFAULT_CAMERA_TUNING,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_TOUCH_MODE,
  clearControls,
  defaultControls,
  loadControls,
  resolveControls,
  saveControls,
} from '@/lib/controlsPersistence'

/**
 * REQ-043: Controls settings persist to localStorage under
 * `vibecity.controls`. Separate namespace from VibeRacer so a player
 * tuning both projects keeps independent settings per project.
 *
 * The persistence layer is the substrate the future settings pane
 * slices (REQ-040 camera tuning, REQ-041 keyboard rebinding, REQ-042
 * touch mode) all consume. This test surface locks the shape, the
 * default values, the round-trip semantics, and the malformed-payload
 * fallbacks.
 */

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

class ThrowingStorage implements Storage {
  length = 0
  clear(): void {
    throw new Error('storage disabled')
  }
  getItem(): string | null {
    throw new Error('storage disabled')
  }
  key(): string | null {
    throw new Error('storage disabled')
  }
  removeItem(): void {
    throw new Error('storage disabled')
  }
  setItem(): void {
    throw new Error('storage disabled')
  }
}

function withWindowStorage(storage: Storage | undefined): {
  restore: () => void
} {
  const previousWindow = (
    globalThis as unknown as { window?: { localStorage?: Storage } }
  ).window
  if (storage === undefined) {
    delete (globalThis as unknown as { window?: unknown }).window
  } else {
    ;(globalThis as unknown as { window: { localStorage: Storage } }).window = {
      localStorage: storage,
    }
  }
  return {
    restore: () => {
      if (previousWindow === undefined) {
        delete (globalThis as unknown as { window?: unknown }).window
      } else {
        ;(globalThis as unknown as { window: unknown }).window = previousWindow
      }
    },
  }
}

describe('CONTROLS_STORAGE_KEY (REQ-043)', () => {
  it('uses the vibecity namespace', () => {
    expect(CONTROLS_STORAGE_KEY).toBe('vibecity.controls')
  })

  it('does not collide with the builderId cookie name', () => {
    expect(CONTROLS_STORAGE_KEY).not.toBe('vibecity.builderId')
  })
})

describe('CONTROLS_STORAGE_VERSION', () => {
  it('is a positive integer', () => {
    expect(CONTROLS_STORAGE_VERSION).toBeGreaterThan(0)
    expect(Number.isInteger(CONTROLS_STORAGE_VERSION)).toBe(true)
  })

  it('starts at v1 for the initial release', () => {
    expect(CONTROLS_STORAGE_VERSION).toBe(1)
  })
})

describe('CameraTuningSchema (REQ-040)', () => {
  it('accepts the default tuning', () => {
    expect(CameraTuningSchema.safeParse(DEFAULT_CAMERA_TUNING).success).toBe(
      true,
    )
  })

  it('rejects negative height', () => {
    expect(
      CameraTuningSchema.safeParse({
        ...DEFAULT_CAMERA_TUNING,
        height: -1,
      }).success,
    ).toBe(false)
  })

  it('rejects non-finite values', () => {
    expect(
      CameraTuningSchema.safeParse({
        ...DEFAULT_CAMERA_TUNING,
        height: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false)
    expect(
      CameraTuningSchema.safeParse({
        ...DEFAULT_CAMERA_TUNING,
        distance: Number.NaN,
      }).success,
    ).toBe(false)
  })

  it('rejects fov above 179 degrees', () => {
    expect(
      CameraTuningSchema.safeParse({
        ...DEFAULT_CAMERA_TUNING,
        fov: 200,
      }).success,
    ).toBe(false)
  })

  it('rejects followSpeed outside [0, 1]', () => {
    expect(
      CameraTuningSchema.safeParse({
        ...DEFAULT_CAMERA_TUNING,
        followSpeed: 1.5,
      }).success,
    ).toBe(false)
    expect(
      CameraTuningSchema.safeParse({
        ...DEFAULT_CAMERA_TUNING,
        followSpeed: -0.5,
      }).success,
    ).toBe(false)
  })
})

describe('DEFAULT_CAMERA_TUNING (REQ-040)', () => {
  it('mirrors the chase-far constants from cameraRig.ts', () => {
    expect(DEFAULT_CAMERA_TUNING.height).toBe(6.4)
    expect(DEFAULT_CAMERA_TUNING.distance).toBe(14)
    expect(DEFAULT_CAMERA_TUNING.lookAhead).toBe(6)
    expect(DEFAULT_CAMERA_TUNING.followSpeed).toBe(0.12)
    expect(DEFAULT_CAMERA_TUNING.fov).toBe(60)
  })
})

describe('KeyBindingsSchema (REQ-041)', () => {
  it('accepts the default WASD plus arrow bindings', () => {
    expect(KeyBindingsSchema.safeParse(DEFAULT_KEY_BINDINGS).success).toBe(true)
  })

  it('rejects an unknown action name', () => {
    expect(
      KeyBindingsSchema.safeParse({ KeyJ: 'jump' }).success,
    ).toBe(false)
  })

  it('rejects an empty key code', () => {
    expect(
      KeyBindingsSchema.safeParse({ '': 'throttle' }).success,
    ).toBe(false)
  })

  it('accepts a custom code mapped to a known action', () => {
    expect(
      KeyBindingsSchema.safeParse({ KeyJ: 'throttle' }).success,
    ).toBe(true)
  })

  it('accepts an empty record (no bindings)', () => {
    expect(KeyBindingsSchema.safeParse({}).success).toBe(true)
  })
})

describe('DEFAULT_KEY_BINDINGS (REQ-041)', () => {
  it('covers WASD and arrow keys', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyW).toBe('throttle')
    expect(DEFAULT_KEY_BINDINGS.ArrowUp).toBe('throttle')
    expect(DEFAULT_KEY_BINDINGS.KeyS).toBe('brake')
    expect(DEFAULT_KEY_BINDINGS.ArrowDown).toBe('brake')
    expect(DEFAULT_KEY_BINDINGS.KeyA).toBe('steerLeft')
    expect(DEFAULT_KEY_BINDINGS.ArrowLeft).toBe('steerLeft')
    expect(DEFAULT_KEY_BINDINGS.KeyD).toBe('steerRight')
    expect(DEFAULT_KEY_BINDINGS.ArrowRight).toBe('steerRight')
  })

  it('binds at most one action per code', () => {
    const codes = Object.keys(DEFAULT_KEY_BINDINGS)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('TouchModeSchema (REQ-042)', () => {
  it('accepts dual-stick and single-stick', () => {
    expect(TouchModeSchema.safeParse('dual-stick').success).toBe(true)
    expect(TouchModeSchema.safeParse('single-stick').success).toBe(true)
  })

  it('rejects unknown modes', () => {
    expect(TouchModeSchema.safeParse('gyro').success).toBe(false)
    expect(TouchModeSchema.safeParse('').success).toBe(false)
  })
})

describe('DEFAULT_TOUCH_MODE (REQ-042)', () => {
  it('is dual-stick to match VibeRacer', () => {
    expect(DEFAULT_TOUCH_MODE).toBe('dual-stick')
  })
})

describe('ControlsPayloadSchema (REQ-043)', () => {
  it('accepts an empty payload (no fields set)', () => {
    expect(ControlsPayloadSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a partial payload with only camera', () => {
    expect(
      ControlsPayloadSchema.safeParse({ camera: DEFAULT_CAMERA_TUNING })
        .success,
    ).toBe(true)
  })

  it('rejects a payload with an unknown action in keyBindings', () => {
    expect(
      ControlsPayloadSchema.safeParse({
        keyBindings: { KeyJ: 'jump' },
      }).success,
    ).toBe(false)
  })
})

describe('ControlsEnvelopeSchema (REQ-043)', () => {
  it('accepts a v1 envelope with empty controls', () => {
    expect(
      ControlsEnvelopeSchema.safeParse({
        version: 1,
        controls: {},
      }).success,
    ).toBe(true)
  })

  it('rejects a missing version field', () => {
    expect(
      ControlsEnvelopeSchema.safeParse({ controls: {} }).success,
    ).toBe(false)
  })

  it('rejects a wrong version field', () => {
    expect(
      ControlsEnvelopeSchema.safeParse({ version: 2, controls: {} }).success,
    ).toBe(false)
  })

  it('rejects a missing controls field', () => {
    expect(
      ControlsEnvelopeSchema.safeParse({ version: 1 }).success,
    ).toBe(false)
  })
})

describe('resolveControls', () => {
  it('returns defaults on null payload', () => {
    expect(resolveControls(null)).toEqual({
      camera: DEFAULT_CAMERA_TUNING,
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: DEFAULT_TOUCH_MODE,
    })
  })

  it('returns defaults on undefined payload', () => {
    expect(resolveControls(undefined)).toEqual({
      camera: DEFAULT_CAMERA_TUNING,
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: DEFAULT_TOUCH_MODE,
    })
  })

  it('returns defaults on empty payload', () => {
    expect(resolveControls({})).toEqual({
      camera: DEFAULT_CAMERA_TUNING,
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: DEFAULT_TOUCH_MODE,
    })
  })

  it('overlays a partial camera over defaults for the other fields', () => {
    const camera = { ...DEFAULT_CAMERA_TUNING, height: 10 }
    const out = resolveControls({ camera })
    expect(out.camera).toEqual(camera)
    expect(out.keyBindings).toEqual(DEFAULT_KEY_BINDINGS)
    expect(out.touchMode).toEqual(DEFAULT_TOUCH_MODE)
  })

  it('overlays a partial touchMode over defaults for the other fields', () => {
    const out = resolveControls({ touchMode: 'single-stick' })
    expect(out.camera).toEqual(DEFAULT_CAMERA_TUNING)
    expect(out.keyBindings).toEqual(DEFAULT_KEY_BINDINGS)
    expect(out.touchMode).toBe('single-stick')
  })

  it('overlays custom keyBindings over defaults for the other fields', () => {
    const out = resolveControls({ keyBindings: { KeyJ: 'throttle' } })
    expect(out.keyBindings).toEqual({ KeyJ: 'throttle' })
    expect(out.camera).toEqual(DEFAULT_CAMERA_TUNING)
    expect(out.touchMode).toEqual(DEFAULT_TOUCH_MODE)
  })
})

describe('defaultControls', () => {
  it('returns the same shape as resolveControls(null)', () => {
    expect(defaultControls()).toEqual(resolveControls(null))
  })
})

describe('loadControls (REQ-043)', () => {
  let teardown: () => void = () => {}

  afterEach(() => {
    teardown()
  })

  it('returns defaults on the server (no window)', () => {
    teardown = withWindowStorage(undefined).restore
    expect(loadControls()).toEqual(defaultControls())
  })

  it('returns defaults when localStorage is empty', () => {
    teardown = withWindowStorage(new MemoryStorage()).restore
    expect(loadControls()).toEqual(defaultControls())
  })

  it('returns defaults when localStorage throws', () => {
    teardown = withWindowStorage(new ThrowingStorage()).restore
    expect(loadControls()).toEqual(defaultControls())
  })

  it('returns defaults on malformed JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(CONTROLS_STORAGE_KEY, 'not json')
    teardown = withWindowStorage(storage).restore
    expect(loadControls()).toEqual(defaultControls())
  })

  it('returns defaults on a non-object JSON value', () => {
    const storage = new MemoryStorage()
    storage.setItem(CONTROLS_STORAGE_KEY, '"just a string"')
    teardown = withWindowStorage(storage).restore
    expect(loadControls()).toEqual(defaultControls())
  })

  it('returns defaults on a wrong-version envelope', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        version: 99,
        controls: { touchMode: 'single-stick' },
      }),
    )
    teardown = withWindowStorage(storage).restore
    expect(loadControls()).toEqual(defaultControls())
  })

  it('returns defaults on a malformed envelope (missing controls)', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({ version: 1 }),
    )
    teardown = withWindowStorage(storage).restore
    expect(loadControls()).toEqual(defaultControls())
  })

  it('returns the merged controls when the envelope is valid', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        controls: { touchMode: 'single-stick' },
      }),
    )
    teardown = withWindowStorage(storage).restore
    const out = loadControls()
    expect(out.touchMode).toBe('single-stick')
    expect(out.camera).toEqual(DEFAULT_CAMERA_TUNING)
    expect(out.keyBindings).toEqual(DEFAULT_KEY_BINDINGS)
  })

  it('returns defaults on a payload that fails inner schema validation', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        controls: { touchMode: 'gyro' },
      }),
    )
    teardown = withWindowStorage(storage).restore
    expect(loadControls()).toEqual(defaultControls())
  })
})

describe('saveControls (REQ-043)', () => {
  let teardown: () => void = () => {}

  afterEach(() => {
    teardown()
  })

  it('returns false on the server (no window)', () => {
    teardown = withWindowStorage(undefined).restore
    expect(saveControls({ touchMode: 'single-stick' })).toBe(false)
  })

  it('returns false on a malformed patch', () => {
    teardown = withWindowStorage(new MemoryStorage()).restore
    const malformed = { touchMode: 'gyro' } as unknown as Parameters<
      typeof saveControls
    >[0]
    expect(saveControls(malformed)).toBe(false)
  })

  it('writes the v1 envelope to localStorage on a valid patch', () => {
    const storage = new MemoryStorage()
    teardown = withWindowStorage(storage).restore
    expect(saveControls({ touchMode: 'single-stick' })).toBe(true)
    const raw = storage.getItem(CONTROLS_STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed.version).toBe(1)
    expect(parsed.controls.touchMode).toBe('single-stick')
  })

  it('round-trips through loadControls', () => {
    const storage = new MemoryStorage()
    teardown = withWindowStorage(storage).restore
    saveControls({ touchMode: 'single-stick' })
    const out = loadControls()
    expect(out.touchMode).toBe('single-stick')
  })

  it('merges a partial patch with previously-saved fields', () => {
    const storage = new MemoryStorage()
    teardown = withWindowStorage(storage).restore
    saveControls({ touchMode: 'single-stick' })
    saveControls({ camera: { ...DEFAULT_CAMERA_TUNING, height: 10 } })
    const out = loadControls()
    expect(out.touchMode).toBe('single-stick')
    expect(out.camera.height).toBe(10)
  })

  it('overwrites a previously-saved field on conflict', () => {
    const storage = new MemoryStorage()
    teardown = withWindowStorage(storage).restore
    saveControls({ touchMode: 'single-stick' })
    saveControls({ touchMode: 'dual-stick' })
    const out = loadControls()
    expect(out.touchMode).toBe('dual-stick')
  })

  it('returns false when localStorage throws on write', () => {
    teardown = withWindowStorage(new ThrowingStorage()).restore
    expect(saveControls({ touchMode: 'single-stick' })).toBe(false)
  })

  it('treats an empty patch as a no-op write that still records v1', () => {
    const storage = new MemoryStorage()
    teardown = withWindowStorage(storage).restore
    expect(saveControls({})).toBe(true)
    const raw = storage.getItem(CONTROLS_STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed.version).toBe(1)
    expect(parsed.controls).toEqual({})
  })
})

describe('clearControls (REQ-043)', () => {
  let teardown: () => void = () => {}

  afterEach(() => {
    teardown()
  })

  it('returns false on the server (no window)', () => {
    teardown = withWindowStorage(undefined).restore
    expect(clearControls()).toBe(false)
  })

  it('removes the storage key', () => {
    const storage = new MemoryStorage()
    teardown = withWindowStorage(storage).restore
    saveControls({ touchMode: 'single-stick' })
    expect(storage.getItem(CONTROLS_STORAGE_KEY)).not.toBeNull()
    expect(clearControls()).toBe(true)
    expect(storage.getItem(CONTROLS_STORAGE_KEY)).toBeNull()
  })

  it('subsequent loadControls returns defaults', () => {
    const storage = new MemoryStorage()
    teardown = withWindowStorage(storage).restore
    saveControls({ touchMode: 'single-stick' })
    clearControls()
    expect(loadControls()).toEqual(defaultControls())
  })

  it('returns true even when localStorage throws on remove (kit swallows the error)', () => {
    // The kit's `removeStorage` silently catches quota / disabled /
    // private-mode errors so the boolean return cannot meaningfully
    // distinguish thrown vs. happy paths in the client branch. The
    // SSR branch (no window) still returns false, covered above.
    teardown = withWindowStorage(new ThrowingStorage()).restore
    expect(clearControls()).toBe(true)
  })
})

describe('REQ-043 namespace separation', () => {
  it('does not write to a VibeRacer-style key', () => {
    const storage = new MemoryStorage()
    const teardown = withWindowStorage(storage).restore
    try {
      saveControls({ touchMode: 'single-stick' })
      expect(storage.getItem('viberacer.controls')).toBeNull()
      expect(storage.getItem('controls')).toBeNull()
    } finally {
      teardown()
    }
  })
})

describe('controlsPersistence is hermetic against test interleaving', () => {
  /**
   * Belt-and-braces: any leaked global storage from a prior test run
   * must not contaminate the next run's defaults read. The harness
   * resets the window after every test; this case asserts that read
   * helper sees a fresh storage when the harness installs one.
   */
  let restoreFn: () => void = () => {}

  beforeEach(() => {
    const storage = new MemoryStorage()
    restoreFn = withWindowStorage(storage).restore
  })

  afterEach(() => {
    restoreFn()
    vi.restoreAllMocks()
  })

  it('starts fresh between tests', () => {
    expect(loadControls()).toEqual(defaultControls())
  })
})
