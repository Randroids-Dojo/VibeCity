import type { Piece } from '@/lib/schemas'

/**
 * Ambient AI traffic (drive-mode visual fun). N small cars roam the
 * placed street cells while the player is in drive mode. v1 keeps the
 * behavior simple: each car picks a starting street cell and one of
 * the four cardinal directions, then drives in a straight line at a
 * constant speed. When a car leaves the grid bounds it respawns on a
 * random street cell with a random direction. No turning, no collision,
 * no interaction with the player's vehicle.
 *
 * The module is pure so the per-frame step is unit-testable with no
 * three.js scene dependency. The caller (DriveSceneClient) owns the
 * mesh group lifecycle and reads `{x, z, headingY}` per car each
 * frame.
 */

export type CardinalDir = 'east' | 'west' | 'north' | 'south'

export interface AmbientCar {
  x: number
  z: number
  dir: CardinalDir
  speed: number
  colorHex: number
}

export const AMBIENT_CAR_SPEED = 6
export const AMBIENT_CAR_COUNT = 12

/**
 * Per-resident divisor for population-scaled ambient car spawning
 * (REQ-077 follow-on). Each `RESIDENTS_PER_AMBIENT_CAR` residents
 * unlocks one ambient car, capped at `AMBIENT_CAR_COUNT`. With the
 * residential density ladder (1=4, 2=12, 3=40), this maps:
 *   - 1 small house (4 residents) -> 1 ambient car
 *   - 1 mid house  (12 residents) -> 2 ambient cars
 *   - 1 apartment  (40 residents) -> 5 ambient cars
 *   - ~96 residents -> capped at 12 (full fleet)
 *
 * Empty cities get 0 ambient cars; the player's vehicle is a
 * separate group and is not affected.
 */
export const RESIDENTS_PER_AMBIENT_CAR = 8

export function ambientCarCountForPopulation(
  totalPopulation: number,
): number {
  if (!Number.isFinite(totalPopulation) || totalPopulation <= 0) return 0
  return Math.min(
    AMBIENT_CAR_COUNT,
    Math.ceil(totalPopulation / RESIDENTS_PER_AMBIENT_CAR),
  )
}
export const AMBIENT_CAR_COLORS = [
  0xc44d56, 0x4d8bc4, 0x4dc476, 0xd4b34d, 0x9d4dc4, 0xd47e4d, 0x4dc4c4,
] as const

const CARDINALS: CardinalDir[] = ['east', 'west', 'north', 'south']

export function dirToVector(dir: CardinalDir): { dx: number; dz: number } {
  switch (dir) {
    case 'east':
      return { dx: 1, dz: 0 }
    case 'west':
      return { dx: -1, dz: 0 }
    case 'north':
      return { dx: 0, dz: -1 }
    case 'south':
      return { dx: 0, dz: 1 }
  }
}

/**
 * Y-axis rotation (radians) for a car oriented along the given
 * direction. Mirrors the player car's convention: rotation.y = 0
 * faces +X (east).
 */
export function dirToHeadingY(dir: CardinalDir): number {
  switch (dir) {
    case 'east':
      return 0
    case 'south':
      return Math.PI / 2
    case 'west':
      return Math.PI
    case 'north':
      return -Math.PI / 2
  }
}

export interface AmbientBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * Pick a random integer in `[0, max)` using the supplied rng. The rng
 * is supplied so tests can pass a deterministic sequence and
 * production can pass `Math.random`.
 */
export type Rng = () => number

function pickIndex(rng: Rng, max: number): number {
  if (max <= 0) return 0
  return Math.min(max - 1, Math.floor(rng() * max))
}

/**
 * Spawn one ambient car on a random street cell with a random
 * cardinal direction. Returns null if no street cells exist.
 */
export function spawnAmbientCar(
  streetCells: ReadonlyArray<{ x: number; z: number }>,
  rng: Rng,
  colorHex: number,
): AmbientCar | null {
  if (streetCells.length === 0) return null
  const cell = streetCells[pickIndex(rng, streetCells.length)]
  const dir = CARDINALS[pickIndex(rng, CARDINALS.length)]
  return {
    x: cell.x,
    z: cell.z,
    dir,
    speed: AMBIENT_CAR_SPEED,
    colorHex,
  }
}

/**
 * Advance one ambient car by `dt` seconds. If the car leaves the
 * grid bounds, respawn on a random street cell. The respawn uses
 * the supplied rng so two replays with the same rng sequence
 * produce identical paths.
 */
export function stepAmbientCar(
  car: AmbientCar,
  dt: number,
  bounds: AmbientBounds,
  streetCells: ReadonlyArray<{ x: number; z: number }>,
  rng: Rng,
): AmbientCar {
  const { dx, dz } = dirToVector(car.dir)
  const nextX = car.x + dx * car.speed * dt
  const nextZ = car.z + dz * car.speed * dt
  if (
    nextX < bounds.minX ||
    nextX > bounds.maxX ||
    nextZ < bounds.minZ ||
    nextZ > bounds.maxZ
  ) {
    const respawned = spawnAmbientCar(streetCells, rng, car.colorHex)
    if (respawned === null) return car
    return respawned
  }
  return { ...car, x: nextX, z: nextZ }
}

/**
 * Initial spawn of `count` ambient cars across the supplied street
 * cells. Colors cycle through `AMBIENT_CAR_COLORS` so a small set of
 * cars reads as a varied fleet rather than a uniform color.
 */
export function spawnAmbientFleet(
  streetCells: ReadonlyArray<{ x: number; z: number }>,
  count: number,
  rng: Rng,
): AmbientCar[] {
  const fleet: AmbientCar[] = []
  for (let i = 0; i < count; i++) {
    const color = AMBIENT_CAR_COLORS[i % AMBIENT_CAR_COLORS.length]
    const car = spawnAmbientCar(streetCells, rng, color)
    if (car !== null) fleet.push(car)
  }
  return fleet
}

/**
 * Convert the placed pieces array into an array of street-cell world
 * coordinates that an ambient car can spawn on. The caller supplies a
 * `cellToWorld` function so the module stays free of the world-grid
 * geometry constants.
 */
export function streetCellWorldCenters(
  pieces: ReadonlyArray<Piece>,
  pieceFootprint: (piece: Piece) => Array<{ row: number; col: number }>,
  cellToWorld: (row: number, col: number) => { x: number; z: number },
): Array<{ x: number; z: number }> {
  const seen = new Set<string>()
  const cells: Array<{ x: number; z: number }> = []
  for (const piece of pieces) {
    for (const cell of pieceFootprint(piece)) {
      const key = `${cell.row},${cell.col}`
      if (seen.has(key)) continue
      seen.add(key)
      cells.push(cellToWorld(cell.row, cell.col))
    }
  }
  return cells
}
