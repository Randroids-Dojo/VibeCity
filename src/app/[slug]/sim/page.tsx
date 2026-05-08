import { notFound, redirect } from 'next/navigation'
import { parseSlugParam } from '../slugRoute'

/**
 * Legacy sim view redirect (REQ-110 unification, 2026-05-06; REQ-110
 * slice B 2026-05-08).
 *
 * The standalone `/<slug>/sim` route was a tactical artifact from
 * when sim was prototyped separately from the editor. Slice B of the
 * sim-as-primary view (REQ-110) made the editor the canonical
 * `/<slug>` route, so this redirect now points at the bare slug
 * URL. Any external links or bookmarks to `/<slug>/sim` keep
 * working through the redirect.
 *
 * Invalid slugs return 404 via `notFound()` so a malformed URL still
 * surfaces the framework 404 instead of redirecting to a broken
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
  redirect(`/${slug}`)
}
