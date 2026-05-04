import { describe, expect, it } from 'vitest'
import {
  AMBIENT_LIGHT_INTENSITY,
  BUILDING_COLORS,
  BUILDING_HEIGHTS,
  CAMERA_DISTANCE,
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_HEIGHT,
  CAMERA_NEAR,
  CAR_AXLE_OFFSET,
  CAR_BODY_COLOR,
  CAR_BODY_HEIGHT,
  CAR_CABIN_COLOR,
  CAR_CABIN_HEIGHT,
  CAR_CABIN_LENGTH,
  CAR_CABIN_OFFSET,
  CAR_CABIN_WIDTH,
  CAR_GROUND_LIFT,
  CAR_LENGTH,
  CAR_WHEEL_COLOR,
  CAR_WHEEL_INSET,
  CAR_WHEEL_RADIUS,
  CAR_WHEEL_THICKNESS,
  CAR_WIDTH,
  CELL_SIZE,
  DEFAULT_PIECE_COLOR,
  DIRECTIONAL_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_POSITION,
  GROUND_COLOR,
  PIECE_COLORS,
  PIECE_GROUND_LIFT,
  SKY_COLOR,
  SPAWN_MARKER_COLOR,
  SPAWN_MARKER_HEIGHT,
  SPAWN_MARKER_LENGTH,
  SPAWN_MARKER_WIDTH,
  buildingColorFor,
  buildingHeightFor,
  carBodyY,
  carCabinY,
  carWheelOffsets,
  cellToWorld,
  cityWorldBounds,
  pieceColorFor,
  rotationToRadians,
  spawnAnchor,
} from '@/app/[slug]/driveScene'
import type { Building, BuildingType, Piece, PieceType } from '@/lib/schemas'
import { BuildingTypeSchema, PieceTypeSchema } from '@/lib/schemas'

/**
 * REQ-044, REQ-045, REQ-046, REQ-053: drive-scene scaffold helpers.
 *
 * The pure helper module backs the three.js mount in
 * `DriveSceneClient.tsx`. These tests cover the constants, color and
 * height maps, world-coordinate conversions, and the bounds helper
 * that the scene mount uses to fit the camera and decide whether to
 * show the empty-state prompt.
 */

describe('driveScene constants (REQ-044, REQ-045, REQ-046)', () => {
  it('CELL_SIZE matches VibeRacer world units (4)', () => {
    expect(CELL_SIZE).toBe(4)
  })

  it('CAMERA_FOV / NEAR / FAR are sensible perspective defaults', () => {
    expect(CAMERA_FOV).toBeGreaterThanOrEqual(35)
    expect(CAMERA_FOV).toBeLessThanOrEqual(75)
    expect(CAMERA_NEAR).toBeGreaterThan(0)
    expect(CAMERA_NEAR).toBeLessThan(1)
    expect(CAMERA_FAR).toBeGreaterThan(CAMERA_NEAR)
  })

  it('CAMERA_HEIGHT and CAMERA_DISTANCE scale with CELL_SIZE', () => {
    expect(CAMERA_HEIGHT).toBeGreaterThan(0)
    expect(CAMERA_DISTANCE).toBeGreaterThan(0)
    // Both should be a multiple of CELL_SIZE so the camera frames a
    // small starter city without coupling to an arbitrary world unit.
    expect(CAMERA_HEIGHT % CELL_SIZE).toBe(0)
    expect(CAMERA_DISTANCE % CELL_SIZE).toBe(0)
  })

  it('AMBIENT and DIRECTIONAL light intensities are in the [0, 2] range', () => {
    expect(AMBIENT_LIGHT_INTENSITY).toBeGreaterThan(0)
    expect(AMBIENT_LIGHT_INTENSITY).toBeLessThanOrEqual(2)
    expect(DIRECTIONAL_LIGHT_INTENSITY).toBeGreaterThan(0)
    expect(DIRECTIONAL_LIGHT_INTENSITY).toBeLessThanOrEqual(2)
  })

  it('DIRECTIONAL_LIGHT_POSITION is a tuple of three finite numbers', () => {
    expect(DIRECTIONAL_LIGHT_POSITION).toHaveLength(3)
    for (const component of DIRECTIONAL_LIGHT_POSITION) {
      expect(Number.isFinite(component)).toBe(true)
    }
  })

  it('SKY_COLOR and GROUND_COLOR are valid 24-bit hex values', () => {
    expect(SKY_COLOR).toBeGreaterThanOrEqual(0)
    expect(SKY_COLOR).toBeLessThanOrEqual(0xffffff)
    expect(GROUND_COLOR).toBeGreaterThanOrEqual(0)
    expect(GROUND_COLOR).toBeLessThanOrEqual(0xffffff)
  })

  it('PIECE_GROUND_LIFT is positive but smaller than CELL_SIZE', () => {
    expect(PIECE_GROUND_LIFT).toBeGreaterThan(0)
    expect(PIECE_GROUND_LIFT).toBeLessThan(CELL_SIZE)
  })
})

