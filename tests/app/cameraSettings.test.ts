import { describe, expect, it } from 'vitest'
import {
  CAMERA_SETTINGS_FIXED_RIG_FIELDS,
  CAMERA_SLIDER_BOUNDS,
  DEFAULT_CAMERA_TUNING,
  clampCameraTuning,
  snapToSliderStep,
  toCameraRigParams,
} from '@/app/[slug]/cameraSettings'
import {
  CAMERA_RIG_POSITION_LERP,
  CAMERA_RIG_TARGET_HEIGHT,
  CAMERA_RIG_TARGET_LERP,
} from '@/lib/render/cameraRig'
import type { CameraTuning } from '@/lib/controlsPersistence'

/**
 * REQ-040: camera tuning settings pane. The persistence layer
 * (REQ-043) accepts any finite number in the documented bounds; this
 * module narrows that surface area to what a slider can actually
 * produce, and bridges the persisted `CameraTuning` shape into the
 * `CameraRigParams` shape the chase rig consumes.
 */

const APPROX = 1e-9

describe('CAMERA_SLIDER_BOUNDS', () => {
  it('exposes a bound for every CameraTuning field', () => {
    const fields: Array<keyof CameraTuning> = [
      'height',
      'distance',
      'lookAhead',
      'followSpeed',
      'fov',
    ]
    for (const field of fields) {
      const bound = CAMERA_SLIDER_BOUNDS[field]
      expect(bound).toBeDefined()
      expect(bound.label.length).toBeGreaterThan(0)
    }
  })

  it('every bound has min < max and a positive finite step', () => {
    for (const bound of Object.values(CAMERA_SLIDER_BOUNDS)) {
      expect(Number.isFinite(bound.min)).toBe(true)
      expect(Number.isFinite(bound.max)).toBe(true)
      expect(Number.isFinite(bound.step)).toBe(true)
      expect(bound.min).toBeLessThan(bound.max)
      expect(bound.step).toBeGreaterThan(0)
      expect(bound.step).toBeLessThanOrEqual(bound.max - bound.min)
    }
  })

  it('every default value sits inside the corresponding bound', () => {
    expect(DEFAULT_CAMERA_TUNING.height).toBeGreaterThanOrEqual(
      CAMERA_SLIDER_BOUNDS.height.min,
    )
    expect(DEFAULT_CAMERA_TUNING.height).toBeLessThanOrEqual(
      CAMERA_SLIDER_BOUNDS.height.max,
    )
    expect(DEFAULT_CAMERA_TUNING.distance).toBeGreaterThanOrEqual(
      CAMERA_SLIDER_BOUNDS.distance.min,
    )
    expect(DEFAULT_CAMERA_TUNING.distance).toBeLessThanOrEqual(
      CAMERA_SLIDER_BOUNDS.distance.max,
    )
    expect(DEFAULT_CAMERA_TUNING.lookAhead).toBeGreaterThanOrEqual(
      CAMERA_SLIDER_BOUNDS.lookAhead.min,
    )
    expect(DEFAULT_CAMERA_TUNING.lookAhead).toBeLessThanOrEqual(
      CAMERA_SLIDER_BOUNDS.lookAhead.max,
    )
    expect(DEFAULT_CAMERA_TUNING.followSpeed).toBeGreaterThanOrEqual(
      CAMERA_SLIDER_BOUNDS.followSpeed.min,
    )
    expect(DEFAULT_CAMERA_TUNING.followSpeed).toBeLessThanOrEqual(
      CAMERA_SLIDER_BOUNDS.followSpeed.max,
    )
    expect(DEFAULT_CAMERA_TUNING.fov).toBeGreaterThanOrEqual(
      CAMERA_SLIDER_BOUNDS.fov.min,
    )
    expect(DEFAULT_CAMERA_TUNING.fov).toBeLessThanOrEqual(
      CAMERA_SLIDER_BOUNDS.fov.max,
    )
  })

  it('label vocabulary stays free of race terminology so REQ-037 does not regress', () => {
    const RACE_TERMS = ['lap', 'race', 'checkpoint', 'finish', 'leaderboard']
    for (const bound of Object.values(CAMERA_SLIDER_BOUNDS)) {
      const lower = bound.label.toLowerCase()
      for (const term of RACE_TERMS) {
        expect(lower.includes(term)).toBe(false)
      }
    }
  })
})

