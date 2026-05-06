# Open Questions

Questions here block or influence implementation.

> **Critical convention.** Every question must include a `Recommended default:` line. The loop ships under that default and leaves the question open for override. Do not block the loop on dev sign-off. Stress-tested values that survive multiple iterations get frozen.

## How to add a new question

```
## Q-NNN: Short title

- Context: one or two sentences on why this is a decision point.
- Options:
  - A. Option A description.
  - B. Option B description.
  - C. Option C description.
- Recommended default: B. One sentence on the rationale.
- Status: open
- Resolution: (filled in once dev confirms or overrides)
```

Keep `Q-NNN` IDs monotonically increasing. When a question resolves, leave the entry in place and update `Status: resolved` plus the `Resolution:` line. Never delete.

## Open

### Q-009: SimCity-like mechanics vs Pillar 3 ("core first, sim later")

- Context: User direction at the start of an autonomous research loop on 2026-05-05 included "Find the fun. Figure out an actually fun feature set. Implement the real track pieces from ../VibeRacer, add real SimCity like mechanics, add a real car model." Coverage stands at 60/69 done = 87%, comfortably past the 80% threshold that activates `docs/FUN_FACTOR_AUDIT.md`. The "real track pieces" and "real car model" parts already have an in-scope path (the schema accepts every Phase 1 piece type, REQ-047 anticipates a fidelity-bump slice for the car). The "real SimCity like mechanics" part directly conflicts with `docs/gdd/01-vision-and-pillars.md` Pillar 3 ("Core first, sim later") and `docs/gdd/99-out-of-scope.md` which fence power, water, zoning, citizens, traffic AI, taxes, demand curves, disasters out of v1 entirely. AGENTS.md Rule 7 says when in doubt, ask, and prefer simple consistent flows.
- Options:
  - A. Honor pillar 3 strictly: ship NO sim mechanics in v1. The "find the fun" loop focuses on visual / feel polish (real car model, sampled centerline geometry, lit-window night ambience). Sim mechanics defer to v1.1 once the v1 loop ships and is validated.
  - B. Open a narrow "ambient city life" carveout: visual-only signals that look like sim but persist no schema state and run no logic deeper than per-frame movement. Concrete carveout list: ambient AI traffic (follower cars on placed segments), day/night-only mood control, lit windows at night, optional traffic lights at intersection cells. None of these add sim state to `CitySchema`. None of them gate the player's drive. All of them are visible from inside the car within 30 seconds.
  - C. Pivot the GDD: rewrite pillar 3 to admit a sim layer, scope a real population / demand / economy slice, and accept the v1 release-date hit. The Flatline failure mode warning in `docs/IMPLEMENTATION_PLAN.md` cuts both ways: shipping pillar-perfect-but-sterile is one failure; thrashing the pillars and shipping nothing is the other.
- Recommended default: B. The user direction phrasing ("SimCity LIKE", not "be SimCity") and the simultaneous "find the fun" framing read as "the city should feel alive while I drive", not "implement an economy". Carveout B delivers the perceived sim feel without violating the schema-state fence or the persistence contract. A stays as the explicit fallback if dev overrides; C is the heavier alternative if dev wants to break the v1 fence properly. Ship under B unless overridden: the immediate downstream slices are the lit-window night ambience dot and the ambient-AI-traffic dot, both of which carry their own `## Verify` blocks and can ship independently. Supporting analysis with the full 12-candidate ranking and OOS-fence mapping lives at `docs/SIM_LITE_CANDIDATES.md`. Refined recommendation per that study: only the ambient-AI-traffic candidate actually needs Q-009 to resolve B; seven other "city feels alive" candidates are admissible under the existing narrow reading of `99-out-of-scope.md` and can ship without a fence pivot.
- Status: open
- Resolution:

### Q-002: Build / drive page topology

