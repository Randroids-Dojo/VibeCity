# 21. Sim-as-primary View

**Status:** partial

The sim-as-primary view is the top-down or 2.5D-isometric surface that replaces the existing snap-grid editor as the default `/<slug>` route. The drive view becomes a toggle from this surface, not the default. This is the UI side of the Q-009 pivot.

This file is the canonical spec for the sim-as-primary view (REQ-110 through REQ-114).

## What this section covers

- **REQ-110** Sim view as default route. `/<slug>` renders the sim view. The existing drive view moves to `/<slug>/drive`. The existing editor at `/<slug>/edit` is absorbed into the sim view's toolbar; placing zones / infrastructure happens directly on the sim canvas. Old routes either redirect or stay supported during a migration window.
- **REQ-111** Top-down camera. Default angle is overhead 45-degree iso (SimCity 4 standard). Camera supports pan, rotate (90deg snaps), zoom. Mouse-wheel zoom; click-drag pan; Q/E rotate.
- **REQ-112** Toolbar redesign. Tabs for zones, infrastructure (power, water, sewage), services, transit (streets), terrain (future). The current Streets / Buildings tab pair extends; nothing is removed.
- **REQ-113** Sim controls panel. Pause / 1x / 2x / 4x speed selector. Tax sliders. Treasury readout. Demand bars. Always visible in sim view.
- **REQ-114** Drive toggle. A persistent button labeled `Drive` in the sim view drops the player to the existing drive scene at the camera's current focus point. Press `Esc` or click `Sim view` to return. The sim continues running while the player is in the car.

## Migration notes

The existing `/<slug>` and `/<slug>/edit` routes need careful handling. Recommended:

1. Ship the new sim view at `/<slug>/sim` first. Existing routes unchanged.
2. Once the sim view feels right, swap the defaults: `/<slug>` becomes the sim view, `/<slug>/edit` redirects to `/<slug>/sim`, drive moves to `/<slug>/drive`.
3. Keep the old route shapes alive long enough that any external links stay working. Add 301 redirects for the inverted paths.

## Out of scope for this section

- VR / 3D city view (defer until everything else feels right).
- Mobile-touch pinch-zoom and rotate gestures (touch-controls.ts inheritance covers basic pan; full gesture support is its own slice).
- A minimap separate from the existing drive minimap (the sim view IS the minimap; no separate widget).

### Build log

- 2026-05-08: Slice C landed: iso camera rotate (REQ-110, REQ-111). New `src/app/[slug]/edit/isoRotation.ts` exports `ISO_ROTATION_STEP_DEG = 90`, `DEFAULT_ISO_ROTATION_DEG = 0`, `normalizeIsoRotation` (positive-modulo wrap with non-finite fallback), `rotateIsoCcw`, `rotateIsoCw`. `src/app/[slug]/edit/isoProjection.ts` `isoTransformCss(mode, rotationDeg = 0)` sums camera rotation into the iso rotate angle. `src/app/[slug]/edit/SnapGridView.tsx` accepts `viewRotationDeg?: number` (default 0), passes it to `isoTransformCss`, and mirrors `data-viewport-rotation` on the SVG root. `src/app/[slug]/edit/EditorClient.tsx` holds `isoRotationDeg` state, threads it into `<SnapGrid />`, and binds Q (ccw) and `]` (cw) in the existing keyboard handler. `]` substitutes for the canonical SimCity E binding because REQ-022 already owns E for the erase tool; documented inline so a future polish slice can introduce an alternate cw key without conflict. Tests: 12 new cases in `tests/app/isoRotation.test.ts` covering constants, positive-modulo wrap, non-finite fallback, ccw/cw stepping, the 4-rotation cycle, and the inverse property; 2 new cases in `tests/app/isoProjection.test.ts` covering `rotationDeg` summation in iso mode and its no-op behavior in flat mode. Verified `npx vitest run` (2325/2325), `npx tsc --noEmit`, dash check clean. REQ-111 status flips `not_started` -> `partial`. Slice D (sim controls panel polish) stays deferred. PR TBD.

- 2026-05-08: Slice B landed: route swap (REQ-110). `/<slug>` now renders the editor / sim view (was the drive scene); the drive scene moved to `/<slug>/drive`. `/<slug>/edit` 308-redirects to `/<slug>` preserving the optional `?v=<hash>` query string. `/<slug>/sim` redirect target updated from `/<slug>/edit` to `/<slug>` so the legacy chain collapses to one hop. `buildShareUrl` now returns `/<slug>/drive`; `buildEditUrl` returns `/<slug>`. Internal links (editor Drive CTA, drive HUD Edit CTAs, home page Create CTA) all updated to the new contract. Tests: `tests/app/shareUrl.test.ts` URL assertions retuned, `tests/app/driveRoute.test.ts` / `tests/app/editRoute.test.ts` import paths flipped, `e2e/drive.spec.ts` + `e2e/editor.spec.ts` + `e2e/sim.spec.ts` + `e2e/home.spec.ts` URL assertions retuned. Verified `npm test` (2311/2311), `npm run type-check`, `npm run build`, `npm run check:dashes`. Slice C (iso camera rotate + Q/E keys) and slice D (sim controls panel polish) stay deferred. PR #167.

- 2026-05-08: Slice A landed: 45deg iso projection on the editor SnapGrid (REQ-111 visual). New `src/app/[slug]/edit/isoProjection.ts` exports `ISO_ROTATE_DEG = -45`, `ISO_SCALE_Y = 0.5`, `isoTransformCss(mode)`, and `SnapGridViewMode` union. `src/app/[slug]/edit/SnapGridView.tsx` accepts `viewMode` prop (default `'iso'`) and applies the CSS transform to the SVG element with `transform-origin: center center`; the SVG's internal coords are unchanged so existing pointer events and viewBox pan/zoom keep working. Tests: `tests/app/isoProjection.test.ts` (8 cases on the constants and the transform string); `e2e/editor.spec.ts` adds a `data-view-mode="iso"` assertion. REQ-110 status flips `not_started` -> `partial`. Slice B (route swap), slice C (iso camera rotate + Q/E keys), and slice D (sim controls panel polish) stay deferred. PR #166.
