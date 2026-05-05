/**
 * Pure helper that formats a total city count as a short header cue
 * (REQ-011, REQ-050). The home page (REQ-050) reads `cityIndexCount()`
 * from the `city:index` sorted set (REQ-011) once per request and uses
 * this formatter to surface the count alongside the recently-updated
 * list so a visitor reads at a glance how active the substrate is.
 *
 * Output bands match a common conversational shape:
 *
 *   - 0 cities -> "0 cities so far"
 *   - 1 city   -> "1 city so far"      (singular noun)
 *   - 2+ cities -> "N cities so far"   (plural noun)
 *
 * Defensive fallbacks:
 *   - Non-finite input (NaN, Infinity, non-numeric) collapses to the
 *     empty string. The home page treats the empty string as "no
 *     readout" and renders no cue rather than painting `NaN cities so
 *     far` on a tuning bug. Mirrors `relativeTime`'s defensive contract.
 *   - Negative input collapses to the empty string. A negative count is
 *     not a real state; silently dropping it is safer than rendering a
 *     confusing `-3 cities so far` cue.
 *   - A fractional input is floored. The reader (`cityIndexCount`)
 *     already floors the `ZCARD` return, but the formatter is defensive
 *     so a future caller that passes a fractional count cannot leak
 *     `1.5 cities so far` either.
 *
 * Pure module: no React, no DOM, no KV reads. The caller passes the
 * count so unit tests can pin a deterministic input and the home page
 * server component reads `cityIndexCount()` once per request.
 */

/**
 * Suffix appended after the noun. Exported so tests can pin the literal
 * without parsing the formatter output and a future copy update lands
 * in one place.
 */
export const CITY_COUNT_SUFFIX = 'so far'

/**
 * Singular noun used when the count is exactly 1. Exported as a constant
 * so tests can pin the noun choice without parsing the formatter output.
 */
export const CITY_COUNT_NOUN_SINGULAR = 'city'

/**
 * Plural noun used when the count is 0 or 2+. English convention treats
 * zero as plural ("0 cities", not "0 city") so the band table only
 * splits at the singular boundary.
 */
export const CITY_COUNT_NOUN_PLURAL = 'cities'

/**
 * Format a non-negative integer count as the home page header cue. See
 * the module docstring for the band table and defensive contract.
 */
export function formatCityCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return ''
  const floored = Math.floor(count)
  const noun = floored === 1 ? CITY_COUNT_NOUN_SINGULAR : CITY_COUNT_NOUN_PLURAL
  return `${floored} ${noun} ${CITY_COUNT_SUFFIX}`
}
