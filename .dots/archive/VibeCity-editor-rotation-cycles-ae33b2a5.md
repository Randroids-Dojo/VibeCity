---
title: "Editor: rotation cycles on piece-tool retap + R key"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-10T01:31:18.699971-05:00\""
closed-at: "2026-05-10T01:34:59.149684-05:00"
close-reason: "shipped in PR #205: selectStreetPaletteEntry helper + EditorClient wiring; R key was already bound"
---

Port VibeRacer's selectTool retap-to-cycle rotation. Also bind R to advance rotation. Drop the separate Rotate button, or keep as a redundant control. Reference: ../VibeRacer/src/components/TrackEditor.tsx:721 + ../VibeRacer/src/game/editor.ts:28 (nextRotation).
