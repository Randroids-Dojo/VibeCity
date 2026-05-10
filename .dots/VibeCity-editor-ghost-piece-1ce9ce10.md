---
title: "Editor: ghost piece glyph + active-piece preview at current rotation"
status: open
priority: 2
issue-type: task
created-at: "2026-05-10T01:31:18.706390-05:00"
---

Hover ghost should render the piece SHAPE (connector glyphs / curve outline) at the current rotation, not just a flat cell fill. Add a 'currently armed piece' preview tile in the palette area showing the piece + rotation visually. Reference: editorPreview.ts already computes preview cells; SnapGridView.tsx renders ghost cells flat. Extend to render piece glyphs in ghost color.
