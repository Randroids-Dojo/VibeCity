import { notFound } from 'next/navigation'
import { loadCity } from '@/lib/loadCity'
import { readVersionParam } from '@/lib/cityVersion'
import { parseSlugParam } from './slugRoute'
import { DriveSceneClient } from './DriveSceneClient'

/**
 * Drive-view route at `/<slug>` (REQ-006, REQ-044, REQ-045, REQ-046,
 * REQ-049, REQ-053).
 *
 * v1 scope: validate the slug, optionally pin to a historical version
 * via `?v=<hash>` (REQ-049), load the saved city via `loadCity`
 * (REQ-015), and mount the three.js drive scene scaffold seeded with
 * that city. The scaffold renders street pieces as flat colored quads
 * (REQ-045), buildings as extruded boxes (REQ-046), with a noon-style
 * lighting rig over a flat ground plane (REQ-044), and an empty-state
 * prompt that asks the author to place a road first when the city has
 * zero pieces and zero buildings (REQ-053). The Edit CTA in the
 * scene's top-right corner returns to `/<slug>/edit` so the build /
 * drive loop round-trips from a single control surface.
 *
 * `?v=<hash>` (REQ-049): pins the load to a specific historical
 * version. Hash format is sha256 hex (64 lowercase hex chars) per
 * REQ-013. A malformed hash fails the route via `notFound()` so a
 * broken share link surfaces the framework 404 instead of silently
 * falling through to the latest version (which would be a confusing
 * UX for a shared snapshot URL). A valid-shape hash that is not in KV
 * resolves to `EMPTY_CITY` via `loadCity`'s missing-version branch so
 * the empty-state prompt appears; the page still renders, the URL is
 * still meaningful, and the player can click Edit to start over.
 *
 * Invalid slugs return 404 via `notFound()` so unsharable URLs do not
 * leak into the drive view.
 */
export default async function SlugDrivePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ v?: string | string[] }>
}) {
  const { slug: raw } = await params
  const slug = parseSlugParam(raw)
  if (!slug) {
    notFound()
  }

  const { v: vRaw } = await searchParams
  const pinned = vRaw === undefined ? null : readVersionParam(vRaw)
  if (vRaw !== undefined && pinned === null) {
    notFound()
  }

  const { city } = await loadCity(slug, pinned ?? undefined)

  return <DriveSceneClient slug={slug} city={city} />
}
