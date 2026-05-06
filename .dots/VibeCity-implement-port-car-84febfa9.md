---
title: "implement: port car.glb to drive scene (REQ-047 fidelity bump)"
status: open
priority: 1
issue-type: task
created-at: "2026-05-05T21:21:49.098712-05:00"
---

## Description

Replace the `BoxGeometry`-composed placeholder car in `src/app/[slug]/driveScene.ts` with a real GLTF model. The drive scene currently builds the car from a body box, a cabin box, and four wheel boxes (lines ~488-552 of `driveScene.ts`, instantiated in `DriveSceneClient.tsx` ~line 692-752 as `placeholder-car` group). REQ-047's spec text explicitly anticipates this slice: "a future slice that swaps the car for a higher-fidelity placeholder car".

## Context

User direction this iteration: "add a real car model". GDD pillar 3 fences asset polish until the core loop ships; coverage is at 87% (60/69), past the 80% trigger, and REQ-047 itself names a fidelity-bump slice as the in-scope follow-on. This is the lowest-risk, highest-perceived-value asset slice: one file copy and one loader change.

## Affected Files

- `public/models/car.glb` (new, copied from `../VibeRacer/public/models/car.glb`)
- `public/models/KENNEY-LICENSE.txt` (new, attribution required)
- `package.json` may need `three/examples/jsm/loaders/GLTFLoader` import path verification (no new dep; ships with `three`)
- `src/app/[slug]/driveScene.ts`: replace `CAR_*` constant exports + `WHEEL_LOCAL_OFFSETS` derivation source so wheel offsets come from the loaded GLTF bounding box rather than hand-tuned constants
- `src/app/[slug]/DriveSceneClient.tsx`: lazy-load the GLB via GLTFLoader inside the mount effect, replace the inline `THREE.Group` of primitive boxes with the loaded scene; preserve the `name = 'placeholder-car'` so existing data attributes and tests continue to address the same node
- `tests/app/driveScene.test.ts`: relax the BoxGeometry-shape assertions; add a "loads GLTF asynchronously" stub or fall back to the primitive when the asset is missing in the test env (vitest jsdom)
- `e2e/drive.spec.ts`: keep the same selector contract (`car` data attributes); add an asset-loaded waiter

## Implementation Notes

- Copy the asset, do not symlink. AGENTS.md Rule 11 ("one backing store per project") is about KV but the same dedicated-resource discipline applies to checked-in assets.
- The Kenney license is CC0; redistribute the LICENSE alongside the asset.
- Keep the primitive-car as a fallback render path while the GLB is in flight (so the `data-car-mounted` attribute fires immediately and the chase camera does not hang on the asset load).
- Do NOT tune chassis dimensions, color schemes, or per-wheel physics this slice. Wheel offsets read from the GLTF bounding box are the only structural change.

### VibeRacer reference pattern

`../VibeRacer/src/game/sceneBuilder.ts` lines 179-190 show the exact pattern to mirror:

```ts
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

const CAR_MODEL_URL = '/models/car.glb'

let carGltfPromise: Promise<GLTF> | null = null
function loadCarGltf(): Promise<GLTF> {
  carGltfPromise ??= new GLTFLoader().loadAsync(CAR_MODEL_URL).catch((err) => {
    carGltfPromise = null
    throw err
  })
  return carGltfPromise
}
```

Key details:
- Module-level singleton promise so two car spawns reuse one fetch.
- The `.catch` resets the promise to `null` so a transient failure does not cache permanently.
- Per-instance: `const clone = gltf.scene.clone()` (sceneBuilder.ts line 476). Always clone before adding to the scene; never add the cached scene directly.
- Import path is `'three/examples/jsm/loaders/GLTFLoader.js'` with the `.js` suffix. Without the suffix, the bundler may resolve to a different module under newer three versions.

## Verify

- [ ] `npm run type-check` passes
- [ ] `npm run test` passes (existing driveScene unit tests adapted, no new flake)
- [ ] `npm run build` produces a deployable bundle
- [ ] `git diff --check` clean, no em-dash / en-dash via `grep -rnP '[\x{2014}\x{2013}]' .`
- [ ] Dev server: visit `/test-slug/edit`, place one piece, switch to drive mode, see the GLB car render in place of red boxes
- [ ] Chase camera frames the car correctly (no clip into ground, no bobbing)
- [ ] Engine audio still triggers on first throttle press
- [ ] `tests/app/driveScene.test.ts` retains its existing surface for `WHEEL_LOCAL_OFFSETS` (sourced from GLTF bbox now, but same shape)
- [ ] Asset license is committed alongside the model
