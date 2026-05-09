---
title: Migrate cityKv.ts to @randroids-dojo/vibekit/server
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:28:53.316968-05:00"
---

VibeCity has cityKv.ts plus signing helpers if it gates city creates / loads. Migrate to ../VibeKit/src/server: getKv for the client singleton, readKv<T>(kv, key, schema) / writeKv / removeKv for typed access, signToken/verifyToken for any token-shaped flow, incrementWithExpiry for rate-limited routes.
