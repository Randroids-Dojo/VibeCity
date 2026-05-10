---
title: Game should start out paused
status: closed
priority: 2
issue-type: task
created-at: "\"2026-05-10T00:41:58.839817-05:00\""
closed-at: "2026-05-10T17:33:40.272264-05:00"
close-reason: "shipped in PR (TBD): DriveSceneClient initializes pauseState='paused' when city.pieces.length>0; empty cities stay 'running'."
---

Drive mode should boot in a paused state; player explicitly unpauses to begin. Decide UX (overlay? press-to-start?) and wire pause-on-load.
