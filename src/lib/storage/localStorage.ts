/**
 * SSR-safe `localStorage` wrappers. Game-agnostic.
 *
 * Each helper checks `typeof window` before touching `localStorage`
 * because Next.js modules can be imported on the server. The helpers
 * also wrap the storage call in a try/catch so a quota error, a
 * disabled-storage browser, or a private-mode tab does not throw out
 * of the caller. Returns `null` (read) or `false` (write / remove)
 * on the server or on any storage exception.
 */

/**
 * Read a string value from `localStorage`. Returns the stored string
 * when present, `null` when the key is unset, the runtime is the
 * server, or the read throws.
 */
export function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Write a string value to `localStorage`. Returns `true` on success,
 * `false` on the server or when the write throws (quota, disabled
 * storage, etc.).
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Remove a key from `localStorage`. Returns `true` on success,
 * `false` on the server or when the call throws.
 */
export function safeLocalStorageRemove(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}
