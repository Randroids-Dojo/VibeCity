import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { loadCity } from '@/lib/loadCity'
import { readVersionParam } from '@/lib/cityVersion'
import { parseSlugParam } from './slugRoute'
import { editDescription, editTitle } from './slugMetadata'
import { BUILDER_ID_COOKIE, isValidBuilderId } from '@/lib/builderId'
import type { BuilderId } from '@/lib/schemas'
import { EditorClient } from './edit/EditorClient'
import { readFocusSearchParam } from './edit/focusOverride'

/**
 * Sim-as-primary view at `/<slug>` (REQ-110, REQ-111).
 *
 * Was the drive route before slice B of REQ-110; the route swap moved
 * the drive scene to `/<slug>/drive` so `/<slug>` can host the
 * SimCity-style 45deg dimetric editor / sim surface as the default
 * landing experience for a saved city. The contract here is the same
 * editor surface that previously lived at `/<slug>/edit` (REQ-007,
 * REQ-016 grid + REQ-017 palette + REQ-020 click-to-place + REQ-021
 * rotate + REQ-022 erase + REQ-023 undo/redo + REQ-025 autosave +
 * REQ-026 Drive CTA + REQ-028/REQ-029 building palette parity). The
 * old `/<slug>/edit` route 308-redirects to here so bookmarks keep
 * working through the migration window.
 *
 * `?v=<hash>` (REQ-048): pins the initial load to a specific
 * historical version. Hash format is sha256 hex (64 lowercase hex
 * chars) per REQ-013. A malformed hash fails the route via
 * `notFound()`. Loading a pinned version into the editor and then
 * making an edit forks: the next autosave PUT writes a fresh `:latest`
 * pointer, mirroring VibeRacer's "edit-from-history" semantics.
 *
 * Invalid slugs return 404 via `notFound()` so unsharable URLs do not
 * leak into the editor.
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

export default async function SlugSimPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    v?: string | string[]
    focus?: string | string[]
  }>
}) {
  const { slug: raw } = await params
  const slug = parseSlugParam(raw)
  if (!slug) {
    notFound()
  }

  const { v: vRaw, focus: focusRaw } = await searchParams
  const pinned = vRaw === undefined ? null : readVersionParam(vRaw)
  if (vRaw !== undefined && pinned === null) {
    notFound()
  }
  // REQ-110: `?focus=row,col` deep-links the editor's camera to a
  // specific cell so a drive -> editor handoff (or a shared link)
  // pans into place automatically. A malformed value falls through
  // to the default viewport rather than 404-ing (the surface still
  // works; the player just gets the default framing).
  const initialFocus = readFocusSearchParam(focusRaw)

  const { city } = await loadCity(slug, pinned ?? undefined)

  const jar = await cookies()
  const builderIdRaw = jar.get(BUILDER_ID_COOKIE)?.value
  if (!builderIdRaw || !isValidBuilderId(builderIdRaw)) {
    notFound()
  }
  const builderId = builderIdRaw as BuilderId

  return (
    <main
      data-view="sim"
      data-route="sim"
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
        VIBECITY
      </p>
      <h1 style={{ fontSize: 32, margin: 0, wordBreak: 'break-all' }}>{slug}</h1>
      <p style={{ fontSize: 14, margin: 0, opacity: 0.65, textAlign: 'center' }}>
        Pick a tab (Streets, Zones, Buildings, Power, Water, Services,
        Disasters), click the iso grid to place items. Press R to
        rotate. Press E to erase. Edits autosave. Click Drive in the
        toolbar to take this city for a spin.
      </p>
      <EditorClient
        slug={slug}
        initialCity={city}
        builderId={builderId}
        initialFocus={initialFocus}
      />
    </main>
  )
}
