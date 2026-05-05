/**
 * Pure helper that formats a timestamp as a short "N ago" relative cue
 * (REQ-011, REQ-050). The home page (REQ-050) uses this to surface the
 * `Date.now()` score the PUT route writes onto the `city:index` sorted
 * set so a visitor reads how fresh each recently-updated city is at a
 * glance.
 *
 * The output bands match a common conversational shape:
 *
 *   - under one minute -> "just now"
 *   - under one hour   -> "Nm ago" (1m, 5m, 59m)
 *   - under one day    -> "Nh ago" (1h, 23h)
 *   - under one week   -> "Nd ago" (1d, 6d)
 *   - under one month  -> "Nw ago" (1w, 4w; one month is 30 days here)
 *   - under one year   -> "Nmo ago" (1mo, 11mo)
 *   - one year or more -> "Ny ago" (1y, 5y)
 *
 * Future timestamps (input ahead of `nowMs`) collapse to "just now"
 * rather than emitting a negative readout. This is a defensive default:
 * `city:index` scores are written by the server with `Date.now()` and the
 * home page reads them on the same server, so a future score should not
 * occur in production. If a clock-skewed deployment ever did emit one,
 * the home page renders a clean cue rather than a confusing `-3m ago`.
 *
 * Non-finite or non-positive `updatedAtMs` collapses to the empty string
 * so a tuning bug that leaks `NaN` or `0` does not paint a stray cue on
 * the home page; the caller can treat the empty string as "no readout".
 *
 * Pure module: no React, no DOM, no `Date.now()`. The caller provides
 * `nowMs` so unit tests can pin a deterministic clock and the home page
 * server component reads `Date.now()` once per request.
 */

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

/**
 * Threshold below which the readout collapses to "just now" rather than
 * "0m ago". Mirrors a common conversational shape: a save that landed
 * five seconds ago should not read as a stale "0m ago" stub.
 */
export const RELATIVE_TIME_JUST_NOW_THRESHOLD_MS = MINUTE_MS

/**
 * The literal "just now" cue exposed as a constant so tests can pin the
 * exact text without parsing the formatter output.
 */
export const RELATIVE_TIME_JUST_NOW_LABEL = 'just now'

/**
 * Format the delta between `updatedAtMs` and `nowMs` as a short relative
 * cue. See the module docstring for the full band table.
 */
export function formatRelativeTime(
  updatedAtMs: number,
  nowMs: number,
): string {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return ''
  if (!Number.isFinite(nowMs) || nowMs <= 0) return ''
  const delta = nowMs - updatedAtMs
  if (delta < RELATIVE_TIME_JUST_NOW_THRESHOLD_MS) {
    return RELATIVE_TIME_JUST_NOW_LABEL
  }
  if (delta < HOUR_MS) {
    const minutes = Math.floor(delta / MINUTE_MS)
    return `${minutes}m ago`
  }
  if (delta < DAY_MS) {
    const hours = Math.floor(delta / HOUR_MS)
    return `${hours}h ago`
  }
  if (delta < WEEK_MS) {
    const days = Math.floor(delta / DAY_MS)
    return `${days}d ago`
  }
  if (delta < MONTH_MS) {
    const weeks = Math.floor(delta / WEEK_MS)
    return `${weeks}w ago`
  }
  if (delta < YEAR_MS) {
    const months = Math.floor(delta / MONTH_MS)
    return `${months}mo ago`
  }
  const years = Math.floor(delta / YEAR_MS)
  return `${years}y ago`
}
