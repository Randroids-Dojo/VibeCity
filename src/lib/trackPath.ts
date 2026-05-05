import {
  cellKey,
  pieceFootprintCells,
} from '@/app/[slug]/edit/snapGrid'
import {
  connectorPortsOf,
  DIR_OFFSETS,
  opposite,
  type ConnectorPort,
  type Dir,
} from '@/lib/connectors'
import type { City, Piece } from '@/lib/schemas'

/**
 * Segment-based path substrate (REQ-064).
 *
 * VibeRacer's `trackPath.ts` carries the whole drive surface (sampled
 * centerlines, spawn points, finish line, checkpoints). VibeCity v1
 * ships only the substrate that the editor and the future drive scene
 * (REQ-019, REQ-032, REQ-065) need: a per-segment ordered piece walk
 * plus a `cellToLocators` map keyed by every footprint cell of every
 * placed piece. The geometry layer (sampled centerlines, headings,
 * spawn) lands when REQ-031 / REQ-032 / F-003 / F-004 ship.
 *
 * Why this is a separate module from `connectors.ts`: connectors are
 * the per-piece port substrate (a piece-local question). The path is
 * the connected-pieces graph (a city-wide question). Keeping them
 * separated mirrors VibeRacer's `track.ts` / `trackPath.ts` split and
 * lets future slices port the geometry layer without touching the
 * connector substrate.
 */

/**
 * `(piece, port)` -> absolute cell the port lives on. The port carries
 * a footprint-cell offset `(dr, dc)`, so the absolute cell is
 * `(piece.row + port.dr, piece.col + port.dc)`. Mirrors VibeRacer's
 * `portCell` (track.ts).
 */
export function portCell(
  piece: Pick<Piece, 'row' | 'col'>,
  port: Pick<ConnectorPort, 'dr' | 'dc'>,
): { row: number; col: number } {
  return { row: piece.row + port.dr, col: piece.col + port.dc }
}

/**
 * Stable key for the cell a port faces across (one cell beyond the
 * port's host cell along the port's compass direction). Useful when
 * the caller wants to look up a neighbor by anchor cell or by
 * footprint cell index. Mirrors VibeRacer's `neighborAnchorKey` /
 * `neighborAnchorCell` (track.ts).
 */
export function neighborAnchorCell(
  piece: Piece,
  port: ConnectorPort,
): { row: number; col: number } {
  const cell = portCell(piece, port)
  const off = DIR_OFFSETS[port.dir]
  return { row: cell.row + off.dr, col: cell.col + off.dc }
}

/**
 * Two pieces' ports connect when they sit on cells that are adjacent
 * along the port's compass direction AND the neighbor's port faces
 * back. The classifier `isCardinal` / `isCorner` already lives in
 * `connectors.ts` (REQ-063); this helper layers on top to give callers
 * the connected-graph predicate. Mirrors VibeRacer's `portsConnect`
 * (track.ts).
 */
export function portsConnect(
  piece: Piece,
  port: ConnectorPort,
  neighbor: Piece,
): boolean {
  const cell = portCell(piece, port)
  for (const neighborPort of connectorPortsOf(neighbor)) {
    const neighborCell = portCell(neighbor, neighborPort)
    const off = DIR_OFFSETS[neighborPort.dir]
    if (
      neighborCell.row + off.dr === cell.row &&
      neighborCell.col + off.dc === cell.col &&
      neighborPort.dir === opposite(port.dir)
    ) {
      return true
    }
  }
  return false
}

/**
 * Walk every other piece in the city looking for one whose port
 * connects to the given `(piece, port)`. Returns the first matching
 * neighbor or null. Mirrors VibeRacer's `findConnectedNeighbor`
 * (track.ts).
 *
 * The search is linear in the piece count; a future cell-keyed index
 * can speed this up if a benchmark identifies a cost. v1 ships the
 * straightforward walk so the substrate stays small.
 */
export function findConnectedNeighbor(
  piece: Piece,
  port: ConnectorPort,
  pieces: readonly Piece[],
): Piece | null {
  for (const candidate of pieces) {
    if (candidate === piece) continue
    if (portsConnect(piece, port, candidate)) return candidate
  }
  return null
}

/**
 * One ordered piece in a path segment. Carries the underlying piece,
 * the entry port the walker came in on, and the exit port the walker
 * left on. Single-connector or branching pieces are not yet supported
 * in the v1 substrate; the walker picks a deterministic exit for the
 * first piece (the second port returned by `connectorPortsOf`) and
 * follows matched ports forward until it dead-ends or closes a loop.
 *
 * Geometry (heading, sampled centerline, world-space center) is
 * intentionally absent. The geometry layer lands in its own slice on
 * top of this substrate when REQ-031 / REQ-032 / F-003 / F-004 ship.
 */
