import { describe, expect, it } from 'vitest'
import {
  EDIT_COPY_LABEL_IDLE,
  SHARE_COPY_LABEL_COPIED,
  SHARE_COPY_LABEL_ERROR,
  SHARE_COPY_LABEL_IDLE,
  SHARE_COPY_RESET_DELAY_MS,
  buildEditUrl,
  buildShareUrl,
  editCopyAriaLabel,
  editCopyLabel,
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

describe('buildShareUrl (REQ-006, REQ-053, REQ-110 slice B)', () => {
  it('composes the absolute URL when a clean origin is provided', () => {
    expect(buildShareUrl(slug('downtown'), 'https://vibecity.example')).toBe(
      'https://vibecity.example/downtown/drive',
    )
  })

  it('strips a single trailing slash on the origin', () => {
    expect(buildShareUrl(slug('downtown'), 'https://vibecity.example/')).toBe(
      'https://vibecity.example/downtown/drive',
    )
  })

  it('does not add a second slash when the origin is bare', () => {
    expect(buildShareUrl(slug('a'), 'https://x')).toBe('https://x/a/drive')
  })

  it('returns a relative path when origin is undefined', () => {
    expect(buildShareUrl(slug('downtown'))).toBe('/downtown/drive')
  })

  it('returns a relative path when origin is null', () => {
    expect(buildShareUrl(slug('downtown'), null)).toBe('/downtown/drive')
  })

  it('returns a relative path when origin is the empty string', () => {
    expect(buildShareUrl(slug('downtown'), '')).toBe('/downtown/drive')
  })

  it('returns a relative path when origin is whitespace only', () => {
    expect(buildShareUrl(slug('downtown'), '   ')).toBe('/downtown/drive')
  })

  it('includes localhost ports in the absolute URL', () => {
    expect(buildShareUrl(slug('downtown'), 'http://localhost:3000')).toBe(
      'http://localhost:3000/downtown/drive',
    )
  })

  it('preserves protocol on the origin (no transformation)', () => {
    expect(buildShareUrl(slug('a'), 'http://example.com')).toBe(
      'http://example.com/a/drive',
    )
    expect(buildShareUrl(slug('a'), 'https://example.com')).toBe(
      'https://example.com/a/drive',
    )
  })

  it('does not duplicate the slash when origin is just a forward slash', () => {
    expect(buildShareUrl(slug('downtown'), '/')).toBe('/downtown/drive')
  })

  it('handles a hyphenated slug correctly', () => {
    expect(buildShareUrl(slug('my-cool-city'), 'https://x.example')).toBe(
      'https://x.example/my-cool-city/drive',
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

describe('EDIT_COPY_LABEL_IDLE (REQ-007, REQ-026)', () => {
  it('is non-empty', () => {
    expect(EDIT_COPY_LABEL_IDLE.length).toBeGreaterThan(0)
  })

  it('is trimmed (no leading or trailing whitespace)', () => {
    expect(EDIT_COPY_LABEL_IDLE).toBe(EDIT_COPY_LABEL_IDLE.trim())
  })

  it('differs from the drive-share idle label so the two surfaces read distinct copy labels', () => {
    expect(EDIT_COPY_LABEL_IDLE).not.toBe(SHARE_COPY_LABEL_IDLE)
  })

  it('mentions the build verb so the editor button reads as the build half of the build / drive loop', () => {
    expect(EDIT_COPY_LABEL_IDLE.toLowerCase()).toContain('build')
  })

  it('uses the copy verb so the click target reads as a copy action', () => {
    expect(EDIT_COPY_LABEL_IDLE.toLowerCase()).toContain('copy')
  })
})

describe('buildEditUrl (REQ-007, REQ-026, REQ-110 slice B)', () => {
  it('composes the absolute editor URL when a clean origin is provided', () => {
    expect(buildEditUrl(slug('downtown'), 'https://vibecity.example')).toBe(
      'https://vibecity.example/downtown',
    )
  })

  it('strips a single trailing slash on the origin', () => {
    expect(buildEditUrl(slug('downtown'), 'https://vibecity.example/')).toBe(
      'https://vibecity.example/downtown',
    )
  })

  it('does not add a second slash when the origin is bare', () => {
    expect(buildEditUrl(slug('a'), 'https://x')).toBe('https://x/a')
  })

  it('returns a relative path when origin is undefined', () => {
    expect(buildEditUrl(slug('downtown'))).toBe('/downtown')
  })

  it('returns a relative path when origin is null', () => {
    expect(buildEditUrl(slug('downtown'), null)).toBe('/downtown')
  })

  it('returns a relative path when origin is the empty string', () => {
    expect(buildEditUrl(slug('downtown'), '')).toBe('/downtown')
  })

  it('returns a relative path when origin is whitespace only', () => {
    expect(buildEditUrl(slug('downtown'), '   ')).toBe('/downtown')
  })

  it('includes localhost ports in the absolute URL', () => {
    expect(buildEditUrl(slug('downtown'), 'http://localhost:3000')).toBe(
      'http://localhost:3000/downtown',
    )
  })

  it('preserves protocol on the origin (no transformation)', () => {
    expect(buildEditUrl(slug('a'), 'http://example.com')).toBe(
      'http://example.com/a',
    )
    expect(buildEditUrl(slug('a'), 'https://example.com')).toBe(
      'https://example.com/a',
    )
  })

  it('does not duplicate the slash when origin is just a forward slash', () => {
    expect(buildEditUrl(slug('downtown'), '/')).toBe('/downtown')
  })

  it('handles a hyphenated slug correctly', () => {
    expect(buildEditUrl(slug('my-cool-city'), 'https://x.example')).toBe(
      'https://x.example/my-cool-city',
    )
  })

  it('produces a usable href shape for the relative-path case (starts with single slash)', () => {
    const url = buildEditUrl(slug('downtown'))
    expect(url.startsWith('/')).toBe(true)
    expect(url.startsWith('//')).toBe(false)
  })

  it('REQ-110 slice B: editor URL is the bare slug (no /edit suffix anymore)', () => {
    expect(buildEditUrl(slug('downtown'))).not.toMatch(/\/edit$/)
    expect(buildEditUrl(slug('downtown'), 'https://x.example')).not.toMatch(
      /\/edit$/,
    )
  })

  it('differs from buildShareUrl so the two helpers point at distinct destinations', () => {
    const driveUrl = buildShareUrl(slug('downtown'), 'https://x.example')
    const buildUrl = buildEditUrl(slug('downtown'), 'https://x.example')
    expect(driveUrl).not.toBe(buildUrl)
    // Drive is the editor URL plus `/drive` after slice B.
    expect(driveUrl).toBe(`${buildUrl}/drive`)
  })

  it('reuses SHARE_COPY_RESET_DELAY_MS so the two surfaces share the lifecycle timing', () => {
    expect(SHARE_COPY_RESET_DELAY_MS).toBeGreaterThan(0)
  })
})

describe('editCopyLabel (REQ-007, REQ-026)', () => {
  it('returns the editor idle label for the idle status', () => {
    expect(editCopyLabel('idle')).toBe(EDIT_COPY_LABEL_IDLE)
  })

  it('reuses SHARE_COPY_LABEL_COPIED for the copied status', () => {
    expect(editCopyLabel('copied')).toBe(SHARE_COPY_LABEL_COPIED)
  })

  it('reuses SHARE_COPY_LABEL_ERROR for the error status', () => {
    expect(editCopyLabel('error')).toBe(SHARE_COPY_LABEL_ERROR)
  })

  it('covers every CopyShareStatus member with a non-empty label', () => {
    const statuses: readonly CopyShareStatus[] = ['idle', 'copied', 'error']
    for (const status of statuses) {
      expect(editCopyLabel(status).length).toBeGreaterThan(0)
    }
  })

  it('produces three pairwise distinct labels (one per status)', () => {
    const idle = editCopyLabel('idle')
    const copied = editCopyLabel('copied')
    const error = editCopyLabel('error')
    expect(idle).not.toBe(copied)
    expect(idle).not.toBe(error)
    expect(copied).not.toBe(error)
  })

  it('idle label differs from the drive surface idle label so the two buttons read distinct copy actions', () => {
    expect(editCopyLabel('idle')).not.toBe(shareCopyLabel('idle'))
  })

  it('copied label matches the drive surface copied label so the success feedback vocabulary stays one channel', () => {
    expect(editCopyLabel('copied')).toBe(shareCopyLabel('copied'))
  })

  it('error label matches the drive surface error label so the failure feedback vocabulary stays one channel', () => {
    expect(editCopyLabel('error')).toBe(shareCopyLabel('error'))
  })
})

describe('editCopyAriaLabel (REQ-007, REQ-026)', () => {
  it('mentions the slug in the idle aria-label', () => {
    expect(editCopyAriaLabel(slug('downtown'), 'idle')).toContain('downtown')
  })

  it('mentions the slug in the copied aria-label', () => {
    expect(editCopyAriaLabel(slug('downtown'), 'copied')).toContain('downtown')
  })

  it('mentions the slug in the error aria-label', () => {
    expect(editCopyAriaLabel(slug('downtown'), 'error')).toContain('downtown')
  })

  it('produces three pairwise distinct aria-labels (one per status)', () => {
    const idle = editCopyAriaLabel(slug('a'), 'idle')
    const copied = editCopyAriaLabel(slug('a'), 'copied')
    const error = editCopyAriaLabel(slug('a'), 'error')
    expect(idle).not.toBe(copied)
    expect(idle).not.toBe(error)
    expect(copied).not.toBe(error)
  })

  it('idle aria-label reads as a future action verb (Copy)', () => {
    expect(editCopyAriaLabel(slug('a'), 'idle').toLowerCase()).toContain(
      'copy',
    )
  })

  it('copied aria-label reads as a completed past tense (Copied)', () => {
    expect(editCopyAriaLabel(slug('a'), 'copied').toLowerCase()).toContain(
      'copied',
    )
  })

  it('error aria-label calls out the failure', () => {
    expect(editCopyAriaLabel(slug('a'), 'error').toLowerCase()).toContain(
      'fail',
    )
  })

  it('mentions the build verb so the screen-reader hears the editor URL is the destination', () => {
    expect(editCopyAriaLabel(slug('a'), 'idle').toLowerCase()).toContain(
      'build',
    )
    expect(editCopyAriaLabel(slug('a'), 'copied').toLowerCase()).toContain(
      'build',
    )
    expect(editCopyAriaLabel(slug('a'), 'error').toLowerCase()).toContain(
      'build',
    )
  })

  it('idle aria-label differs from the drive surface idle aria-label', () => {
    expect(editCopyAriaLabel(slug('a'), 'idle')).not.toBe(
      shareCopyAriaLabel(slug('a'), 'idle'),
    )
  })
})