- Context: VibeRacer ships two separate pages (`/[slug]` for drive, `/[slug]/edit` for editor). VibeCity's pillar 1 ("Build it. Drive it. Build more.") wants the toggle to feel like one click, not a save-and-reload round trip. We can either inherit VibeRacer's two-page split or collapse to a single page with a build / drive mode switch.
- Options:
  - A. Two separate routes (mirrors VibeRacer): `/[slug]` drive, `/[slug]/edit` edit. Mode change is a Next.js navigation. Pro: simplest port; each page owns its data load. Con: the toggle is a full page transition, not the "one click" feel pillar 1 wants.
  - B. Single page with mode switch: one `/[slug]` route renders either editor or drive view based on local state. Pro: the toggle is instant; closer to pillar 1. Con: harder to deep-link to a mode; bigger initial JS bundle; have to reload geometry on every mode flip anyway.
  - C. Two routes + smooth client-side transition: keep both routes for deep-linkability and back-button correctness, but use Next.js prefetching plus an interstitial keep-the-grid mounted layer so the perceived flip is sub-200ms.
- Recommended default: C. Keeps VibeRacer's clean route split (which the slug routing port wants anyway), keeps deep-linkable URLs (a city's drive view at `/<slug>` is the share link, edit view at `/<slug>/edit` is the build link), and still hits pillar 1's one-click feel via prefetch + shared scene state. The price is one extra slice to wire the prefetch.
- Status: open
- Resolution:

### Q-003: Reuse mechanism for VibeRacer modules (physics, wheel contact, camera, editor model)

- Context: Vision lists the modules VibeCity reuses from VibeRacer (`physics.ts`, `wheelContact.ts`, `sceneBuilder.ts`, editor primitives). We need to pick how the code travels.
- Options:
  - A. Copy-paste port: copy the source files into VibeCity's `src/` tree at the same paths. Pro: simplest; allows divergence (city tuning vs racing tuning); no monorepo plumbing. Con: bug fixes do not propagate; drift is real.
  - B. Git submodule pointing at VibeRacer: VibeCity depends on a pinned VibeRacer commit. Pro: bug fixes propagate via update. Con: submodules are notoriously rough; tying VibeCity's release to VibeRacer's HEAD is over-coupling.
  - C. Extract a shared `@vibe/driving` workspace package: convert VibeRacer's drive surface (physics, wheel contact, camera, input) into a published-or-linked package and depend on it from both projects. Pro: clean separation, real versioning, divergence still possible via package version pin. Con: requires a refactor pass on VibeRacer first; multi-week scope.
- Recommended default: A. Copy-paste port matches "the port is not a fork" language in the vision (VibeCity ships its own tunable copy). Bug fixes are cheap to re-port manually for v1; if drift becomes painful, escalate to C as a focused project. Do NOT do B; submodules are a trap.
- Status: open
- Resolution:

### Q-004: v1 building palette breadth

- Context: Vision pillar 3 says "core first, sim later". Buildings in v1 are placeholder primitives with no simulation behavior. The question is which primitives to include in v1 vs. later.
- Options:
  - A. Two types only (residential, commercial), each as a single-cell box with a distinct color. Pro: minimal scope, fastest to ship. Con: cities feel monotonous, less visual variety to drive past.
  - B. Four types (small-house, mid-house, shop, factory), still single-cell boxes with distinct colors and silhouettes. Pro: gives the player a visible-from-the-car vocabulary without committing to simulation. Con: slightly more editor palette UI, more building-pieces schema variants.
  - C. Multi-cell footprint buildings (2x2, 2x3 industrial), with rotation. Pro: visually rich. Con: footprint validation is more code; not worth it before the loop is fun.
- Recommended default: B. Four types is the smallest breadth that makes a driven-through city feel like a city instead of a track with cubes next to it. Multi-cell footprints (C) wait until the loop is fun and we have real playtest signal that the visual variety matters.
- Status: open
- Resolution:

### Q-005: Drive mode collision with buildings

