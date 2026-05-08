import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SNAP_GRID_VIEW_MODE,
  ISO_ROTATE_DEG,
  ISO_SCALE_Y,
  isoTransformCss,
} from '@/lib/render/iso'

describe('isoProjection constants (REQ-110, REQ-111)', () => {
  it('ISO_ROTATE_DEG is the SimCity-style 45deg rotation', () => {
    // Negative because CSS rotate is clockwise from the y-axis; -45
    // makes the +x grid axis point up-and-right (SimCity convention).
    expect(ISO_ROTATE_DEG).toBe(-45)
  })

  it('ISO_SCALE_Y compresses the y-axis to the 2:1 dimetric ratio', () => {
    expect(ISO_SCALE_Y).toBe(0.5)
  })

  it('DEFAULT_SNAP_GRID_VIEW_MODE is iso (sim-as-primary view)', () => {
    expect(DEFAULT_SNAP_GRID_VIEW_MODE).toBe('iso')
  })
})

describe('isoTransformCss', () => {
  it('returns "none" for flat mode (no transform applied)', () => {
    expect(isoTransformCss('flat')).toBe('none')
  })

  it('returns the rotate + scaleY transform for iso mode', () => {
    const css = isoTransformCss('iso')
    expect(css).toContain('rotate(-45deg)')
    expect(css).toContain('scaleY(0.5)')
  })

  it('scaleY appears before rotate so rotate applies first under CSS right-to-left order', () => {
    // CSS transform functions are applied right-to-left: the rightmost
    // function transforms the original coord space first, then the
    // next-leftmost. To rotate the unit square into a diamond first
    // and THEN squash the diamond vertically (the SimCity dimetric
    // shape), `scaleY` must appear on the LEFT and `rotate` on the
    // RIGHT of the transform string.
    const css = isoTransformCss('iso')
    const rotateIdx = css.indexOf('rotate')
    const scaleIdx = css.indexOf('scale')
    expect(rotateIdx).toBeGreaterThanOrEqual(0)
    expect(scaleIdx).toBeGreaterThanOrEqual(0)
    expect(rotateIdx).toBeGreaterThan(scaleIdx)
  })

  it('iso transform string mentions the canonical constant values', () => {
    const css = isoTransformCss('iso')
    expect(css).toContain(`${ISO_ROTATE_DEG}deg`)
    expect(css).toContain(`${ISO_SCALE_Y}`)
  })

  it('flat transform is distinct from iso so the SVG style flips visibly', () => {
    expect(isoTransformCss('flat')).not.toBe(isoTransformCss('iso'))
  })

  it('sums rotationDeg into the iso rotate angle (REQ-111 slice C)', () => {
    expect(isoTransformCss('iso', 0)).toContain(`rotate(${ISO_ROTATE_DEG}deg)`)
    expect(isoTransformCss('iso', 90)).toContain(
      `rotate(${ISO_ROTATE_DEG + 90}deg)`,
    )
    expect(isoTransformCss('iso', 180)).toContain(
      `rotate(${ISO_ROTATE_DEG + 180}deg)`,
    )
    expect(isoTransformCss('iso', 270)).toContain(
      `rotate(${ISO_ROTATE_DEG + 270}deg)`,
    )
  })

  it('rotationDeg has no effect in flat mode', () => {
    expect(isoTransformCss('flat', 90)).toBe('none')
    expect(isoTransformCss('flat', 270)).toBe('none')
  })
})
