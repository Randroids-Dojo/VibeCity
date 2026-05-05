import type { Slug } from '@/lib/schemas'

/**
 * Per-slug metadata helpers (REQ-006, REQ-007, REQ-053).
 *
 * Pure module: no Next.js imports, no React. The drive and edit route
 * `generateMetadata` exports compose these helpers with the validated
 * slug to produce browser-tab titles and link-preview descriptions.
 *
 * Until this slice the only metadata on the slug routes was the
 * application-wide `metadata` object in `src/app/layout.tsx` (title
 * "VibeCity", a one-line site description). That meant a shared drive
 * link in iMessage, Slack, or a browser-tab list read as the bare
 * "VibeCity" with no slug context, and a builder with two tabs open
 * could not tell the drive view of "downtown" from the editor of
 * "harbor-loop". The per-route metadata closes that gap by surfacing
 * the slug and the build / drive role in the title, plus a one-line
 * description that names the slug for link-preview cards.
 *
 * The helpers are pure so the unit tests can pin the exact title /
 * description strings without spinning up a Next.js render pipeline,
 * and the production build picks the strings up via the route-level
 * `generateMetadata` exports.
 */

/**
 * Site-wide app name used as the trailing fragment on every per-route
 * title. Matches the `title` in `src/app/layout.tsx` so the brand reads
 * the same on the home page and on every per-slug route.
 */
export const APP_NAME = 'VibeCity'

/**
 * Title separator. Matches the conventional " | " pattern other web
 * apps use so a long slug followed by the app name still reads clearly
 * in a constrained tab strip.
 */
export const TITLE_SEPARATOR = ' | '

/**
 * Build the browser-tab title for the drive route at `/<slug>`. Reads
 * as "Drive <slug> | VibeCity". The slug comes first so a builder with
 * many tabs open scans the slug column first; the role ("Drive") is
 * the second cue, and the brand fragment closes the line.
 */
export function driveTitle(slug: Slug): string {
  return `Drive ${slug}${TITLE_SEPARATOR}${APP_NAME}`
}

/**
 * Build the browser-tab title for the editor route at `/<slug>/edit`.
 * Reads as "Edit <slug> | VibeCity". Mirrors `driveTitle` so the slug
 * is the first cue and the role is the second cue; "Edit" vs "Drive"
 * is the only difference between the two route titles for the same
 * slug, which matches the build / drive loop the GDD names.
 */
export function editTitle(slug: Slug): string {
  return `Edit ${slug}${TITLE_SEPARATOR}${APP_NAME}`
}

/**
 * One-line description for the drive route. Used both for the
 * browser-tab description and the social-share link preview card. The
 * sentence interpolates the slug so a shared drive link reads as a
 * sentence that names the destination city.
 */
export function driveDescription(slug: Slug): string {
  return `Drive around the ${slug} city on VibeCity.`
}

/**
 * One-line description for the editor route. Mirrors `driveDescription`
 * with the build verb so a shared editor link reads as the
 * complementary half of the build / drive loop.
 */
export function editDescription(slug: Slug): string {
  return `Build the ${slug} city on VibeCity.`
}
