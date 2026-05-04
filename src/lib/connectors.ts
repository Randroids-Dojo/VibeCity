import type { Piece, PieceType, Rotation } from '@/lib/schemas'

/**
 * 8-direction connector system (REQ-063).
 *
 * A `Dir` is a compass direction encoded as `0..7` clockwise from north:
 * `N=0`, `NE=1`, `E=2`, `SE=3`, `S=4`, `SW=5`, `W=6`, `NW=7`. Cardinal
 * directions are even (`N`, `E`, `S`, `W`); corners are odd (`NE`, `SE`,
 * `SW`, `NW`). The `opposite(d) = (d + 4) % 8` identity holds for both.
 *
 * Ported from VibeRacer's `src/game/track.ts` Phase 0d. VibeCity adopts
 * the same vocabulary so future ports of the segment-based path
 * (REQ-064) and the multi-locator wheel contact (REQ-065) can layer on
 * top without re-deriving the direction primitives.
 *
 * v1 ships the type, the offsets, the opposite helper, the cardinal /
 * corner classifier, and the per-piece-type connector port resolver.
 * Connector validation across two adjacent placed pieces (the "this
 * piece's east port faces that piece's west port" check) ships in its
 * own slice when REQ-064 lands; this slice is the substrate.
 */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export const DIR_N: Dir = 0
export const DIR_NE: Dir = 1
export const DIR_E: Dir = 2
export const DIR_SE: Dir = 3
export const DIR_S: Dir = 4
export const DIR_SW: Dir = 5
export const DIR_W: Dir = 6
export const DIR_NW: Dir = 7

/**
 * Per-direction `(dr, dc)` offset for stepping one cell in that
 * direction. Row indices grow downward (south); column indices grow
 * rightward (east), matching the editor and schema convention.
 *
 * Used by neighbor lookups: a connector at direction `d` faces the
 * cell at `(row + DIR_OFFSETS[d].dr, col + DIR_OFFSETS[d].dc)`.
 */
export const DIR_OFFSETS: Record<Dir, { dr: number; dc: number }> = {
  0: { dr: -1, dc: 0 },
  1: { dr: -1, dc: 1 },
  2: { dr: 0, dc: 1 },
  3: { dr: 1, dc: 1 },
  4: { dr: 1, dc: 0 },
  5: { dr: 1, dc: -1 },
  6: { dr: 0, dc: -1 },
  7: { dr: -1, dc: -1 },
}

/**
 * Opposite-direction helper. `opposite(0) = 4`, `opposite(1) = 5`, and
 * so on. Holds for both cardinal and corner directions.
 */
export function opposite(d: Dir): Dir {
  return ((d + 4) % 8) as Dir
}

/**
 * Cardinal directions (N, E, S, W) are even; corner directions (NE,
 * SE, SW, NW) are odd. The drive-side wheel-contact check (REQ-065)
 * needs the classifier to validate that a cardinal connector only
 * faces a cardinal-adjacent neighbor and a corner connector only faces
 * a diagonal-adjacent neighbor.
 */
export function isCardinal(d: Dir): boolean {
  return d % 2 === 0
}

export function isCorner(d: Dir): boolean {
  return d % 2 === 1
}

/**
 * One connector port on a piece. `(dr, dc)` is the footprint-cell
 * offset from the piece's anchor cell at which the port lives; `dir`
 * is the compass direction the port faces.
 *
 * Most v1 piece types are single-cell so every port lives at
 * `(dr: 0, dc: 0)`. Multi-cell pieces (mega sweep, hairpin) place
 * ports at the footprint cell that owns the connecting edge.
 */
export interface ConnectorPort {
  dr: number
  dc: number
  dir: Dir
}

/**
 * Base connector directions per piece type at rotation 0.
 *
 * Mirrors VibeRacer's `BASE_CONNECTORS` table for the piece types
 * VibeCity ships in v1. The pair encodes `[entry, exit]` semantics
 * but both ports are open edges for graph purposes, so the pair is
 * symmetric for connector matching.
 *
 * VibeCity-specific entries:
 *
 * - `intersection` (REQ-019): a 4-way junction with N / E / S / W
 *   cardinal connectors. VibeRacer ships a 3-connector planned junction;
 *   VibeCity extends the pattern to four arms so streets can cross.
 *
 * Pieces with a non-uniform per-cell port layout (`hairpin`) live
 * outside this table; their ports are computed in `connectorPortsOf`.
 */
const BASE_CONNECTOR_DIRS: Record<
  Exclude<PieceType, 'hairpin' | 'intersection'>,
  readonly Dir[]
