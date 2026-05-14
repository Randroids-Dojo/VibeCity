---
title: "implement: REQ-075 citizens layer (population + trip demand)"
status: closed
priority: 2
issue-type: task
created-at: "2026-05-05T22:36:13.371214-05:00"
closed-at: "2026-05-14T02:44:03.116176-05:00"
close-reason: "Added residential employment growth gate. Verification: dash check, git diff --check, type-check, events unit test, full vitest suite, and build passed."
---

Per-cell residential population integer, pedestrian render proxies, trip demand counter draining via NPC vehicle traffic. Reuses the existing ambient-AI-traffic dot for the vehicle render side. Blocked by sim engine + zoning. See docs/gdd/14-citizens.md.