export interface OrderedPiece {
  piece: Piece
  entryPort: ConnectorPort
  exitPort: ConnectorPort
  entryDir: Dir
  exitDir: Dir
}

/**
 * `(segmentId, idx)` pointer back into a segment's `order` array.
 * The drive-side wheel contact (REQ-065) reads `cellToLocators` and
 * picks the closest centerline candidate from the locator list. The
 * locator is intentionally a pair, not just an index, so a future
 * multi-segment walker can keep distinct branches addressable from a
 * shared `cellToLocators` map.
 */
export interface PathLocator {
  segmentId: string
  idx: number
}

/**
 * One connected component of the city's piece graph, walked in
 * order. The walker emits one segment per connected component; the
 * segment containing `city.pieces[0]` is named `main` and subsequent
 * components are named `segment-1`, `segment-2`, etc. in placement
 * order of their first unvisited piece. Branching at intersections
 * (multiple segments through one piece) is still deferred to its own
 * slice when the editor surface needs it (REQ-019).
 */
export interface PathSegment {
  id: string
  order: OrderedPiece[]
  closesLoop: boolean
}

/**
 * The path substrate built from a city's pieces.
 *
 * - `segments`: every connected component the walker produced. The
 *   first segment is always named `main`; additional components get
 *   `segment-1`, `segment-2`, and so on in placement order of their
 *   first unvisited piece.
 * - `cellToOrderIdx`: anchor-cell key -> index in segment 0's `order`
 *   array. Single-cell pieces map their `(row, col)` to their index.
 *   Pieces in non-main segments are addressed via `cellToLocators`.
 * - `cellToLocators`: every footprint cell key (including non-anchor
 *   cells of multi-cell pieces) -> list of locators across every
 *   segment. Multi-cell pieces produce one locator per footprint cell.
 *   Future slices that emit multiple segments through the same cell
 *   (e.g. an intersection cell that participates in two segments) can
 *   layer additional locators on the same cell key.
 */
export interface TrackPath {
  segments: PathSegment[]
  cellToOrderIdx: Map<string, number>
  cellToLocators: Map<string, PathLocator[]>
}

const MAIN_SEGMENT_ID = 'main'

function segmentIdForIndex(index: number): string {
  return index === 0 ? MAIN_SEGMENT_ID : `segment-${index}`
}

/**
 * Build the path substrate from a city.
 *
 * Empty city returns an empty TrackPath rather than throwing, matching
 * VibeCity's "fresh slug landing" contract (REQ-010, REQ-015) where
 * the drive scene mounts on an empty city. VibeRacer throws on empty
 * pieces because a track must have a start; a city does not.
 *
 * Walker behaviour:
 *
 * - Walk every connected component in the piece graph. The component
 *   that contains `city.pieces[0]` becomes the `main` segment; each
 *   subsequent component (in placement order of its first unvisited
 *   piece) becomes `segment-1`, `segment-2`, and so on. A piece with
 *   no connector ports (degenerate input) emits a one-piece segment
 *   so it is still addressable by `cellToLocators`.
 * - Inside each component the walker picks a deterministic start exit
 *   on the first piece: prefer the port that connects to any other
 *   unvisited piece in the city so the segment walks toward the rest
 *   of the component, otherwise fall back to the last port returned
 *   by `connectorPortsOf` (matches VibeRacer's `getStartExitPort`
 *   fallback when only one piece is placed).
 * - At each step, follow the exit port to a connected neighbor via
 *   `findConnectedNeighbor`. Stop on dead end (no neighbor) or
 *   loop closure (current cell already in `seen`).
 * - For pieces with exactly two ports (every v1 type except the 4-way
 *   `intersection`), the next exit is the port that is not the entry.
 *   For the 4-way `intersection`, v1 picks the port directly opposite
 *   the entry so a straight pass through reads as the natural
 *   continuation. Non-pass-through branching at intersections (one
 *   intersection emitting more than one segment) stays deferred to
 *   its own slice.
 * - `cellToOrderIdx` only carries anchors of the `main` segment so
 *   the existing single-segment consumers stay backward compatible;
 *   pieces in non-main segments are addressed via `cellToLocators`,
 *   which carries every segment's locators across every footprint
 *   cell.
 */
