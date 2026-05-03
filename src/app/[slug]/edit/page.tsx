import Link from 'next/link'
import { notFound } from 'next/navigation'
import { parseSlugParam } from '../slugRoute'

/**
 * Editor route at `/<slug>/edit` (REQ-007).
 *
 * v1 scope: validate the slug, render the editor placeholder shell with
 * a Drive CTA linking back to `/<slug>`. The actual editor surface
 * (snap grid, piece palette, place / rotate / erase, autosave) lands in
 * its own slices (REQ-016 onward); until then this route exists so the
 * fresh-slug landing's "Create this city" CTA has a valid target instead
 * of producing a 404.
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
        justifyContent: 'center',
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
      <h1 style={{ fontSize: 48, margin: 0, wordBreak: 'break-all' }}>{slug}</h1>
      <p style={{ fontSize: 18, margin: 0, opacity: 0.75, textAlign: 'center' }}>
        Editor surface lands in its own slice. Place pieces, build a city,
        drive it.
      </p>
      <Link
        href={`/${slug}`}
        style={{
          marginTop: 16,
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
