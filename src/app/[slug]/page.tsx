import { notFound } from 'next/navigation'
import { loadCity } from '@/lib/loadCity'
import { parseSlugParam } from './slugRoute'
import { DriveSceneClient } from './DriveSceneClient'

/**
 * Drive-view route at `/<slug>` (REQ-006, REQ-044, REQ-045, REQ-046,
 * REQ-053).
 *
 * v1 scope: validate the slug, load the saved city via `loadCity`
 * (REQ-015), and mount the three.js drive scene scaffold seeded with
 * that city. The scaffold renders street pieces as flat colored quads
 * (REQ-045), buildings as extruded boxes (REQ-046), with a noon-style
 * lighting rig over a flat ground plane (REQ-044), and an empty-state
 * prompt that asks the author to place a road first when the city has
 * zero pieces and zero buildings (REQ-053). The Edit CTA in the
 * scene's top-right corner returns to `/<slug>/edit` so the build /
 * drive loop round-trips from a single control surface.
 *
 * Physics (REQ-031), wheel contact (REQ-032), the chase camera
 * (REQ-033), and keyboard / touch input (REQ-034 / REQ-035) all land
 * in their own slices once the segment-based path (REQ-064) and
 * multi-cell footprint plumbing (REQ-059) ship. v1 ships an aerial /
 * orbit view so the build / drive round trip can be experienced ahead
 * of a drivable car.
 *
 * Invalid slugs return 404 via `notFound()` so unsharable URLs do not
 * leak into the drive view.
 */
export default async function SlugDrivePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug: raw } = await params
  const slug = parseSlugParam(raw)
  if (!slug) {
    notFound()
  }

  const { city } = await loadCity(slug)

  return <DriveSceneClient slug={slug} city={city} />
}
