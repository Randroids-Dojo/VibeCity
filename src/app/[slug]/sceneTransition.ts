/**
 * REQ-055 build / drive transition curtain constants and helpers.
 *
 * Pillar 1 of the vision ("Build it. Drive it. Build more.") wants the
 * editor / drive toggle to feel like one click, not a save and reload
 * round trip. Both routes already use Next.js `<Link prefetch>` so the
 * data-side cost is paid before the click. What was missing is the
 * perceived feel: a click that navigates to the next route surface
 * paints nothing during the in-flight tick (a flash of the prior page
 * paints, then the next page replaces it). This module defines the
 * pure constants for the curtain that paints over the click target
 * while Next.js completes the navigation, plus a tiny label helper.
 *
 * The curtain itself is a client component (`SceneTransitionCurtain`)
 * that uses `useLinkStatus()` from `next/link` to read the in-flight
 * pending flag of the nearest enclosing `<Link>`. The flag flips true
 * the moment Next.js starts the navigation and back to false when the
 * destination route's first render lands. The intervening interval is
 * the curtain's lifetime; we keep it short and accessible.
 *
 * The constants here are the v1 defaults. A future settings pane that
 * exposes accessibility colors or a "reduced motion" toggle can swap
 * the table without touching the helper or the curtain. The fade
 * duration is intentionally below the 200 ms perceived-instant
 * threshold so a successful prefetched navigation reads as a flicker
 * rather than a transition.
 */

/**
 * Two surfaces the curtain can transition toward. The build / drive
 * toggle is the only navigation v1 promises; future surfaces (settings
 * pane modal, version picker) can layer on top without changing this
 * union because the curtain is scoped to the build / drive loop.
 */
export type SceneTransitionTarget = 'drive' | 'edit'

/**
 * CSS background color of the curtain. Picked to match the drive
 * scene's clear color so a curtain over the editor reads as the next
 * surface arriving rather than a generic loader. The drive scene uses
 * a near-black backdrop; the editor uses the same color for the
 * inverse direction so the visual handoff is symmetric.
 */
export const SCENE_TRANSITION_BACKGROUND = '#101820'

/**
 * CSS foreground color of the curtain text. Mirrors the cream the
 * editor and drive HUDs already use so the label reads against the
 * dark backdrop without introducing a new palette entry.
 */
export const SCENE_TRANSITION_FOREGROUND = '#f7f4ee'

/**
 * Fade duration in milliseconds for the curtain's opacity ramp on
 * mount and unmount. Below the 200 ms perceived-instant threshold so a
 * prefetched navigation reads as a flicker, not a transition. A larger
 * value would feel sluggish; a smaller value would not register.
 */
export const SCENE_TRANSITION_FADE_MS = 180

/**
 * Z-index of the curtain overlay. Sits above the drive scene's pause
 * menu (which uses an inline `zIndex: 10` style on its overlay) and
 * the editor's palette / toolbar, so the curtain owns the surface
 * during navigation. The constant is exposed so a test can assert the
 * stacking contract without scraping the inline style string.
 */
export const SCENE_TRANSITION_Z_INDEX = 100

/**
 * Test id prefix the curtain mounts with so a test or a future audit
 * can locate the overlay deterministically. The full id is
 * `${prefix}-${target}` so a curtain transitioning to the drive view
 * resolves as `scene-transition-curtain-drive`. The constant lives
 * here so the constants module is the single source of truth and the
 * curtain component, the unit tests, and the playwright assertions
 * all read from it.
 */
export const SCENE_TRANSITION_TESTID_PREFIX = 'scene-transition-curtain'

/**
 * Per-target accessible labels. The curtain renders the matching
 * label inside an `aria-live="polite"` region so a screen reader
 * announces the transition without interrupting other speech. The
 * copy is intentionally minimal: a noun phrase the user can map to
 * the click they just made, no spinner verb.
 */
export const SCENE_TRANSITION_LABEL: Record<SceneTransitionTarget, string> = {
  drive: 'Loading drive view',
  edit: 'Loading editor',
}

/**
 * Returns the testid the curtain mounts with for a given target. Pure
 * helper so the unit tests can assert the testid contract without
 * having to import the React component.
 */
export function sceneTransitionTestid(target: SceneTransitionTarget): string {
  return `${SCENE_TRANSITION_TESTID_PREFIX}-${target}`
}

/**
 * Returns the accessible label for a given target. Pure helper so the
 * unit tests can assert the label contract without having to import
 * the React component.
 */
export function sceneTransitionLabel(target: SceneTransitionTarget): string {
  return SCENE_TRANSITION_LABEL[target]
}
