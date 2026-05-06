---
title: "implement: REQ-088 slice 2 of 2 - night-mode lit-windows on powered zones"
status: closed
priority: 1
issue-type: task
created-at: "\"\\\"2026-05-06T11:41:40.701885-05:00\\\"\""
closed-at: "2026-05-06T11:45:45.159382-05:00"
close-reason: REQ-088 slice 2/2. Night-mode lit-windows on powered zones. timeOfDay.ts pure helpers + 27 unit tests. PR pending.
---

Drive scene reads city.mood.timeOfDay. When 'night': dim sky/ground, brighten sun, per-zone emissive: powered residential warm, powered commercial cool, powered industrial subdued, brownout dim, unpowered fully dark. Pure helpers in src/app/[slug]/timeOfDay.ts; unit-tested. e2e for night-mode visible signal.
