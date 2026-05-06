---
title: "implement: REQ-101 services coverage solver + visible coverage on zones"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T12:41:20.488968-05:00\""
closed-at: "2026-05-06T12:44:17.151608-05:00"
close-reason: REQ-101 services coverage solver + zone coverage count signal. 20 new solver tests + 1 e2e. PR pending.
---

Pure servicesSolver: cellCoverage returns Record<ServiceKind, boolean> by Manhattan distance. solveServicesCoverage returns per-cell map. SnapGridView surfaces coverage count via data-zone-coverage-count. Tests + e2e.
