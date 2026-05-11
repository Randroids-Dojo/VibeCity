---
title: "implement: REQ-110 sim-as-primary view scaffold (top-down camera at /[slug]/sim)"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-05T22:36:05.684518-05:00\""
closed-at: "2026-05-10T19:02:00.435274-05:00"
close-reason: "shipped in PR #213: data-view='sim' / data-route='sim' marker stamped on the canonical sim view <main>. The dot's named scope (top-down iso camera, pan / rotate / zoom, toolbar with zone tab) had already shipped across slices A-D (PRs #166, #167, #168, #169, #170); this slice closes the dot by giving the sim-view identity a stable DOM hook. REQ-110 stays partial: REQ-114 Drive toggle and REQ-112 tab rename pass remain in their own slices."
---

Without this, the new primary loop is invisible. Ship the new sim view at /[slug]/sim (existing /[slug] and /[slug]/edit unchanged this slice). Top-down 45-degree iso camera, pan / rotate / zoom, basic toolbar with zone tab. Default route swap (REQ-110 step 2) lands as a follow-on slice once the sim view feels right. See docs/gdd/21-sim-as-primary-view.md.
