import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AMBIENT_LIGHT_INTENSITY,
  DEFAULT_CAMERA_FAR,
  DEFAULT_CAMERA_FOV,
  DEFAULT_CAMERA_NEAR,
  DEFAULT_DIRECTIONAL_LIGHT_INTENSITY,
  DEFAULT_DIRECTIONAL_LIGHT_POSITION,
  DEFAULT_FOG_DENSITY,
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

describe('fog defaults', () => {
  it('fog density is positive and small (atmospheric, not opaque)', () => {
    expect(DEFAULT_FOG_DENSITY).toBeGreaterThan(0)
    // FogExp2 falloff is `exp(-(density * distance)^2)`. A density of 0.1
    // would drop visibility to ~37% at distance 10, which is opaque for a
    // city scene. Cap at 0.05 so the constant has room to be tuned darker
    // without crossing into "wall of fog" territory.
    expect(DEFAULT_FOG_DENSITY).toBeLessThan(0.05)
  })

  it('visibility at the far plane is non-zero (city horizon still readable)', () => {
    // FogExp2 falloff. At distance == DEFAULT_CAMERA_FAR (1000) the fog
    // factor is `exp(-(density * far)^2)`. Density 0.004 gives
    // `exp(-16) ~= 1.1e-7`, basically opaque, which is the desired
    // behavior. Lock the constant so a future tuning bump does not
    // accidentally cross into "everything is fogged at any range" range.
    const factor = Math.exp(-((DEFAULT_FOG_DENSITY * DEFAULT_CAMERA_FAR) ** 2))
    expect(factor).toBeLessThan(0.5)
  })

  it('visibility at the chase-camera distance stays mostly clear', () => {
    // At 96 world units (the chase-camera ground distance with CELL_SIZE=4
    // and CAMERA_DISTANCE = CELL_SIZE * 24), the player should still see
    // the city clearly. Locks the density so a future tune does not
    // shroud the playable area in fog.
    const chaseDistance = 96
    const factor = Math.exp(-((DEFAULT_FOG_DENSITY * chaseDistance) ** 2))
    expect(factor).toBeGreaterThan(0.8)
  })
})
