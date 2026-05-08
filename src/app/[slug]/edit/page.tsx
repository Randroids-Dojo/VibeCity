import { notFound, redirect } from 'next/navigation'
import { parseSlugParam } from '../slugRoute'

/**
 * Legacy `/<slug>/edit` redirect (REQ-110 sim-as-primary slice B).
 *
 * Before the route swap the editor surface lived at `/<slug>/edit`
 * with the drive scene at `/<slug>`. Slice B inverts: the editor
 * (now the SimCity-style sim view) lives at `/<slug>` and the drive
 * scene at `/<slug>/drive`. This route is preserved as a 308
 * redirect so any external bookmarks or shared links to the old
 * editor URL keep working.
 *
 * Forward the optional `?v=<hash>` query string so a deep-link to a
 * historical version pins correctly after the redirect (REQ-048).
 *
 * Invalid slugs return 404 via `notFound()` so a malformed URL still
 * surfaces the framework 404 instead of redirecting to a broken
 * route.
 */
export default async function LegacyEditRedirect({
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
  const v = Array.isArray(vRaw) ? vRaw[0] : vRaw
  if (typeof v === 'string' && v.length > 0) {
    redirect(`/${slug}?v=${encodeURIComponent(v)}`)
  }
  redirect(`/${slug}`)
}
