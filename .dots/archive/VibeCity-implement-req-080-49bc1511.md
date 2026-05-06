---
title: "implement: REQ-080 zoning slice 2 of N - clickable grid + zone palette UI in sim view"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T00:12:21.779357-05:00\""
closed-at: "2026-05-06T00:15:28.300541-05:00"
close-reason: REQ-080 zoning slice 2/N. Clickable 2D grid + zone palette in sim view. 2 new e2e tests (paint, switch+erase). PR pending.
---

Add a clickable 2D SVG grid to the SimViewClient (mirroring editor SnapGridView pattern). Zone palette buttons (Residential / Commercial / Industrial + Erase tool). Click on a cell dispatches placeZone or eraseZone via engine.enqueue. Render zoned cells with distinct colors per kind. Defers the 3D iso camera (REQ-111) to its own slice; this slice is flat top-down for fastest visible payoff.
