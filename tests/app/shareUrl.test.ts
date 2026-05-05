import { describe, expect, it } from 'vitest'
import {
  SHARE_COPY_LABEL_COPIED,
  SHARE_COPY_LABEL_ERROR,
  SHARE_COPY_LABEL_IDLE,
  SHARE_COPY_RESET_DELAY_MS,
  buildShareUrl,
  shareCopyAriaLabel,
  shareCopyLabel,
  type CopyShareStatus,
} from '@/app/[slug]/shareUrl'
import { SlugSchema, type Slug } from '@/lib/schemas'

/**
 * REQ-006, REQ-053: drive HUD share-URL copy button.
 *
 * Pure helpers: URL composition, the visible button label per status,
 * and the accessible-name composition. The live `navigator.clipboard`
 * call lives in `DriveSceneClient.tsx`; this suite covers the math so
 * the URL composition stays correct across origins (with / without
 * trailing slash, blank, undefined, null) and the labels stay distinct
 * across the three lifecycle states.
 */

function slug(value: string): Slug {
  return SlugSchema.parse(value)
}

describe('SHARE_COPY constants (REQ-006, REQ-053)', () => {
  it('idle, copied, and error labels are all non-empty', () => {
    expect(SHARE_COPY_LABEL_IDLE.length).toBeGreaterThan(0)
    expect(SHARE_COPY_LABEL_COPIED.length).toBeGreaterThan(0)
    expect(SHARE_COPY_LABEL_ERROR.length).toBeGreaterThan(0)
  })

  it('idle, copied, and error labels are pairwise distinct so a click registers as visible feedback', () => {
    expect(SHARE_COPY_LABEL_IDLE).not.toBe(SHARE_COPY_LABEL_COPIED)
    expect(SHARE_COPY_LABEL_IDLE).not.toBe(SHARE_COPY_LABEL_ERROR)
    expect(SHARE_COPY_LABEL_COPIED).not.toBe(SHARE_COPY_LABEL_ERROR)
  })

  it('reset delay is positive and short enough to feel responsive on a re-click after failure', () => {
    expect(SHARE_COPY_RESET_DELAY_MS).toBeGreaterThan(0)
    expect(SHARE_COPY_RESET_DELAY_MS).toBeLessThan(5000)
  })

  it('reset delay is long enough to read the feedback (eye refocus is a few hundred ms)', () => {
    expect(SHARE_COPY_RESET_DELAY_MS).toBeGreaterThanOrEqual(800)
  })

  it('idle label is trimmed (no leading or trailing whitespace)', () => {
    expect(SHARE_COPY_LABEL_IDLE).toBe(SHARE_COPY_LABEL_IDLE.trim())
  })

  it('copied label is trimmed (no leading or trailing whitespace)', () => {
    expect(SHARE_COPY_LABEL_COPIED).toBe(SHARE_COPY_LABEL_COPIED.trim())
  })

  it('error label is trimmed (no leading or trailing whitespace)', () => {
    expect(SHARE_COPY_LABEL_ERROR).toBe(SHARE_COPY_LABEL_ERROR.trim())
  })
})

