---
title: "implement: REQ-085 plant footprint validation follow-up"
status: open
priority: 2
issue-type: task
created-at: "2026-05-14T03:08:11.825468-05:00"
---

Power plants are specified as 2x2 footprints, but the current reducer and editor still record only an anchor cell. Add 2x2 footprint occupancy for coal and solar plants, validate placement against existing city and sim layers, render the footprint in SnapGrid, and update solver/render tests. See docs/gdd/16-power-grid.md.\n\n## Verify\n- npm run check:dashes\n- git diff --check\n- npm run type-check\n- npx vitest run tests/lib/sim/state.test.ts tests/lib/sim/events.test.ts tests/lib/sim/powerSolver.test.ts\n- npx playwright test e2e/sim.spec.ts --project=chromium\n- npm run build
