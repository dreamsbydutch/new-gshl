---
name: gshl-ranking
description: >-
  Change or investigate GSHL player/team ratings, power ratings, RankingEngine,
  PowerRankingsAlgo, score tuning, parity, or synchronized runtime drift.
metadata:
  short-description: Maintain ranking and power behavior
---

# GSHL ranking and power

Read [the ranking reference](../../../docs/RANKING.md). The authoritative
Apps-Script-compatible runtime is `scripts/src/runtime/apps-script/`; matching
files under `apps-script/` are deployment copies.

Keep configuration in `RankingEngine/config.js`, pure math in player/team
modules, and sheet/context orchestration at the public runtime boundary.
Preserve the entering-week invariant: Week N results may affect Week N+1 power
but never rewrite Week N's entering snapshot.

For a behavior change:

1. Identify affected positions, sheets, season types, comparison pools, and
   small-sample behavior.
2. Add or update the smallest representative test or parity fixture.
3. Run the direct test. Use `test:power` only when its whole shared surface
   changed; run rating/power parity only when numerical behavior changed.
4. Run `npm run ranking-engine:sync`, inspect every generated diff, then run
   `npm run ranking-engine:check`.
5. Treat production recomputation or backfill as a separate authorized data
   operation.

Report expected score/rank movement and affected cohorts. Keep recalibration
inside the profile responsible for the intended behavior.
