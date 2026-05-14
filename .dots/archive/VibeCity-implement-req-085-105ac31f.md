---
title: "implement: REQ-085 2x2 power plant footprint validation"
status: closed
priority: 2
issue-type: task
created-at: "\"2026-05-14T03:08:19.051336-05:00\""
closed-at: "2026-05-14T03:08:33.668400-05:00"
close-reason: Duplicate of VibeCity-implement-req-085-9ec6c06b, which remains open for the footprint follow-up
---

Power plants are specified as 2x2 footprints but the current reducer and editor record only an anchor cell. Implement 2x2 footprint occupancy for coal and solar plants in the power editor, prevent placement over streets, buildings, zones, lines, services, water/sewage infrastructure, and other plants, and update solver/render tests. See docs/gdd/16-power-grid.md.\n\n## Verify\n- npm run check:dashes\n- git diff --check\n- npm run type-check\n- npx vitest run tests/lib/sim/state.test.ts tests/lib/sim/events.test.ts tests/lib/sim/powerSolver.test.ts\n- npx playwright test e2e/sim.spec.ts --project=chromium\n- npm run build
