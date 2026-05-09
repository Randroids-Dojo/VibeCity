import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AMBIENT_LIGHT_INTENSITY,
  DEFAULT_CAMERA_FAR,
  DEFAULT_CAMERA_FOV,
  DEFAULT_CAMERA_NEAR,
  DEFAULT_DIRECTIONAL_LIGHT_INTENSITY,
  DEFAULT_DIRECTIONAL_LIGHT_POSITION,
} from '@/lib/render/scene'

describe('lighting defaults', () => {
  it('ambient intensity is in [0, 1]', () => {
    expect(DEFAULT_AMBIENT_LIGHT_INTENSITY).toBeGreaterThan(0)
    expect(DEFAULT_AMBIENT_LIGHT_INTENSITY).toBeLessThanOrEqual(1)
  })

  it('directional intensity is in (0, 2]', () => {
    expect(DEFAULT_DIRECTIONAL_LIGHT_INTENSITY).toBeGreaterThan(0)
    expect(DEFAULT_DIRECTIONAL_LIGHT_INTENSITY).toBeLessThanOrEqual(2)
  })

  it('directional position is a 3-tuple of finite numbers', () => {
    expect(DEFAULT_DIRECTIONAL_LIGHT_POSITION).toHaveLength(3)
    for (const coord of DEFAULT_DIRECTIONAL_LIGHT_POSITION) {
      expect(Number.isFinite(coord)).toBe(true)
    }
  })

  it('directional Y is positive (top-down key light)', () => {
    expect(DEFAULT_DIRECTIONAL_LIGHT_POSITION[1]).toBeGreaterThan(0)
  })
})

describe('camera defaults', () => {
  it('FOV is between 30 and 90 degrees (typical outdoor scene range)', () => {
    expect(DEFAULT_CAMERA_FOV).toBeGreaterThan(30)
    expect(DEFAULT_CAMERA_FOV).toBeLessThan(90)
  })

  it('near plane is positive and small', () => {
    expect(DEFAULT_CAMERA_NEAR).toBeGreaterThan(0)
    expect(DEFAULT_CAMERA_NEAR).toBeLessThan(1)
  })

  it('far plane is much larger than near (positive depth budget)', () => {
    expect(DEFAULT_CAMERA_FAR).toBeGreaterThan(DEFAULT_CAMERA_NEAR * 100)
  })
})
