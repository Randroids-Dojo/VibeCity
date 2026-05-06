---
title: "implement: REQ-080 zoning categories + R/C/I demand"
status: open
priority: 2
issue-type: task
created-at: "2026-05-05T22:36:09.276960-05:00"
---

Replace the four placeholder building types with three zone types (residential / commercial / industrial). Ship: zone painting tool, schema migration that keeps v1 placeholder buildings loadable, per-tick demand calculation (function of population + power + water + services + economy), demand bars in sim view. Blocked by sim engine substrate. See docs/gdd/15-zoning-and-business.md.
