'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'
import { SlugSchema, normalizeSlug } from '@/lib/schemas'

/**
 * Create-new-slug input on the home page (REQ-050).
 *
 * Renders a single-line input that lets a visitor type a slug and
 * navigate to `/<slug>` to start a new city in the SimCity-style sim
 * view (REQ-110 sim-as-primary). The input runs the raw value through
 * `normalizeSlug` for the live preview and validates the normalized
 * result against `SlugSchema` to gate the submit button.
 *
 * The form is uncontrolled in the sense that it stores the raw text
 * the user typed. The normalized preview is shown alongside so a user
 * who types `"Downtown!"` sees `downtown` and understands what URL the
 * Create button will navigate to.
 *
 * On submit, the router pushes `/<normalized>`. The route segment runs
 * the slug through `parseSlugParam` again so a malformed input never
 * reaches the sim surface.
 */
export function HomeCreateForm() {
  const router = useRouter()
  const [raw, setRaw] = useState('')

  const normalized = useMemo(() => normalizeSlug(raw), [raw])
  const parsed = useMemo(() => SlugSchema.safeParse(normalized), [normalized])
  const isValid = parsed.success

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid) return
    router.push(`/${normalized}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="home-create-form"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        maxWidth: 360,
        alignItems: 'stretch',
      }}
    >
      <label
        htmlFor="home-create-slug"
        style={{
          fontSize: 13,
          opacity: 0.75,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        Start a new city
      </label>
      <input
        id="home-create-slug"
        data-testid="home-create-slug-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="my-cool-city"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        maxLength={128}
        aria-invalid={raw.length > 0 && !isValid ? 'true' : 'false'}
        aria-describedby="home-create-slug-preview"
        style={{
          padding: '10px 12px',
          fontSize: 16,
          fontFamily: 'system-ui, sans-serif',
          color: '#222',
          background: '#fdfaf2',
          border: '1px solid #d6cfbf',
          borderRadius: 4,
        }}
      />
      <p
        id="home-create-slug-preview"
        data-testid="home-create-slug-preview"
        data-normalized={normalized}
        data-valid={isValid ? 'true' : 'false'}
        aria-live="polite"
        style={{
          margin: 0,
          fontSize: 13,
          opacity: 0.7,
          minHeight: '1.4em',
        }}
      >
        {raw.length === 0
          ? 'Lowercase letters, digits, and hyphens. 1 to 128 characters.'
          : isValid
            ? `Will open /${normalized}`
            : 'Invalid slug. Use lowercase letters, digits, and hyphens.'}
      </p>
      <button
        type="submit"
        data-testid="home-create-submit"
        disabled={!isValid}
        style={{
          padding: '10px 16px',
          fontSize: 14,
          fontFamily: 'system-ui, sans-serif',
          color: '#f7f4ee',
          background: isValid ? '#222' : '#999',
          border: 'none',
          borderRadius: 4,
          cursor: isValid ? 'pointer' : 'not-allowed',
        }}
      >
        Create
      </button>
    </form>
  )
}
