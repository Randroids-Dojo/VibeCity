import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from '@/lib/storage/localStorage'

const KEY = 'safe-local-storage.spec'

class FakeStorage implements Storage {
  private readonly store = new Map<string, string>()
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

describe('safeLocalStorageGet', () => {
  let storage: FakeStorage
  let scope: { restore: () => void }

  beforeEach(() => {
    storage = new FakeStorage()
    scope = withWindowStorage(storage)
  })

  afterEach(() => {
    scope.restore()
  })

  it('returns the stored string when the key exists', () => {
    storage.setItem(KEY, 'hello')
    expect(safeLocalStorageGet(KEY)).toBe('hello')
  })

  it('returns null when the key is unset', () => {
    expect(safeLocalStorageGet(KEY)).toBeNull()
  })

  it('returns null when the underlying getItem throws', () => {
    scope.restore()
    scope = withWindowStorage(new ThrowingStorage())
    expect(safeLocalStorageGet(KEY)).toBeNull()
  })
})

describe('safeLocalStorageSet', () => {
  let storage: FakeStorage
  let scope: { restore: () => void }

  beforeEach(() => {
    storage = new FakeStorage()
    scope = withWindowStorage(storage)
  })

  afterEach(() => {
    scope.restore()
  })

  it('writes the value and returns true', () => {
    expect(safeLocalStorageSet(KEY, 'world')).toBe(true)
    expect(storage.getItem(KEY)).toBe('world')
  })

  it('returns false when the underlying setItem throws (quota / disabled)', () => {
    scope.restore()
    scope = withWindowStorage(new ThrowingStorage())
    expect(safeLocalStorageSet(KEY, 'world')).toBe(false)
  })
})

describe('safeLocalStorageRemove', () => {
  let storage: FakeStorage
  let scope: { restore: () => void }

  beforeEach(() => {
    storage = new FakeStorage()
    scope = withWindowStorage(storage)
  })

  afterEach(() => {
    scope.restore()
  })

  it('removes the key and returns true', () => {
    storage.setItem(KEY, 'world')
    expect(safeLocalStorageRemove(KEY)).toBe(true)
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('returns true even when the key did not exist', () => {
    expect(safeLocalStorageRemove(KEY)).toBe(true)
  })

  it('returns false when the underlying removeItem throws', () => {
    scope.restore()
    scope = withWindowStorage(new ThrowingStorage())
    expect(safeLocalStorageRemove(KEY)).toBe(false)
  })
})

describe('SSR safety (no window)', () => {
  let scope: { restore: () => void }

  beforeEach(() => {
    scope = withWindowStorage(undefined)
  })

  afterEach(() => {
    scope.restore()
  })

  it('returns null on the server', () => {
    expect(safeLocalStorageGet(KEY)).toBeNull()
  })

  it('returns false from set on the server', () => {
    expect(safeLocalStorageSet(KEY, 'x')).toBe(false)
  })

  it('returns false from remove on the server', () => {
    expect(safeLocalStorageRemove(KEY)).toBe(false)
  })
})
