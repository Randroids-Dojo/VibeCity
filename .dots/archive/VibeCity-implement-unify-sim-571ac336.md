---
title: "implement: unify sim view into the editor (REQ-110 step 2 - one canonical place/edit surface)"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T10:33:25.409703-05:00\""
closed-at: "2026-05-06T10:42:03.089310-05:00"
close-reason: "Unification: editor IS the sim editor. Zone tab + speed controls in editor toolbar. Sim view is now a 308 redirect. Legacy SimViewClient/SimGridView deleted. 6 new e2e tests; 1811 unit tests. PR pending."
---

User correctly pointed out the sim view and the editor are the same kind of surface (paintable grid). Merge: editor's Streets/Buildings switcher gains a Zones tab; engine runs in the editor; speed controls in editor toolbar; SnapGridView renders pieces+buildings+zones on the same grid. /<slug>/sim either redirects to /<slug>/edit or pre-selects the Zones tab. Single canonical editor with all placement tools.