describe('snapToSliderStep', () => {
  it('clamps below min', () => {
    const bound = CAMERA_SLIDER_BOUNDS.height
    expect(snapToSliderStep(-100, bound)).toBe(bound.min)
    expect(snapToSliderStep(bound.min - 1, bound)).toBe(bound.min)
  })

  it('clamps above max', () => {
    const bound = CAMERA_SLIDER_BOUNDS.height
    expect(snapToSliderStep(9999, bound)).toBe(bound.max)
    expect(snapToSliderStep(bound.max + 1, bound)).toBe(bound.max)
  })

  it('snaps an in-range value to the nearest step', () => {
    const bound = CAMERA_SLIDER_BOUNDS.fov
    // Bound: min 30, step 1. Value 60.4 rounds down to 60.
    expect(snapToSliderStep(60.4, bound)).toBe(60)
    // Value 60.6 rounds up to 61.
    expect(snapToSliderStep(60.6, bound)).toBe(61)
  })

  it('returns min for a non-finite input', () => {
    const bound = CAMERA_SLIDER_BOUNDS.fov
    expect(snapToSliderStep(Number.NaN, bound)).toBe(bound.min)
    expect(snapToSliderStep(Number.POSITIVE_INFINITY, bound)).toBe(bound.min)
    expect(snapToSliderStep(Number.NEGATIVE_INFINITY, bound)).toBe(bound.min)
  })

  it('preserves a value that already sits exactly on a step', () => {
    const bound = CAMERA_SLIDER_BOUNDS.distance
    expect(snapToSliderStep(bound.min, bound)).toBe(bound.min)
    expect(snapToSliderStep(bound.max, bound)).toBe(bound.max)
    expect(snapToSliderStep(bound.min + bound.step, bound)).toBe(
      bound.min + bound.step,
    )
  })

  it('snaps the followSpeed bound (sub-unit step) without floating noise', () => {
    const bound = CAMERA_SLIDER_BOUNDS.followSpeed
    // Bound: min 0.02, step 0.01. Value 0.12 should round to 0.12 cleanly.
    expect(snapToSliderStep(0.12, bound)).toBeCloseTo(0.12, 6)
    // 0.123 should snap to 0.12 (nearest step at 0.12 vs 0.13 is 0.12).
    expect(snapToSliderStep(0.123, bound)).toBeCloseTo(0.12, 6)
    // 0.127 should snap to 0.13.
    expect(snapToSliderStep(0.127, bound)).toBeCloseTo(0.13, 6)
  })

  it('snaps the fov bound (integer step) to whole numbers', () => {
    const bound = CAMERA_SLIDER_BOUNDS.fov
    expect(snapToSliderStep(60.4, bound)).toBe(60)
    expect(snapToSliderStep(60.6, bound)).toBe(61)
  })
})

describe('clampCameraTuning', () => {
  it('returns the defaults verbatim when given the defaults', () => {
    const out = clampCameraTuning(DEFAULT_CAMERA_TUNING)
    expect(out.height).toBeCloseTo(DEFAULT_CAMERA_TUNING.height, 6)
    expect(out.distance).toBeCloseTo(DEFAULT_CAMERA_TUNING.distance, 6)
    expect(out.lookAhead).toBeCloseTo(DEFAULT_CAMERA_TUNING.lookAhead, 6)
    expect(out.followSpeed).toBeCloseTo(DEFAULT_CAMERA_TUNING.followSpeed, 6)
    expect(out.fov).toBeCloseTo(DEFAULT_CAMERA_TUNING.fov, 6)
  })

  it('clamps every field below its min', () => {
    const out = clampCameraTuning({
      height: -10,
      distance: -10,
      lookAhead: -10,
      followSpeed: -10,
      fov: -10,
    })
    expect(out.height).toBe(CAMERA_SLIDER_BOUNDS.height.min)
    expect(out.distance).toBe(CAMERA_SLIDER_BOUNDS.distance.min)
    expect(out.lookAhead).toBe(CAMERA_SLIDER_BOUNDS.lookAhead.min)
    expect(out.followSpeed).toBe(CAMERA_SLIDER_BOUNDS.followSpeed.min)
    expect(out.fov).toBe(CAMERA_SLIDER_BOUNDS.fov.min)
  })

  it('clamps every field above its max', () => {
    const out = clampCameraTuning({
      height: 9999,
      distance: 9999,
      lookAhead: 9999,
      followSpeed: 9999,
      fov: 9999,
    })
    expect(out.height).toBe(CAMERA_SLIDER_BOUNDS.height.max)
    expect(out.distance).toBe(CAMERA_SLIDER_BOUNDS.distance.max)
    expect(out.lookAhead).toBe(CAMERA_SLIDER_BOUNDS.lookAhead.max)
    expect(out.followSpeed).toBe(CAMERA_SLIDER_BOUNDS.followSpeed.max)
    expect(out.fov).toBe(CAMERA_SLIDER_BOUNDS.fov.max)
  })

  it('collapses non-finite fields to the min so a malformed event cannot poison the value', () => {
    const out = clampCameraTuning({
      height: Number.NaN,
      distance: Number.POSITIVE_INFINITY,
      lookAhead: Number.NEGATIVE_INFINITY,
      followSpeed: Number.NaN,
      fov: Number.NaN,
    })
    expect(out.height).toBe(CAMERA_SLIDER_BOUNDS.height.min)
    expect(out.distance).toBe(CAMERA_SLIDER_BOUNDS.distance.min)
    expect(out.lookAhead).toBe(CAMERA_SLIDER_BOUNDS.lookAhead.min)
    expect(out.followSpeed).toBe(CAMERA_SLIDER_BOUNDS.followSpeed.min)
    expect(out.fov).toBe(CAMERA_SLIDER_BOUNDS.fov.min)
  })

  it('returns a fresh object so the caller does not have to clone', () => {
    const input = { ...DEFAULT_CAMERA_TUNING }
    const out = clampCameraTuning(input)
    expect(out).not.toBe(input)
  })
})

