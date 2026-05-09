---
title: Migrate src/storage/ and src/controlsPersistence.ts to @randroid/game-kit/storage
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:07:48.843045-05:00"
---

VibeCity has a dedicated storage/ folder plus controlsPersistence.ts. Sweep these to use @randroid/game-kit/storage (readStorage<T>(key, schema), writeStorage, listenStorage, notifyStorageChange). Each store keeps its zod schema in the consuming module; the kit just owns the SSR-safe + JSON-safe + quota-safe + cross+same-tab plumbing.
