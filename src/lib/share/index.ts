import type { Slug } from '@/lib/schemas'

/**
 * Slug-based share-URL helpers + clipboard-copy FSM. Game-agnostic
 * within the slug-URL family.
 *
 * Pure module: no React, no DOM, no `navigator.clipboard`. The
 * caller owns the live clipboard call and the per-click status
 * timer; this module owns URL composition and the button label /
 * status mapping so they stay fully unit-testable.
 *
 * VibeCity's "Your city, your URL" pillar (REQ-006, REQ-053) is the
 * v1 consumer: `/<slug>` renders the sim view, `/<slug>/drive`
 * renders the drive scene. Future games on the same slug-URL pattern
 * (one resource per slug, two views) can import these helpers as is.
 *
 * The URL composition takes an explicit `origin` rather than reading
 * `window.location.origin` so the helper stays pure: the consumer
 * passes the live origin in the click handler. A blank or non-string
 * origin collapses to the bare relative path so a server-rendered
 * preview (or a misconfigured deployment) still emits a usable link
 * rather than a corrupted absolute URL.
 */

/**
 * The clipboard-copy lifecycle for the share-URL button. `idle` is the
 * resting state; `copied` paints the success label after a successful
 * `navigator.clipboard.writeText` call; `error` paints the failure
 * label when the browser refuses (no clipboard permission, no secure
 * context, or `navigator.clipboard` undefined). The drive scene client
 * resets back to `idle` after `SHARE_COPY_RESET_DELAY_MS` so the
 * button does not stick on the success / error label.
 */
export type CopyShareStatus = 'idle' | 'copied' | 'error'

/**
 * The static label rendered on the button at rest. Single short verb
 * phrase so the button reads at glance against the drive HUD's other
 * one- or two-word controls (the `Edit` link, the `Sound on` /
 * `Sound off` toggle).
 */
export const SHARE_COPY_LABEL_IDLE = 'Copy share URL'

/**
 * The label rendered after a successful copy. Past-tense verb so the
 * player reads the click as a completed action (vs the future-tense
 * idle label). Distinct from the idle label so a click registers as
 * visible feedback even if the player did not glance at the success
 * toast.
 */
export const SHARE_COPY_LABEL_COPIED = 'Copied!'

/**
 * The label rendered after a failed copy. Distinct from the success
 * label so a player whose browser refused the clipboard call sees the
 * failure rather than thinking the click silently succeeded.
 */
export const SHARE_COPY_LABEL_ERROR = 'Copy failed'

/**
 * The number of milliseconds the success / error label sticks before
 * the button resets to the idle label. Long enough that a player can
 * read the feedback (the eye takes a few hundred ms to refocus on a
 * button after a click) and short enough that a re-click after a
 * failure feels like a fresh attempt rather than a stuck state.
 */
export const SHARE_COPY_RESET_DELAY_MS = 1600

/**
 * Compose the canonical drive-view share URL for a given slug. Returns
 * the absolute URL `${origin}/<slug>/drive` when an origin is provided
 * and the bare `/<slug>/drive` path otherwise so a server-rendered
 * preview (or a misconfigured deployment that fails to read
 * `window.location`) still emits a usable relative link.
 *
 * Slice B of REQ-110 (sim-as-primary view) moved the drive scene from
 * `/<slug>` to `/<slug>/drive` so the bare slug URL can host the
 * SimCity-style sim view as the default. The trailing slash on the
 * origin is stripped so callers that pass `https://example.com/` and
 * callers that pass `https://example.com` both produce
 * `https://example.com/<slug>/drive`.
 */
export function buildShareUrl(slug: Slug, origin?: string | null): string {
  if (typeof origin !== 'string') {
    return `/${slug}/drive`
  }
  const trimmed = origin.trim()
  if (trimmed.length === 0) {
    return `/${slug}/drive`
  }
  const stripped = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
  return `${stripped}/${slug}/drive`
}

