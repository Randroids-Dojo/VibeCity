---
title: Migrate cityKv.ts to @randroid/game-kit/server
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:21:27.895519-05:00"
---

VibeCity has cityKv.ts plus signing helpers if it gates city creates / loads. Migrate to @randroid/game-kit/server: getKv for the client singleton, readKv<T>(kv, key, schema) / writeKv / removeKv for typed access, signToken/verifyToken for any token-shaped flow, incrementWithExpiry for rate-limited routes.
