import { describe, expect, it } from 'vitest'
import {
  DIR_E,
  DIR_N,
  DIR_NE,
  DIR_NW,
  DIR_OFFSETS,
  DIR_S,
  DIR_SE,
  DIR_SW,
  DIR_W,
  connectorPortsOf,
  connectorsOf,
  isCardinal,
  isCorner,
  opposite,
  portsFaceEachOther,
  type Dir,
} from '@/lib/connectors'
import type { PieceType, Rotation } from '@/lib/schemas'
import { PieceTypeSchema } from '@/lib/schemas'

/**
 * REQ-063: 8-direction connector substrate.
 *
 * Tests cover the direction primitives (`Dir`, `DIR_OFFSETS`,
 * `opposite`, `isCardinal`, `isCorner`), the connector port resolver
 * for every piece type in VibeCity's v1 taxonomy across every cardinal
 * rotation, and the cardinal-vs-corner port-match classifier. This is
 * the substrate that future slices (REQ-064 segment-based path,
 * REQ-065 multi-locator wheel contact, REQ-019 intersection runtime)
 * build on; the validator across two adjacent placed pieces lives in
 * its own slice when REQ-064 lands.
 */

const ALL_DIRS: readonly Dir[] = [0, 1, 2, 3, 4, 5, 6, 7] as const
const ALL_ROTATIONS: readonly Rotation[] = [0, 90, 180, 270] as const

describe('Dir constants (REQ-063)', () => {
  it('assigns the canonical compass values 0..7 clockwise from north', () => {
    expect(DIR_N).toBe(0)
    expect(DIR_NE).toBe(1)
    expect(DIR_E).toBe(2)
    expect(DIR_SE).toBe(3)
    expect(DIR_S).toBe(4)
    expect(DIR_SW).toBe(5)
    expect(DIR_W).toBe(6)
    expect(DIR_NW).toBe(7)
  })

  it('every Dir constant is unique', () => {
    const values = [DIR_N, DIR_NE, DIR_E, DIR_SE, DIR_S, DIR_SW, DIR_W, DIR_NW]
    expect(new Set(values).size).toBe(values.length)
  })

  it('the constants cover every value in 0..7', () => {
    const values = new Set([
      DIR_N,
      DIR_NE,
      DIR_E,
      DIR_SE,
      DIR_S,
      DIR_SW,
      DIR_W,
      DIR_NW,
    ])
    for (const d of ALL_DIRS) {
      expect(values.has(d)).toBe(true)
    }
  })
})

describe('DIR_OFFSETS (REQ-063)', () => {
  it('north steps row -1, column 0', () => {
    expect(DIR_OFFSETS[DIR_N]).toEqual({ dr: -1, dc: 0 })
  })

  it('east steps row 0, column +1', () => {
    expect(DIR_OFFSETS[DIR_E]).toEqual({ dr: 0, dc: 1 })
  })

  it('south steps row +1, column 0', () => {
    expect(DIR_OFFSETS[DIR_S]).toEqual({ dr: 1, dc: 0 })
  })

  it('west steps row 0, column -1', () => {
    expect(DIR_OFFSETS[DIR_W]).toEqual({ dr: 0, dc: -1 })
  })

  it('corner directions step diagonally one row and one column', () => {
    expect(DIR_OFFSETS[DIR_NE]).toEqual({ dr: -1, dc: 1 })
    expect(DIR_OFFSETS[DIR_SE]).toEqual({ dr: 1, dc: 1 })
    expect(DIR_OFFSETS[DIR_SW]).toEqual({ dr: 1, dc: -1 })
    expect(DIR_OFFSETS[DIR_NW]).toEqual({ dr: -1, dc: -1 })
  })

  it('every Dir has an entry', () => {
    for (const d of ALL_DIRS) {
      expect(DIR_OFFSETS[d]).toBeDefined()
    }
  })

  it('opposite directions cancel: offset(d) + offset(opposite(d)) is zero', () => {
    for (const d of ALL_DIRS) {
      const a = DIR_OFFSETS[d]
      const b = DIR_OFFSETS[opposite(d)]
      expect(a.dr + b.dr).toBe(0)
      expect(a.dc + b.dc).toBe(0)
    }
  })
})

describe('opposite (REQ-063)', () => {
  it('opposite(N) === S, opposite(E) === W, etc.', () => {
    expect(opposite(DIR_N)).toBe(DIR_S)
    expect(opposite(DIR_E)).toBe(DIR_W)
    expect(opposite(DIR_S)).toBe(DIR_N)
    expect(opposite(DIR_W)).toBe(DIR_E)
    expect(opposite(DIR_NE)).toBe(DIR_SW)
    expect(opposite(DIR_SE)).toBe(DIR_NW)
    expect(opposite(DIR_SW)).toBe(DIR_NE)
    expect(opposite(DIR_NW)).toBe(DIR_SE)
  })

  it('opposite is an involution: opposite(opposite(d)) === d', () => {
    for (const d of ALL_DIRS) {
      expect(opposite(opposite(d))).toBe(d)
    }
  })

  it('opposite(d) === (d + 4) % 8', () => {
    for (const d of ALL_DIRS) {
      expect(opposite(d)).toBe(((d + 4) % 8) as Dir)
    }
  })
})

