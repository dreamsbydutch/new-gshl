# Ranking and power

This is the behavior contract for GSHL ratings and weekly power. Implementation
details that can be discovered directly from code are intentionally omitted.

## Source and runtime

The authoritative Apps-Script-compatible files live under
`scripts/src/runtime/apps-script/features/`:

- `RankingEngine/config.js`
- `RankingEngine/player-pure.js`
- `RankingEngine/team-pure.js`
- `RankingEngine/index.js`
- `PowerRankingsAlgo.js`

Matching files under `apps-script/features/` are synchronized deployment
copies. Local TypeScript commands load the ranking runtime into a Node `vm`;
there is no second TypeScript implementation.

After editing an authoritative file:

```powershell
npm run ranking-engine:sync
npm run ranking-engine:check
```

Inspect every destination diff. Add focused representative tests; use numerical
parity commands when scoring changes. A production rebuild is a separate data
operation.

## Ranking behavior

The public runtime exposes `rankRows`, `rankPerformance`, and
`getPerformanceGrade`. It supports player day, week, split, total, and NHL rows
plus team day, week, and season rows. Player day/week single-row calls return a
blank result because those ratings require a comparison pool.

Player pools are separated into forwards, defense, and goalies, with controlled
widening for small cohorts. Skater profiles blend category efficiency, support,
breadth, volume, and star impact. Goalie profiles blend efficiency, support,
breadth, and workload. Day/week profiles use retained-range handling for short
samples; aggregate profiles use distribution scoring with capped comparison
pools. Tunable weights and lower-is-better categories belong in `config.js`.

Team ratings are percentile comparisons inside season-scoped pools:

- day rows guard against no-activity results;
- week rows normalize counting categories to comparable games played while
  preserving GAA and save percentage; and
- regular-season totals also derive Hart, Norris, Vezina, Calder, Jack Adams,
  and GM of the Year team ratings. Non-regular-season rows clear those awards.

The output scale is approximately 0-125 rather than a strict percentage. Grade
labels, from highest to lowest, are Insanity, Super Elite, Elite, Above Average
Starter, Borderline Starter, Rosterable, Waiver Wire, and No Impact.

The engine computes ratings, not every downstream field. For example,
`PlayerNHL` salary and overall-rating derivation remain outside the engine.

## Entering-week power

`TeamWeekStatLine.powerRating` and `powerRk` describe a team entering the week.
Week N results may affect Week N+1 but must never rewrite Week N's snapshot.
Only active and completed weeks receive power rows.

The standardized composite is:

| Signal                                         | Weight |
| ---------------------------------------------- | -----: |
| Previous completed week                        |    25% |
| Recent-form EWMA through the previous week     |    30% |
| Matchup Elo through the previous week          |    20% |
| Rolling roster talent at the start of the week |    15% |
| GM career ladder at the start of the week      |    10% |

`gmLadderRating` stores the absolute ladder snapshot;
`powerGmScore` stores its league-standardized contribution.

## Change checklist

Before changing behavior, account for every affected sheet, position, season
type, comparison pool, and small-sample path. Report expected score/rank movement
and affected cohorts. Keep tuning within the responsible profile and preserve
the entering-week invariant. Run sync/check after focused tests and parity.