describe('pieceColorFor (REQ-045)', () => {
  it('returns the mapped color for every piece type the schema knows', () => {
    for (const type of PieceTypeSchema.options) {
      const color = pieceColorFor(type)
      expect(color).toBeGreaterThanOrEqual(0)
      expect(color).toBeLessThanOrEqual(0xffffff)
    }
  })

  it('falls back to DEFAULT_PIECE_COLOR for an unmapped type', () => {
    // A type not present in PIECE_COLORS still returns the asphalt
    // default; the cast is fine because the runtime fallback is the
    // contract under test.
    const novel = 'novel-type' as unknown as PieceType
    expect(pieceColorFor(novel)).toBe(DEFAULT_PIECE_COLOR)
  })

  it('cardinal basics share a single asphalt color so they read as one road', () => {
    expect(pieceColorFor('left90')).toBe(pieceColorFor('right90'))
  })
})

describe('buildingColorFor / buildingHeightFor (REQ-046)', () => {
  it('returns a finite positive height for every building type', () => {
    for (const type of BuildingTypeSchema.options) {
      const height = buildingHeightFor(type)
      expect(height).toBeGreaterThan(0)
      expect(Number.isFinite(height)).toBe(true)
    }
  })

  it('factory is taller than a small house so silhouettes vary', () => {
    expect(buildingHeightFor('factory')).toBeGreaterThan(
      buildingHeightFor('small-house'),
    )
  })

  it('every building type maps to a distinct color', () => {
    const seen = new Set<number>()
    for (const type of BuildingTypeSchema.options) {
      seen.add(buildingColorFor(type))
    }
    expect(seen.size).toBe(BuildingTypeSchema.options.length)
  })

  it('BUILDING_COLORS and BUILDING_HEIGHTS cover every type in the schema', () => {
    for (const type of BuildingTypeSchema.options) {
      expect(BUILDING_HEIGHTS).toHaveProperty(type)
      expect(BUILDING_COLORS).toHaveProperty(type)
    }
  })

  it('PIECE_COLORS is a partial map keyed by valid piece types', () => {
    for (const type of Object.keys(PIECE_COLORS)) {
      expect(PieceTypeSchema.options).toContain(type as PieceType)
    }
  })
})

describe('cellToWorld', () => {
  it('places the origin cell at the world origin', () => {
    expect(cellToWorld(0, 0)).toEqual({ x: 0, z: 0 })
  })

  it('moves east on positive col (column scales x)', () => {
    expect(cellToWorld(0, 2)).toEqual({ x: CELL_SIZE * 2, z: 0 })
  })

  it('moves south on positive row (row scales z)', () => {
    expect(cellToWorld(3, 0)).toEqual({ x: 0, z: CELL_SIZE * 3 })
  })

  it('handles negative coordinates symmetrically', () => {
    expect(cellToWorld(-2, -1)).toEqual({
      x: -CELL_SIZE,
      z: -CELL_SIZE * 2,
    })
  })
})

