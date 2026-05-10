---
title: "Editor: erase mode auto-exits on piece-tool click"
status: closed
priority: 1
issue-type: task
created-at: "2026-05-10T01:31:18.703267-05:00"
closed-at: "2026-05-10T03:29:37.876628-05:00"
close-reason: "shipped in PR #206: setToolMode('place') wired into all seven palette onClicks + handleSelectCategory; Playwright spec asserts erase auto-exit"
---

When user clicks any street/building piece tool while toolMode='erase', exit erase and arm that piece. Currently the toggle persists across palette changes which is the #1 user complaint.
