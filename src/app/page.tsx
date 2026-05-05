import Link from 'next/link'
import { cityIndexCount, recentCities } from '@/lib/recentSlugs'
import { formatCityCount } from '@/lib/cityCount'
import { formatRelativeTime } from '@/lib/relativeTime'
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
            {cities.map(({ slug, updatedAt }) => {
              const relative = formatRelativeTime(updatedAt, nowMs)
              const iso = new Date(updatedAt).toISOString()
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
                      flexDirection: 'column',
                      gap: 4,
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
