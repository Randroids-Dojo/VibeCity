import { notFound, redirect } from 'next/navigation'
import { parseSlugParam } from '../slugRoute'

/**
 * Legacy sim view redirect (REQ-110 unification, 2026-05-06).
 *
 * The standalone `/<slug>/sim` route was a tactical artifact from
 * when sim was prototyped separately from the editor. The user
 * correctly observed that the editor and the sim view are the same
 * kind of paintable-grid surface. Slice REQ-110 step 2 unifies them
 * by absorbing the sim engine + zone palette + speed controls into
 * the editor at `/<slug>/edit`. This route is preserved as a 308
 * redirect so any external links or bookmarks to `/<slug>/sim` keep
 * working; the canonical surface is now the editor.
 *
 * Invalid slugs return 404 via `notFound()` so a malformed URL still
 * surfaces the framework 404 instead of redirecting to a broken edit
 * route.
 */
export default async function SimViewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug: raw } = await params
  const slug = parseSlugParam(raw)
  if (!slug) {
    notFound()
  }
  redirect(`/${slug}/edit`)
}
