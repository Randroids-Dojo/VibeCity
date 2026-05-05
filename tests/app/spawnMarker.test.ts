import { describe, expect, it } from 'vitest'
import {
  SPAWN_ARROW_HALF_PIXELS,
  SPAWN_ARROW_REACH_PIXELS,
  SPAWN_DIRECTION_LONG_LABEL,
  SPAWN_DIRECTION_VECTOR,
  SPAWN_MARKER_HALF_PIXELS,
  SPAWN_MARKER_INSET_PIXELS,
  spawnAnchorMarker,
  spawnAnchorReadout,
  type SpawnDirectionLabel,
} from '@/app/[slug]/edit/spawnMarker'
import { CELL_PIXELS, GRID_RADIUS } from '@/app/[slug]/edit/snapGrid'
import { EMPTY_CITY, type City, type Piece } from '@/lib/schemas'

/**
 * REQ-019, REQ-036: editor spawn-anchor marker.
 *
 * Pure pixel-space resolver. The SnapGridView renders the marker on the
 * spawn-anchor cell; this suite locks down the math so a future style
 * swap (different ring, different chevron) does not silently shift the
 * on-screen marker position or rotate the heading arrow off-axis.
 */

function piece(overrides: Partial<Piece> = {}): Piece {
  return {
    type: 'straight',
    row: 0,
    col: 0,
    rotation: 0,
    ...overrides,
  }
}

function cityWith(pieces: readonly Piece[]): City {
  return { pieces: pieces.slice(), buildings: [] }
}

describe('spawnMarker constants (REQ-019, REQ-036)', () => {
  it('SPAWN_MARKER_HALF_PIXELS is half a cell so the marker centers on the cell', () => {
    expect(SPAWN_MARKER_HALF_PIXELS).toBe(CELL_PIXELS / 2)
  })

  it('SPAWN_MARKER_INSET_PIXELS is positive and small enough to keep the ring inside the cell', () => {
    expect(SPAWN_MARKER_INSET_PIXELS).toBeGreaterThan(0)
    expect(SPAWN_MARKER_INSET_PIXELS).toBeLessThan(SPAWN_MARKER_HALF_PIXELS)
  })

  it('SPAWN_ARROW_REACH_PIXELS is positive and below half a cell so the chevron stays inside the cell', () => {
    expect(SPAWN_ARROW_REACH_PIXELS).toBeGreaterThan(0)
    expect(SPAWN_ARROW_REACH_PIXELS).toBeLessThan(SPAWN_MARKER_HALF_PIXELS)
  })

  it('SPAWN_ARROW_HALF_PIXELS is positive and smaller than the chevron reach so the triangle is taller than wide', () => {
    expect(SPAWN_ARROW_HALF_PIXELS).toBeGreaterThan(0)
    expect(SPAWN_ARROW_HALF_PIXELS).toBeLessThanOrEqual(SPAWN_ARROW_REACH_PIXELS)
  })

  it('SPAWN_DIRECTION_VECTOR maps each rotation to a unit vector facing the heading direction', () => {
    expect(SPAWN_DIRECTION_VECTOR[0]).toEqual({ x: 0, y: -1, label: 'N' })
    expect(SPAWN_DIRECTION_VECTOR[90]).toEqual({ x: 1, y: 0, label: 'E' })
    expect(SPAWN_DIRECTION_VECTOR[180]).toEqual({ x: 0, y: 1, label: 'S' })
    expect(SPAWN_DIRECTION_VECTOR[270]).toEqual({ x: -1, y: 0, label: 'W' })
  })

  it('SPAWN_DIRECTION_VECTOR labels are the four cardinal compass strings', () => {
    const labels = Object.values(SPAWN_DIRECTION_VECTOR).map((d) => d.label)
    expect(labels.sort()).toEqual(['E', 'N', 'S', 'W'])
  })
})

