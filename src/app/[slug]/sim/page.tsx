import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { parseSlugParam } from '../slugRoute'
import { BUILDER_ID_COOKIE, isValidBuilderId } from '@/lib/builderId'
import type { BuilderId } from '@/lib/schemas'
import { SimViewClient } from './SimViewClient'

/**
 * Sim view route at `/<slug>/sim` (REQ-110 + REQ-070..074 substrate
 * slice 5 of 5).
 *
 * Validates the slug, reads the builder cookie (REQ-009; middleware
 * mints it on first visit AND propagates the new value to the
 * request cookies so the same-request page handler sees it), then
 * mounts the `SimViewClient` so the useSimEngine hook can author
 * events on the slug. The middleware change is required because the
 * builder cookie is httpOnly and the client cannot read it via
 * document.cookie; the server component is the only path to surface
 * the id to the SimViewClient prop.
 *
 * Invalid slugs return 404 via `notFound()`.
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

  const jar = await cookies()
  const builderIdRaw = jar.get(BUILDER_ID_COOKIE)?.value
  if (!builderIdRaw || !isValidBuilderId(builderIdRaw)) {
    // Middleware should have minted and propagated the cookie before
    // we got here. If it did not, fail closed with a 404 rather than
    // looping the redirect; the next visit (or a refresh) should
    // succeed because the response carries the cookie.
    notFound()
  }
  const builderId = builderIdRaw as BuilderId

  return <SimViewClient slug={slug} builderId={builderId} />
}
