import { describe, it, expect } from 'vitest'
import {
  MAX_STREET_LAMPS,
  STREET_LAMP_COLOR,
  STREET_LAMP_DISTANCE,
  STREET_LAMP_HEIGHT,
  STREET_LAMP_INTENSITY,
  WINDOWS_PER_FACE,
  WINDOW_GLOW_COLOR,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
  streetLampForIntersection,
  streetLampIntersections,
  windowMeshesForBuilding,
} from '@/app/[slug]/cityLighting'
import { CELL_SIZE } from '@/lib/cellSize'
import type { Building, Piece } from '@/lib/schemas'

const ZERO_BUILDING: Building = {
  type: 'small-house',
  row: 0,
  col: 0,
  rotation: 0,
}

describe('cityLighting constants', () => {
  it('window glow is a positive RGB color', () => {
    expect(WINDOW_GLOW_COLOR).toBeGreaterThan(0)
    expect(WINDOW_GLOW_COLOR).toBeLessThanOrEqual(0xffffff)
  })

  it('street-lamp color is a positive RGB color', () => {
    expect(STREET_LAMP_COLOR).toBeGreaterThan(0)
    expect(STREET_LAMP_COLOR).toBeLessThanOrEqual(0xffffff)
  })

  it('street-lamp intensity is positive', () => {
    expect(STREET_LAMP_INTENSITY).toBeGreaterThan(0)
  })

  it('street-lamp distance covers a few cells of reach', () => {
    expect(STREET_LAMP_DISTANCE).toBeGreaterThan(CELL_SIZE)
  })

  it('street-lamp height sits above the ground plane', () => {
    expect(STREET_LAMP_HEIGHT).toBeGreaterThan(0)
  })

  it('max street lamps caps at 8 per the perf guard', () => {
    expect(MAX_STREET_LAMPS).toBe(8)
  })

  it('windows-per-face is positive', () => {
    expect(WINDOWS_PER_FACE).toBeGreaterThan(0)
  })

  it('window quad dimensions are positive and below one cell', () => {
    expect(WINDOW_WIDTH).toBeGreaterThan(0)
    expect(WINDOW_WIDTH).toBeLessThan(CELL_SIZE)
    expect(WINDOW_HEIGHT).toBeGreaterThan(0)
    expect(WINDOW_HEIGHT).toBeLessThan(CELL_SIZE)
  })
})

