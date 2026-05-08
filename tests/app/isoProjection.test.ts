import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SNAP_GRID_VIEW_MODE,
  ISO_ROTATE_DEG,
  ISO_SCALE_Y,
  isoTransformCss,
} from '@/app/[slug]/edit/isoProjection'

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

  it('rotate appears before scaleY (CSS order matters for the iso shape)', () => {
    const css = isoTransformCss('iso')
    const rotateIdx = css.indexOf('rotate')
    const scaleIdx = css.indexOf('scale')
    expect(rotateIdx).toBeGreaterThanOrEqual(0)
    expect(scaleIdx).toBeGreaterThan(rotateIdx)
  })

  it('iso transform string mentions the canonical constant values', () => {
    const css = isoTransformCss('iso')
    expect(css).toContain(`${ISO_ROTATE_DEG}deg`)
    expect(css).toContain(`${ISO_SCALE_Y}`)
  })

  it('flat transform is distinct from iso so the SVG style flips visibly', () => {
    expect(isoTransformCss('flat')).not.toBe(isoTransformCss('iso'))
  })
})