describe('spawnAnchorMarker (REQ-019, REQ-036)', () => {
  it('returns null on an empty city', () => {
    expect(spawnAnchorMarker(EMPTY_CITY)).toBeNull()
  })

  it('returns null on a city with only buildings (no pieces)', () => {
    const city: City = {
      pieces: [],
      buildings: [
        { type: 'small-house', row: 0, col: 0, rotation: 0 },
      ],
    }
    expect(spawnAnchorMarker(city)).toBeNull()
  })

  it('returns the first piece cell as the spawn anchor', () => {
    const city = cityWith([
      piece({ row: 2, col: -1, rotation: 0 }),
      piece({ row: 0, col: 0, rotation: 90 }),
    ])
    const marker = spawnAnchorMarker(city)
    expect(marker).not.toBeNull()
    expect(marker?.cellRow).toBe(2)
    expect(marker?.cellCol).toBe(-1)
  })

  it('mirrors the first piece rotation onto the marker shape', () => {
    const city = cityWith([piece({ rotation: 270 })])
    const marker = spawnAnchorMarker(city)
    expect(marker?.rotation).toBe(270)
    expect(marker?.direction).toBe('W')
  })

  it('places the ring inset by SPAWN_MARKER_INSET_PIXELS on a cell at the origin', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 0 })])
    const marker = spawnAnchorMarker(city)
    expect(marker).not.toBeNull()
    const expectedTopLeftX = GRID_RADIUS * CELL_PIXELS
    const expectedTopLeftY = GRID_RADIUS * CELL_PIXELS
    expect(marker?.ringX).toBe(expectedTopLeftX + SPAWN_MARKER_INSET_PIXELS)
    expect(marker?.ringY).toBe(expectedTopLeftY + SPAWN_MARKER_INSET_PIXELS)
    expect(marker?.ringSize).toBe(CELL_PIXELS - SPAWN_MARKER_INSET_PIXELS * 2)
  })

  it('translates the ring by CELL_PIXELS for an off-origin cell', () => {
    const city = cityWith([piece({ row: 1, col: 2, rotation: 0 })])
    const marker = spawnAnchorMarker(city)
    expect(marker).not.toBeNull()
    const expectedTopLeftX = (2 + GRID_RADIUS) * CELL_PIXELS
    const expectedTopLeftY = (1 + GRID_RADIUS) * CELL_PIXELS
    expect(marker?.ringX).toBe(expectedTopLeftX + SPAWN_MARKER_INSET_PIXELS)
    expect(marker?.ringY).toBe(expectedTopLeftY + SPAWN_MARKER_INSET_PIXELS)
  })

  it('north spawn arrow tip extends above the cell center by SPAWN_ARROW_REACH_PIXELS', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 0 })])
    const marker = spawnAnchorMarker(city)
    expect(marker).not.toBeNull()
    const centerX = GRID_RADIUS * CELL_PIXELS + SPAWN_MARKER_HALF_PIXELS
    const centerY = GRID_RADIUS * CELL_PIXELS + SPAWN_MARKER_HALF_PIXELS
    expect(marker?.tipX).toBe(centerX)
    expect(marker?.tipY).toBe(centerY - SPAWN_ARROW_REACH_PIXELS)
    expect(marker?.direction).toBe('N')
  })

  it('east spawn arrow tip extends right of the cell center by SPAWN_ARROW_REACH_PIXELS', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 90 })])
    const marker = spawnAnchorMarker(city)
    const centerX = GRID_RADIUS * CELL_PIXELS + SPAWN_MARKER_HALF_PIXELS
    const centerY = GRID_RADIUS * CELL_PIXELS + SPAWN_MARKER_HALF_PIXELS
    expect(marker?.tipX).toBe(centerX + SPAWN_ARROW_REACH_PIXELS)
    expect(marker?.tipY).toBe(centerY)
    expect(marker?.direction).toBe('E')
  })

  it('south spawn arrow tip extends below the cell center by SPAWN_ARROW_REACH_PIXELS', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 180 })])
    const marker = spawnAnchorMarker(city)
    const centerX = GRID_RADIUS * CELL_PIXELS + SPAWN_MARKER_HALF_PIXELS
    const centerY = GRID_RADIUS * CELL_PIXELS + SPAWN_MARKER_HALF_PIXELS
    expect(marker?.tipX).toBe(centerX)
    expect(marker?.tipY).toBe(centerY + SPAWN_ARROW_REACH_PIXELS)
    expect(marker?.direction).toBe('S')
  })

  it('west spawn arrow tip extends left of the cell center by SPAWN_ARROW_REACH_PIXELS', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 270 })])
    const marker = spawnAnchorMarker(city)
    const centerX = GRID_RADIUS * CELL_PIXELS + SPAWN_MARKER_HALF_PIXELS
    const centerY = GRID_RADIUS * CELL_PIXELS + SPAWN_MARKER_HALF_PIXELS
    expect(marker?.tipX).toBe(centerX - SPAWN_ARROW_REACH_PIXELS)
    expect(marker?.tipY).toBe(centerY)
    expect(marker?.direction).toBe('W')
  })

  it('points string carries three vertices in tip / leftBase / rightBase order', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 0 })])
    const marker = spawnAnchorMarker(city)
    expect(marker).not.toBeNull()
    const vertices = marker!.points.split(' ')
    expect(vertices).toHaveLength(3)
    const [tipPair] = vertices
    const [tipXStr, tipYStr] = tipPair.split(',')
    expect(Number(tipXStr)).toBe(marker!.tipX)
    expect(Number(tipYStr)).toBe(marker!.tipY)
  })

  it('chevron base vertices are perpendicular to the heading and equidistant from the base midpoint', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 0 })])
    const marker = spawnAnchorMarker(city)
    expect(marker).not.toBeNull()
    const vertices = marker!.points.split(' ').map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return { x, y }
    })
    const tip = vertices[0]
    const left = vertices[1]
    const right = vertices[2]
    // Tip is north (above) the base midpoint; both base vertices share
    // the same y so they read as a horizontal base for a north-facing
    // chevron.
    expect(left.y).toBe(right.y)
    expect(tip.y).toBeLessThan(left.y)
    // Left and right base vertices straddle the tip on the x axis at
    // equal distance.
    const dxLeft = Math.abs(tip.x - left.x)
    const dxRight = Math.abs(tip.x - right.x)
    expect(dxLeft).toBeCloseTo(dxRight, 6)
    expect(dxLeft).toBeCloseTo(SPAWN_ARROW_HALF_PIXELS, 6)
  })

  it('produces finite numeric vertices for every cardinal rotation', () => {
    const rotations = [0, 90, 180, 270] as const
    for (const rotation of rotations) {
      const city = cityWith([piece({ row: 0, col: 0, rotation })])
      const marker = spawnAnchorMarker(city)
      expect(marker).not.toBeNull()
      expect(Number.isFinite(marker!.tipX)).toBe(true)
      expect(Number.isFinite(marker!.tipY)).toBe(true)
      expect(Number.isFinite(marker!.ringX)).toBe(true)
      expect(Number.isFinite(marker!.ringY)).toBe(true)
      expect(Number.isFinite(marker!.ringSize)).toBe(true)
      const verts = marker!.points.split(' ')
      expect(verts).toHaveLength(3)
      for (const v of verts) {
        const [x, y] = v.split(',').map(Number)
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
      }
    }
  })

  it('returns a fresh object on every call so callers cannot mutate cached state', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 0 })])
    const a = spawnAnchorMarker(city)
    const b = spawnAnchorMarker(city)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('does not mutate the input city', () => {
    const city = cityWith([piece({ row: 1, col: 2, rotation: 90 })])
    const snapshot = JSON.stringify(city)
    spawnAnchorMarker(city)
    expect(JSON.stringify(city)).toBe(snapshot)
  })

  it('spawn anchor agrees with driveScene spawnAnchor on the first piece', async () => {
    // Cross-check: editor marker should mirror the substrate spawnAnchor
    // contract from src/app/[slug]/driveScene.ts so the editor cue
    // agrees with the live drive-scene behavior.
    const { spawnAnchor } = await import('@/app/[slug]/driveScene')
    const city = cityWith([
      piece({ row: 3, col: -2, rotation: 180 }),
      piece({ row: 0, col: 0, rotation: 0 }),
    ])
    const marker = spawnAnchorMarker(city)
    const anchor = spawnAnchor(city.pieces)
    expect(marker?.cellRow).toBe(anchor.row)
    expect(marker?.cellCol).toBe(anchor.col)
  })
})