describe('isCardinal / isCorner (REQ-063)', () => {
  it('cardinal directions (N, E, S, W) are cardinal', () => {
    for (const d of [DIR_N, DIR_E, DIR_S, DIR_W]) {
      expect(isCardinal(d)).toBe(true)
      expect(isCorner(d)).toBe(false)
    }
  })

  it('corner directions (NE, SE, SW, NW) are corners', () => {
    for (const d of [DIR_NE, DIR_SE, DIR_SW, DIR_NW]) {
      expect(isCardinal(d)).toBe(false)
      expect(isCorner(d)).toBe(true)
    }
  })

  it('every direction is exactly one of cardinal or corner', () => {
    for (const d of ALL_DIRS) {
      expect(isCardinal(d) !== isCorner(d)).toBe(true)
    }
  })
})

describe('connectorPortsOf for cardinal-only pieces (REQ-063)', () => {
  it('straight at rotation 0 has S -> N ports', () => {
    const ports = connectorPortsOf({ type: 'straight', rotation: 0 })
    expect(ports).toEqual([
      { dr: 0, dc: 0, dir: DIR_S },
      { dr: 0, dc: 0, dir: DIR_N },
    ])
  })

  it('straight at rotation 90 rotates S -> N to W -> E (clockwise)', () => {
    const ports = connectorPortsOf({ type: 'straight', rotation: 90 })
    expect(ports).toEqual([
      { dr: 0, dc: 0, dir: DIR_W },
      { dr: 0, dc: 0, dir: DIR_E },
    ])
  })

  it('straight rotates through the full cardinal cycle', () => {
    const r0 = connectorPortsOf({ type: 'straight', rotation: 0 }).map(
      (p) => p.dir,
    )
    const r90 = connectorPortsOf({ type: 'straight', rotation: 90 }).map(
      (p) => p.dir,
    )
    const r180 = connectorPortsOf({ type: 'straight', rotation: 180 }).map(
      (p) => p.dir,
    )
    const r270 = connectorPortsOf({ type: 'straight', rotation: 270 }).map(
      (p) => p.dir,
    )
    expect(r0).toEqual([DIR_S, DIR_N])
    expect(r90).toEqual([DIR_W, DIR_E])
    expect(r180).toEqual([DIR_N, DIR_S])
    expect(r270).toEqual([DIR_E, DIR_W])
  })

  it('left90 at rotation 0 has S -> W ports', () => {
    const ports = connectorPortsOf({ type: 'left90', rotation: 0 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_S, DIR_W])
  })

  it('right90 at rotation 0 has S -> E ports', () => {
    const ports = connectorPortsOf({ type: 'right90', rotation: 0 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_S, DIR_E])
  })

  it('scurve and scurveLeft both have S -> N ports at rotation 0', () => {
    expect(connectorsOf({ type: 'scurve', rotation: 0 })).toEqual([DIR_S, DIR_N])
    expect(connectorsOf({ type: 'scurveLeft', rotation: 0 })).toEqual([
      DIR_S,
      DIR_N,
    ])
  })

  it('sweepRight has S -> E and sweepLeft has S -> W at rotation 0', () => {
    expect(connectorsOf({ type: 'sweepRight', rotation: 0 })).toEqual([
      DIR_S,
      DIR_E,
    ])
    expect(connectorsOf({ type: 'sweepLeft', rotation: 0 })).toEqual([
      DIR_S,
      DIR_W,
    ])
  })

  it('megaSweepRight has S -> E and megaSweepLeft has S -> W at rotation 0', () => {
    expect(connectorsOf({ type: 'megaSweepRight', rotation: 0 })).toEqual([
      DIR_S,
      DIR_E,
    ])
    expect(connectorsOf({ type: 'megaSweepLeft', rotation: 0 })).toEqual([
      DIR_S,
      DIR_W,
    ])
  })

  it('places every cardinal-only port at the anchor cell (dr=0, dc=0)', () => {
    const types: PieceType[] = [
      'straight',
      'left90',
      'right90',
      'scurve',
      'scurveLeft',
      'sweepRight',
      'sweepLeft',
      'megaSweepRight',
      'megaSweepLeft',
    ]
    for (const type of types) {
      for (const rotation of ALL_ROTATIONS) {
        const ports = connectorPortsOf({ type, rotation })
        for (const port of ports) {
          expect(port.dr).toBe(0)
          expect(port.dc).toBe(0)
        }
      }
    }
  })
})

