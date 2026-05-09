/**
 * Route-transition curtain primitives. Game-agnostic.
 *
 * Pillar 1 of VibeCity's vision (REQ-055) wants the build / drive
 * toggle to feel like one click, not a save and reload round trip.
 * Both routes already use Next.js `<Link prefetch>` so the data-side
 * cost is paid before the click. What was missing is the perceived
 * feel: a click that navigates to the next route surface paints
 * nothing during the in-flight tick (a flash of the prior page paints,
 * then the next page replaces it). This module ships the visual
 * constants for the curtain that paints over the click target while
 * Next.js completes the navigation.
 *
 * The curtain itself is a client component (e.g. VibeCity's
 * `SceneTransitionCurtain`) that uses `useLinkStatus()` from
 * `next/link` to read the in-flight pending flag of the nearest
 * enclosing `<Link>`. The flag flips true the moment Next.js starts
 * the navigation and back to false when the destination route's first
 * render lands. The intervening interval is the curtain's lifetime;
 * we keep it short and accessible.
 *
 * Future games on Next.js with the same prefetch + curtain pattern
 * can reuse these constants directly. The fade duration is
 * intentionally below the 200 ms perceived-instant threshold so a
 * successful prefetched navigation reads as a flicker rather than a
 * transition.
 */

/** Solid background color the curtain paints. Dark navy reads against most layouts. */
export const TRANSITION_CURTAIN_BACKGROUND = '#101820'

/** Foreground color for the optional in-curtain label. Off-white for contrast. */
export const TRANSITION_CURTAIN_FOREGROUND = '#f7f4ee'

/** Fade duration in milliseconds. Below the 200 ms perceived-instant threshold. */
export const TRANSITION_CURTAIN_FADE_MS = 180

/** z-index for the curtain layer. Above typical HUD / overlay z-indexes. */
export const TRANSITION_CURTAIN_Z_INDEX = 100

/**
 * Default test-id prefix for the curtain element. Consumers can pass
 * a project-specific prefix if they want different testids per app.
 */
export const TRANSITION_CURTAIN_TESTID_PREFIX_DEFAULT = 'transition-curtain'

/**
 * Build a stable test id for a curtain element. The default prefix
 * suits any app; override it via the second argument when a consumer
 * needs a project-namespaced id.
 */
export function transitionCurtainTestid(
  target: string,
  prefix: string = TRANSITION_CURTAIN_TESTID_PREFIX_DEFAULT,
): string {
  return `${prefix}-${target}`
}
