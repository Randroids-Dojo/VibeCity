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
 * order. v1 emits at most one segment (the connected component
 * starting at the first piece in `city.pieces`); pieces in a different
 * component are not included. A future slice can extend the walker to
 * emit multiple segments when the editor surface needs branching
 * (intersections per REQ-019).
 */
export interface PathSegment {
  id: string
  order: OrderedPiece[]
  closesLoop: boolean
}

/**
 * The path substrate built from a city's pieces.
 *
 * - `segments`: every connected component the walker produced. v1
 *   produces zero (empty city) or one segment.
 * - `cellToOrderIdx`: anchor-cell key -> index in segment 0's `order`
 *   array. Single-cell pieces map their `(row, col)` to their index.
 * - `cellToLocators`: every footprint cell key (including non-anchor
 *   cells of multi-cell pieces) -> list of locators. Multi-cell pieces
 *   produce one locator per footprint cell, all pointing at the same
 *   `(segmentId, idx)`. Future slices that emit multiple segments can
 *   layer additional locators on the same cell key (e.g. an
 *   intersection cell that participates in two segments).
 */
export interface TrackPath {
  segments: PathSegment[]
  cellToOrderIdx: Map<string, number>
  cellToLocators: Map<string, PathLocator[]>
}

const MAIN_SEGMENT_ID = 'main'

/**
 * Build the path substrate from a city.
 *
 * Empty city returns an empty TrackPath rather than throwing, matching
 * VibeCity's "fresh slug landing" contract (REQ-010, REQ-015) where
 * the drive scene mounts on an empty city. VibeRacer throws on empty
 * pieces because a track must have a start; a city does not.
 *
 * v1 walker behaviour:
 *
 * - Start at `city.pieces[0]`. Pick the second port from
 *   `connectorPortsOf` as the exit (matches VibeRacer's
 *   `getStartExitPort` fallback when only one piece is placed). If
 *   the second piece is connected to the first, prefer the exit that
 *   faces the second piece.
 * - At each step, follow the exit port to a connected neighbor via
 *   `findConnectedNeighbor`. Stop on dead end (no neighbor) or
 *   loop closure (current cell already in `seen`).
 * - For pieces with exactly two ports (every v1 type except the 4-way
 *   `intersection`), the next exit is the port that is not the entry.
 *   For the 4-way `intersection`, v1 picks the port directly opposite
 *   the entry so a straight pass through reads as the natural
 *   continuation. Non-pass-through branching at intersections is
 *   deferred to the multi-segment walker slice.
 * - Pieces in a disconnected component are not included in the
 *   segment. They produce no entries in `cellToOrderIdx` or
 *   `cellToLocators`. A future slice can emit additional segments per
 *   component when a real drive surface needs them.
 */
export function buildTrackPath(city: Pick<City, 'pieces'>): TrackPath {
  const pieces = city.pieces
  if (pieces.length === 0) {
    return {
      segments: [],
      cellToOrderIdx: new Map(),
      cellToLocators: new Map(),
    }
  }

  const first = pieces[0]
  const firstPorts = connectorPortsOf(first)
  if (firstPorts.length === 0) {
    return {
      segments: [],
      cellToOrderIdx: new Map(),
      cellToLocators: new Map(),
    }
  }

  // Pick a deterministic start exit. With two pieces we prefer the
  // port that connects to the second piece so the path walks toward
  // the rest of the city. Otherwise fall back to the second port
  // (matches VibeRacer's `getStartExitPort` fallback).
  let exitPort = firstPorts[firstPorts.length - 1]
  if (pieces.length >= 2) {
    const second = pieces[1]
    const matching = firstPorts.find((port) =>
      portsConnect(first, port, second),
    )
    if (matching) exitPort = matching
  }

  let entryPort: ConnectorPort = pickEntryPort(first, exitPort)
  let current: Piece = first

  const order: OrderedPiece[] = []
  const seen = new Set<string>()
  let closesLoop = false

  while (order.length < pieces.length) {
    const key = cellKey(current.row, current.col)
    if (seen.has(key)) {
      closesLoop = true
      break
    }
    seen.add(key)
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

  const segment: PathSegment = {
    id: MAIN_SEGMENT_ID,
    order,
    closesLoop,
  }
  const cellToOrderIdx = new Map<string, number>()
  const cellToLocators = new Map<string, PathLocator[]>()
  for (let i = 0; i < order.length; i++) {
    const p = order[i].piece
    cellToOrderIdx.set(cellKey(p.row, p.col), i)
    for (const cell of pieceFootprintCells(p)) {
      const fpKey = cellKey(cell.row, cell.col)
      const list = cellToLocators.get(fpKey) ?? []
      list.push({ segmentId: segment.id, idx: i })
      cellToLocators.set(fpKey, list)
    }
  }

  return {
    segments: [segment],
    cellToOrderIdx,
    cellToLocators,
  }
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