describe('windowMeshesForBuilding', () => {
  it('returns four faces of windows for a single building', () => {
    const quads = windowMeshesForBuilding(ZERO_BUILDING)
    expect(quads.length).toBe(4 * WINDOWS_PER_FACE)
  })

  it('covers each of the four cardinal faces', () => {
    const quads = windowMeshesForBuilding(ZERO_BUILDING)
    const faces = new Set(quads.map((q) => q.face))
    expect(faces.has('north')).toBe(true)
    expect(faces.has('east')).toBe(true)
    expect(faces.has('south')).toBe(true)
    expect(faces.has('west')).toBe(true)
  })

  it('window center y sits at mid-body height', () => {
    const quads = windowMeshesForBuilding(ZERO_BUILDING)
    // small-house body height is CELL_SIZE * 0.6 so mid-height is 1.2.
    const midHeight = (CELL_SIZE * 0.6) / 2
    for (const quad of quads) {
      expect(quad.y).toBeCloseTo(midHeight, 6)
    }
  })

  it('each quad declares its width and height', () => {
    const quads = windowMeshesForBuilding(ZERO_BUILDING)
    for (const quad of quads) {
      expect(quad.width).toBe(WINDOW_WIDTH)
      expect(quad.height).toBe(WINDOW_HEIGHT)
    }
  })

  it('south face quads sit at positive z relative to the building anchor', () => {
    const quads = windowMeshesForBuilding(ZERO_BUILDING)
    const south = quads.filter((q) => q.face === 'south')
    expect(south.length).toBe(WINDOWS_PER_FACE)
    for (const quad of south) {
      // Building at (0, 0) world-anchor (0, 0) so south face is at +z.
      expect(quad.z).toBeGreaterThan(0)
    }
  })

  it('north face quads sit at negative z relative to the building anchor', () => {
    const quads = windowMeshesForBuilding(ZERO_BUILDING)
    const north = quads.filter((q) => q.face === 'north')
    for (const quad of north) {
      expect(quad.z).toBeLessThan(0)
    }
  })

  it('east face quads sit at positive x relative to the building anchor', () => {
    const quads = windowMeshesForBuilding(ZERO_BUILDING)
    const east = quads.filter((q) => q.face === 'east')
    for (const quad of east) {
      expect(quad.x).toBeGreaterThan(0)
    }
  })

  it('west face quads sit at negative x relative to the building anchor', () => {
    const quads = windowMeshesForBuilding(ZERO_BUILDING)
    const west = quads.filter((q) => q.face === 'west')
    for (const quad of west) {
      expect(quad.x).toBeLessThan(0)
    }
  })

  it('translates by the building anchor cell', () => {
    const shifted = windowMeshesForBuilding({
      ...ZERO_BUILDING,
      row: 2,
      col: 3,
    })
    // cellToWorld(row=2, col=3) returns (x=12, z=8); all quads sit
    // within roughly one cell of that world anchor.
    for (const quad of shifted) {
      expect(quad.x).toBeGreaterThan(12 - CELL_SIZE)
      expect(quad.x).toBeLessThan(12 + CELL_SIZE)
      expect(quad.z).toBeGreaterThan(8 - CELL_SIZE)
      expect(quad.z).toBeLessThan(8 + CELL_SIZE)
    }
  })

  it('rotates with the building rotation (90deg swaps north / east faces)', () => {
    const baseSouth = windowMeshesForBuilding(ZERO_BUILDING).filter(
      (q) => q.face === 'south',
    )
    const rotated = windowMeshesForBuilding({
      ...ZERO_BUILDING,
      rotation: 90,
    }).filter((q) => q.face === 'south')
    // Under a 90deg rotation, the local-south face's outward normal
    // rotates from (0, 1) to (1, 0), so the south-face quads should
    // sit at positive x and zero z (within rounding) rather than at
    // positive z and zero x.
    const baseSouthX = baseSouth.reduce((s, q) => s + q.x, 0)
    expect(baseSouthX).toBeCloseTo(0, 6)
    const rotatedSouthZ = rotated.reduce((s, q) => s + q.z, 0)
    expect(rotatedSouthZ).toBeCloseTo(0, 6)
    for (const quad of rotated) {
      expect(quad.x).toBeGreaterThan(0)
    }
  })

  it('emits finite numbers for every output field', () => {
    const quads = windowMeshesForBuilding({
      type: 'factory',
      row: -3,
      col: 7,
      rotation: 270,
    })
    for (const quad of quads) {
      expect(Number.isFinite(quad.x)).toBe(true)
      expect(Number.isFinite(quad.y)).toBe(true)
      expect(Number.isFinite(quad.z)).toBe(true)
      expect(Number.isFinite(quad.rotationY)).toBe(true)
    }
  })

  it('returns a fresh array on each call', () => {
    const a = windowMeshesForBuilding(ZERO_BUILDING)
    const b = windowMeshesForBuilding(ZERO_BUILDING)
    expect(a).not.toBe(b)
    a.length = 0
    expect(windowMeshesForBuilding(ZERO_BUILDING).length).toBeGreaterThan(0)
  })
})

