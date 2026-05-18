import { parseSpawnOverride } from '@/app/[slug]/drive/spawnOverride'

/**
 * Editor camera-focus URL plumbing (REQ-110).
 *
 * The bidirectional editor / drive toggle from REQ-110 lets the
 * player jump from one surface to the other without losing spatial
 * context. The drive page already reads `?spawn=row,col` to land the
 * car at a chosen cell (see `src/app/[slug]/drive/spawnOverride.ts`);
 * the editor side mirrors that contract under the `?focus=row,col`
 * param so a drive -> editor handoff can pan the camera to the
 * vehicle's current cell.
 *
 * The parse contract reuses `parseSpawnOverride` verbatim (identical
 * `row,col` integer shape, identical rejection cases). Only the URL
 * param name and the resolve semantics differ: spawn requires the
 * cell to host a placed piece (the car needs road under it), focus
 * has no such constraint (the player may want to pan to an empty
 * cell to plan a new build). So this module ships parse + query +
 * search-param read, but no `resolveFocusOverride` analogue.
 */

/** Parse a raw `?focus=row,col` query value. Same contract as
 * `parseSpawnOverride` (integers, optional sign, whitespace tolerant,
 * `null` on any failure). */
export const parseFocusOverride = parseSpawnOverride

/**
 * Compose the URL query for a focus cell. Empty input returns the
 * empty string so the caller can drop the param cleanly when no
 * focus cell is meaningful. Mirrors `spawnOverrideQuery` but writes
 * the `focus` param instead of `spawn`.
 */
export function focusOverrideQuery(
  cell: { row: number; col: number } | null | undefined,
): string {
  if (
    !cell ||
    !Number.isInteger(cell.row) ||
    !Number.isInteger(cell.col)
  ) {
    return ''
  }
  return `?focus=${cell.row},${cell.col}`
}

/**
 * Reader for a Next.js `searchParams` `focus` field. Accepts the
 * `string | string[] | undefined` shape Next gives us and returns
 * the parsed cell, or `null` on any failure. When `focus` is an
 * array (duplicate query params), the first value wins.
 */
export function readFocusSearchParam(
  raw: string | string[] | undefined,
): { row: number; col: number } | null {
  if (raw === undefined) return null
  const single = Array.isArray(raw) ? raw[0] : raw
  return parseFocusOverride(single)
}
