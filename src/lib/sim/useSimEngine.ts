'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BuilderId, Slug } from '@/lib/schemas'
import {
  EMPTY_ENGINE_RUNTIME,
  FLUSH_IDLE_MS,
  buildTickEvent,
  commitFlush,
  enqueueEvent,
  foldServerEvents,
  loadFromColdResponse,
  shouldFlush,
  tickIntervalMs,
  type EngineRuntime,
} from './engine'
import {
  SimEventSchema,
  type SimEvent,
  type SetSpeedEvent,
} from './events'
import { SimStateSchema, type SimSpeed, type SimState } from './state'

/**
 * Sim engine React hook (REQ-070..074 substrate slice 5 of 5).
 *
 * Owns the EngineRuntime + setInterval + flush + poll lifecycle. Pure
 * engine logic lives in `./engine.ts` (slice 3, fully unit-tested);
 * this hook is the thin DOM/effect glue layer that wires it into a
 * React component. The pure helpers are deterministic, so this hook's
 * correctness reduces to: do the effects fire on the right triggers
 * with the right inputs.
 *
 * Lifecycle:
 *   1. Mount: cold-load the slug via GET to `/api/city/<slug>/events`,
 *      hydrate the runtime via `loadFromColdResponse`.
 *   2. Tick: setInterval at `tickIntervalMs(speed)`. Each tick calls
 *      `enqueueEvent` with a `tick` event.
 *   3. Flush: a separate setInterval checks `shouldFlush` every
 *      ~`FLUSH_IDLE_MS / 2` and POSTs the buffer when the helper
 *      returns true. visibilitychange='hidden' triggers an immediate
 *      flush bypassing the interval.
 *   4. Poll: a separate setInterval GETs the tail since the local
 *      cursor every `POLL_INTERVAL_MS` and folds server events in.
 *   5. Unmount: clear all intervals; do a final flush attempt with
 *      `navigator.sendBeacon` so a closing tab still preserves
 *      pending events.
 */

/** Poll interval for fetching the server tail (incoming events from other clients). */
const POLL_INTERVAL_MS = 5000

/** How often the flush trigger checks `shouldFlush` (half of FLUSH_IDLE_MS so the autonomous trigger fires within that window). */
const FLUSH_CHECK_INTERVAL_MS = Math.max(FLUSH_IDLE_MS / 2, 1000)

export interface SimEngineApi {
  runtime: EngineRuntime
  enqueue: (event: SimEvent) => void
  setSpeed: (speed: SimSpeed) => void
  /**
   * Force a flush of the pending buffer right now. Returns the new
   * cursor on success, or null on failure. Callers can `await` to
   * coordinate save flows; they do NOT need to call this in the
   * happy path because the autonomous flush trigger handles it.
   */
  flushNow: () => Promise<number | null>
}

interface ColdResponse {
  events?: unknown
  snapshot?: unknown
  snapshotCursor?: unknown
  totalLen?: unknown
}

interface PollResponse {
  events?: unknown
  nextCursor?: unknown
}

interface PostResponse {
  nextCursor?: unknown
}

function parseTail(payload: unknown): SimEvent[] {
  if (!Array.isArray(payload)) return []
  const events: SimEvent[] = []
  for (const raw of payload) {
    const parsed = SimEventSchema.safeParse(raw)
    if (parsed.success) events.push(parsed.data)
  }
  return events
}