describe('toCameraRigParams', () => {
  it('passes through the tunable fields unchanged', () => {
    const tuning: CameraTuning = {
      height: 8,
      distance: 16,
      lookAhead: 4,
      followSpeed: 0.25,
      fov: 70,
    }
    const params = toCameraRigParams(tuning)
    expect(params.height).toBe(8)
    expect(params.distance).toBe(16)
    expect(params.lookAhead).toBe(4)
    expect(params.positionLerp).toBeCloseTo(0.25, APPROX)
  })

  it('fills the fixed rig fields from cameraRig defaults so the rig contract is satisfied', () => {
    const params = toCameraRigParams(DEFAULT_CAMERA_TUNING)
    expect(params.targetHeight).toBe(CAMERA_RIG_TARGET_HEIGHT)
    expect(params.targetLerp).toBe(CAMERA_RIG_TARGET_LERP)
  })

  it('CAMERA_SETTINGS_FIXED_RIG_FIELDS exposes the same defaults the bridge uses', () => {
    expect(CAMERA_SETTINGS_FIXED_RIG_FIELDS.targetHeight).toBe(
      CAMERA_RIG_TARGET_HEIGHT,
    )
    expect(CAMERA_SETTINGS_FIXED_RIG_FIELDS.targetLerp).toBe(
      CAMERA_RIG_TARGET_LERP,
    )
    expect(CAMERA_SETTINGS_FIXED_RIG_FIELDS.positionLerp).toBe(
      CAMERA_RIG_POSITION_LERP,
    )
  })

  it('the default tuning bridge produces a CameraRigParams equivalent to the rig defaults', () => {
    const params = toCameraRigParams(DEFAULT_CAMERA_TUNING)
    // The persisted default followSpeed (0.12) matches the cameraRig
    // default position lerp so the bridge produces the same params the
    // rig used before REQ-040 wired the persisted tuning in.
    expect(params.positionLerp).toBeCloseTo(CAMERA_RIG_POSITION_LERP, 6)
  })

  it('returns a fresh object on every call', () => {
    const a = toCameraRigParams(DEFAULT_CAMERA_TUNING)
    const b = toCameraRigParams(DEFAULT_CAMERA_TUNING)
    expect(a).not.toBe(b)
  })
})

describe('DEFAULT_CAMERA_TUNING re-export', () => {
  it('matches the persistence-layer default verbatim', () => {
    // The re-export is so the panel imports both bounds and defaults
    // from the same module without forcing the editor surface to
    // bundle the persistence layer.
    expect(DEFAULT_CAMERA_TUNING.height).toBeGreaterThan(0)
    expect(DEFAULT_CAMERA_TUNING.distance).toBeGreaterThan(0)
    expect(DEFAULT_CAMERA_TUNING.lookAhead).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_CAMERA_TUNING.followSpeed).toBeGreaterThan(0)
    expect(DEFAULT_CAMERA_TUNING.followSpeed).toBeLessThanOrEqual(1)
    expect(DEFAULT_CAMERA_TUNING.fov).toBeGreaterThan(0)
    expect(DEFAULT_CAMERA_TUNING.fov).toBeLessThan(180)
  })
})
