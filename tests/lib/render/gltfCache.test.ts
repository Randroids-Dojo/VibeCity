import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearGltfCache,
  gltfCacheSize,
  loadGltfOnce,
  type GltfCacheLoader,
} from '@/lib/render/gltfCache'

interface FakeGltf {
  url: string
}

function makeLoader(behavior: 'resolve' | 'reject' = 'resolve'): {
  loader: GltfCacheLoader<FakeGltf>
  loadAsync: ReturnType<typeof vi.fn>
} {
  const loadAsync = vi.fn(async (url: string) => {
    if (behavior === 'reject') {
      throw new Error(`boom: ${url}`)
    }
    return { url }
  })
  return { loader: { loadAsync }, loadAsync }
}

afterEach(() => {
  clearGltfCache()
  vi.restoreAllMocks()
})

describe('loadGltfOnce', () => {
  it('returns the loaded GLTF on success', async () => {
    const { loader } = makeLoader('resolve')
    const gltf = await loadGltfOnce(loader, '/models/foo.glb')
    expect(gltf).toEqual({ url: '/models/foo.glb' })
  })

  it('caches by URL: a second call with the same URL hits the cache', async () => {
    const { loader, loadAsync } = makeLoader('resolve')
    await loadGltfOnce(loader, '/models/foo.glb')
    await loadGltfOnce(loader, '/models/foo.glb')
    expect(loadAsync).toHaveBeenCalledTimes(1)
  })

  it('different URLs produce independent cache entries', async () => {
    const { loader, loadAsync } = makeLoader('resolve')
    await loadGltfOnce(loader, '/models/a.glb')
    await loadGltfOnce(loader, '/models/b.glb')
    expect(loadAsync).toHaveBeenCalledTimes(2)
    expect(gltfCacheSize()).toBe(2)
  })

  it('resolves to null on loader failure (no rethrow)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { loader } = makeLoader('reject')
    const result = await loadGltfOnce(loader, '/models/missing.glb')
    expect(result).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('caches failures: a second call after a rejection does not retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { loader, loadAsync } = makeLoader('reject')
    await loadGltfOnce(loader, '/models/missing.glb')
    await loadGltfOnce(loader, '/models/missing.glb')
    expect(loadAsync).toHaveBeenCalledTimes(1)
  })

  it('clearGltfCache forces the next call to reload', async () => {
    const { loader, loadAsync } = makeLoader('resolve')
    await loadGltfOnce(loader, '/models/foo.glb')
    clearGltfCache()
    expect(gltfCacheSize()).toBe(0)
    await loadGltfOnce(loader, '/models/foo.glb')
    expect(loadAsync).toHaveBeenCalledTimes(2)
  })

  it('returns the same in-flight promise to concurrent callers', async () => {
    const { loader, loadAsync } = makeLoader('resolve')
    const p1 = loadGltfOnce(loader, '/models/foo.glb')
    const p2 = loadGltfOnce(loader, '/models/foo.glb')
    expect(p1).toBe(p2)
    await Promise.all([p1, p2])
    expect(loadAsync).toHaveBeenCalledTimes(1)
  })
})
