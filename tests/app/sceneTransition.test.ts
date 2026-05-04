import { describe, expect, it } from 'vitest'
import {
  SCENE_TRANSITION_BACKGROUND,
  SCENE_TRANSITION_FADE_MS,
  SCENE_TRANSITION_FOREGROUND,
  SCENE_TRANSITION_LABEL,
  SCENE_TRANSITION_TESTID_PREFIX,
  SCENE_TRANSITION_Z_INDEX,
  sceneTransitionLabel,
  sceneTransitionTestid,
  type SceneTransitionTarget,
} from '@/app/[slug]/sceneTransition'

/**
 * REQ-055 build / drive transition curtain. The pure constants module
 * is the single source of truth for the curtain's visual contract; the
 * React component (SceneTransitionCurtain) reads from it. Unit tests
 * here cover the constants invariants and the testid / label helpers.
 */

const ALL_TARGETS: readonly SceneTransitionTarget[] = ['drive', 'edit'] as const

describe('SCENE_TRANSITION_BACKGROUND', () => {
  it('is a valid 6-digit hex color string', () => {
    expect(SCENE_TRANSITION_BACKGROUND).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is dark enough to read as a curtain (sum of channels well below 384)', () => {
    const r = parseInt(SCENE_TRANSITION_BACKGROUND.slice(1, 3), 16)
    const g = parseInt(SCENE_TRANSITION_BACKGROUND.slice(3, 5), 16)
    const b = parseInt(SCENE_TRANSITION_BACKGROUND.slice(5, 7), 16)
    // 384 is half of the 0..768 brightness sum range; a dark curtain
    // sits well below that so light text reads with contrast.
    expect(r + g + b).toBeLessThan(150)
  })
})

describe('SCENE_TRANSITION_FOREGROUND', () => {
  it('is a valid 6-digit hex color string', () => {
    expect(SCENE_TRANSITION_FOREGROUND).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is light enough to read against the dark background', () => {
    const r = parseInt(SCENE_TRANSITION_FOREGROUND.slice(1, 3), 16)
    const g = parseInt(SCENE_TRANSITION_FOREGROUND.slice(3, 5), 16)
    const b = parseInt(SCENE_TRANSITION_FOREGROUND.slice(5, 7), 16)
    expect(r + g + b).toBeGreaterThan(600)
  })

  it('differs from the curtain background', () => {
    expect(SCENE_TRANSITION_FOREGROUND).not.toBe(SCENE_TRANSITION_BACKGROUND)
  })
})

describe('SCENE_TRANSITION_FADE_MS', () => {
  it('is a positive number', () => {
    expect(SCENE_TRANSITION_FADE_MS).toBeGreaterThan(0)
  })

  it('is below the 200 ms perceived-instant threshold', () => {
    // Pillar 1 (Build it. Drive it. Build more.) wants the toggle to
    // feel like one click. A fade longer than 200 ms reads as a
    // transition rather than a flicker.
    expect(SCENE_TRANSITION_FADE_MS).toBeLessThanOrEqual(200)
  })
})

describe('SCENE_TRANSITION_Z_INDEX', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(SCENE_TRANSITION_Z_INDEX)).toBe(true)
    expect(SCENE_TRANSITION_Z_INDEX).toBeGreaterThan(0)
  })

  it('sits above the drive scene pause menu (zIndex 10)', () => {
    // The drive scene pause menu uses an inline zIndex of 10. The
    // curtain owns the surface during navigation so it must sit above
    // every interactive overlay the outgoing route paints.
    expect(SCENE_TRANSITION_Z_INDEX).toBeGreaterThan(10)
  })
})

describe('SCENE_TRANSITION_TESTID_PREFIX', () => {
  it('is a non-empty kebab-case string', () => {
    expect(SCENE_TRANSITION_TESTID_PREFIX.length).toBeGreaterThan(0)
    expect(SCENE_TRANSITION_TESTID_PREFIX).toMatch(/^[a-z][a-z0-9-]*$/)
  })

  it('matches the documented prefix for the curtain testid', () => {
    expect(SCENE_TRANSITION_TESTID_PREFIX).toBe('scene-transition-curtain')
  })
})

describe('SCENE_TRANSITION_LABEL', () => {
  it('declares an entry for every transition target', () => {
    for (const target of ALL_TARGETS) {
      expect(SCENE_TRANSITION_LABEL[target]).toBeTypeOf('string')
      expect(SCENE_TRANSITION_LABEL[target].length).toBeGreaterThan(0)
    }
  })

  it('mentions the target surface verbally', () => {
    expect(SCENE_TRANSITION_LABEL.drive.toLowerCase()).toContain('drive')
    expect(SCENE_TRANSITION_LABEL.edit.toLowerCase()).toContain('editor')
  })

  it('avoids race vocabulary (REQ-037 anti-feature)', () => {
    // The curtain copy must not smuggle race terms onto the drive
    // surface even during navigation. The full anti-feature lockdown
    // lives in driveAntiFeatures.ts; this is the local guard.
    for (const target of ALL_TARGETS) {
      const text = SCENE_TRANSITION_LABEL[target].toLowerCase()
      expect(text).not.toContain('lap')
      expect(text).not.toContain('race')
      expect(text).not.toContain('checkpoint')
      expect(text).not.toContain('finish')
      expect(text).not.toContain('leaderboard')
    }
  })

  it('has distinct labels per target', () => {
    expect(SCENE_TRANSITION_LABEL.drive).not.toBe(SCENE_TRANSITION_LABEL.edit)
  })
})

describe('sceneTransitionTestid', () => {
  it('returns the prefix followed by the target', () => {
    expect(sceneTransitionTestid('drive')).toBe(
      `${SCENE_TRANSITION_TESTID_PREFIX}-drive`,
    )
    expect(sceneTransitionTestid('edit')).toBe(
      `${SCENE_TRANSITION_TESTID_PREFIX}-edit`,
    )
  })

  it('produces unique testids per target', () => {
    const ids = new Set(ALL_TARGETS.map((target) => sceneTransitionTestid(target)))
    expect(ids.size).toBe(ALL_TARGETS.length)
  })

  it('produces a kebab-case testid string', () => {
    for (const target of ALL_TARGETS) {
      expect(sceneTransitionTestid(target)).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })
})

describe('sceneTransitionLabel', () => {
  it('returns the matching SCENE_TRANSITION_LABEL entry', () => {
    for (const target of ALL_TARGETS) {
      expect(sceneTransitionLabel(target)).toBe(SCENE_TRANSITION_LABEL[target])
    }
  })

  it('is a pure helper (idempotent across calls)', () => {
    for (const target of ALL_TARGETS) {
      expect(sceneTransitionLabel(target)).toBe(sceneTransitionLabel(target))
    }
  })
})
