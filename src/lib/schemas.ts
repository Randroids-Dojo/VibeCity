import { z } from 'zod'

/**
 * Slug schema for city URLs.
 *
 * Rules (REQ-008):
 *   - kebab-case
 *   - 1 to 128 chars
 *   - first char must be [a-z0-9]
 *   - remaining chars are [a-z0-9-]
 *
 * Ported from VibeRacer's `src/lib/schemas.ts` SlugSchema.
 */
export const SlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be kebab-case')

export type Slug = z.infer<typeof SlugSchema>

/**
 * Best-effort normalizer for raw user input.
 *
 * Lowercases, drops disallowed characters, strips a leading run of dashes,
 * and clamps to the schema's max length. Output is not guaranteed to pass
 * `SlugSchema.safeParse` (e.g. an all-dash input collapses to empty); the
 * caller must validate with `SlugSchema` before use.
 */
export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')
    .slice(0, 128)
}
