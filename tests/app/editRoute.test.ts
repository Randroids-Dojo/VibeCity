import { describe, expect, it } from 'vitest'
import SlugSimPage, { generateMetadata } from '@/app/[slug]/page'
import { editDescription, editTitle } from '@/app/[slug]/slugMetadata'
import { SlugSchema } from '@/lib/schemas'

const EditCityPage = SlugSimPage

/**
 * REQ-007 + REQ-110 slice B: editor / sim-as-primary route at `/<slug>`.
 * (Was `/<slug>/edit` before the route swap; that path is now a 308
 * redirect and the editor logic lives at `/<slug>`.)
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

const noSearch: Promise<{ v?: string | string[] }> = Promise.resolve({})

describe('EditCityPage (REQ-007)', () => {
  it('throws notFound for an empty slug', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: '' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for an uppercase slug', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'Downtown' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with underscores', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'my_city' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with spaces', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'my city' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with a leading dash', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: '-leading-dash' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with slashes', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'foo/bar' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug longer than 128 characters', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'a'.repeat(129) }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for URL-encoded characters', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'hello%20world' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  // REQ-048: malformed `?v=` rejects the route via notFound() so a
  // broken share link surfaces 404 instead of silently loading the
  // latest version.
  it('throws notFound when ?v= is too short', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'downtown' }),
        searchParams: Promise.resolve({ v: 'abc123' }),
      }),
    ).rejects.toThrow()
  })

  it('throws notFound when ?v= contains uppercase hex', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'downtown' }),
        searchParams: Promise.resolve({
          v: '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
        }),
      }),
    ).rejects.toThrow()
  })

  it('throws notFound when ?v= is empty', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'downtown' }),
        searchParams: Promise.resolve({ v: '' }),
      }),
    ).rejects.toThrow()
  })

  it('throws notFound when ?v= is supplied as an array', async () => {
    await expect(
      EditCityPage({
        params: Promise.resolve({ slug: 'downtown' }),
        searchParams: Promise.resolve({
          v: [
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          ],
        }),
      }),
    ).rejects.toThrow()
  })
})

describe('generateMetadata for EditCityPage (REQ-007)', () => {
  it('returns the per-slug title and description for a valid slug', async () => {
    const slug = SlugSchema.parse('downtown')
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'downtown' }),
    })
    expect(metadata.title).toBe(editTitle(slug))
    expect(metadata.description).toBe(editDescription(slug))
  })

  it('mirrors the title and description into the OpenGraph card', async () => {
    const slug = SlugSchema.parse('harbor-loop')
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'harbor-loop' }),
    })
    expect(metadata.openGraph?.title).toBe(editTitle(slug))
    expect(metadata.openGraph?.description).toBe(editDescription(slug))
  })

  it('mirrors the title and description into the Twitter card', async () => {
    const slug = SlugSchema.parse('harbor-loop')
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'harbor-loop' }),
    })
    expect(metadata.twitter?.title).toBe(editTitle(slug))
    expect(metadata.twitter?.description).toBe(editDescription(slug))
  })

  it('returns an empty metadata object for an invalid slug so the layout default applies', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'Invalid Slug' }),
    })
    expect(metadata).toEqual({})
  })

  it('returns an empty metadata object for an empty slug', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: '' }),
    })
    expect(metadata).toEqual({})
  })
})