describe('streetLampForIntersection', () => {
  it('places the lamp at the intersection cell + corner offset', () => {
    const piece: Piece = { type: 'intersection', row: 0, col: 0, rotation: 0 }
    const lamp = streetLampForIntersection(piece)
    // Existing bulb sits at +x + offset, +z + offset (see DriveSceneClient).
    expect(lamp.x).toBeGreaterThan(0)
    expect(lamp.z).toBeGreaterThan(0)
    expect(lamp.x).toBeLessThan(CELL_SIZE / 2)
    expect(lamp.z).toBeLessThan(CELL_SIZE / 2)
  })

  it('emits the cool-white street-lamp color', () => {
    const lamp = streetLampForIntersection({
      type: 'intersection',
      row: 0,
      col: 0,
      rotation: 0,
    })
    expect(lamp.color).toBe(STREET_LAMP_COLOR)
  })

  it('uses the configured intensity and distance', () => {
    const lamp = streetLampForIntersection({
      type: 'intersection',
      row: 5,
      col: -2,
      rotation: 0,
    })
    expect(lamp.intensity).toBe(STREET_LAMP_INTENSITY)
    expect(lamp.distance).toBe(STREET_LAMP_DISTANCE)
  })

  it('sits at the streetlamp bulb height', () => {
    const lamp = streetLampForIntersection({
      type: 'intersection',
      row: 0,
      col: 0,
      rotation: 0,
    })
    expect(lamp.y).toBe(STREET_LAMP_HEIGHT)
  })

  it('translates with the intersection cell', () => {
    const a = streetLampForIntersection({
      type: 'intersection',
      row: 0,
      col: 0,
      rotation: 0,
    })
    const b = streetLampForIntersection({
      type: 'intersection',
      row: 1,
      col: 1,
      rotation: 0,
    })
    expect(b.x).toBeCloseTo(a.x + CELL_SIZE, 6)
    expect(b.z).toBeCloseTo(a.z + CELL_SIZE, 6)
  })
})

describe('streetLampIntersections', () => {
  const intersection: Piece = {
    type: 'intersection',
    row: 0,
    col: 0,
    rotation: 0,
  }
  const straight: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }

  it('picks every intersection when below the cap', () => {
    const pieces: Piece[] = [
      { ...intersection, col: 0 },
      { ...intersection, col: 1 },
      { ...intersection, col: 2 },
    ]
    expect(streetLampIntersections(pieces).length).toBe(3)
  })

  it('caps at MAX_STREET_LAMPS', () => {
    const pieces: Piece[] = Array.from({ length: 12 }, (_, i) => ({
      ...intersection,
      col: i,
    }))
    expect(streetLampIntersections(pieces).length).toBe(MAX_STREET_LAMPS)
  })

  it('respects a caller-provided max', () => {
    const pieces: Piece[] = Array.from({ length: 6 }, (_, i) => ({
      ...intersection,
      col: i,
    }))
    expect(streetLampIntersections(pieces, 3).length).toBe(3)
  })

  it('returns empty for max <= 0', () => {
    const pieces: Piece[] = [intersection]
    expect(streetLampIntersections(pieces, 0).length).toBe(0)
    expect(streetLampIntersections(pieces, -1).length).toBe(0)
  })

  it('returns empty for non-finite max', () => {
    expect(
      streetLampIntersections([intersection], Number.POSITIVE_INFINITY).length,
    ).toBe(0)
    expect(streetLampIntersections([intersection], Number.NaN).length).toBe(0)
  })

  it('filters out non-intersection pieces', () => {
    const pieces: Piece[] = [
      straight,
      intersection,
      straight,
      { ...intersection, col: 1 },
    ]
    expect(streetLampIntersections(pieces).length).toBe(2)
  })

  it('returns an empty array when there are no intersections', () => {
    expect(streetLampIntersections([straight, straight]).length).toBe(0)
  })

  it('preserves placement order in the returned list', () => {
    const pieces: Piece[] = [
      { ...intersection, col: 7 },
      { ...intersection, col: 3 },
      { ...intersection, col: 5 },
    ]
    const picked = streetLampIntersections(pieces, 8)
    expect(picked[0].col).toBe(7)
    expect(picked[1].col).toBe(3)
    expect(picked[2].col).toBe(5)
  })

  it('returns a fresh array on each call', () => {
    const pieces: Piece[] = [intersection]
    expect(streetLampIntersections(pieces)).not.toBe(
      streetLampIntersections(pieces),
    )
  })
})
