---
title: "implement: REQ-088 slice 1 of 2 - render zones in the drive scene"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T11:22:42.489200-05:00\""
closed-at: "2026-05-06T11:26:38.494781-05:00"
close-reason: REQ-088 slice 1/2. Zones rendered in drive scene as flat per-kind quads with density opacity + brownout emissive. PR pending.
---

Drive page reads builder cookie + passes builderId. DriveSceneClient mounts useSimEngine (cold-loads zones+power from event log). Renders zones as flat colored ground quads per kind/density. The lit-windows-at-night signal lands in slice 4b once zones are visible at all.
