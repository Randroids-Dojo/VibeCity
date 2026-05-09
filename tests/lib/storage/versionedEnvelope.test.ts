import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  versionedEnvelopeSchema,
  type VersionedEnvelope,
} from '@/lib/storage/versionedEnvelope'

const PayloadSchema = z.object({
  greeting: z.string(),
  count: z.number().int(),
})
type Payload = z.infer<typeof PayloadSchema>

describe('versionedEnvelopeSchema', () => {
  it('parses a matching version + valid payload', () => {
    const Schema = versionedEnvelopeSchema(PayloadSchema, 1)
    const result = Schema.safeParse({
      version: 1,
      payload: { greeting: 'hi', count: 3 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects a wrong version literal', () => {
    const Schema = versionedEnvelopeSchema(PayloadSchema, 2)
    const result = Schema.safeParse({
      version: 1,
      payload: { greeting: 'hi', count: 3 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed payload at the matching version', () => {
    const Schema = versionedEnvelopeSchema(PayloadSchema, 1)
    const result = Schema.safeParse({
      version: 1,
      payload: { greeting: 'hi', count: 'not-a-number' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a missing payload field', () => {
    const Schema = versionedEnvelopeSchema(PayloadSchema, 1)
    expect(Schema.safeParse({ version: 1 }).success).toBe(false)
  })

  it('rejects a missing version field', () => {
    const Schema = versionedEnvelopeSchema(PayloadSchema, 1)
    const result = Schema.safeParse({
      payload: { greeting: 'hi', count: 3 },
    })
    expect(result.success).toBe(false)
  })

  it('exposes a typed envelope shape via VersionedEnvelope<T>', () => {
    const envelope: VersionedEnvelope<Payload> = {
      version: 7,
      payload: { greeting: 'hi', count: 1 },
    }
    expect(envelope.version).toBe(7)
    expect(envelope.payload.count).toBe(1)
  })
})
