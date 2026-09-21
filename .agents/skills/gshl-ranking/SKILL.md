---
name: gshl-ranking
description: >-
  Change or investigate GSHL player/team ratings, power ratings, RankingEngine,
  PowerRankingsAlgo, score tuning, or numerical regressions.
metadata:
  short-description: Maintain ranking and power behavior
---

# GSHL ranking and power

Read [the ranking reference](../../../docs/RANKING.md). The local calculation
runtime lives in `scripts/src/runtime/`; operator adapters supply record data.

Keep configuration in `RankingEngine/config.js`, pure math in player/team
modules, and record/context orchestration at the public runtime boundary.
Preserve the entering-week invariant: Week N results may affect Week N+1 power
but never rewrite Week N's entering snapshot.

For a behavior change:

1. Identify affected positions, models, season types, comparison pools, and
   small-sample behavior.
2. Add or update the smallest representative numerical fixture.
3. Run the direct test. Use `test:power` only when its whole shared surface
   changed.
4. Run `npm run ranking-engine:check` when shared runtime contracts change.
5. Treat production recomputation or backfill as a separate authorized data
   operation.

Report expected score/rank movement and affected cohorts. Keep recalibration
inside the profile responsible for the intended behavior.
