/**
 * Generic count-label formatter. Game-agnostic.
 *
 * Renders a non-negative integer count plus a singular / plural noun
 * (and an optional trailing suffix) into a short header cue. Future
 * games can wire their own labels without re-implementing the
 * pluralization or the defensive fallbacks. VibeCity's
 * `formatCityCount` (REQ-011, REQ-050) is the v1 consumer.
 *
 * Defensive contract (matches `relativeTime`):
 *   - Non-finite input (NaN, Infinity, non-numeric) -> empty string.
 *   - Negative input -> empty string.
 *   - Fractional input is floored.
 *
 * The empty-string fallback lets a UI render no cue at all rather
 * than printing `NaN <noun>` on a tuning bug.
 */

export interface CountLabelOptions {
  /** Noun shown when the count equals exactly 1. */
  singular: string
  /** Noun shown when the count equals 0 or 2+. English treats 0 as plural. */
  plural: string
  /**
   * Optional trailing suffix (e.g. `'so far'`). When provided, the
   * formatter emits `${count} ${noun} ${suffix}`; when omitted, just
   * `${count} ${noun}`.
   */
  suffix?: string
}

/**
 * Format a non-negative integer count using the supplied noun pair
 * and optional suffix. See the module docstring for the band table
 * and defensive contract.
 */
export function formatCountLabel(
  count: number,
  options: CountLabelOptions,
): string {
  if (!Number.isFinite(count) || count < 0) return ''
  const floored = Math.floor(count)
  const noun = floored === 1 ? options.singular : options.plural
  return options.suffix
    ? `${floored} ${noun} ${options.suffix}`
    : `${floored} ${noun}`
}
