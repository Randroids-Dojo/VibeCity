import Link from 'next/link'
import { cityIndexCount, recentCities } from '@/lib/recentSlugs'
import { formatCityCount } from '@/lib/cityCount'
import { formatRelativeTime } from '@/lib/format/relativeTime'
import { loadCity } from '@/lib/loadCity'
import {
  THUMBNAIL_DOT_RADIUS,
  THUMBNAIL_SIZE_PX,
  cityThumbnailDots,
  type ThumbnailDot,
} from '@/lib/cityThumbnail'
import { HomeCreateForm } from './HomeCreateForm'

/**
 * Home page (REQ-050).
 *
 * Server component that lists recently-updated slugs from `city:index`
 * (REQ-011) plus a Create-new-slug input. The list defaults to the
 * twelve newest slugs; an empty list (no saves yet, or KV not
 * configured locally) renders a friendly placeholder so the page is
 * never blank.
 *
 * Each recent-slug entry links to `/<slug>` so a visitor lands on the
 * drive view of an existing city. The card surfaces a relative "Updated
 * N ago" cue (REQ-011, REQ-050) so a visitor sees how fresh each entry
 * is at a glance; the helper reads the `Date.now()` score the PUT route
 * wrote on save and `formatRelativeTime` collapses the delta into a
 * short readable cue. The Create input creates a new slug by navigating
 * to `/<new-slug>/edit`. The two halves of the home page mirror the
 * build / drive loop: visit an existing city to drive it, type a new
 * slug to start building one.
 */
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Read the recently-updated list and the total count in parallel so
  // both KV reads complete in one network round-trip rather than
  // serializing on the slower of the two.
  const [cities, totalCount] = await Promise.all([
    recentCities(),
    cityIndexCount(),
  ])
  // F-011: fetch each recent city's payload in parallel so the
  // recent-card thumbnails render alongside the slug + relative-time
  // labels. The recentCities limit is bounded (default 12) so the
  // parallel fan-out stays small.
  const thumbnailDots = await Promise.all(
    cities.map(async ({ slug }) => {
      try {
        const { city } = await loadCity(slug)
        return cityThumbnailDots(city)
      } catch (err) {
        console.warn(
          `home: thumbnail loadCity failed for slug=${slug}:`,
          err,
        )
        return []
      }
    }),
  )
  // Snapshot the clock once per request so every entry's relative cue
  // is computed against the same `now`. Reading `Date.now()` per-entry
  // would let a slow render leak inconsistent readouts ("just now" /
  // "1m ago") for two saves landed at the same instant.
  const nowMs = Date.now()
  const totalCountLabel = formatCityCount(totalCount)

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        fontFamily: 'system-ui, sans-serif',
        background: '#f7f4ee',
        color: '#222',
        padding: '48px 24px',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 56, margin: 0 }}>VibeCity</h1>
        <p style={{ fontSize: 18, margin: 0, opacity: 0.75 }}>
          A fully vibed city builder you can actually drive around in.
        </p>
        {totalCountLabel.length > 0 ? (
          <p
            data-testid="home-total-count"
            data-total-count={totalCount}
            style={{
              fontSize: 14,
              margin: 0,
              opacity: 0.6,
              letterSpacing: 0.3,
            }}
          >
            {totalCountLabel}
          </p>
        ) : null}
      </header>

      <HomeCreateForm />

      <Link
        href="/demo/drive"
        data-testid="home-demo-cta"
        prefetch
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 20px',
          fontSize: 15,
          color: '#222',
          background: '#fdfaf2',
          border: '1px solid #b6a87a',
          borderRadius: 4,
          textDecoration: 'none',
          letterSpacing: 0.3,
        }}
      >
        Try the demo
        <span aria-hidden="true">{'→'}</span>
      </Link>

      <section
        data-testid="home-recent-section"
        data-recent-count={cities.length}
        aria-labelledby="home-recent-heading"
        style={{
          width: '100%',
          maxWidth: 720,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h2
          id="home-recent-heading"
          style={{
            fontSize: 18,
            margin: 0,
            opacity: 0.7,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Recently updated
        </h2>
        {cities.length === 0 ? (
          <p
            data-testid="home-recent-empty"
            style={{ margin: 0, fontSize: 14, opacity: 0.6 }}
          >
            No cities yet. Pick a slug above to start building.
          </p>
        ) : (
          <ul
            data-testid="home-recent-list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 8,
            }}
          >
            {cities.map(({ slug, updatedAt }, index) => {
              const relative = formatRelativeTime(updatedAt, nowMs)
              const iso = new Date(updatedAt).toISOString()
              const dots = thumbnailDots[index] ?? []
              return (
                <li key={slug}>
                  <Link
                    href={`/${slug}`}
                    data-testid="home-recent-link"
                    data-slug={slug}
                    data-updated-at={updatedAt}
                    prefetch
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      fontSize: 15,
                      color: '#222',
                      background: '#fdfaf2',
                      border: '1px solid #d6cfbf',
                      borderRadius: 4,
                      textDecoration: 'none',
                      wordBreak: 'break-all',
                    }}
                  >
                    <RecentCityThumbnail slug={slug} dots={dots} />
                    <span
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        minWidth: 0,
                      }}
                    >
                      <span data-testid="home-recent-slug">{slug}</span>
                      {relative.length > 0 ? (
                        <time
                          data-testid="home-recent-updated"
                          data-updated-at={updatedAt}
                          dateTime={iso}
                          title={iso}
                          style={{ fontSize: 12, opacity: 0.6 }}
                        >
                          {`Updated ${relative}`}
                        </time>
                      ) : null}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}

/**
 * Tiny SVG preview of a city's pieces and buildings (F-011). Renders
 * a fixed-size square thumbnail in each recent-card so a visitor reads
 * which slug is interesting at a glance instead of just slug text.
 * An empty city renders an empty grid background with no dots.
 */
function RecentCityThumbnail({
  slug,
  dots,
}: {
  slug: string
  dots: ThumbnailDot[]
}) {
  return (
    <svg
      data-testid="home-recent-thumbnail"
      data-slug={slug}
      data-dot-count={dots.length}
      role="img"
      aria-label={`Preview of ${slug}`}
      width={THUMBNAIL_SIZE_PX}
      height={THUMBNAIL_SIZE_PX}
      viewBox="0 0 1 1"
      preserveAspectRatio="xMidYMid meet"
      style={{
        flex: '0 0 auto',
        background: '#f4eedc',
        border: '1px solid #d6cfbf',
        borderRadius: 3,
      }}
    >
      {dots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.xNorm}
          cy={dot.yNorm}
          r={THUMBNAIL_DOT_RADIUS}
          fill={dot.kind === 'piece' ? '#3a2f1a' : '#a36a3a'}
          data-dot-kind={dot.kind}
        />
      ))}
    </svg>
  )
}
