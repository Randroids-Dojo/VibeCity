'use client'

import { useLinkStatus } from 'next/link'
import {
  SCENE_TRANSITION_BACKGROUND,
  SCENE_TRANSITION_FADE_MS,
  SCENE_TRANSITION_FOREGROUND,
  SCENE_TRANSITION_Z_INDEX,
  sceneTransitionLabel,
  sceneTransitionTestid,
  type SceneTransitionTarget,
} from './sceneTransition'

/**
 * REQ-055 build / drive transition curtain.
 *
 * A short, accessible overlay that paints over the viewport while
 * Next.js completes a navigation between the editor (`/<slug>/edit`)
 * and the drive view (`/<slug>`). The component must be rendered as a
 * descendant of a Next.js `<Link>` because it reads the navigation's
 * in-flight pending flag via `useLinkStatus()`. When that flag flips
 * true the curtain mounts a fixed full-viewport overlay over the
 * current scene; when it flips back to false the curtain unmounts.
 *
 * The curtain is purely visual: it does not block the click that
 * triggers the navigation (Next's `<Link>` already handles that and
 * the curtain only mounts after the click has been accepted), and it
 * does not call `router.push` or `router.prefetch` itself. The Link
 * already prefetches the destination so the typical curtain lifetime
 * is below 200 ms; this is the perceived-instant window pillar 1
 * promises.
 *
 * The curtain owns the surface during navigation: it sits above the
 * drive scene's pause menu, the editor's palette, and the HUD overlays
 * so a slow navigation cannot leak partial-rendered chrome from the
 * outgoing route. The `pointer-events: auto` keeps an accidental
 * second click from re-firing the navigation while the curtain is
 * up; the click target is non-interactive so a stray click on the
 * curtain itself is a no-op.
 */
export function SceneTransitionCurtain({
  target,
}: {
  target: SceneTransitionTarget
}) {
  const { pending } = useLinkStatus()
  if (!pending) return null

  const testid = sceneTransitionTestid(target)
  const label = sceneTransitionLabel(target)

  return (
    <div
      data-testid={testid}
      data-target={target}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: SCENE_TRANSITION_Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: SCENE_TRANSITION_BACKGROUND,
        color: SCENE_TRANSITION_FOREGROUND,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        letterSpacing: 1,
        textTransform: 'uppercase',
        opacity: 1,
        transition: `opacity ${SCENE_TRANSITION_FADE_MS}ms ease-out`,
        pointerEvents: 'auto',
      }}
    >
      {label}
    </div>
  )
}
