import { formatCountLabel } from './format/countLabel'

/**
 * VibeCity-specific binding of the generic `formatCountLabel`
 * formatter (REQ-011, REQ-050). The home page reads `cityIndexCount()`
 * from the `city:index` sorted set (REQ-011) once per request and
 * passes the result through this helper to render a short header cue
 * alongside the recently-updated list.
 *
 * Output bands (delegated to `formatCountLabel`):
 *   - 0 cities -> "0 cities so far"
 *   - 1 city   -> "1 city so far"
 *   - 2+       -> "N cities so far"
 *
 * Defensive fallbacks (also delegated): non-finite or negative input
 * collapses to the empty string so a tuning bug paints no cue rather
 * than `NaN cities so far`.
 */

export const CITY_COUNT_SUFFIX = 'so far'
export const CITY_COUNT_NOUN_SINGULAR = 'city'
export const CITY_COUNT_NOUN_PLURAL = 'cities'

export function formatCityCount(count: number): string {
  return formatCountLabel(count, {
    singular: CITY_COUNT_NOUN_SINGULAR,
    plural: CITY_COUNT_NOUN_PLURAL,
    suffix: CITY_COUNT_SUFFIX,
  })
}
