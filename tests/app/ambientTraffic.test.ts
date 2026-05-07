import { describe, it, expect } from 'vitest'
import {
  AMBIENT_CAR_COLORS,
  AMBIENT_CAR_COUNT,
  AMBIENT_CAR_SPEED,
  ambientCarCountForPopulation,
  dirToHeadingY,
  dirToVector,
  RESIDENTS_PER_AMBIENT_CAR,
  spawnAmbientCar,
  spawnAmbientFleet,
  stepAmbientCar,
  type AmbientBounds,
  type AmbientCar,
  type Rng,
} from '@/app/[slug]/ambientTraffic'

const STREET = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 0, z: 10 },
  { x: 10, z: 10 },
]

const BOUNDS: AmbientBounds = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50,
}

function seqRng(values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length]
}

describe('AMBIENT_CAR_COUNT and AMBIENT_CAR_SPEED', () => {
  it('count is positive', () => {
    expect(AMBIENT_CAR_COUNT).toBeGreaterThan(0)
  })

  it('speed is positive', () => {
    expect(AMBIENT_CAR_SPEED).toBeGreaterThan(0)
  })

  it('colors palette has at least one entry', () => {
    expect(AMBIENT_CAR_COLORS.length).toBeGreaterThan(0)
  })
})

describe('ambientCarCountForPopulation', () => {
  it('returns 0 for an empty city', () => {
    expect(ambientCarCountForPopulation(0)).toBe(0)
  })

  it('returns 0 for a negative population (defensive)', () => {
    expect(ambientCarCountForPopulation(-5)).toBe(0)
  })

  it('one ambient car per RESIDENTS_PER_AMBIENT_CAR threshold (ceil semantics)', () => {
    expect(ambientCarCountForPopulation(1)).toBe(1)
    expect(ambientCarCountForPopulation(RESIDENTS_PER_AMBIENT_CAR)).toBe(1)
    expect(ambientCarCountForPopulation(RESIDENTS_PER_AMBIENT_CAR + 1)).toBe(2)
  })

  it('caps at AMBIENT_CAR_COUNT regardless of how large population gets', () => {
    expect(ambientCarCountForPopulation(10_000)).toBe(AMBIENT_CAR_COUNT)
  })

  it('one small house (4 residents) yields 1 car under default RESIDENTS_PER_AMBIENT_CAR=8', () => {
    expect(ambientCarCountForPopulation(4)).toBe(1)
  })

  it('one apartment (40 residents) yields 5 cars under default', () => {
    expect(ambientCarCountForPopulation(40)).toBe(5)
  })
})

describe('dirToVector', () => {
  it('east heads +x', () => {
    expect(dirToVector('east')).toEqual({ dx: 1, dz: 0 })
  })

  it('west heads -x', () => {
    expect(dirToVector('west')).toEqual({ dx: -1, dz: 0 })
  })

  it('north heads -z', () => {
    expect(dirToVector('north')).toEqual({ dx: 0, dz: -1 })
  })

  it('south heads +z', () => {
    expect(dirToVector('south')).toEqual({ dx: 0, dz: 1 })
  })
})

describe('dirToHeadingY', () => {
  it('east is 0', () => {
    expect(dirToHeadingY('east')).toBe(0)
  })

  it('south is +pi/2', () => {
    expect(dirToHeadingY('south')).toBeCloseTo(Math.PI / 2, 5)
  })

  it('west is pi', () => {
    expect(dirToHeadingY('west')).toBeCloseTo(Math.PI, 5)
  })

  it('north is -pi/2', () => {
    expect(dirToHeadingY('north')).toBeCloseTo(-Math.PI / 2, 5)
  })
})

