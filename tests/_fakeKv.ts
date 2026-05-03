/**
 * In-memory KV used by route-handler tests. Mirrors the slice of the
 * @upstash/redis surface that VibeCity uses today: get / set / del,
 * lpush / lrange / ltrim, zadd / zrange / zscore / zrem / zrank / zcard.
 *
 * Ported from VibeRacer's `tests/unit/_fakeKv.ts` so the persistence
 * tests in both projects share the same fake semantics.
 */

interface ZEntry {
  member: string
  score: number
}

type SetOptions = { ex?: number; nx?: boolean }

export class FakeKv {
  private store = new Map<string, string>()
  private expirations = new Map<string, number>()
  private zsets = new Map<string, ZEntry[]>()
  private lists = new Map<string, string[]>()
  private zsetMembers = new Map<string, Set<string>>()

  private expired(key: string): boolean {
    const exp = this.expirations.get(key)
    if (!exp) return false
    if (Date.now() >= exp) {
      this.store.delete(key)
      this.expirations.delete(key)
      return true
    }
    return false
  }

  async set(
    key: string,
    value: unknown,
    opts?: SetOptions,
  ): Promise<string | null> {
    if (opts?.nx && this.store.has(key) && !this.expired(key)) return null
    this.store.set(
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    )
    if (opts?.ex) {
      this.expirations.set(key, Date.now() + opts.ex * 1000)
    } else {
      this.expirations.delete(key)
    }
    return 'OK'
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (this.expired(key)) return null
    const v = this.store.get(key)
    if (v === undefined) return null
    try {
      return JSON.parse(v) as T
    } catch {
      return v as T
    }
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0
    for (const k of keys) {
      const had =
        this.store.delete(k) || this.zsets.delete(k) || this.lists.delete(k)
      if (had) n++
      this.expirations.delete(k)
      this.zsetMembers.delete(k)
    }
    return n
  }

  async zadd(
    key: string,
    entry: { score: number; member: string },
  ): Promise<number> {
    const members = this.zsetMembers.get(key) ?? new Set<string>()
    const wasNew = !members.has(entry.member)
    members.add(entry.member)
    this.zsetMembers.set(key, members)
    const list = this.zsets.get(key) ?? []
    const filtered = list.filter((e) => e.member !== entry.member)
    filtered.push(entry)
    filtered.sort((a, b) => a.score - b.score)
    this.zsets.set(key, filtered)
    return wasNew ? 1 : 0
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    opts?: { withScores?: boolean; rev?: boolean },
  ): Promise<string[]> {
    const list = this.zsets.get(key) ?? []
    const ordered = opts?.rev ? [...list].reverse() : list
    const slice = ordered.slice(start, stop === -1 ? undefined : stop + 1)
    if (opts?.withScores) {
      return slice.flatMap((e) => [e.member, String(e.score)])
    }
    return slice.map((e) => e.member)
  }

  async zscore(key: string, member: string): Promise<number | null> {
    const list = this.zsets.get(key) ?? []
    const entry = list.find((e) => e.member === member)
    return entry ? entry.score : null
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) ?? []
    list.unshift(...values)
    this.lists.set(key, list)
    return list.length
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? []
    return list.slice(start, stop === -1 ? undefined : stop + 1)
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    const list = this.lists.get(key) ?? []
    this.lists.set(key, list.slice(start, stop === -1 ? undefined : stop + 1))
    return 'OK'
  }
}