- Context: REQ-030 says buildings collide with the car (treated as off-street). The collision model has options.
- Options:
  - A. Cell-level binary: any cell containing a building is "off-street" with the same penalty as off-grid driving (drag + max-speed cap). No bouncing; the car just slows. Pro: matches VibeRacer's existing on-track / off-track flag perfectly; zero new physics code. Con: the car can drive *through* buildings, just slowly. Feels weird.
  - B. Cell-level hard wall: a cell with a building is impassable; the car stops at the boundary. Requires a thin physics layer (line-segment collision against cell edges of building cells). Pro: more believable. Con: net new collision code; risk of glitchy edge cases (corner clipping, stuck states).
  - C. Soft bounce: cell-level wall but with a small bounce-back impulse on contact. Pro: forgiving, arcade-feeling. Con: same physics work as B plus impulse tuning.
- Recommended default: A. Ship the cheap thing in v1; revisit when playtest reveals it as a fun blocker. The penalty alone (immediate slowdown to off-street max speed when wheels overlap a building cell) is enough to discourage driving through buildings without inventing collision.
- Status: open
- Resolution:

## Resolved

### Q-008: Slug write gating: per-cookie owner or open-edit

- Context: REQ-014 originally landed with a per-slug owner gate: the first PUT to a slug claimed `city:${slug}:owner = builderId` and any subsequent PUT with a different builder cookie returned 403. This surfaced a bug where a Playwright test slug (`rejection-flash-spec`) wrote to production KV under the test browser's cookie, locking the slug for any other visitor and producing a "Save failed" banner on the editor. The dev was then unable to save against that slug from their normal browser.
- Options:
  - A. Keep the per-cookie owner gate. Pro: prevents accidental cross-builder overwrites; matches VibeRacer's per-track owner pattern. Con: the dev declared "anybody should be able to edit any city" as a core tenet; per-cookie locking blocks the collaborative loop and any slug locked by a stale CI run is permanently broken.
  - B. Open-edit: any visitor with a valid builder id cookie can write to any slug. Pro: matches the stated core tenet; unblocks the rejection-flash-spec slug and any future test-leaked slug; one consistent rule regardless of who created the slug. Con: a malicious or accidental visitor can overwrite a city someone else built. Out-of-scope mitigations (locked slugs, draft / publish, cooperative editing) stay deferred per `99-out-of-scope.md`.
  - C. Open-edit but require the cookie to claim a slug first (rate-limit). Pro: blocks anonymous bots without per-cookie locking. Con: the cookie is already minted by middleware so every browser visit is a "claim", which collapses to A under the test-leak failure mode.
- Recommended default: B. The dev's stated core tenet is unambiguous, and the test-leak failure mode is real (already happened on the rejection-flash-spec slug). Open-edit also matches the loop the GDD names ("Build it. Drive it. Build more.") where the implied subject is "anyone, including someone different from the original builder".
- Status: resolved
- Resolution: 2026-05-05. Default B confirmed by dev. The PUT route at `src/app/api/city/[slug]/route.ts` no longer reads `city:${slug}:owner` and no longer returns 403 on a cookie mismatch; the cookie validates identity shape only. The `kvKeys.cityOwner` namespace is removed; orphan keys from prior writes stay in KV and are ignored. GDD updated: `docs/gdd/03-persistence.md` REQ-014 write path, `docs/gdd/05-identity.md` REQ-009 spec text, `docs/gdd/99-out-of-scope.md` Auth and identity fence. Per-slug write protection (locked slugs, mod tools) is explicitly out of scope; if the open-edit failure mode (a griefer overwriting popular cities) becomes a real problem, escalate to a moderation surface in its own slice rather than reverting to per-cookie owner gating.

### Q-007: VibeCity Upstash store: shared with VibeRacer or dedicated

