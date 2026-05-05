import { describe, expect, it } from 'vitest'
import {
  APP_NAME,
  TITLE_SEPARATOR,
  driveDescription,
  driveTitle,
  editDescription,
  editTitle,
} from '@/app/[slug]/slugMetadata'
import { SlugSchema, type Slug } from '@/lib/schemas'

/**
 * REQ-006, REQ-007, REQ-053: per-slug metadata helpers.
 *
 * The drive and edit `generateMetadata` exports import these helpers
 * to compose the browser-tab title and the social-share description.
 * The unit tests pin the exact strings (the title shape, the role
 * verbs, the slug interpolation) so a regression on the share-UX
 * surface is caught before the playwright spec runs.
 */

const slug = (raw: string): Slug => SlugSchema.parse(raw)

describe('APP_NAME and TITLE_SEPARATOR (REQ-006, REQ-007)', () => {
  it('APP_NAME matches the site brand', () => {
    expect(APP_NAME).toBe('VibeCity')
  })

  it('APP_NAME is non-empty and trimmed', () => {
    expect(APP_NAME.length).toBeGreaterThan(0)
    expect(APP_NAME).toBe(APP_NAME.trim())
  })

  it('TITLE_SEPARATOR is the conventional pipe with single spaces', () => {
    expect(TITLE_SEPARATOR).toBe(' | ')
  })

  it('TITLE_SEPARATOR is exactly three characters wide', () => {
    expect(TITLE_SEPARATOR.length).toBe(3)
  })
})

describe('driveTitle (REQ-006, REQ-053)', () => {
  it('reads "Drive <slug> | VibeCity" for a simple slug', () => {
    expect(driveTitle(slug('downtown'))).toBe('Drive downtown | VibeCity')
  })

  it('reads "Drive <slug> | VibeCity" for a kebab-case slug', () => {
    expect(driveTitle(slug('my-fun-city'))).toBe(
      'Drive my-fun-city | VibeCity',
    )
  })

  it('starts with the role verb "Drive"', () => {
    expect(driveTitle(slug('downtown')).startsWith('Drive ')).toBe(true)
  })

  it('ends with the app name', () => {
    expect(driveTitle(slug('downtown')).endsWith(APP_NAME)).toBe(true)
  })

  it('contains the slug verbatim', () => {
    expect(driveTitle(slug('1st-ave'))).toContain('1st-ave')
  })

  it('uses the title separator between slug and app name', () => {
    const title = driveTitle(slug('downtown'))
    expect(title).toContain(TITLE_SEPARATOR)
    expect(title.split(TITLE_SEPARATOR)[1]).toBe(APP_NAME)
  })

  it('returns a fresh string on each call', () => {
    expect(driveTitle(slug('downtown'))).toBe(driveTitle(slug('downtown')))
  })
})

describe('editTitle (REQ-007)', () => {
  it('reads "Edit <slug> | VibeCity" for a simple slug', () => {
    expect(editTitle(slug('downtown'))).toBe('Edit downtown | VibeCity')
  })

  it('reads "Edit <slug> | VibeCity" for a kebab-case slug', () => {
    expect(editTitle(slug('harbor-loop'))).toBe('Edit harbor-loop | VibeCity')
  })

  it('starts with the role verb "Edit"', () => {
    expect(editTitle(slug('downtown')).startsWith('Edit ')).toBe(true)
  })

  it('ends with the app name', () => {
    expect(editTitle(slug('downtown')).endsWith(APP_NAME)).toBe(true)
  })

  it('contains the slug verbatim', () => {
    expect(editTitle(slug('1st-ave'))).toContain('1st-ave')
  })

  it('uses the title separator between slug and app name', () => {
    const title = editTitle(slug('downtown'))
    expect(title).toContain(TITLE_SEPARATOR)
    expect(title.split(TITLE_SEPARATOR)[1]).toBe(APP_NAME)
  })
})

describe('drive vs edit title (REQ-006, REQ-007)', () => {
  it('drive and edit titles for the same slug differ only by role verb', () => {
    const drive = driveTitle(slug('downtown'))
    const edit = editTitle(slug('downtown'))
    expect(drive).not.toBe(edit)
    expect(drive.replace(/^Drive /, '')).toBe(edit.replace(/^Edit /, ''))
  })

  it('drive and edit titles share the same suffix for the same slug', () => {
    const drive = driveTitle(slug('downtown'))
    const edit = editTitle(slug('downtown'))
    const suffix = `${TITLE_SEPARATOR}${APP_NAME}`
    expect(drive.endsWith(suffix)).toBe(true)
    expect(edit.endsWith(suffix)).toBe(true)
  })
})

describe('driveDescription (REQ-006, REQ-053)', () => {
  it('reads as a sentence naming the slug', () => {
    expect(driveDescription(slug('downtown'))).toBe(
      'Drive around the downtown city on VibeCity.',
    )
  })

  it('contains the slug verbatim', () => {
    expect(driveDescription(slug('harbor-loop'))).toContain('harbor-loop')
  })

  it('mentions the app name', () => {
    expect(driveDescription(slug('downtown'))).toContain(APP_NAME)
  })

  it('starts with the role verb "Drive"', () => {
    expect(driveDescription(slug('downtown')).startsWith('Drive ')).toBe(true)
  })

  it('ends with a period', () => {
    expect(driveDescription(slug('downtown')).endsWith('.')).toBe(true)
  })
})

describe('editDescription (REQ-007)', () => {
  it('reads as a sentence naming the slug', () => {
    expect(editDescription(slug('downtown'))).toBe(
      'Build the downtown city on VibeCity.',
    )
  })

  it('contains the slug verbatim', () => {
    expect(editDescription(slug('harbor-loop'))).toContain('harbor-loop')
  })

  it('mentions the app name', () => {
    expect(editDescription(slug('downtown'))).toContain(APP_NAME)
  })

  it('starts with the role verb "Build"', () => {
    expect(editDescription(slug('downtown')).startsWith('Build ')).toBe(true)
  })

  it('ends with a period', () => {
    expect(editDescription(slug('downtown')).endsWith('.')).toBe(true)
  })
})

describe('drive vs edit description (REQ-006, REQ-007)', () => {
  it('drive and edit descriptions differ', () => {
    expect(driveDescription(slug('downtown'))).not.toBe(
      editDescription(slug('downtown')),
    )
  })

  it('both descriptions name the slug verbatim', () => {
    const target = 'mountain-view'
    expect(driveDescription(slug(target))).toContain(target)
    expect(editDescription(slug(target))).toContain(target)
  })
})
