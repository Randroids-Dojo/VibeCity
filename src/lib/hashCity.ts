import { createHash } from 'node:crypto'
import type { Building, City, Piece, PieceFootprintCell } from './schemas'
import type { CityVersionHash } from './cityKv'

/**
 * Stable content hash over a city's `pieces` and `buildings` (REQ-013).
 *
 * Mirrors VibeRacer's `hashTrack` pattern (`src/lib/hashTrack.ts`):
 *   - canonicalize the input (sort pieces / buildings, drop default footprint),
 *   - JSON.stringify with deterministic key order,
 *   - sha256 hex digest.
 *
 * Excluded from the hash:
 *   - `City.mood` (REQ-013, see `docs/gdd/06-city-schema.md`). Adding or
 *     changing mood does not produce a new content version, so prior version
 *     references stay stable.
 *   - The literal shape of `Piece.footprint` when it is missing, empty, or
 *     equal to the single-cell default `[{ dr: 0, dc: 0 }]`. Two pieces that
 *     resolve to the same footprint must hash identically.
 *
 * The output is a 64-char hex digest, branded as `CityVersionHash` so it
 * cannot be silently passed where a raw string is expected.
 */

const DEFAULT_FOOTPRINT: ReadonlyArray<PieceFootprintCell> = [{ dr: 0, dc: 0 }]

function cleanOffset(value: number): number {
  return Object.is(value, -0) ? 0 : value
}

/**
 * Resolve a piece's footprint to a canonical form: deduped, sorted by
 * `(dr, dc)`, with `-0` collapsed to `0`. An undefined or empty footprint
 * resolves to the single-cell default.
 */
function normalizedFootprint(
  footprint: readonly PieceFootprintCell[] | undefined,
): PieceFootprintCell[] {
  if (!footprint || footprint.length === 0) return [...DEFAULT_FOOTPRINT]
  const seen = new Set<string>()
  const out: PieceFootprintCell[] = []
  for (const cell of footprint) {
    const dr = cleanOffset(cell.dr)
    const dc = cleanOffset(cell.dc)
    const key = `${dr},${dc}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ dr, dc })
  }
  if (out.length === 0) return [...DEFAULT_FOOTPRINT]
  return out.sort((a, b) => (a.dr === b.dr ? a.dc - b.dc : a.dr - b.dr))
}

function isDefaultFootprint(
  footprint: readonly PieceFootprintCell[] | undefined,
): boolean {
  const normalized = normalizedFootprint(footprint)
  return (
    normalized.length === 1 &&
    normalized[0].dr === 0 &&
    normalized[0].dc === 0
  )
}

function canonicalizePieces(pieces: readonly Piece[]): Piece[] {
  return [...pieces].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    if (a.col !== b.col) return a.col - b.col
    if (a.type !== b.type) return a.type < b.type ? -1 : 1
    return a.rotation - b.rotation
  })
}

function canonicalizeBuildings(buildings: readonly Building[]): Building[] {
  return [...buildings].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    if (a.col !== b.col) return a.col - b.col
    if (a.type !== b.type) return a.type < b.type ? -1 : 1
    return a.rotation - b.rotation
  })
}

/**
 * The canonical JSON form that feeds the digest. Exported for tests.
 *
 * Schema-shaped (`{ pieces, buildings }`) so adding a future hashed field
 * (e.g. branch edges in REQ-064) is a one-line extension.
 */
export function canonicalCityJson(city: Pick<City, 'pieces' | 'buildings'>): string {
  const pieces = canonicalizePieces(city.pieces).map((p) => ({
    type: p.type,
    row: p.row,
    col: p.col,
    rotation: p.rotation,
    footprint: isDefaultFootprint(p.footprint)
      ? undefined
      : normalizedFootprint(p.footprint),
  }))
  const buildings = canonicalizeBuildings(city.buildings).map((b) => ({
    type: b.type,
    row: b.row,
    col: b.col,
    rotation: b.rotation,
  }))
  return JSON.stringify({ pieces, buildings })
}

/**
 * Hash a city's pieces and buildings. Mood is excluded.
 */
export function hashCity(
  city: Pick<City, 'pieces' | 'buildings'>,
): CityVersionHash {
  const digest = createHash('sha256')
    .update(canonicalCityJson(city))
    .digest('hex')
  return digest as CityVersionHash
}
