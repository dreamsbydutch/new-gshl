# Ranking and power

This is the behavior contract for GSHL ratings and weekly power. Implementation
details that can be discovered directly from code are intentionally omitted.

## Source and runtime

The local calculation files live under
`scripts/src/runtime/`:

- `RankingEngine/config.js`
- `RankingEngine/player-pure.js`
- `RankingEngine/team-pure.js`
- `RankingEngine/index.js`
- `PowerRankingsAlgo.js`

Local TypeScript commands load these runtimes into a Node `vm` with supplied
record data. Calculations do not perform storage writes. Convex persistence
belongs to the calling operator workflow.

Run `npm run ranking-engine:check` after runtime changes, and add representative
numerical fixtures when scoring changes. A production rebuild is a separate
authorized data operation.

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

## Draft expectations and Calder

Draft slot expectations use the historical regular-season quality curve in
`RankingEngine/config.js` (`draftSlot`). The browser calibration JSON is generated
by `node tools/sync-draft-slot.mjs`; `--check` verifies it without writing.
Browser/runtime parity is exercised by the draft-slot-curve tests.

Expected rating is `41.73092969231692 + 45.19453675621042 × remaining slot share`,
where remaining slot share is `(last non-signing slot - slot + 1) / last non-signing slot`.
It is a fixed retrospective benchmark fitted to eight recorded drafts, rather
than a scale stretched between each season's strongest and weakest selections.
See [the research](product/draft-slot-quality-curve.md) for coverage and validation.

Calder's over-slot component uses the same actual regular-season total rating
minus slot expectation as the draft page. The existing percentile combination
and weights remain: over-slot value 31.5%, NHL value 24.5%, GSHL total 14%, and
team production 30%, followed by the existing first-eight/later-picks weighting.
Signings and selections missing regular-season ratings do not receive draft grades.
Recalculating Calder scores/ranks does not rewrite recorded award recipients.
When award reassignment is requested, the focused
`scripts/src/commands/awards/reconcile-calder-winners.ts` operator reconciles
Calder winners and nominees to those rankings and verifies all award records.

## Entering-week power

`TeamWeekStatLine.powerRating` and `powerRk` describe a team entering the week.
Week N results may affect Week N+1 but must never rewrite Week N's snapshot.
Only active and completed weeks receive power rows.

Before opening week, the power views compute a separate preseason projection
from current season team assignments. This preview does not create a fictional
week or write derived rows. Historical replay uses opening-day roster snapshots,
falling back to completed draft selections; it never uses today's player team
assignments to reconstruct an old season.

The pure preseason model lives in `scripts/src/runtime/preseason-projection.ts`.
It projects category rates from the preceding three NHL seasons, regresses small
samples toward position-group rates, and models availability and eligible daily
lineups using the target season's roster slots. Goalie ratios use total shots
and minutes; goalie category strength includes the risk of missing the weekly
appearance minimum. Unproven players receive conservative position priors rather
than disappearing from the roster average. Only the selected season's configured
categories count, including plus/minus when configured.

Entering Weeks 1–4, the composite blends the fixed opening projection with the
standard in-season composite at 100%, 75%, 50%, and 25% preseason weight. Entering
Week 5, this explicit preseason weight is zero. The existing rolling player talent
and seeded Elo still carry historical information. The four-week transition is a
transparent policy choice, not a fitted optimal decay. The projection's score uses
the same `50 + 25 × standardized composite` display scale as weekly power.

See [the preseason evaluation](product/preseason-power-projections.md) for
historical comparison, current coverage, assumptions, and limitations.

The standard in-season composite is:

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
