---
title: Migrate src/storage/ and src/controlsPersistence.ts to @randroids-dojo/vibekit/storage
status: closed
priority: 3
issue-type: task
created-at: "2026-05-08T23:28:53.314509-05:00"
closed-at: "2026-05-11T22:00:00-05:00"
close-reason: "shipped in PR #N (F-018 slice 2): controlsPersistence.ts now calls @randroids-dojo/vibekit's readStorage / writeStorage / removeStorage directly. src/lib/storage/localStorage.ts + its test file removed. README updated. The kit's storage surface is schema-validated; controlsPersistence's per-call zod usage collapsed into the kit's readStorage(KEY, ControlsEnvelopeSchema) one-liner. Behavioral delta: clearControls's 'returns false when localStorage throws on remove' path no longer reachable because the kit swallows the throw internally; client branch returns true, SSR branch still returns false. The 57-case test surface still passes with one test rewording to match the new contract."
---

VibeCity has a storage/ folder plus controlsPersistence.ts. Sweep these to use ../VibeKit/src/storage.ts (readStorage<T>(key, schema), writeStorage, listenStorage, notifyStorageChange). Each store keeps its zod schema in the consuming module; the kit just owns the SSR-safe + JSON-safe + quota-safe + cross+same-tab plumbing.
