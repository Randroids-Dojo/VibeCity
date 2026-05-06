---
title: "implement: REQ-085 power grid (plants, lines, connectivity solver)"
status: open
priority: 2
issue-type: task
created-at: "2026-05-05T22:36:15.586721-05:00"
---

Two plant types (coal 100MW 2x2, solar 30MW 2x2), single-cell line pieces, per-tick connected-component solver, drive-visible lit/dark window signal at night. Per-cell pollution from coal feeds into citizen happiness (REQ-079). Blocked by sim engine. The existing lit-window dot becomes the drive-side render layer for this slice. See docs/gdd/16-power-grid.md.