describe('rotationToRadians', () => {
  it('zero degrees maps to zero radians', () => {
    expect(rotationToRadians(0)).toBe(0)
  })

  it('90 degrees maps to a quarter turn', () => {
    expect(rotationToRadians(90)).toBeCloseTo(Math.PI / 2, 10)
  })

  it('180 degrees maps to half a turn', () => {
    expect(rotationToRadians(180)).toBeCloseTo(Math.PI, 10)
  })

  it('270 degrees maps to three quarter turns', () => {
    expect(rotationToRadians(270)).toBeCloseTo((3 * Math.PI) / 2, 10)
  })
})

describe('cityWorldBounds (REQ-053 empty-state pivot)', () => {
  it('returns null for an empty city so callers can show the empty prompt', () => {
    expect(cityWorldBounds([], [])).toBeNull()
  })

  it('returns bounds covering a single piece centered on the origin', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const bounds = cityWorldBounds([piece], [])
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.centerX).toBeCloseTo(0, 10)
    expect(bounds.centerZ).toBeCloseTo(0, 10)
    expect(bounds.width).toBeCloseTo(CELL_SIZE, 10)
    expect(bounds.depth).toBeCloseTo(CELL_SIZE, 10)
    expect(bounds.minX).toBeCloseTo(-CELL_SIZE / 2, 10)
    expect(bounds.maxX).toBeCloseTo(CELL_SIZE / 2, 10)
  })

  it('inflates over two pieces to cover both cells', () => {
    const a: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const b: Piece = { type: 'straight', row: 1, col: 2, rotation: 0 }
    const bounds = cityWorldBounds([a, b], [])
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.minX).toBeCloseTo(-CELL_SIZE / 2, 10)
    expect(bounds.maxX).toBeCloseTo(CELL_SIZE * 2 + CELL_SIZE / 2, 10)
    expect(bounds.minZ).toBeCloseTo(-CELL_SIZE / 2, 10)
    expect(bounds.maxZ).toBeCloseTo(CELL_SIZE + CELL_SIZE / 2, 10)
    expect(bounds.centerX).toBeCloseTo(CELL_SIZE, 10)
    expect(bounds.centerZ).toBeCloseTo(CELL_SIZE / 2, 10)
  })

  it('expands a piece footprint over every cell when one is provided', () => {
    const piece: Piece = {
      type: 'megaSweepRight',
      row: 0,
      col: 0,
      rotation: 0,
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
      ],
    }
    const bounds = cityWorldBounds([piece], [])
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.maxX).toBeCloseTo(CELL_SIZE + CELL_SIZE / 2, 10)
    expect(bounds.maxZ).toBeCloseTo(CELL_SIZE / 2 + CELL_SIZE, 10)
  })

  it('a building-only city still produces bounds (REQ-053 empty check)', () => {
    const building: Building = {
      type: 'small-house',
      row: 0,
      col: 0,
      rotation: 0,
    }
    const bounds = cityWorldBounds([], [building])
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.centerX).toBeCloseTo(0, 10)
    expect(bounds.centerZ).toBeCloseTo(0, 10)
  })

  it('combines pieces and buildings into one box', () => {
    const piece: Piece = { type: 'straight', row: -2, col: -2, rotation: 0 }
    const building: BuildingExt = {
      type: 'mid-house',
      row: 3,
      col: 3,
      rotation: 0,
    }
    const bounds = cityWorldBounds([piece], [building])
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.minX).toBeCloseTo(-CELL_SIZE * 2 - CELL_SIZE / 2, 10)
    expect(bounds.maxX).toBeCloseTo(CELL_SIZE * 3 + CELL_SIZE / 2, 10)
  })
})

// Local alias so the multi-type test reads cleanly without importing
// the BuildingType union twice.
type BuildingExt = Building & { type: BuildingType }

