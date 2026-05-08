import { Redis } from '@upstash/redis'

/**
 * Generic Upstash Redis client wrapper. Game-agnostic.
 *
 * Provides the lazy singleton client + the env-presence probe used
 * by anything that needs persistence. The key namespace any specific
 * game uses (e.g. VibeCity's `city:`-prefixed keys in `cityKv.ts`)
 * lives in its own module so a new game can wire its own namespace
 * without forking the Redis-client plumbing.
 *
 * Env contract:
 *   - `KV_REST_API_URL`
 *   - `KV_REST_API_TOKEN`
 *
 * `getKv()` is lazy: instantiation is deferred until first use so a
 * module import does not crash routes that do not need persistence
 * (e.g. the home page).
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

/**
 * Returns true iff both Upstash env vars are present. Callers that
 * want to gracefully fall back when KV is unconfigured should branch
 * on this before calling `getKv()`.
 */
export function hasKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

let _kv: Redis | null = null

/**
 * Returns the singleton Upstash Redis client. Throws if env is missing.
 * Use `hasKvConfigured()` first when a caller wants a soft fallback.
 */
export function getKv(): Redis {
  if (!_kv) {
    _kv = new Redis({
      url: requireEnv('KV_REST_API_URL'),
      token: requireEnv('KV_REST_API_TOKEN'),
    })
  }
  return _kv
}