describe('SPAWN_DIRECTION_LONG_LABEL (REQ-019, REQ-036)', () => {
  it('maps each compass label to its full English word', () => {
    expect(SPAWN_DIRECTION_LONG_LABEL.N).toBe('North')
    expect(SPAWN_DIRECTION_LONG_LABEL.E).toBe('East')
    expect(SPAWN_DIRECTION_LONG_LABEL.S).toBe('South')
    expect(SPAWN_DIRECTION_LONG_LABEL.W).toBe('West')
  })

  it('covers every cardinal compass label without duplicates', () => {
    const values = Object.values(SPAWN_DIRECTION_LONG_LABEL)
    expect(values).toHaveLength(4)
    expect(new Set(values).size).toBe(4)
  })

  it('every long label is non-empty and trims to the same word', () => {
    for (const label of ['N', 'E', 'S', 'W'] as const) {
      const long = SPAWN_DIRECTION_LONG_LABEL[label]
      expect(long.length).toBeGreaterThan(0)
      expect(long.trim()).toBe(long)
    }
  })
})

describe('spawnAnchorReadout (REQ-019, REQ-036)', () => {
  it('returns null on an empty city', () => {
    expect(spawnAnchorReadout(EMPTY_CITY)).toBeNull()
  })

  it('returns null on a city with only buildings (no pieces)', () => {
    const city: City = {
      pieces: [],
      buildings: [
        { type: 'small-house', row: 0, col: 0, rotation: 0 },
      ],
    }
    expect(spawnAnchorReadout(city)).toBeNull()
  })

  it('returns the first piece cell and direction at rotation 0 (North)', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 0 })])
    const readout = spawnAnchorReadout(city)
    expect(readout).not.toBeNull()
    expect(readout?.cellRow).toBe(0)
    expect(readout?.cellCol).toBe(0)
    expect(readout?.direction).toBe('N')
    expect(readout?.text).toBe('Spawn: (0, 0) facing North')
  })

  it('emits the East long label for rotation 90', () => {
    const city = cityWith([piece({ row: 1, col: 2, rotation: 90 })])
    const readout = spawnAnchorReadout(city)
    expect(readout?.direction).toBe('E')
    expect(readout?.text).toBe('Spawn: (1, 2) facing East')
  })

  it('emits the South long label for rotation 180', () => {
    const city = cityWith([piece({ row: -3, col: 4, rotation: 180 })])
    const readout = spawnAnchorReadout(city)
    expect(readout?.direction).toBe('S')
    expect(readout?.text).toBe('Spawn: (-3, 4) facing South')
  })

  it('emits the West long label for rotation 270', () => {
    const city = cityWith([piece({ row: 5, col: -2, rotation: 270 })])
    const readout = spawnAnchorReadout(city)
    expect(readout?.direction).toBe('W')
    expect(readout?.text).toBe('Spawn: (5, -2) facing West')
  })

  it('mirrors pieces[0] not the most recently placed piece', () => {
    // Drive-scene spawn anchor reads pieces[0] (the first placed piece),
    // not the most recently placed; the readout must agree.
    const city = cityWith([
      piece({ row: 2, col: -1, rotation: 0 }),
      piece({ row: 0, col: 0, rotation: 90 }),
    ])
    const readout = spawnAnchorReadout(city)
    expect(readout?.cellRow).toBe(2)
    expect(readout?.cellCol).toBe(-1)
    expect(readout?.direction).toBe('N')
  })

  it('readout direction agrees with spawnAnchorMarker direction for every rotation', () => {
    const rotations = [0, 90, 180, 270] as const
    for (const rotation of rotations) {
      const city = cityWith([piece({ row: 1, col: -1, rotation })])
      const readout = spawnAnchorReadout(city)
      const marker = spawnAnchorMarker(city)
      expect(readout?.direction).toBe(marker?.direction)
      expect(readout?.cellRow).toBe(marker?.cellRow)
      expect(readout?.cellCol).toBe(marker?.cellCol)
    }
  })

  it('returns a fresh object on every call so callers cannot mutate cached state', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 0 })])
    const a = spawnAnchorReadout(city)
    const b = spawnAnchorReadout(city)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('does not mutate the input city', () => {
    const city = cityWith([piece({ row: 1, col: 2, rotation: 90 })])
    const snapshot = JSON.stringify(city)
    spawnAnchorReadout(city)
    expect(JSON.stringify(city)).toBe(snapshot)
  })

  it('text mentions the direction long-label so the reader does not have to translate the compass letter', () => {
    const labels: SpawnDirectionLabel[] = ['N', 'E', 'S', 'W']
    for (const label of labels) {
      const rotation = (label === 'N' ? 0 : label === 'E' ? 90 : label === 'S' ? 180 : 270) as 0 | 90 | 180 | 270
      const city = cityWith([piece({ rotation })])
      const readout = spawnAnchorReadout(city)
      expect(readout?.text).toContain(SPAWN_DIRECTION_LONG_LABEL[label])
    }
  })

  it('text starts with "Spawn:" so the toolbar readout is visually distinct from the other toolbar readouts', () => {
    const city = cityWith([piece({ row: 0, col: 0, rotation: 0 })])
    const readout = spawnAnchorReadout(city)
    expect(readout?.text.startsWith('Spawn:')).toBe(true)
  })
})
