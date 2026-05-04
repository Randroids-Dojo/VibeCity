import { describe, expect, it } from 'vitest'
import SlugDrivePage from '@/app/[slug]/page'

/**
 * REQ-006 / REQ-049: `/<slug>` drive-view route.
 *
 * The route reuses `parseSlugParam` (covered by `slugRoute.test.ts`)
 * for slug validation, so the accept paths for slug shape are already
 * tested upstream. These tests assert the route-level rejection
 * contract: invalid slugs throw the Next.js `notFound()` signal so the
 * framework renders the 404 instead of leaking into the drive view,
 * and a malformed `?v=<hash>` likewise rejects the route so a broken
 * share link surfaces 404 instead of silently falling through to the
 * latest version.
 *
 * The success-path JSX is intentionally not inspected here. Vitest runs
 * in `node` and the drive scene's `<DriveSceneClient>` imports `three`
 * which only runs in a real browser. The production build
 * (`npm run build`) compiles the route end-to-end and the playwright
 * e2e suite covers the rendered shell.
 */

const noSearch: Promise<{ v?: string | string[] }> = Promise.resolve({})

describe('SlugDrivePage (REQ-006, REQ-049)', () => {
  it('throws notFound for an empty slug', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: '' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for an uppercase slug', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: 'Downtown' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with underscores', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: 'my_city' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with a leading dash', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: '-leading-dash' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug with slashes', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: 'foo/bar' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  it('throws notFound for a slug longer than 128 characters', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: 'a'.repeat(129) }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow()
  })

  // REQ-049: malformed `?v=` rejects the route via notFound() so a
  // broken share link surfaces 404 instead of silently loading the
  // latest version.
  it('throws notFound when ?v= is too short', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: 'downtown' }),
        searchParams: Promise.resolve({ v: 'abc123' }),
      }),
    ).rejects.toThrow()
  })

  it('throws notFound when ?v= contains uppercase hex', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: 'downtown' }),
        searchParams: Promise.resolve({
          v: '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
        }),
      }),
    ).rejects.toThrow()
  })

  it('throws notFound when ?v= is empty', async () => {
    await expect(
      SlugDrivePage({
        params: Promise.resolve({ slug: 'downtown' }),
        searchParams: Promise.resolve({ v: '' }),
      }),
    ).rejects.toThrow()
  })

  it('throws notFound when ?v= is supplied as an array', async () => {
    await expect(
      SlugDrivePage({
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