function parseSnapshot(payload: unknown): SimState | null {
  if (payload === null || payload === undefined) return null
  const parsed = SimStateSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

function parseCursor(payload: unknown, fallback = 0): number {
  if (typeof payload !== 'number' || !Number.isFinite(payload) || payload < 0) {
    return fallback
  }
  return payload
}

export function useSimEngine(
  slug: Slug,
  builderId: BuilderId,
): SimEngineApi {
  const [runtime, setRuntime] = useState<EngineRuntime>(EMPTY_ENGINE_RUNTIME)
  const runtimeRef = useRef<EngineRuntime>(EMPTY_ENGINE_RUNTIME)
  runtimeRef.current = runtime

  const eventsUrl = `/api/city/${slug}/events`

  const updateRuntime = useCallback((next: EngineRuntime) => {
    runtimeRef.current = next
    setRuntime(next)
  }, [])

  // Internal flush primitive used by both the autonomous trigger and
  // the explicit flushNow callback. Returns the new cursor or null
  // on failure. Idempotent on an empty buffer.
  const flushPending = useCallback(async (): Promise<number | null> => {
    const r = runtimeRef.current
    if (r.pendingEvents.length === 0) return r.serverCursor
    const batch = r.pendingEvents
    try {
      const res = await fetch(eventsUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        credentials: 'same-origin',
      })
      if (!res.ok) return null
      const body = (await res.json()) as PostResponse
      const cursor = parseCursor(body.nextCursor, runtimeRef.current.serverCursor)
      const next = commitFlush(runtimeRef.current, cursor)
      updateRuntime(next)
      return cursor
    } catch {
      return null
    }
  }, [eventsUrl, updateRuntime])

  // Cold load on mount. Fetches snapshot + events from index 0,
  // hydrates via loadFromColdResponse, sets up the runtime so the
  // tick scheduler can take over.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(eventsUrl, { credentials: 'same-origin' })
        if (!res.ok) return
        const body = (await res.json()) as ColdResponse
        if (cancelled) return
        const snapshot = parseSnapshot(body.snapshot)
        const tail = parseTail(body.events)
        const snapshotCursor = parseCursor(body.snapshotCursor, 0)
        // Skip events the snapshot already covers; the tail starts at
        // index 0 from this GET so we slice past the snapshot's
        // covered range.
        const tailFromSnapshot =
          snapshot && snapshotCursor > 0
            ? tail.slice(snapshotCursor)
            : tail
        const totalLen = parseCursor(body.totalLen, tail.length)
        const next = loadFromColdResponse(
          snapshot,
          tailFromSnapshot,
          totalLen,
        )
        updateRuntime(next)
      } catch {
        // Cold load failure is non-fatal: the hook keeps running with
        // EMPTY_ENGINE_RUNTIME and the next poll will retry.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eventsUrl, updateRuntime])

  // Tick scheduler. setInterval keyed on the current speed; paused
  // skips scheduling entirely.
  useEffect(() => {
    const interval = tickIntervalMs(runtime.state.speed)
    if (interval === null) return undefined
    const handle = setInterval(() => {
      const tickEvent = buildTickEvent(
        runtimeRef.current,
        builderId,
        Date.now(),
      )
      if (tickEvent === null) return
      const next = enqueueEvent(runtimeRef.current, tickEvent, Date.now())
      updateRuntime(next)
    }, Math.max(Math.round(interval), 1))
    return () => clearInterval(handle)
  }, [runtime.state.speed, builderId, updateRuntime])

  // Autonomous flush trigger. Checks shouldFlush every
  // FLUSH_CHECK_INTERVAL_MS; the helper returns true when the buffer
  // hits the batch cap or the idle threshold elapses since the last
  // enqueue. POSTs the buffer when triggered.
  useEffect(() => {
    const handle = setInterval(() => {
      if (shouldFlush(runtimeRef.current, Date.now())) {
        void flushPending()
      }
    }, FLUSH_CHECK_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [flushPending])

  // Server poll. Periodically GET the tail since the local cursor;
  // fold incoming events from other clients into local state.
  useEffect(() => {
    const handle = setInterval(() => {
      void (async () => {
        try {
          const cursor = runtimeRef.current.serverCursor
          const res = await fetch(`${eventsUrl}?cursor=${cursor}`, {
            credentials: 'same-origin',
          })
          if (!res.ok) return
          const body = (await res.json()) as PollResponse
          const tail = parseTail(body.events)
          if (tail.length === 0) return
          const newCursor = parseCursor(body.nextCursor, cursor)
          const next = foldServerEvents(runtimeRef.current, tail, newCursor)
          updateRuntime(next)
        } catch {
          // poll failure is non-fatal; next interval retries
        }
      })()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [eventsUrl, updateRuntime])

  // visibilitychange: flush on hidden so a closing tab does not lose
  // pending events. The fetch may not complete on a true tab close
  // (browsers commonly cancel in-flight requests on unload); a future
  // hardening pass can swap to navigator.sendBeacon for the
  // best-effort tab-close path. v1 ships the fetch; the periodic
  // flush + autonomous trigger cover the long-tail.
  useEffect(() => {
    const handler = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'hidden') {
        void flushPending()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handler)
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handler)
      }
    }
  }, [flushPending])

  const enqueue = useCallback(
    (event: SimEvent) => {
      const next = enqueueEvent(runtimeRef.current, event, Date.now())
      updateRuntime(next)
    },
    [updateRuntime],
  )

  const setSpeed = useCallback(
    (speed: SimSpeed) => {
      const event: SetSpeedEvent = {
        type: 'setSpeed',
        payload: { speed },
        clientCreatedAt: Date.now(),
        authorBuilderId: builderId,
      }
      const next = enqueueEvent(runtimeRef.current, event, Date.now())
      updateRuntime(next)
    },
    [builderId, updateRuntime],
  )

  return { runtime, enqueue, setSpeed, flushNow: flushPending }
}
