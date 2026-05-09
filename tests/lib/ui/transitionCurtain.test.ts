import { describe, expect, it } from 'vitest'
import {
  TRANSITION_CURTAIN_BACKGROUND,
  TRANSITION_CURTAIN_FADE_MS,
  TRANSITION_CURTAIN_FOREGROUND,
  TRANSITION_CURTAIN_TESTID_PREFIX_DEFAULT,
  TRANSITION_CURTAIN_Z_INDEX,
  transitionCurtainTestid,
} from '@/lib/ui/transitionCurtain'

/**
 * Generic curtain primitives. The city-specific binding
 * (`SCENE_TRANSITION_*` + label map + `sceneTransitionTestid`) is
 * covered in `tests/app/sceneTransition.test.ts`.
 */

describe('TRANSITION_CURTAIN_BACKGROUND', () => {
  it('is a non-empty CSS color string', () => {
    expect(typeof TRANSITION_CURTAIN_BACKGROUND).toBe('string')
    expect(TRANSITION_CURTAIN_BACKGROUND.length).toBeGreaterThan(0)
  })
})

describe('TRANSITION_CURTAIN_FOREGROUND', () => {
  it('is a non-empty CSS color string', () => {
    expect(typeof TRANSITION_CURTAIN_FOREGROUND).toBe('string')
    expect(TRANSITION_CURTAIN_FOREGROUND.length).toBeGreaterThan(0)
  })

  it('differs from the background so the label has contrast', () => {
    expect(TRANSITION_CURTAIN_FOREGROUND).not.toBe(TRANSITION_CURTAIN_BACKGROUND)
  })
})

describe('TRANSITION_CURTAIN_FADE_MS', () => {
  it('is below the 200 ms perceived-instant threshold so the curtain reads as a flicker', () => {
    expect(TRANSITION_CURTAIN_FADE_MS).toBeGreaterThan(0)
    expect(TRANSITION_CURTAIN_FADE_MS).toBeLessThan(200)
  })
})

describe('TRANSITION_CURTAIN_Z_INDEX', () => {
  it('is high enough to sit above typical HUD overlays (>10)', () => {
    expect(TRANSITION_CURTAIN_Z_INDEX).toBeGreaterThan(10)
  })
})

describe('transitionCurtainTestid', () => {
  it('uses the default prefix when the second argument is omitted', () => {
    expect(transitionCurtainTestid('foo')).toBe(
      `${TRANSITION_CURTAIN_TESTID_PREFIX_DEFAULT}-foo`,
    )
  })

  it('honors a project-specific prefix override', () => {
    expect(transitionCurtainTestid('drive', 'my-curtain')).toBe(
      'my-curtain-drive',
    )
  })
})
