import type { City, Piece } from '@/lib/schemas'
import { pieceFootprintCells } from '@/app/[slug]/edit/snapGrid'

/**
 * Drive-spawn override parsing (REQ-110 follow-on, foothold slice).
 *
 * The persistent Drive toggle in the editor (future slice) will encode
 * the iso camera's focus cell into the navigation URL so the drive
 * view spawns under wherever the player was looking. The drive page
 * reads this `?spawn=<row>,<col>` query param and overrides the
 * default `spawnAnchor` if the override is valid AND points at a cell
 * that hosts a street piece (otherwise the override silently falls
 * through to the spawn anchor; an off-grid or off-piece spawn would
 * put the car on grass or into a wall on frame zero).
 *
 * Pure functions, no Three.js or React dependency, so the helper is
 * fully unit-testable.
 */

/**
 * Parse a raw `?spawn=...` query value into a `{ row, col }` cell or
 * return `null` on any failure. Accepts:
 *
 *   - `"3,5"` plain comma-separated integers
 *   - `"-2,4"` negative coords (the grid is symmetric around the origin)
 *
 * Rejects:
 *
 *   - Missing comma, more than one comma, empty parts
 *   - Non-integer values (`"1.5,2"`, `"abc,3"`)
 *   - Non-finite values (`"Infinity,0"`, `"NaN,0"`)
 *   - Whitespace-only or trim-collapsed-empty inputs
 *
 * Returns `null` rather than throwing so a caller can branch to the
 * default spawn without try / catch at every site.
 */
export function parseSpawnOverride(
  raw: string | undefined | null,
): { row: number; col: number } | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const parts = trimmed.split(',')
  if (parts.length !== 2) return null
  const rowStr = parts[0].trim()
  const colStr = parts[1].trim()
  if (rowStr.length === 0 || colStr.length === 0) return null
  // Reject anything that does not look like an integer (allow optional
  // leading `-`). `Number('1.5')` would parse to 1.5 and then fail
  // `Number.isInteger`, so the regex is the cheap first-line guard.
  if (!/^-?\d+$/.test(rowStr) || !/^-?\d+$/.test(colStr)) return null
  const row = Number(rowStr)
  const col = Number(colStr)
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { row, col }
}

/**
 * Resolve a parsed spawn override against the live city. Returns the
 * override cell only if it sits on a placed street piece's footprint
 * (so the car spawns ON the road). Falls back to `null` otherwise so
 * the caller can use the default `spawnAnchor`.
 *
 * Walks every piece's footprint (using the same `defaultFootprintForPiece`
 * the editor uses for placement) so a multi-cell piece (hairpin, mega
 * sweep) accepts the override on any of its footprint cells. v1 has no
 * per-piece custom footprints, so this matches the placement validator.
 */
export function resolveSpawnOverride(
  override: { row: number; col: number },
  pieces: readonly Piece[],
): { row: number; col: number } | null {
  for (const piece of pieces) {
    for (const cell of pieceFootprintCells(piece)) {
      if (cell.row === override.row && cell.col === override.col) {
        return override
      }
    }
  }
  return null
}

/**
 * Compose the URL query for a spawn override. Empty input returns the
 * empty string (no query param at all) so the caller can drop the
 * override cleanly when no focus cell is meaningful. Matches the
 * `?spawn=<row>,<col>` shape `parseSpawnOverride` reads back.
 */
export function spawnOverrideQuery(
  cell: { row: number; col: number } | null | undefined,
): string {
  if (
    !cell ||
    !Number.isInteger(cell.row) ||
    !Number.isInteger(cell.col)
  ) {
    return ''
  }
  return `?spawn=${cell.row},${cell.col}`
}

/**
 * Reader for a Next.js `searchParams` `spawn` field. Accepts the
 * `string | string[] | undefined` shape Next gives us and returns the
 * parsed cell, or `null` on any failure. When `spawn` is an array
 * (duplicate query params), the first value wins.
 */
export function readSpawnSearchParam(
  raw: string | string[] | undefined,
): { row: number; col: number } | null {
  if (raw === undefined) return null
  const single = Array.isArray(raw) ? raw[0] : raw
  return parseSpawnOverride(single)
}

/**
 * Type-only export so consumers can use `City` without re-importing
 * the schema barrel; matches the pattern used elsewhere in this dir.
 */
export type { City }