describe('connectorPortsOf for arc45 (REQ-063, REQ-061)', () => {
  it('arc45 at rotation 0 has S (cardinal) -> NE (corner)', () => {
    const ports = connectorPortsOf({ type: 'arc45', rotation: 0 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_S, DIR_NE])
  })

  it('arc45 at rotation 90 rotates S -> NE to W -> SE', () => {
    const ports = connectorPortsOf({ type: 'arc45', rotation: 90 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_W, DIR_SE])
  })

  it('arc45 at rotation 180 rotates S -> NE to N -> SW', () => {
    const ports = connectorPortsOf({ type: 'arc45', rotation: 180 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_N, DIR_SW])
  })

  it('arc45 at rotation 270 rotates S -> NE to E -> NW', () => {
    const ports = connectorPortsOf({ type: 'arc45', rotation: 270 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_E, DIR_NW])
  })

  it('arc45 mixes one cardinal and one corner port at every rotation', () => {
    for (const rotation of ALL_ROTATIONS) {
      const ports = connectorPortsOf({ type: 'arc45', rotation })
      const cardinals = ports.filter((p) => isCardinal(p.dir))
      const corners = ports.filter((p) => isCorner(p.dir))
      expect(cardinals).toHaveLength(1)
      expect(corners).toHaveLength(1)
    }
  })
})

describe('connectorPortsOf for diagonal (REQ-063, REQ-062)', () => {
  it('diagonal at rotation 0 has SW -> NE (both corner)', () => {
    const ports = connectorPortsOf({ type: 'diagonal', rotation: 0 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_SW, DIR_NE])
  })

  it('diagonal at rotation 90 rotates SW -> NE to NW -> SE', () => {
    const ports = connectorPortsOf({ type: 'diagonal', rotation: 90 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_NW, DIR_SE])
  })

  it('diagonal at rotation 180 walks back to NE -> SW (mirror across the anchor)', () => {
    const ports = connectorPortsOf({ type: 'diagonal', rotation: 180 })
    expect(ports.map((p) => p.dir)).toEqual([DIR_NE, DIR_SW])
  })

  it('diagonal has two corner ports at every rotation', () => {
    for (const rotation of ALL_ROTATIONS) {
      const ports = connectorPortsOf({ type: 'diagonal', rotation })
      for (const port of ports) {
        expect(isCorner(port.dir)).toBe(true)
      }
    }
  })
})

describe('connectorPortsOf for intersection (REQ-063, REQ-019)', () => {
  it('intersection at rotation 0 has all four cardinal ports (N, E, S, W)', () => {
    const ports = connectorPortsOf({ type: 'intersection', rotation: 0 })
    expect(ports.map((p) => p.dir).sort()).toEqual(
      [DIR_N, DIR_E, DIR_S, DIR_W].sort(),
    )
  })

  it('intersection rotation is rotation-equivalent (a 4-way is symmetric under cardinal rotation)', () => {
    const r0 = new Set(
      connectorPortsOf({ type: 'intersection', rotation: 0 }).map((p) => p.dir),
    )
    for (const rotation of ALL_ROTATIONS) {
      const ports = connectorPortsOf({ type: 'intersection', rotation })
      const dirs = new Set(ports.map((p) => p.dir))
      expect(dirs).toEqual(r0)
    }
  })

  it('intersection ports all live at the anchor cell', () => {
    for (const rotation of ALL_ROTATIONS) {
      const ports = connectorPortsOf({ type: 'intersection', rotation })
      for (const port of ports) {
        expect(port.dr).toBe(0)
        expect(port.dc).toBe(0)
      }
    }
  })

  it('every intersection port is cardinal', () => {
    for (const rotation of ALL_ROTATIONS) {
      const ports = connectorPortsOf({ type: 'intersection', rotation })
      for (const port of ports) {
        expect(isCardinal(port.dir)).toBe(true)
      }
    }
  })
})

