import { z } from 'zod'

/**
 * Versioned-envelope schema constructor. Game-agnostic.
 *
 * Wraps a payload schema in a `{ version, payload }` envelope so a
 * future migration (renamed field, removed binding, etc.) can detect
 * a stale stored payload and discard it rather than silently feed a
 * malformed shape into the runtime. A consumer that loads a payload
 * with a different `version` literal hits a `safeParse` failure and
 * can fall back to defaults.
 *
 * VibeCity's `controlsPersistence.ts` (REQ-043) is the v1 consumer.
 * Future games with persisted user settings can wrap their own
 * payload schemas the same way.
 *
 * The `version` field is a `z.literal` so the envelope only accepts
 * the current version exactly; bump the literal when the persisted
 * shape changes incompatibly.
 */
export function versionedEnvelopeSchema<TPayload extends z.ZodTypeAny>(
  payloadSchema: TPayload,
  version: number,
) {
  return z.object({
    version: z.literal(version),
    payload: payloadSchema,
  })
}

/**
 * The TypeScript type of the envelope produced by `versionedEnvelopeSchema`.
 * Useful when writing a typed `next` envelope back into storage.
 */
export type VersionedEnvelope<TPayload> = {
  version: number
  payload: TPayload
}
