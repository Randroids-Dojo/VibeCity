import Link from 'next/link'
import { notFound } from 'next/navigation'
import { parseSlugParam } from './slugRoute'

/**
 * Drive-view route at `/<slug>` (REQ-006).
 *
 * v1 scope: validate the slug, render the empty-city landing with a
 * Create CTA linking to `/<slug>/edit` (REQ-010). The drive scene
 * (REQ-031 onward) and saved-city load (REQ-015) land in their own
 * slices; until then every visit shows the landing.
 *
 * Invalid slugs return 404 via `notFound()` so unsharable URLs do not
 * leak into the editor.
 */
export default async function SlugLandingPage({
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
        VIBECITY
      </p>
      <h1 style={{ fontSize: 48, margin: 0, wordBreak: 'break-all' }}>{slug}</h1>
      <p style={{ fontSize: 18, margin: 0, opacity: 0.75, textAlign: 'center' }}>
        No city is here yet. Be the first to build one.
      </p>
      <Link
        href={`/${slug}/edit`}
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
        Create this city
      </Link>
    </main>
  )
}
