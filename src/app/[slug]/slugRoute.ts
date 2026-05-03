import { SlugSchema, type Slug } from '@/lib/schemas'

/**
 * Validate a raw slug captured from the URL segment.
 *
 * Returns the typed `Slug` brand on success and `null` when the input
 * fails `SlugSchema`. Route handlers call this and pass the `null` case
 * to `notFound()` so invalid URLs render the framework 404 instead of
 * crashing the page render.
 *
 * Kept as a separate module from the React server component so it can
 * be unit tested without a JSX runtime.
 */
export function parseSlugParam(raw: string): Slug | null {
  const result = SlugSchema.safeParse(raw)
  return result.success ? result.data : null
}