describe('spawnAmbientCar', () => {
  it('returns null when no street cells exist', () => {
    expect(spawnAmbientCar([], () => 0, 0xffffff)).toBeNull()
  })

  it('places the car at one of the supplied street cells', () => {
    const car = spawnAmbientCar(STREET, () => 0, 0xff0000)
    expect(car).not.toBeNull()
    const matchedCell = STREET.find(
      (c) => c.x === car!.x && c.z === car!.z,
    )
    expect(matchedCell).toBeDefined()
  })

  it('uses the supplied rng deterministically', () => {
    // rng -> [0.0, 0.0] picks index 0 cell + index 0 dir
    const a = spawnAmbientCar(STREET, seqRng([0, 0]), 0xff0000)
    const b = spawnAmbientCar(STREET, seqRng([0, 0]), 0xff0000)
    expect(a).toEqual(b)
  })

  it('honors the supplied color', () => {
    const car = spawnAmbientCar(STREET, () => 0, 0xabcdef)
    expect(car!.colorHex).toBe(0xabcdef)
  })
})

describe('stepAmbientCar', () => {
  it('advances east by speed * dt', () => {
    const car: AmbientCar = {
      x: 0,
      z: 0,
      dir: 'east',
      speed: AMBIENT_CAR_SPEED,
      colorHex: 0xff0000,
    }
    const next = stepAmbientCar(car, 1, BOUNDS, STREET, () => 0)
    expect(next.x).toBe(AMBIENT_CAR_SPEED)
    expect(next.z).toBe(0)
    expect(next.dir).toBe('east')
  })

  it('respawns when leaving bounds via +x', () => {
    const car: AmbientCar = {
      x: BOUNDS.maxX,
      z: 0,
      dir: 'east',
      speed: 1000,
      colorHex: 0xff0000,
    }
    // rng -> picks cell index 0 and dir index 0
    const next = stepAmbientCar(car, 1, BOUNDS, STREET, seqRng([0, 0]))
    // Respawn at STREET[0] = (0, 0) with east direction
    expect(next.x).toBe(0)
    expect(next.z).toBe(0)
  })

  it('respawn uses the supplied rng deterministically', () => {
    const car: AmbientCar = {
      x: BOUNDS.maxX,
      z: 0,
      dir: 'east',
      speed: 1000,
      colorHex: 0xff0000,
    }
    const a = stepAmbientCar(car, 1, BOUNDS, STREET, seqRng([0.5, 0.5]))
    const b = stepAmbientCar(car, 1, BOUNDS, STREET, seqRng([0.5, 0.5]))
    expect(a).toEqual(b)
  })

  it('preserves colorHex through respawn', () => {
    const car: AmbientCar = {
      x: BOUNDS.maxX + 1,
      z: 0,
      dir: 'east',
      speed: 1,
      colorHex: 0xabcdef,
    }
    const next = stepAmbientCar(car, 1, BOUNDS, STREET, seqRng([0, 0]))
    expect(next.colorHex).toBe(0xabcdef)
  })

  it('returns the same car when bounds are exited but no street cells exist', () => {
    const car: AmbientCar = {
      x: BOUNDS.maxX + 1,
      z: 0,
      dir: 'east',
      speed: 1,
      colorHex: 0xff0000,
    }
    const next = stepAmbientCar(car, 1, BOUNDS, [], () => 0)
    expect(next).toBe(car)
  })
})

describe('spawnAmbientFleet', () => {
  it('returns an empty fleet when there are no street cells', () => {
    expect(spawnAmbientFleet([], 5, () => 0)).toEqual([])
  })

  it('returns the requested count when street cells exist', () => {
    const fleet = spawnAmbientFleet(STREET, 7, () => 0)
    expect(fleet).toHaveLength(7)
  })

  it('cycles through AMBIENT_CAR_COLORS so the first color is used first', () => {
    const fleet = spawnAmbientFleet(STREET, 3, () => 0)
    expect(fleet[0].colorHex).toBe(AMBIENT_CAR_COLORS[0])
    expect(fleet[1].colorHex).toBe(AMBIENT_CAR_COLORS[1])
    expect(fleet[2].colorHex).toBe(AMBIENT_CAR_COLORS[2])
  })

  it('two fleets built with the same rng sequence are identical', () => {
    const a = spawnAmbientFleet(STREET, 5, seqRng([0.1, 0.2, 0.3, 0.4, 0.5]))
    const b = spawnAmbientFleet(STREET, 5, seqRng([0.1, 0.2, 0.3, 0.4, 0.5]))
    expect(a).toEqual(b)
  })
})
