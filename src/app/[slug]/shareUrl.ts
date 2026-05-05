import type { Slug } from '@/lib/schemas'

/**
 * Drive-mode share-URL helpers (REQ-006, REQ-053 share polish).
 *
 * Pure module: no React, no DOM, no `navigator.clipboard`. The drive
 * scene client owns the live clipboard call and the per-click status
 * timer; the math here keeps the URL composition and the button
 * label / status mapping fully unit-testable.
 *
 * Pillar 2 ("Your city, your URL") promises that the slug page is the
 * share link. The drive view is the canonical destination for a
 * shared link: `/<slug>` renders the city in drive mode, while
 * `/<slug>/edit` opens the editor (the build link). The button this
 * module backs lives on the drive HUD and copies the canonical drive
 * URL to the player's clipboard so a visitor can hand the link to a
 * friend without leaving the drive view.
 *
 * The URL composition takes an explicit `origin` rather than reading
 * `window.location.origin` so the helper stays pure: the drive scene
 * client passes the live origin in the click handler. A blank or
 * non-string origin collapses to the bare `/<slug>` path so a server-
 * rendered preview (or a misconfigured deployment) still emits a
 * usable relative link rather than a corrupted absolute URL.
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
 * the absolute URL `${origin}/<slug>` when an origin is provided and
 * the bare `/<slug>` path otherwise so a server-rendered preview (or
 * a misconfigured deployment that fails to read `window.location`)
 * still emits a usable relative link.
 *
 * The trailing slash on the origin is stripped so callers that pass
 * `https://example.com/` and callers that pass `https://example.com`
 * both produce `https://example.com/<slug>`. A blank string origin
 * (after trimming) collapses to the relative path so a misconfigured
 * deployment does not emit `/<slug>` (an absolute path with no host).
 */
export function buildShareUrl(slug: Slug, origin?: string | null): string {
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
