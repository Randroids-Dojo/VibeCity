'use client'

import Link from 'next/link'
import { useSimEngine } from '@/lib/sim/useSimEngine'
import type { BuilderId, Slug } from '@/lib/schemas'
import type { SimSpeed } from '@/lib/sim/state'

/**
 * Sim view client (REQ-110 sim-as-primary view scaffold + REQ-070
 * substrate slice 5 of 5).
 *
 * Mounts the `useSimEngine` hook so the speed-control buttons and the
 * tick / sim-time readout reflect the running engine. v1 ships only
 * the speed buttons + readout + drive toggle; the top-down camera
 * (REQ-111), toolbar tabs (REQ-112), demand bars (REQ-113), and per-
 * layer placement tools (REQ-080 zoning, REQ-085 power, etc.) land
 * in their own slices on top of this scaffold.
 */
export function SimViewClient({
  slug,
  builderId,
}: {
  slug: Slug
  builderId: BuilderId
}) {
  const engine = useSimEngine(slug, builderId)
  const { runtime } = engine
  const { state, pendingEvents, serverCursor } = runtime

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
        padding: '32px 24px',
      }}
      data-testid="sim-view"
      data-sim-tick={state.tick}
      data-sim-speed={state.speed}
      data-sim-time-ms={state.simTimeMs}
      data-sim-pending={pendingEvents.length}
      data-sim-server-cursor={serverCursor}
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
        <h1 style={{ fontSize: 28, margin: 0 }}>Sim view</h1>
        <p style={{ fontSize: 14, margin: 0, opacity: 0.7 }}>
          {`/${slug} (sim scaffold; REQ-110 view layout lands in a follow-on slice)`}
        </p>
      </header>

      <section
        data-testid="sim-controls"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: 13, margin: 0, opacity: 0.65 }}>Sim speed</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {([0, 1, 2, 4] as SimSpeed[]).map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => engine.setSpeed(speed)}
              data-testid={`sim-speed-${speed}`}
              data-sim-speed-button={speed}
              data-sim-speed-active={state.speed === speed ? 'true' : 'false'}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                color: state.speed === speed ? '#f7f4ee' : '#222',
                background: state.speed === speed ? '#222' : '#fdfaf2',
                border: '1px solid #d6cfbf',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              aria-pressed={state.speed === speed ? 'true' : 'false'}
            >
              {speed === 0 ? 'Pause' : `${speed}x`}
            </button>
          ))}
        </div>
      </section>

      <section
        data-testid="sim-readout"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          alignItems: 'center',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
        }}
      >
        <p
          data-testid="sim-readout-tick"
          style={{ margin: 0 }}
        >
          {`Tick: ${state.tick}`}
        </p>
        <p
          data-testid="sim-readout-time"
          style={{ margin: 0 }}
        >
          {`Sim time: ${state.simTimeMs} ms`}
        </p>
        <p
          data-testid="sim-readout-pending"
          style={{ margin: 0, opacity: 0.65 }}
        >
          {`Pending events: ${pendingEvents.length}`}
        </p>
        <p
          data-testid="sim-readout-cursor"
          style={{ margin: 0, opacity: 0.65 }}
        >
          {`Server cursor: ${serverCursor}`}
        </p>
      </section>

      <Link
        href={`/${slug}`}
        prefetch
        data-testid="sim-drive-cta"
        data-slug={slug}
        style={{
          padding: '10px 16px',
          fontSize: 14,
          color: '#f7f4ee',
          background: '#222',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          textDecoration: 'none',
        }}
        aria-label={`Drive ${slug}`}
      >
        Drive
      </Link>
    </main>
  )
}