/**
 * Compose the canonical editor (build) share URL for a given slug. Mirrors
 * `buildShareUrl` exactly except the trailing path is `/<slug>/edit` so a
 * link recipient lands directly in the editor instead of the drive view.
 *
 * The drive URL (`/<slug>`) is the share link a player hands to a friend
 * who wants to drive the city. The editor URL (`/<slug>/edit`) is the
 * build link a co-author hands to another builder who wants to keep
 * editing the same city. The two links share the same lifecycle vocabulary
 * (idle / copied / error labels, reset delay, label strings) because the
 * button behavior is identical; only the URL path differs.
 *
 * Origin handling matches `buildShareUrl`: a trailing slash on the origin
 * is stripped, blank / null / undefined / whitespace-only origins collapse
 * to the bare `/<slug>/edit` path so a server-rendered preview or a
 * misconfigured deployment that fails to read `window.location` still
 * emits a usable relative link.
 */
export function buildEditUrl(slug: Slug, origin?: string | null): string {
  if (typeof origin !== 'string') {
    return `/${slug}`
  }
  const trimmed = origin.trim()
  if (trimmed.length === 0) {
    return `/${slug}`
  }
  const stripped = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
  return `${stripped}/${slug}`
}

/**
 * Resolve the visible button label from the live copy status. Pure:
 * deterministic on the input status with no allocation.
 */
export function shareCopyLabel(status: CopyShareStatus): string {
  switch (status) {
    case 'copied':
      return SHARE_COPY_LABEL_COPIED
    case 'error':
      return SHARE_COPY_LABEL_ERROR
    default:
      return SHARE_COPY_LABEL_IDLE
  }
}

/**
 * Resolve the accessible name for the button from the live copy status.
 * The accessible name reads as a sentence so a screen-reader user
 * hears the URL composition and the action; the visible label is the
 * short verb phrase from `shareCopyLabel`. The slug is interpolated so
 * a screen-reader user hears the destination URL the click will copy.
 */
export function shareCopyAriaLabel(
  slug: Slug,
  status: CopyShareStatus,
): string {
  switch (status) {
    case 'copied':
      return `Copied share URL for ${slug}`
    case 'error':
      return `Failed to copy share URL for ${slug}`
    default:
      return `Copy share URL for ${slug}`
  }
}

/**
 * The static label rendered on the editor copy button at rest. Mirrors
 * `SHARE_COPY_LABEL_IDLE` ("Copy share URL") with the build verb so the
 * editor toolbar reads as the build half of the build / drive loop. The
 * copied / error labels reuse the shared `SHARE_COPY_LABEL_COPIED` /
 * `SHARE_COPY_LABEL_ERROR` constants because the lifecycle feedback
 * vocabulary is identical between the two surfaces.
 */
export const EDIT_COPY_LABEL_IDLE = 'Copy build URL'

/**
 * Resolve the visible button label for the editor copy button. Pure:
 * deterministic on the input status with no allocation. Mirrors
 * `shareCopyLabel` for the copied / error states because the success and
 * failure feedback is identical between the drive and edit copy buttons;
 * only the idle label differs (drive surface says "Copy share URL", edit
 * surface says "Copy build URL").
 */
export function editCopyLabel(status: CopyShareStatus): string {
  switch (status) {
    case 'copied':
      return SHARE_COPY_LABEL_COPIED
    case 'error':
      return SHARE_COPY_LABEL_ERROR
    default:
      return EDIT_COPY_LABEL_IDLE
  }
}

/**
 * Resolve the accessible name for the editor copy button. The accessible
 * name reads as a sentence so a screen-reader user hears the URL
 * composition and the action. The slug is interpolated so a screen-reader
 * user hears the destination URL the click will copy. Mirrors
 * `shareCopyAriaLabel` with the "build" noun so the screen-reader text
 * names the editor URL the click will copy.
 */
export function editCopyAriaLabel(
  slug: Slug,
  status: CopyShareStatus,
): string {
  switch (status) {
    case 'copied':
      return `Copied build URL for ${slug}`
    case 'error':
      return `Failed to copy build URL for ${slug}`
    default:
      return `Copy build URL for ${slug}`
  }
}