export function buildTrackPath(city: Pick<City, 'pieces'>): TrackPath {
  const pieces = city.pieces
  const segments: PathSegment[] = []
  const cellToOrderIdx = new Map<string, number>()
  const cellToLocators = new Map<string, PathLocator[]>()

  if (pieces.length === 0) {
    return { segments, cellToOrderIdx, cellToLocators }
  }

  const visitedAnchors = new Set<string>()

  for (const start of pieces) {
    const startKey = cellKey(start.row, start.col)
    if (visitedAnchors.has(startKey)) continue

    const order = walkComponent(start, pieces, visitedAnchors)
    if (order.length === 0) continue

    const segmentIndex = segments.length
    const segmentId = segmentIdForIndex(segmentIndex)
    const first = order[0]
    const last = order[order.length - 1]
    // The walker stops on loop closure by re-encountering the start
    // anchor. The piece graph is undirected so a closed loop also
    // shows up as `last.exitPort` connecting back to `first.piece`.
    const closesLoop = portsConnect(last.piece, last.exitPort, first.piece)

    const segment: PathSegment = {
      id: segmentId,
      order,
      closesLoop,
    }
    segments.push(segment)

    for (let i = 0; i < order.length; i++) {
      const p = order[i].piece
      if (segmentIndex === 0) {
        cellToOrderIdx.set(cellKey(p.row, p.col), i)
      }
      for (const cell of pieceFootprintCells(p)) {
        const fpKey = cellKey(cell.row, cell.col)
        const list = cellToLocators.get(fpKey) ?? []
        list.push({ segmentId, idx: i })
        cellToLocators.set(fpKey, list)
      }
    }
  }

  return { segments, cellToOrderIdx, cellToLocators }
}

/**
 * Walk one connected component starting at `start`. Marks every
 * visited piece's anchor in `visitedAnchors` so the outer loop skips
 * pieces already absorbed into an earlier segment.
 *
 * Returns an empty array when the start has no connector ports
 * (defensive; the v1 piece taxonomy always emits ports). Callers
 * treat an empty result as "no segment to emit".
 */
function walkComponent(
  start: Piece,
  pieces: readonly Piece[],
  visitedAnchors: Set<string>,
): OrderedPiece[] {
  const startPorts = connectorPortsOf(start)
  if (startPorts.length === 0) return []

  // Prefer the start exit that connects to any other unvisited piece
  // so the walker walks toward the rest of the component. Fall back
  // to the last port (matches VibeRacer's `getStartExitPort` for the
  // single-piece case).
  let exitPort = startPorts[startPorts.length - 1]
  for (const port of startPorts) {
    const neighbor = findUnvisitedConnectedNeighbor(
      start,
      port,
      pieces,
      visitedAnchors,
    )
    if (neighbor) {
      exitPort = port
      break
    }
  }

  let entryPort: ConnectorPort = pickEntryPort(start, exitPort)
  let current: Piece = start

  const order: OrderedPiece[] = []
  const seen = new Set<string>()

  while (order.length < pieces.length) {
    const key = cellKey(current.row, current.col)
    if (seen.has(key)) break
    seen.add(key)
    visitedAnchors.add(key)
    order.push({
      piece: current,
      entryPort,
      exitPort,
      entryDir: entryPort.dir,
      exitDir: exitPort.dir,
    })

    const next = findConnectedNeighbor(current, exitPort, pieces)
    if (!next) break

    const nextEntry = matchingEntryPort(next, current)
    const nextExit = nextExitPort(next, nextEntry)
    current = next
    entryPort = nextEntry
    exitPort = nextExit
  }

  return order
}

/**
 * Variant of `findConnectedNeighbor` that ignores pieces whose anchor
 * is already in `visitedAnchors`. Used by the start-exit heuristic
 * inside the multi-component walker so a fresh segment does not
 * choose a port that points back into an already-walked segment.
 */
function findUnvisitedConnectedNeighbor(
  piece: Piece,
  port: ConnectorPort,
  pieces: readonly Piece[],
  visitedAnchors: ReadonlySet<string>,
): Piece | null {
  for (const candidate of pieces) {
    if (candidate === piece) continue
    if (visitedAnchors.has(cellKey(candidate.row, candidate.col))) continue
    if (portsConnect(piece, port, candidate)) return candidate
  }
  return null
}

/**
 * Given an exit port, pick the entry port for a single-piece walk.
 * The first piece has no incoming connection, so we fabricate an
 * entry port that is the "other" port for two-port pieces (every v1
 * type except the 4-way intersection) or the opposite-direction port
 * for the intersection.
 */
