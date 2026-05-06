---
title: "research: scope-pivot study for sim-lite mechanics (Q-009 follow-on)"
status: closed
priority: 1
issue-type: task
created-at: "\"\\\"2026-05-05T21:22:05.158644-05:00\\\"\""
closed-at: "2026-05-05T21:32:52.703612-05:00"
close-reason: Wrote docs/SIM_LITE_CANDIDATES.md ranking 12 candidates against the OOS fence and 3 gate tests. 7 are admissible without Q-009; only ambient AI traffic needs the pivot. Q-009 entry updated to reference the study and refine the recommendation.
---

Per Q-009 the user wants 'real SimCity-like mechanics' but Pillar 3 fences them out until the loop is fun. Coverage hits 87%. Audit which sim-mechanic candidates pass three tests: (1) visible from inside the car within 30s of driving, (2) zero new persisted state on the city schema, (3) implementable in one PR. Output: ranked list of candidate features (ambient AI traffic, day/night cycle, traffic lights at intersection, pedestrians on sidewalks, weather change-on-drive) with one-paragraph spec each, mapped to existing GDD scope vs scope-extension required.