describe('buildShareUrl (REQ-006, REQ-053)', () => {
  it('composes the absolute URL when a clean origin is provided', () => {
    expect(buildShareUrl(slug('downtown'), 'https://vibecity.example')).toBe(
      'https://vibecity.example/downtown',
    )
  })

  it('strips a single trailing slash on the origin', () => {
    expect(buildShareUrl(slug('downtown'), 'https://vibecity.example/')).toBe(
      'https://vibecity.example/downtown',
    )
  })

  it('does not add a second slash when the origin is bare', () => {
    expect(buildShareUrl(slug('a'), 'https://x')).toBe('https://x/a')
  })

  it('returns a relative path when origin is undefined', () => {
    expect(buildShareUrl(slug('downtown'))).toBe('/downtown')
  })

  it('returns a relative path when origin is null', () => {
    expect(buildShareUrl(slug('downtown'), null)).toBe('/downtown')
  })

  it('returns a relative path when origin is the empty string', () => {
    expect(buildShareUrl(slug('downtown'), '')).toBe('/downtown')
  })

  it('returns a relative path when origin is whitespace only', () => {
    expect(buildShareUrl(slug('downtown'), '   ')).toBe('/downtown')
  })

  it('includes localhost ports in the absolute URL', () => {
    expect(buildShareUrl(slug('downtown'), 'http://localhost:3000')).toBe(
      'http://localhost:3000/downtown',
    )
  })

  it('preserves protocol on the origin (no transformation)', () => {
    expect(buildShareUrl(slug('a'), 'http://example.com')).toBe(
      'http://example.com/a',
    )
    expect(buildShareUrl(slug('a'), 'https://example.com')).toBe(
      'https://example.com/a',
    )
  })

  it('does not duplicate the slash when origin is just a forward slash', () => {
    expect(buildShareUrl(slug('downtown'), '/')).toBe('/downtown')
  })

  it('handles a hyphenated slug correctly', () => {
    expect(buildShareUrl(slug('my-cool-city'), 'https://x.example')).toBe(
      'https://x.example/my-cool-city',
    )
  })

  it('produces a usable href shape for the relative-path case (starts with single slash)', () => {
    const url = buildShareUrl(slug('downtown'))
    expect(url.startsWith('/')).toBe(true)
    expect(url.startsWith('//')).toBe(false)
  })
})

describe('shareCopyLabel (REQ-006, REQ-053)', () => {
  it('returns the idle label for the idle status', () => {
    expect(shareCopyLabel('idle')).toBe(SHARE_COPY_LABEL_IDLE)
  })

  it('returns the copied label for the copied status', () => {
    expect(shareCopyLabel('copied')).toBe(SHARE_COPY_LABEL_COPIED)
  })

  it('returns the error label for the error status', () => {
    expect(shareCopyLabel('error')).toBe(SHARE_COPY_LABEL_ERROR)
  })

  it('covers every CopyShareStatus member with a non-empty label', () => {
    const statuses: readonly CopyShareStatus[] = ['idle', 'copied', 'error']
    for (const status of statuses) {
      expect(shareCopyLabel(status).length).toBeGreaterThan(0)
    }
  })
})

describe('shareCopyAriaLabel (REQ-006, REQ-053)', () => {
  it('mentions the slug in the idle aria-label', () => {
    expect(shareCopyAriaLabel(slug('downtown'), 'idle')).toContain('downtown')
  })

  it('mentions the slug in the copied aria-label', () => {
    expect(shareCopyAriaLabel(slug('downtown'), 'copied')).toContain('downtown')
  })

  it('mentions the slug in the error aria-label', () => {
    expect(shareCopyAriaLabel(slug('downtown'), 'error')).toContain('downtown')
  })

  it('produces three pairwise distinct aria-labels (one per status)', () => {
    const idle = shareCopyAriaLabel(slug('a'), 'idle')
    const copied = shareCopyAriaLabel(slug('a'), 'copied')
    const error = shareCopyAriaLabel(slug('a'), 'error')
    expect(idle).not.toBe(copied)
    expect(idle).not.toBe(error)
    expect(copied).not.toBe(error)
  })

  it('idle aria-label reads as a future action verb (Copy)', () => {
    expect(shareCopyAriaLabel(slug('a'), 'idle').toLowerCase()).toContain(
      'copy',
    )
  })

  it('copied aria-label reads as a completed past tense (Copied)', () => {
    expect(shareCopyAriaLabel(slug('a'), 'copied').toLowerCase()).toContain(
      'copied',
    )
  })

  it('error aria-label calls out the failure', () => {
    expect(shareCopyAriaLabel(slug('a'), 'error').toLowerCase()).toContain(
      'fail',
    )
  })
})
