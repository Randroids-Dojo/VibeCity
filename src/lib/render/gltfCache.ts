/**
 * Generic GLTF / GLB load cache. Game-agnostic.
 *
 * Memoizes a `loader.loadAsync(url)` promise per URL so a scene that
 * draws many copies of the same model only fetches and parses the file
 * once. Failures resolve to `null` rather than rejecting so a caller
 * can branch to a procedural fallback (a missing mesh never blocks the
 * scene from rendering).
 *
 * The cache is intentionally three.js-agnostic: callers pass in a
 * loader-shaped object (anything with `loadAsync(url): Promise<T>`),
 * and the cache returns the same promise on subsequent calls. This
 * keeps the module testable without dragging the GLTFLoader import
 * (which pulls in a chunk of three's example loaders) into a vitest
 * Node environment.
 */

/**
 * Minimal loader interface the cache depends on. The real
 * `THREE.GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`
 * exposes a compatible `loadAsync(url): Promise<GLTF>` so a consumer
 * can pass it in directly. Tests pass in a fake.
 */
export interface GltfCacheLoader<T = unknown> {
  loadAsync(url: string): Promise<T>
}

const cache = new Map<string, Promise<unknown>>()

/**
 * Load a GLB once per URL. Subsequent calls with the same URL return
 * the cached promise (which may still be in flight, or already
 * resolved). Failures resolve to `null` so callers can fall back
 * without a try / catch at every call site.
 *
 * The cached value is the loader's resolved type (typically `GLTF`)
 * or `null` on failure. The cache stores `Promise<T | null>`; consumers
 * cast on retrieve via the generic.
 */
export function loadGltfOnce<T>(
  loader: GltfCacheLoader<T>,
  url: string,
): Promise<T | null> {
  let entry = cache.get(url) as Promise<T | null> | undefined
  if (!entry) {
    entry = loader
      .loadAsync(url)
      .then((value): T | null => value)
      .catch((err): T | null => {
        // eslint-disable-next-line no-console
        console.warn(`Failed to load GLB ${url}`, err)
        return null
      })
    cache.set(url, entry as Promise<unknown>)
  }
  return entry
}

/**
 * Drop every cached entry. Tests use this to keep cases isolated; a
 * production scene does not need it because the cache lives for the
 * lifetime of the page.
 */
export function clearGltfCache(): void {
  cache.clear()
}

/**
 * Number of URLs currently cached. Test-only inspection helper.
 */
export function gltfCacheSize(): number {
  return cache.size
}
