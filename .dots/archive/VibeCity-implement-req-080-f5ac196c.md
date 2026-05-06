---
title: "implement: REQ-080 zoning categories + R/C/I demand"
status: closed
priority: 2
issue-type: task
created-at: "\"\\\"2026-05-05T22:36:09.276960-05:00\\\"\""
closed-at: "2026-05-06T15:55:24.867098-05:00"
close-reason: REQ-083 commercial/industrial revenue (subset of REQ-080 broader work). 4 unit cases. PR pending.
---

Replace the four placeholder building types with three zone types (residential / commercial / industrial). Ship: zone painting tool, schema migration that keeps v1 placeholder buildings loadable, per-tick demand calculation (function of population + power + water + services + economy), demand bars in sim view. Blocked by sim engine substrate. See docs/gdd/15-zoning-and-business.md.
