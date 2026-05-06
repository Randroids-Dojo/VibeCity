import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { loadCity } from '@/lib/loadCity'
import { readVersionParam } from '@/lib/cityVersion'
import { parseSlugParam } from '../slugRoute'
import { editDescription, editTitle } from '../slugMetadata'
import { BUILDER_ID_COOKIE, isValidBuilderId } from '@/lib/builderId'
import type { BuilderId } from '@/lib/schemas'
import { EditorClient } from './EditorClient'

/**
 * Editor route at `/<slug>/edit` (REQ-007, REQ-048).
 *
 * v1 scope: validate the slug, optionally pin to a historical version
 * via `?v=<hash>` (REQ-048), load the saved city via `loadCity`
 * (REQ-015), then render the editor client surface (REQ-016 grid +
 * REQ-017 palette + REQ-020 click-to-place + REQ-021 rotate +
 * REQ-022 erase + REQ-023 undo / redo + REQ-025 autosave + REQ-026
 * Drive CTA + REQ-028 / REQ-029 building palette parity) seeded with
 * that city. Pan / zoom (REQ-024) lands in its own slice.
 *
 * `loadCity` returns `EMPTY_CITY` when no save exists or KV is
 * unconfigured, so the editor opens cleanly on a fresh slug. The
 * builder id cookie is issued by `src/middleware.ts`. The Drive CTA
 * lives inside the editor toolbar (REQ-026) so the build / drive loop
 * round-trips from a single control surface, not a separate page-level
 * link below the grid.
 *
 * `?v=<hash>` (REQ-048): pins the editor's initial load to a specific
 * historical version. Hash format is sha256 hex (64 lowercase hex
 * chars) per REQ-013. A malformed hash fails the route via
 * `notFound()`. Loading a pinned version into the editor and then
 * making an edit forks: the next autosave PUT writes a fresh `:latest`
 * pointer, mirroring VibeRacer's "edit-from-history" semantics. v1
 * does not surface a "you are viewing a historical version" banner;
 * the URL itself is the only signal. Adding the banner is a separate
 * polish slice.
 *
 * Invalid slugs return 404 via `notFound()` so unsharable URLs do not
 * leak into the editor.
 */
/**
 * Per-route metadata for `/<slug>/edit` (REQ-007). Sets the browser tab
 * title to "Edit <slug> | VibeCity" and the description to a one-line
 * sentence naming the slug so a shared editor link in iMessage, Slack,
 * or a browser-tab list reads with the slug context instead of the
 * bare site name. Invalid slugs fall back to the site-wide title
 * defined in `src/app/layout.tsx` so a 404 render does not leak a
 * slug-shaped title for a URL that did not load.
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
  const description = editDescription(slug)
  return {
    title: editTitle(slug),
    description,
    openGraph: { title: editTitle(slug), description },
    twitter: { title: editTitle(slug), description },
  }
}

export default async function EditCityPage({
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

  // Read the builder cookie for the sim engine (REQ-080 unification:
  // zone events authored by the builder go through /api/city/[slug]/events).
  // Middleware mints + propagates the cookie on first visit so the
  // value is available on the same request; if the cookie is somehow
  // missing, fall back to notFound() and let a refresh recover.
  const jar = await cookies()
  const builderIdRaw = jar.get(BUILDER_ID_COOKIE)?.value
  if (!builderIdRaw || !isValidBuilderId(builderIdRaw)) {
    notFound()
  }
  const builderId = builderIdRaw as BuilderId

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        fontFamily: 'system-ui, sans-serif',
        background: '#f7f4ee',
        color: '#222',
        padding: 24,
      }}
    >
      <p style={{ fontSize: 14, margin: 0, opacity: 0.55, letterSpacing: 1 }}>
        VIBECITY EDITOR
      </p>
      <h1 style={{ fontSize: 32, margin: 0, wordBreak: 'break-all' }}>{slug}</h1>
      <p style={{ fontSize: 14, margin: 0, opacity: 0.65, textAlign: 'center' }}>
        Switch between Streets and Buildings, pick an entry, click the
        grid to place it. Press R or click Rotate to spin the next
        placement. Press E or click Erase to clear a placed piece or
        building. Cmd+Z or Ctrl+Z undoes the last edit; Cmd+Shift+Z or
        Ctrl+Y redoes. Edits autosave. Press the Drive button in the
        toolbar to take this city for a spin.
      </p>
      <EditorClient slug={slug} initialCity={city} builderId={builderId} />
    </main>
  )
}