describe('spawnAnchor (REQ-036)', () => {
  it('returns the grid origin when no pieces are placed', () => {
    expect(spawnAnchor([])).toEqual({ row: 0, col: 0 })
  })

  it('returns the first placed piece cell as the anchor', () => {
    const a: Piece = { type: 'straight', row: 2, col: 3, rotation: 0 }
    const b: Piece = { type: 'straight', row: -1, col: -4, rotation: 90 }
    expect(spawnAnchor([a, b])).toEqual({ row: 2, col: 3 })
  })

  it('the second piece is ignored even when placed earlier in space', () => {
    // Order in the array is insertion order from the editor's
    // `placePiece` reducer. The anchor follows array order, not the
    // numerical order of `(row, col)`.
    const a: Piece = { type: 'straight', row: 5, col: 5, rotation: 0 }
    const b: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    expect(spawnAnchor([a, b])).toEqual({ row: 5, col: 5 })
  })

  it('handles negative coordinates', () => {
    const piece: Piece = {
      type: 'straight',
      row: -3,
      col: -7,
      rotation: 180,
    }
    expect(spawnAnchor([piece])).toEqual({ row: -3, col: -7 })
  })

  it('a single-piece city produces a stable anchor across rotations', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const piece: Piece = {
        type: 'left90',
        row: 1,
        col: 1,
        rotation,
      }
      expect(spawnAnchor([piece])).toEqual({ row: 1, col: 1 })
    }
  })

  it('returns a fresh object on each call (no shared mutable result)', () => {
    const piece: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const a = spawnAnchor([piece])
    const b = spawnAnchor([piece])
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('SPAWN_MARKER_* constants (REQ-036)', () => {
  it('SPAWN_MARKER_COLOR is a valid 24-bit hex value', () => {
    expect(SPAWN_MARKER_COLOR).toBeGreaterThanOrEqual(0)
    expect(SPAWN_MARKER_COLOR).toBeLessThanOrEqual(0xffffff)
  })

  it('marker dimensions are positive and bounded by CELL_SIZE', () => {
    for (const dim of [
      SPAWN_MARKER_WIDTH,
      SPAWN_MARKER_HEIGHT,
      SPAWN_MARKER_LENGTH,
    ]) {
      expect(dim).toBeGreaterThan(0)
      expect(dim).toBeLessThanOrEqual(CELL_SIZE)
    }
  })

  it('marker length is greater than width so the chevron has a forward axis', () => {
    expect(SPAWN_MARKER_LENGTH).toBeGreaterThan(SPAWN_MARKER_WIDTH)
  })
})

describe('CAR_* constants (REQ-047)', () => {
  it('CAR_BODY_COLOR / CAR_CABIN_COLOR / CAR_WHEEL_COLOR are valid 24-bit hex values', () => {
    for (const color of [CAR_BODY_COLOR, CAR_CABIN_COLOR, CAR_WHEEL_COLOR]) {
      expect(color).toBeGreaterThanOrEqual(0)
      expect(color).toBeLessThanOrEqual(0xffffff)
    }
  })

  it('body color and cabin color are distinct so the cabin reads against the body', () => {
    expect(CAR_BODY_COLOR).not.toBe(CAR_CABIN_COLOR)
  })

  it('every car dimension is positive and bounded by CELL_SIZE', () => {
    for (const dim of [
      CAR_LENGTH,
      CAR_WIDTH,
      CAR_BODY_HEIGHT,
      CAR_CABIN_LENGTH,
      CAR_CABIN_WIDTH,
      CAR_CABIN_HEIGHT,
      CAR_WHEEL_RADIUS,
      CAR_WHEEL_THICKNESS,
      CAR_WHEEL_INSET,
      CAR_AXLE_OFFSET,
      CAR_GROUND_LIFT,
    ]) {
      expect(dim).toBeGreaterThan(0)
      expect(dim).toBeLessThanOrEqual(CELL_SIZE)
    }
  })

  it('CAR_LENGTH is greater than CAR_WIDTH so the forward axis is unambiguous', () => {
    expect(CAR_LENGTH).toBeGreaterThan(CAR_WIDTH)
  })

  it('the cabin footprint stays inside the body footprint', () => {
    expect(CAR_CABIN_LENGTH).toBeLessThan(CAR_LENGTH)
    expect(CAR_CABIN_WIDTH).toBeLessThanOrEqual(CAR_WIDTH)
  })

  it('the wheels fit inside the body width once inset is applied', () => {
    // The wheel center sits at body half-width minus the inset; the
    // inset must be smaller than half the body width or wheels would
    // poke out past the body silhouette.
    expect(CAR_WHEEL_INSET).toBeLessThan(CAR_WIDTH / 2)
  })

  it('the front and rear axles are inside the body length', () => {
    // Axle offset is measured from the body's center along the local
    // z axis; the wheel must sit inside the body, not past its nose.
    expect(CAR_AXLE_OFFSET).toBeLessThan(CAR_LENGTH / 2)
  })

  it('CAR_CABIN_OFFSET keeps the cabin inside the body footprint', () => {
    // The cabin sits slightly toward the rear so the windscreen line
    // reads forward; the offset plus half the cabin length must fit
    // inside half the body length.
    expect(Math.abs(CAR_CABIN_OFFSET) + CAR_CABIN_LENGTH / 2).toBeLessThanOrEqual(
      CAR_LENGTH / 2,
    )
  })
})

describe('carWheelOffsets (REQ-047)', () => {
  it('returns four wheels: two front, two rear, two left, two right', () => {
    const offsets = carWheelOffsets()
    expect(offsets).toHaveLength(4)
    const fronts = offsets.filter((o) => o.axle === 'front')
    const rears = offsets.filter((o) => o.axle === 'rear')
    const lefts = offsets.filter((o) => o.side === 'left')
    const rights = offsets.filter((o) => o.side === 'right')
    expect(fronts).toHaveLength(2)
    expect(rears).toHaveLength(2)
    expect(lefts).toHaveLength(2)
    expect(rights).toHaveLength(2)
  })

  it('left and right wheels mirror across the body x axis', () => {
    const offsets = carWheelOffsets()
    const leftFront = offsets.find(
      (o) => o.side === 'left' && o.axle === 'front',
    )
    const rightFront = offsets.find(
      (o) => o.side === 'right' && o.axle === 'front',
    )
    expect(leftFront).toBeDefined()
    expect(rightFront).toBeDefined()
    if (!leftFront || !rightFront) return
    expect(leftFront.x).toBeCloseTo(-rightFront.x, 10)
    expect(leftFront.z).toBeCloseTo(rightFront.z, 10)
  })

  it('front and rear wheels mirror across the body z axis', () => {
    const offsets = carWheelOffsets()
    const leftFront = offsets.find(
      (o) => o.side === 'left' && o.axle === 'front',
    )
    const leftRear = offsets.find(
      (o) => o.side === 'left' && o.axle === 'rear',
    )
    expect(leftFront).toBeDefined()
    expect(leftRear).toBeDefined()
    if (!leftFront || !leftRear) return
    expect(leftFront.x).toBeCloseTo(leftRear.x, 10)
    expect(leftFront.z).toBeCloseTo(-leftRear.z, 10)
  })

  it('returns a fresh array on each call so callers cannot mutate a singleton', () => {
    const a = carWheelOffsets()
    const b = carWheelOffsets()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('every wheel sits inside the body footprint', () => {
    for (const offset of carWheelOffsets()) {
      // Account for the wheel thickness on the x axis: the wheel was
      // rotated to lie on its side, so its width along x is
      // CAR_WHEEL_THICKNESS, not the radius.
      expect(Math.abs(offset.x) + CAR_WHEEL_THICKNESS / 2).toBeLessThanOrEqual(
        CAR_WIDTH / 2,
      )
      expect(Math.abs(offset.z) + CAR_WHEEL_RADIUS).toBeLessThanOrEqual(
        CAR_LENGTH / 2,
      )
    }
  })
})

describe('carBodyY / carCabinY (REQ-047)', () => {
  it('the body sits above the wheels by the ground lift plus the wheel radius', () => {
    expect(carBodyY()).toBeCloseTo(
      CAR_GROUND_LIFT + CAR_WHEEL_RADIUS + CAR_BODY_HEIGHT / 2,
      10,
    )
  })

  it('the cabin sits on top of the body', () => {
    expect(carCabinY()).toBeCloseTo(
      CAR_GROUND_LIFT +
        CAR_WHEEL_RADIUS +
        CAR_BODY_HEIGHT +
        CAR_CABIN_HEIGHT / 2,
      10,
    )
  })

  it('cabin y is greater than body y so the silhouette reads as a car', () => {
    expect(carCabinY()).toBeGreaterThan(carBodyY())
  })
})