> = {
  straight: [DIR_S, DIR_N],
  left90: [DIR_S, DIR_W],
  right90: [DIR_S, DIR_E],
  scurve: [DIR_S, DIR_N],
  scurveLeft: [DIR_S, DIR_N],
  sweepRight: [DIR_S, DIR_E],
  sweepLeft: [DIR_S, DIR_W],
  megaSweepRight: [DIR_S, DIR_E],
  megaSweepLeft: [DIR_S, DIR_W],
  arc45: [DIR_S, DIR_NE],
  diagonal: [DIR_SW, DIR_NE],
}

/**
 * Rotate a direction by a piece rotation in 90deg increments. Each
 * 90deg step adds 2 to the direction modulo 8 (because the 8-direction
 * wheel ticks twice per cardinal rotation: N -> E -> S -> W).
 */
function rotateDir(dir: Dir, rotation: Rotation): Dir {
  const turns = rotation / 90
  return ((dir + turns * 2) % 8) as Dir
}

/**
 * Rotate a connector port (offset and direction) clockwise by the
 * piece's rotation. The 90deg clockwise step `(dr, dc) -> (dc, -dr)`
 * matches the editor's canonical rotation direction so the visual port
 * after a rotate-tool press lines up with the visible piece glyph.
 *
 * Mirrors VibeRacer's `rotatePorts` helper (track.ts) so the same
 * connector geometry produces matching VibeRacer / VibeCity ports.
 */
function rotatePort(port: ConnectorPort, rotation: Rotation): ConnectorPort {
  const turns = rotation / 90
  let dr = port.dr
  let dc = port.dc
  for (let i = 0; i < turns; i++) {
    const nextDr = dc
    const nextDc = -dr
    dr = nextDr
    dc = nextDc
  }
  return {
    dr: Object.is(dr, -0) ? 0 : dr,
    dc: Object.is(dc, -0) ? 0 : dc,
    dir: rotateDir(port.dir, rotation),
  }
}

/**
 * Resolve the connector ports of a placed piece, including
 * footprint-cell offset and rotated direction.
 *
 * Single-cell pieces in the BASE_CONNECTOR_DIRS table place every
 * port at `(dr: 0, dc: 0)` and rotate the directions through the 90deg
 * wheel. Multi-cell pieces (`hairpin`) and the VibeCity-specific
 * `intersection` are computed inline.
 *
 * Returns a fresh array on each call so the caller cannot mutate the
 * canonical port shapes by writing back into the result.
 *
 * The `hairpin` port offsets `(dr: -1, dc: 0)` and `(dr: 1, dc: 0)`
 * assume the canonical 2x3 footprint that arrives with REQ-060. The
 * port positions land first so REQ-064 (segment-based path) and
 * REQ-065 (wheel contact) can build on the same direction substrate;
 * the runtime hairpin geometry ships in its own slice.
 */
export function connectorPortsOf(
  piece: Pick<Piece, 'type' | 'rotation'>,
): ConnectorPort[] {
  if (piece.type === 'hairpin') {
    return [
      { dr: -1, dc: 0, dir: DIR_W },
      { dr: 1, dc: 0, dir: DIR_W },
    ].map((port) => rotatePort(port, piece.rotation))
  }
  if (piece.type === 'intersection') {
    return [
      { dr: 0, dc: 0, dir: DIR_N },
      { dr: 0, dc: 0, dir: DIR_E },
      { dr: 0, dc: 0, dir: DIR_S },
      { dr: 0, dc: 0, dir: DIR_W },
    ].map((port) => rotatePort(port, piece.rotation))
  }
  const baseDirs = BASE_CONNECTOR_DIRS[piece.type]
  return baseDirs.map((dir) => ({
    dr: 0,
    dc: 0,
    dir: rotateDir(dir, piece.rotation),
  }))
}

/**
 * Convenience: just the connector directions of a placed piece, in
 * the order returned by `connectorPortsOf`. Mirrors VibeRacer's
 * `connectorsOf`.
 */
export function connectorsOf(
  piece: Pick<Piece, 'type' | 'rotation'>,
): Dir[] {
  return connectorPortsOf(piece).map((port) => port.dir)
}

/**
 * Two connector ports match when they face each other and live on
 * adjacent cells in the world. The caller resolves the absolute cell
 * each port lives on by adding the piece anchor and the port's
 * `(dr, dc)`; this helper just checks the direction relationship.
 *
 * Cardinal-vs-cardinal: `b.dir === opposite(a.dir)`. Corner-vs-corner:
 * same identity. The classification is handled by `isCardinal` /
 * `isCorner`, so a cardinal-vs-corner pairing always returns false
 * even if the directions happen to satisfy the opposite check.
 *
 * Ported from VibeRacer's connector-validation pattern in `track.ts`.
 * The full neighbor-lookup-and-port-match validator lives with the
 * city-validity slice when REQ-064 lands.
 */
export function portsFaceEachOther(a: Dir, b: Dir): boolean {
  if (isCardinal(a) !== isCardinal(b)) return false
  return b === opposite(a)
}