function pickEntryPort(piece: Piece, exitPort: ConnectorPort): ConnectorPort {
  const ports = connectorPortsOf(piece)
  const others = ports.filter((p) => !samePort(p, exitPort))
  if (others.length === 0) return exitPort
  if (others.length === 1) return others[0]
  // Multi-port piece (intersection). Prefer the port that faces the
  // opposite direction so a pass-through walk reads naturally.
  const oppDir = opposite(exitPort.dir)
  const facing = others.find((p) => p.dir === oppDir)
  return facing ?? others[0]
}

/**
 * For an inbound piece arriving from `previous`, find the entry port
 * whose `(piece, port)` connects back to `previous`. Mirrors VibeRacer's
 * `matchingEntryPort` (trackPath.ts). Falls back to the first port
 * when no port matches; the walker breaks out via the next-piece
 * lookup so the fallback is unreachable in practice when the upstream
 * walker honours the `findConnectedNeighbor` contract.
 */
function matchingEntryPort(piece: Piece, previous: Piece): ConnectorPort {
  const ports = connectorPortsOf(piece)
  const found = ports.find((port) => portsConnect(piece, port, previous))
  return found ?? ports[0]
}

/**
 * For a piece that just received an entry, pick the next exit port.
 * Two-port pieces return the only non-entry port. Multi-port pieces
 * (the 4-way intersection) prefer the port directly opposite the
 * entry so a pass-through walk reads as the natural continuation;
 * non-pass-through branching is deferred to the multi-segment walker
 * slice.
 */
function nextExitPort(piece: Piece, entry: ConnectorPort): ConnectorPort {
  const ports = connectorPortsOf(piece)
  const others = ports.filter((p) => !samePort(p, entry))
  if (others.length === 0) return entry
  if (others.length === 1) return others[0]
  const oppDir = opposite(entry.dir)
  const facing = others.find((p) => p.dir === oppDir)
  return facing ?? others[0]
}

function samePort(a: ConnectorPort, b: ConnectorPort): boolean {
  return a.dr === b.dr && a.dc === b.dc && a.dir === b.dir
}

/**
 * One-shot summary of a built `TrackPath` (REQ-019, REQ-064).
 *
 * Surfaces the substrate-level signals the editor toolbar reads:
 *
 * - `mainSegmentLength`: number of pieces in the segment that contains
 *   `city.pieces[0]` (the canonical `main` segment). Zero when the city
 *   has no pieces.
 * - `totalPieces`: unique pieces across every segment, deduped by
 *   reference identity. Equal to the placed piece count when every
 *   piece is reachable from a connected component (always true given
 *   the multi-component walker). Deduped because the deterministic
 *   intersection pass-through can revisit the same piece from a sibling
 *   arm seeded as a separate segment.
 * - `mainSegmentClosesLoop`: whether the main segment is a closed loop
 *   (the last walked piece's exit port connects back to the first
 *   piece). False when no main segment exists.
 * - `segmentCount`: number of connected components. Zero on empty city.
 *
 * The shape stays substrate-flavoured: no labels, no formatting, no
 * pixel coordinates. The editor toolbar formats these into "Pieces in
 * main path: K of N" / "Main path: closed loop" text. Future slices
 * (drive-mode "city is open chain" warning HUD, save-time integrity
 * check) read the same shape.
 */
export interface TrackPathSummary {
  mainSegmentLength: number
  totalPieces: number
  mainSegmentClosesLoop: boolean
  segmentCount: number
}

/**
 * Summarize a built `TrackPath` (REQ-019, REQ-064).
 *
 * Reads the segment-based substrate and projects it into a flat
 * `{ mainSegmentLength, totalPieces, mainSegmentClosesLoop, segmentCount }`
 * shape so callers (the editor toolbar readout, future drive-mode HUD,
 * future save-time integrity check) can render or branch on the
 * connected-graph topology without iterating segments themselves.
 *
 * `totalPieces` counts unique pieces across every segment, not the sum
 * of segment lengths. The walker's deterministic intersection pass-
 * through can revisit the same piece from a sibling arm seeded as a
 * new segment, so summing segment lengths would over-count; deduping by
 * piece identity keeps `totalPieces` equal to the placed piece count
 * when every piece is reachable from a connected component.
 *
 * Empty path returns zeros and `mainSegmentClosesLoop: false`. The main
 * segment is always `path.segments[0]` per `buildTrackPath`'s contract.
 */
