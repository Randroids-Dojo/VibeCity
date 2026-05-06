---
title: "implement: REQ-075 citizens slice 1 of N - population bucket + density-tied growth + readout"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T12:03:22.192719-05:00\""
closed-at: "2026-05-06T12:07:33.126692-05:00"
close-reason: REQ-075 citizens slice 1/N. Population bucket strict + density-tied growth + editor pop readout. 9 new tests. PR pending.
---

Tighten PopulationBucketSchema. Residential zone growth bumps residents per density (0=0, 1=4, 2=12, 3=40). totalPopulation summary on bucket. Editor toolbar shows population readout next to tick. Tests for the schema + growth + reducer.
