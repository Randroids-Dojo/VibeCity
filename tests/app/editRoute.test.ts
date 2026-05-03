import { describe, expect, it } from 'vitest'
import EditCityPage from '@/app/[slug]/edit/page'

/**
 * REQ-007: `/<slug>/edit` editor route.
 *
 * The route reuses `parseSlugParam` (covered by `slugRoute.test.ts`)
 * for slug validation, so the accept paths for slug shape are already
 * tested upstream. These tests assert the route-level rejection
 * contract: invalid slugs throw the Next.js `notFound()` signal so the
 * framework renders the 404 instead of leaking into the editor.
 *
 * The success-path JSX is intentionally not inspected here. Vitest runs
 * in `node` and there is no React Testing Library or JSX runtime in dev
 * deps (mirroring the prior slice's REQ-006 testing pattern). The
 * production build (`npm run build`) compiles the route end-to-end and
 * is the integration check for the rendered shell. The editor surface
 * itself (REQ-016 onward) lands in its own slices and will bring its
 * own tests.
 */

describe('EditCityPage (REQ-007)', () => {
  it('throws notFound for an empty slug', async () => {
    await expect(
      EditCityPage({ params: Promise.resolve({ slug: '' }) }),
    ).rejects.toThrow()
  })

  it('throws notFound for an uppercase slug', async () => {
    await expect(
      EditCityPage({ params: Promise.resolve({ slug: 'Downtown' }) }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with underscores', async () => {
    await expect(
      EditCityPage({ params: Promise.resolve({ slug: 'my_city' }) }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with spaces', async () => {
    await expect(
      EditCityPage({ params: Promise.resolve({ slug: 'my city' }) }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with a leading dash', async () => {
    await expect(
      EditCityPage({ params: Promise.resolve({ slug: '-leading-dash' }) }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with slashes', async () => {
    await expect(
      EditCityPage({ params: Promise.resolve({ slug: 'foo/bar' }) }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug longer than 128 characters', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'a'.repeat(129) }),
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for URL-encoded characters', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'hello%20world' }),
      }),
    ).rejects.toThrow()
  })
})
