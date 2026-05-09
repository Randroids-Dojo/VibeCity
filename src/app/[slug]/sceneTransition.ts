import {
  TRANSITION_CURTAIN_BACKGROUND,
  TRANSITION_CURTAIN_FADE_MS,
  TRANSITION_CURTAIN_FOREGROUND,
  TRANSITION_CURTAIN_Z_INDEX,
  transitionCurtainTestid,
} from '@/lib/ui/transitionCurtain'

/**
 * REQ-055 build / drive transition curtain. VibeCity-specific
 * binding. Pillar 1 of the vision ("Build it. Drive it. Build more.")
 * wants the editor / drive toggle to feel like one click, not a save
 * and reload round trip.
 *
 * The visual constants and the testid helper are generic and live in
 * `@/lib/ui/transitionCurtain` (any future game on Next.js with the
 * same prefetch-plus-curtain pattern can reuse them). This module
 * pins the city-specific bits: the two-target union ('drive' | 'edit'),
 * the per-target accessible labels, and the testid prefix that the
 * Playwright specs anchor on.
 */

/**
 * Two surfaces the curtain can transition toward. The build / drive
 * toggle is the only navigation v1 promises; future surfaces (settings
 * pane modal, version picker) can layer on top without changing this
 * union because the curtain is scoped to the build / drive loop.
 */
export type SceneTransitionTarget = 'drive' | 'edit'

/** Re-exported under the v1 name so existing call sites do not change. */
export const SCENE_TRANSITION_BACKGROUND = TRANSITION_CURTAIN_BACKGROUND

/** Re-exported under the v1 name so existing call sites do not change. */
export const SCENE_TRANSITION_FOREGROUND = TRANSITION_CURTAIN_FOREGROUND

/** Re-exported under the v1 name so existing call sites do not change. */
export const SCENE_TRANSITION_FADE_MS = TRANSITION_CURTAIN_FADE_MS

/** Re-exported under the v1 name so existing call sites do not change. */
export const SCENE_TRANSITION_Z_INDEX = TRANSITION_CURTAIN_Z_INDEX

/**
 * Test id prefix the curtain mounts with so a test or a future audit
 * can locate the overlay deterministically. City-specific because the
 * v1 Playwright specs already anchor on the literal
 * `scene-transition-curtain` prefix; future games can pick their own.
 * The full id is `${prefix}-${target}`.
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
 * Returns the testid the curtain mounts with for a given target.
 * Delegates to the generic `transitionCurtainTestid` with the city
 * prefix.
 */
export function sceneTransitionTestid(target: SceneTransitionTarget): string {
  return transitionCurtainTestid(target, SCENE_TRANSITION_TESTID_PREFIX)
}

/**
 * Returns the accessible label for a given target. Pure helper so the
 * unit tests can assert the label contract without having to import
 * the React component.
 */
export function sceneTransitionLabel(target: SceneTransitionTarget): string {
  return SCENE_TRANSITION_LABEL[target]
}
