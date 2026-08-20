---
name: gshl-ranking
description: >-
  Change or investigate GSHL ranking and power logic. Use when a task mentions
  RankingEngine, PowerRankingsAlgo, rankRows, rankPerformance, player rating,
  skater rating, goalie rating, team rating, award rating, power rating, Elo,
  tuning profile, score scale, parity, entering-week power snapshot, runtime
  drift, ranking-engine:sync, or ranking-engine:check. Do not use for displaying
  an already-computed rank without algorithm changes.
metadata:
  short-description: Edit the authoritative rating and power runtimes
---

# GSHL ranking and power

Read [AGENTS.md](../../../AGENTS.md) and the full
[ranking reference](../../../docs/RANKING.md) before changing behavior.

The authoritative runtime lives in `scripts/src/runtime/apps-script/`:

- `features/RankingEngine/config.js`
- `features/RankingEngine/player-pure.js`
- `features/RankingEngine/team-pure.js`
- `features/RankingEngine/index.js`
- `features/PowerRankingsAlgo.js`

Matching `apps-script/` files are synchronized deployment copies. Never make a
one-sided behavioral edit.

Keep tuning constants in the structured config, pure player/team math in its
own module, and sheet/context orchestration in the public runtime. Preserve the
entering-week snapshot invariant: Week N results may affect Week N+1 power, but
must not rewrite Week N's entering power.

For a behavior change:

1. Identify every supported sheet/position/season type affected and the
   comparison-pool or small-sample behavior involved.
2. Add or update focused representative tests or parity fixtures before broad
   backfills. There is no packaged rating-engine unit suite today.
3. From the repository root, run `npm --prefix scripts run test:power` for
   power changes, then
   `npm.cmd --prefix scripts run power:parity -- --season-id SEASON_ID` in
   Windows PowerShell. For player-rating changes, run
   `npm.cmd --prefix scripts run ratings:parity -- --season-id SEASON_ID`.
   Follow the data-operations skill's Node-flag and argument-forwarding
   preflight before either parity command.
4. Run `npm run ranking-engine:sync`, review all five destination diffs, then
   run `npm run ranking-engine:check`.
5. Treat any backfill or production recomputation as a separate data operation
   requiring dry-run, scope, and authorization.

Do not recalibrate unrelated profiles merely to make one fixture pass. Report
the expected score/rank movement and affected cohorts.
