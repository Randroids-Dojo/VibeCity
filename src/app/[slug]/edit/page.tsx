import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EMPTY_CITY } from '@/lib/schemas'
import { parseSlugParam } from '../slugRoute'
import { EditorClient } from './EditorClient'

/**
 * Editor route at `/<slug>/edit` (REQ-007).
 *
 * v1 scope: validate the slug, render the editor client surface
 * (REQ-016 grid + REQ-017 palette + REQ-020 click-to-place) seeded
 * with the default empty city plus a Drive CTA linking back to
 * `/<slug>`. Rotate / erase (REQ-021, REQ-022), undo / redo
 * (REQ-023), pan / zoom (REQ-024), and autosave (REQ-025) land in
 * follow-up slices.
 *
 * The grid is seeded with `EMPTY_CITY` directly. Loading a saved
 * city (REQ-015) into the editor lands with REQ-025 (autosave) so
 * the read and write paths can ship together.
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
        Pick a piece, click the grid to place it. Rotate, erase, and
        autosave land next.
      </p>
      <EditorClient initialCity={EMPTY_CITY} />
      <Link
        href={`/${slug}`}
        style={{
          marginTop: 8,
          padding: '12px 24px',
          background: '#222',
          color: '#f7f4ee',
          textDecoration: 'none',
          fontSize: 16,
          borderRadius: 4,
        }}
      >
        Drive this city
      </Link>
    </main>
  )
}