export function summarizeTrackPath(path: TrackPath): TrackPathSummary {
  if (path.segments.length === 0) {
    return {
      mainSegmentLength: 0,
      totalPieces: 0,
      mainSegmentClosesLoop: false,
      segmentCount: 0,
    }
  }
  const main = path.segments[0]
  const seen = new Set<Piece>()
  for (const segment of path.segments) {
    for (const ordered of segment.order) {
      seen.add(ordered.piece)
    }
  }
  return {
    mainSegmentLength: main.order.length,
    totalPieces: seen.size,
    mainSegmentClosesLoop: main.closesLoop,
    segmentCount: path.segments.length,
  }
}

/**
 * One unmatched connector port across the city (REQ-019, REQ-064).
 *
 * `pieceIndex` is the position of the source piece in `city.pieces`.
 * `cellRow` / `cellCol` is the absolute cell the port lives on (anchor
 * plus footprint offset). `dir` is the compass direction the port faces.
 *
 * The shape stays deliberately substrate-flavored: no pixel-space
 * coordinates, no glyph styling. The editor's pixel-space view lives in
 * `src/app/[slug]/edit/connectorGlyphs.ts`; this helper is the canonical
 * city-wide validator used by the future save-time integrity checks
 * and the future drive-mode "city has unmatched ports" warning HUD.
 */
export interface UnmatchedPort {
  pieceIndex: number
  cellRow: number
  cellCol: number
  dir: Dir
}

/**
 * Validate the cross-piece connector graph (REQ-019, REQ-064).
 *
 * Walks every placed piece's connector ports through `connectorPortsOf`
 * and returns the list of ports that face empty space, the grid edge,
 * or a neighbor cell that does not expose an opposing port. A port is
 * `matched` (omitted from the result) when the neighbor cell along the
 * compass direction exposes a port in the opposite direction sourced
 * from a different piece; everything else lands in the result.
 *
 * Walked in placement order: pieces in `city.pieces` order, ports in
 * `connectorPortsOf` order. The result is therefore deterministic and
 * stable across calls so a test or a UI consumer can rely on the order
 * for diff display.
 *
 * The cardinal-vs-corner classification check that `portsFaceEachOther`
 * applies is folded in for free: a cardinal port stepping along its
 * cardinal direction lands on a cardinal-adjacent neighbor; a corner
 * port stepping along its corner direction lands on a diagonal-adjacent
 * neighbor; a port that lands on the same cell as the source piece
 * (e.g. an intersection's own opposing arm) is excluded by the
 * `neighborOwner !== pieceIndex` guard.
 *
 * Returns a fresh array on every call so callers cannot mutate cached
 * state.
 */
export function validateConnections(
  city: Pick<City, 'pieces'>,
): UnmatchedPort[] {
  const pieces = city.pieces
  const portIndex = new Map<string, number>()
  pieces.forEach((piece, index) => {
    for (const port of connectorPortsOf(piece)) {
      const cellRow = piece.row + port.dr
      const cellCol = piece.col + port.dc
      const key = `${cellKey(cellRow, cellCol)}:${port.dir}`
      if (!portIndex.has(key)) {
        portIndex.set(key, index)
      }
    }
  })
  const out: UnmatchedPort[] = []
  pieces.forEach((piece, index) => {
    for (const port of connectorPortsOf(piece)) {
      const cellRow = piece.row + port.dr
      const cellCol = piece.col + port.dc
      const offset = DIR_OFFSETS[port.dir]
      const neighborRow = cellRow + offset.dr
      const neighborCol = cellCol + offset.dc
      const neighborKey = `${cellKey(neighborRow, neighborCol)}:${opposite(port.dir)}`
      const neighborOwner = portIndex.get(neighborKey)
      if (neighborOwner === undefined || neighborOwner === index) {
        out.push({ pieceIndex: index, cellRow, cellCol, dir: port.dir })
      }
    }
  })
  return out
}

/**
 * Collapse an `UnmatchedPort[]` into the unique set of cells that host
 * at least one unmatched port (REQ-019, REQ-064).
 *
 * Returns a `Set<string>` keyed by `cellKey(cellRow, cellCol)` so the
 * SnapGridView can answer "does this cell have an open port" in O(1)
 * while rendering. Multiple ports on the same cell (e.g. a straight
 * piece reports both N and S as unmatched on its anchor cell when
 * placed in isolation) collapse to one set entry; a future per-port
 * highlight that wants to render each port individually can iterate
 * the source `UnmatchedPort[]` directly.
 *
 * Returns a fresh set on every call so callers cannot mutate cached
 * state.
 */
export function unmatchedPortCells(
  unmatchedPorts: readonly UnmatchedPort[],
): Set<string> {
  const out = new Set<string>()
  for (const port of unmatchedPorts) {
    out.add(cellKey(port.cellRow, port.cellCol))
  }
  return out
}
