---
title: Audit src/audio/ and src/share/ for VibeKit contribution
status: open
priority: 4
issue-type: task
created-at: "2026-05-08T23:28:53.312199-05:00"
---

VibeCity has dedicated src/audio/ and src/share/. Survey each for portable candidates: audio likely matches VibeRacer's audioEngine pattern (settings-coupled, defer until VibeRacer-decouple-audioengine lands); share helpers may be portable as-is. Contribute back what qualifies under the VibeKit contract (zero project imports, no framework, pure TS).
