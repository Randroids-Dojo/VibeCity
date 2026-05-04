import { notFound } from 'next/navigation'
import { loadCity } from '@/lib/loadCity'
import { parseSlugParam } from '../slugRoute'
import { EditorClient } from './EditorClient'

/**
 * Editor route at `/<slug>/edit` (REQ-007).
 *
 * v1 scope: validate the slug, load the saved city via `loadCity`
 * (REQ-015), then render the editor client surface (REQ-016 grid +
 * REQ-017 palette + REQ-020 click-to-place + REQ-021 rotate +
 * REQ-022 erase + REQ-023 undo / redo + REQ-025 autosave + REQ-026
 * Drive CTA) seeded with that city. Pan / zoom (REQ-024) lands in its
 * own slice.
 *
 * `loadCity` returns `EMPTY_CITY` when no save exists or KV is
 * unconfigured, so the editor opens cleanly on a fresh slug. The
 * builder id cookie is issued by `src/middleware.ts`. The Drive CTA
 * lives inside the editor toolbar (REQ-026) so the build / drive loop
 * round-trips from a single control surface, not a separate page-level
 * link below the grid.
 *
 * Invalid slugs return 404 via `notFound()` so unsharable URLs do not
 * leak into the editor.
 */
export default async function EditCityPage({
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
        Pick a piece, click the grid to place it. Press R or click
        Rotate to spin the next placement. Press E or click Erase to
        clear a placed piece. Cmd+Z or Ctrl+Z undoes the last edit;
        Cmd+Shift+Z or Ctrl+Y redoes. Edits autosave. Press the Drive
        button in the toolbar to take this city for a spin.
      </p>
      <EditorClient slug={slug} initialCity={city} />
    </main>
  )
}
