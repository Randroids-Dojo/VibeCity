import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { loadCity } from '@/lib/loadCity'
import { readVersionParam } from '@/lib/cityVersion'
import { parseSlugParam } from '../slugRoute'
import { DriveSceneClient } from '../DriveSceneClient'
import { driveDescription, driveTitle } from '../slugMetadata'
import { BUILDER_ID_COOKIE, isValidBuilderId } from '@/lib/builderId'
import type { BuilderId } from '@/lib/schemas'

/**
 * Drive-view route at `/<slug>/drive` (REQ-110 sim-as-primary view).
 *
 * Was at `/<slug>` before slice B of REQ-110; the route swap relocated
 * the drive scene under `/<slug>/drive` so `/<slug>` can host the
 * SimCity-style sim-as-primary view (the editor surface). The drive
 * scene contract is unchanged: validate the slug, optionally pin to a
 * historical version via `?v=<hash>` (REQ-049), load the saved city
 * via `loadCity` (REQ-015), and mount the three.js drive scene
 * scaffold seeded with that city. The Sim-view CTA in the scene's
 * top-right corner returns to `/<slug>` so the build / drive loop
 * round-trips from a single control surface.
 *
 * `?v=<hash>` (REQ-049): pins the load to a specific historical
 * version. Hash format is sha256 hex (64 lowercase hex chars) per
 * REQ-013. A malformed hash fails the route via `notFound()` so a
 * broken share link surfaces the framework 404 instead of silently
 * falling through to the latest version (which would be a confusing
 * UX for a shared snapshot URL). A valid-shape hash that is not in KV
 * resolves to `EMPTY_CITY` via `loadCity`'s missing-version branch so
 * the empty-state prompt appears; the page still renders, the URL is
 * still meaningful, and the player can click Sim view to start over.
 *
 * Invalid slugs return 404 via `notFound()` so unsharable URLs do not
 * leak into the drive view.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug: raw } = await params
  const slug = parseSlugParam(raw)
  if (!slug) {
    return {}
  }
  const description = driveDescription(slug)
  return {
    title: driveTitle(slug),
    description,
    openGraph: { title: driveTitle(slug), description },
    twitter: { title: driveTitle(slug), description },
  }
}

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

  const jar = await cookies()
  const builderIdRaw = jar.get(BUILDER_ID_COOKIE)?.value
  if (!builderIdRaw || !isValidBuilderId(builderIdRaw)) {
    notFound()
  }
  const builderId = builderIdRaw as BuilderId

  return <DriveSceneClient slug={slug} city={city} builderId={builderId} />
}
