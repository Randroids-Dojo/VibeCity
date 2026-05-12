---
title: Migrate cityKv.ts to @randroids-dojo/vibekit/server
status: closed
priority: 3
issue-type: task
created-at: "2026-05-08T23:28:53.316968-05:00"
closed-at: "2026-05-12T03:30:00-05:00"
close-reason: "shipped in PR #222 (F-018 slice 3): cityKv.ts now re-exports getKv from @randroids-dojo/vibekit/server with a local hasKvConfigured = () => getKv() !== null synonym for back-compat. src/lib/storage/kv.ts removed (no other consumers). All 4 lib + route callers (loadCity, recentSlugs x3, recentVersions, the two API routes) switched to the cleaner const kv = getKv(); if (!kv) return ... pattern, dropping the redundant hasKvConfigured() pre-check. Behavioral delta: getKv() returns null on missing env instead of throwing. The test 'throws when env is unset' flipped to 'returns null when env is unset', and the hasKvConfigured env-permutation tests gained resetKvForTesting() in beforeEach/afterEach so the kit's cached resolution doesn't bleed across tests. The readKv / writeKv / removeKv typed helpers from the kit are NOT adopted in this slice; the existing kv.set / kv.get / kv.zadd direct calls keep the migration scope tight. signToken / verifyToken / incrementWithExpiry stay un-adopted as VibeCity has no rate-limited routes or token-shaped flows yet. Full suite 2502/2502 passes."
---

VibeCity has cityKv.ts plus signing helpers if it gates city creates / loads. Migrate to ../VibeKit/src/server: getKv for the client singleton, readKv<T>(kv, key, schema) / writeKv / removeKv for typed access, signToken/verifyToken for any token-shaped flow, incrementWithExpiry for rate-limited routes.