describe('connectorPortsOf for hairpin (REQ-063, REQ-060)', () => {
  it('hairpin at rotation 0 has two W-facing ports on different footprint rows', () => {
    const ports = connectorPortsOf({ type: 'hairpin', rotation: 0 })
    expect(ports).toEqual([
      { dr: -1, dc: 0, dir: DIR_W },
      { dr: 1, dc: 0, dir: DIR_W },
    ])
  })

  it('hairpin at rotation 90 rotates the ports to N-facing on different columns', () => {
    const ports = connectorPortsOf({ type: 'hairpin', rotation: 90 })
    expect(ports).toEqual([
      { dr: 0, dc: 1, dir: DIR_N },
      { dr: 0, dc: -1, dir: DIR_N },
    ])
  })

  it('hairpin ports collapse -0 to 0 in the rotated offsets', () => {
    for (const rotation of ALL_ROTATIONS) {
      const ports = connectorPortsOf({ type: 'hairpin', rotation })
      for (const port of ports) {
        expect(Object.is(port.dr, -0)).toBe(false)
        expect(Object.is(port.dc, -0)).toBe(false)
      }
    }
  })

  it('a 360deg rotation walks back to the canonical port set', () => {
    const r0 = connectorPortsOf({ type: 'hairpin', rotation: 0 })
    let cycled = connectorPortsOf({ type: 'hairpin', rotation: 0 })
    for (const rotation of ALL_ROTATIONS) {
      cycled = connectorPortsOf({ type: 'hairpin', rotation })
    }
    cycled = connectorPortsOf({ type: 'hairpin', rotation: 0 })
    expect(cycled).toEqual(r0)
  })
})

describe('connectorPortsOf coverage and contract (REQ-063)', () => {
  it('every PieceTypeSchema member returns at least one port at every rotation', () => {
    for (const type of PieceTypeSchema.options) {
      for (const rotation of ALL_ROTATIONS) {
        const ports = connectorPortsOf({ type, rotation })
        expect(ports.length).toBeGreaterThan(0)
      }
    }
  })

  it('returns a fresh array on every call so callers cannot mutate cached state', () => {
    const a = connectorPortsOf({ type: 'straight', rotation: 0 })
    const b = connectorPortsOf({ type: 'straight', rotation: 0 })
    expect(a).not.toBe(b)
    a[0].dir = DIR_N
    const c = connectorPortsOf({ type: 'straight', rotation: 0 })
    expect(c[0].dir).toBe(DIR_S)
  })

  it('connectorsOf returns just the dirs of connectorPortsOf in the same order', () => {
    for (const type of PieceTypeSchema.options) {
      for (const rotation of ALL_ROTATIONS) {
        const ports = connectorPortsOf({ type, rotation })
        const dirs = connectorsOf({ type, rotation })
        expect(dirs).toEqual(ports.map((p) => p.dir))
      }
    }
  })

  it('every resolved port direction is a valid Dir (0..7)', () => {
    for (const type of PieceTypeSchema.options) {
      for (const rotation of ALL_ROTATIONS) {
        const ports = connectorPortsOf({ type, rotation })
        for (const port of ports) {
          expect(port.dir).toBeGreaterThanOrEqual(0)
          expect(port.dir).toBeLessThanOrEqual(7)
          expect(Number.isInteger(port.dir)).toBe(true)
        }
      }
    }
  })
})

describe('portsFaceEachOther (REQ-063)', () => {
  it('two cardinal ports facing each other match', () => {
    expect(portsFaceEachOther(DIR_N, DIR_S)).toBe(true)
    expect(portsFaceEachOther(DIR_S, DIR_N)).toBe(true)
    expect(portsFaceEachOther(DIR_E, DIR_W)).toBe(true)
    expect(portsFaceEachOther(DIR_W, DIR_E)).toBe(true)
  })

  it('two corner ports facing each other match', () => {
    expect(portsFaceEachOther(DIR_NE, DIR_SW)).toBe(true)
    expect(portsFaceEachOther(DIR_SE, DIR_NW)).toBe(true)
    expect(portsFaceEachOther(DIR_SW, DIR_NE)).toBe(true)
    expect(portsFaceEachOther(DIR_NW, DIR_SE)).toBe(true)
  })

  it('two cardinal ports not facing each other do not match', () => {
    expect(portsFaceEachOther(DIR_N, DIR_E)).toBe(false)
    expect(portsFaceEachOther(DIR_N, DIR_N)).toBe(false)
    expect(portsFaceEachOther(DIR_S, DIR_W)).toBe(false)
  })

  it('a cardinal port never matches a corner port', () => {
    for (const cardinal of [DIR_N, DIR_E, DIR_S, DIR_W]) {
      for (const corner of [DIR_NE, DIR_SE, DIR_SW, DIR_NW]) {
        expect(portsFaceEachOther(cardinal, corner)).toBe(false)
        expect(portsFaceEachOther(corner, cardinal)).toBe(false)
      }
    }
  })

  it('a port pointing at itself does not match (not opposite)', () => {
    for (const d of ALL_DIRS) {
      expect(portsFaceEachOther(d, d)).toBe(false)
    }
  })

  it('matching is symmetric: a faces b iff b faces a', () => {
    for (const a of ALL_DIRS) {
      for (const b of ALL_DIRS) {
        expect(portsFaceEachOther(a, b)).toBe(portsFaceEachOther(b, a))
      }
    }
  })
})
