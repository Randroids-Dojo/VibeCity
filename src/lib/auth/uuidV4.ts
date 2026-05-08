/**
 * UUID v4 helpers. Game-agnostic.
 *
 * Anonymous identity flows in VibeCity (REQ-009) and VibeRacer use a
 * v4 UUID minted on first visit and stored in a long-lived cookie.
 * This module owns the shape check and the mint so any future game
 * that wants the same anonymous-id pattern can reuse the same regex
 * and the same `crypto.randomUUID()` call.
 */

/**
 * Returns true iff `value` matches the canonical UUID v4 string shape:
 *   xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where `x` is a lowercase hex digit and `y` is one of `8 9 a b`.
 *
 * The check is purely structural and does not call into `crypto`; a
 * stale or spoofed cookie that happens to match the shape still has
 * to pass downstream ownership checks (e.g. matching the value the
 * persistence layer recorded for the resource).
 */
export function isValidUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  )
}

/**
 * Mints a fresh v4 UUID via `crypto.randomUUID()`.
 */
export function mintUuidV4(): string {
  return crypto.randomUUID()
}
