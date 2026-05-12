---
title: Migrate cityKv.ts to @randroid/game-kit/server
status: closed
priority: 3
issue-type: task
created-at: "2026-05-08T23:21:27.895519-05:00"
closed-at: "2026-05-11T22:00:00-05:00"
close-reason: "duplicate of VibeCity-migrate-citykv-ts-b5172997.md (which targets the correct @randroids-dojo/vibekit/server namespace). This dot references the abandoned @randroid/game-kit/server name. Kept the b5172997 sibling open."
---

VibeCity has cityKv.ts plus signing helpers if it gates city creates / loads. Migrate to @randroid/game-kit/server: getKv for the client singleton, readKv<T>(kv, key, schema) / writeKv / removeKv for typed access, signToken/verifyToken for any token-shaped flow, incrementWithExpiry for rate-limited routes.