- Context: VibeCity needed a KV store wired up so production saves stop failing. VibeRacer already has `upstash-kv-rose-garden` provisioned via the Vercel marketplace. VibeCity could share that store (key prefixes already differ: `city:` vs `track:`) or get its own dedicated Upstash resource.
- Options:
  - A. Share VibeRacer's `upstash-kv-rose-garden`: copy the same `KV_REST_API_*` env vars onto the `vibe-city` Vercel project. Pro: zero provisioning friction, immediate fix, key prefix separation already prevents collision. Con: shared rate limits and shared billing across two products; rotating credentials affects both projects; one project's runaway loop can pressure the other's ceiling.
  - B. Provision a dedicated Upstash store via the Vercel marketplace UI: VibeCity gets its own Upstash resource attached only to `vibe-city`. Pro: clean ownership boundary, independent quotas, independent secret rotation. Con: requires Vercel marketplace UI flow (the CLI does not expose marketplace provisioning), more setup steps; a small monthly cost on a second store.
  - C. Provision via the Upstash dashboard directly (no Vercel marketplace): create a free-tier Redis on Upstash and paste its REST URL plus token into `vercel env add`. Pro: still dedicated and independent, no marketplace lock-in. Con: not visible inside `vercel integration ls`, so it does not show up in the Vercel marketplace UI; rotating the token requires hand updates rather than the marketplace handshake.
- Recommended default: A. Ships immediately and unblocks every saving-dependent feature. Key namespaces are already disjoint (`city:` vs `track:`), so collision is structurally impossible. The tradeoff is shared quota and shared rotation; revisit if either becomes a real problem. If we do, B is the cleanest follow-up since the marketplace handshake is what `vercel integration ls` already understands.
- Status: resolved
- Resolution: 2026-05-04. Dev override: B. Going forward every Vercel project gets a dedicated backing store; sharing across projects is forbidden by the new AGENTS.md Rule 11 ("One backing store per project"). The current shared-store state from PR #65 is interim. F-009 ("Migrate VibeCity to a dedicated Upstash store") tracks the migration to a fresh Upstash resource attached only to `vibe-city`.

### Q-006: VibeRacer Phase 1 piece adoption cadence

- Context: VibeRacer is rolling out four long-turn pieces in PR-sized phases (1a Mega Sweep merged as PR #80, 1b Hairpin in flight on `feature/hairpin-track-piece`, 1c 45-arc and 1d Diagonal not yet started). VibeCity reuses VibeRacer's editor module; we have to pick when each upstream phase lands in VibeCity.
- Options:
  - A. Adopt every shipped phase eagerly: every time VibeRacer merges a Phase 1 piece, VibeCity opens a follow-up slice to port it.
  - B. Adopt only the pieces that pass a city playtest: re-evaluate each new piece against "does it make a city more fun to drive" before porting.
  - C. Wait for VibeRacer Phase 1 to fully land, then port the whole long-turn taxonomy in one sweep so VibeCity gets a coherent piece library at once.
- Recommended default: A. The piece taxonomy is the editor's vocabulary. Holding pieces back from VibeCity creates editor drift between the projects and forces double-maintenance every time VibeRacer adds a piece. If a piece turns out to feel wrong in a city context, hide it from the palette in a follow-up rather than skipping the port.
- Status: resolved
- Resolution: 2026-05-03. Default A confirmed by dev. Every Phase 1 piece that merges in VibeRacer is in scope for VibeCity v1 by default. REQ-058 (mega sweep) is now in scope unconditionally; REQ-060 / 061 / 062 (hairpin / 45-arc / diagonal) flip from opt-in to "in scope once upstream merges". F-002 stays open as the upstream watcher.

### Q-001: First requirement file

- Context: which GDD section to draft first as the seed for the coverage ledger.
- Options:
  - A. `01-vision-and-pillars.md` (the abstract framing).
  - B. The first concrete user-visible feature.
  - C. The data model / persistence layer.
- Recommended default: A. The pillars file is short, drives every subsequent decision, and unblocks the rest.
- Status: resolved
- Resolution: 2026-05-03. Drafted `docs/gdd/01-vision-and-pillars.md` plus `docs/gdd/99-out-of-scope.md`. Vision commits to: build / drive toggle as the loop, per-slug URLs, VibeRacer vehicle reuse, SimCity layers deferred. Coverage ledger seeded with 57 atomic rows targeting future GDD section files (`02-tech-stack.md` through `12-home-page.md` plus `99-out-of-scope.md`).
