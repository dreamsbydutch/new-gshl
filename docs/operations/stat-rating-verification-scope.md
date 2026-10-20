# Stat and rating verification scope

This records the October 20, 2026 read-only confirmation after the career repair.
It distinguishes correct calculation from source completeness and freshness.

Status: **qualified verification; an unconditional all-current-rows claim does
not pass**. The fresh comparison completed at 14:55:45 UTC. All 466 scopes were
read, with eight differing from the audited postimages. The differences were
then inspected at field level.

## What the completed audits establish

- All 522,233 recorded GSHL player days have the required active scoring fields
  for recorded appearances. Roster counts and canonical references were audited;
  the user confirmed the required player-day population.
- All 132,637 player-week, player-split, player-total, team-day, team-week and
  team-season rows reconcile to those days, including inactive placeholders.
- All 13,045 career rows reconcile to season sources. The subsequent repair
  corrected native GP/GS discrepancies and added missing current-season keys.
- All 667,915 core GSHL stat rows have the published contribution rating fields.
  Total contribution and average performance are separate. The original rating
  rollout verified 667,613 rows; the career repair verified the additional 302
  and preserved the existing ratings.
- All 13,915 NHL season stat rows match the reviewed official snapshot and
  category-score calculation. Hockey rating associations match the reviewed
  contribution model. The audit also checked all 40,233 model records and 2,893
  canonical players.

See the [post-All-Star reconciliation](season-rollup-post-allstar-reconciliation.md),
[rating rollout](gshl-uniform-rating-rollout.md),
[career repair](career-stat-reconciliation.md), and
[NHL season cleanup](../product/nhl-season-stat-cleanup.md).

## Qualifications

The current NHL season is a static snapshot fetched October 19, 2026 at
13:40:41 UTC. No automatic NHL season refresh was installed. A comparison with
that snapshot does not establish inclusion of games played later that day.
The 756 current-season player rows must be refreshed before calling the NHL
season statistics current.

There are 3,886 intentionally unsupported numeric NHL hockey scores: 3,861
provisional assessments and 25 with insufficient replacement references. These
are explicit model statuses, not accidentally missing category ratings. The
hockey policy excludes playoffs; it estimates observed contribution and does
not establish perfect causal value or prospective predictive accuracy.

Historical source review retains 52 undersized-roster flags; counts cannot prove
every individual lineup membership. Seven corroborated official goalie
accounting inconsistencies retain official values. The rating audit classified
39 populated no-appearance rows: 34 excluded NHL playoff rows, four zero-stat
placeholders and one verified DNP with stale cells. They receive zero counted
contribution. These qualifications prevent an unconditional claim that every
historical raw cell has independent external verification.

## Fresh production comparison

The local read-only verifier compares complete canonical row content against
the previously audited snapshots, excluding only `updatedAt`. Expected GSHL
rows combine original source rows with exact published rating patches; career
rows use the verified repair postimage. NHL stats, model rows and player records
use the complete NHL cleanup postimage. Each bounded scope returns a SHA-256
digest and row count from production. Season/week/team inventory is checked too.

Evidence is retained under `.local-data/db-confirmation-20261020/`:
`verify-live.mts`, `input-provenance.json`, and `live-1/proof.json`.
Input provenance binds the reviewed manifests, inventory, career verification,
NHL snapshot, rating runtime/reference files and active configuration.

A successful comparison confirms unchanged reviewed content in those scopes.
It is not a cross-scope atomic snapshot or a new independent scrape of every
historical source. It does not certify unrelated database tables, archives,
standings, awards or power snapshots. No production data is written by this
confirmation.

## Fresh comparison findings

All historical GSHL scopes match the published postimages. All 13,915 NHL season
stat rows and all 40,233 NHL model records are also unchanged. All 13,045 career
rows still match the completed career repair. Existing GSHL scoring fields and
published rating fields have not drifted.

The daily roster pipeline added 225 rows for October 20 after the earlier audits.
These have blank GP/GS and no `Rating`, `averageRating`, `ratingAppearances` or
`ratingVersion`. The live GSHL population is consequently 668,140 rows, including
522,458 player days. The previous 667,915-row uniform-rating verification does
not cover these new rows.

All six current-season aggregate scopes changed only roster-helper fields:
`days`, `MG` and `IR` on 225 player weeks, splits and totals; `MG` and `IR` on
14 team days, weeks and seasons. No scoring stats or ratings changed. These
changes reflect the new roster day. Careers are unchanged and therefore have
not yet incorporated those new helper counts.

The Yahoo daily roster workflow uses a native-stat-only rollup refresh that
preserves ratings and excludes careers. Changed player-day NHL stats have a
separate rating refresh path. This distinction means the all-row uniform rating
and career guarantees need an ongoing refresh boundary; today's zero-appearance
rows do not establish a numerical error in existing contribution ratings.

The eighth changed scope is canonical player roster metadata: four players
changed only `gshlTeamId`, `ownerId` and `lineupPos`, consistent with two additions
and two drops. All 2,893 player IDs are unchanged; NHL identities, bios, ratings
and financial fields are unchanged. This does not identify who made the roster
changes. The independent paginated scan is in `players-diff-1/proof.json`.

Exact new-row and aggregate differences are retained in `drift/proof.json`.
The initial full comparison is preserved as a failed equality proof rather than
relabeled as a clean pass. There were no production writes during this audit.

## Subsequent refresh activation

The findings above describe the read-only audit before the October 20 scheduler
work. The [stat refresh rollout](stat-refresh-cadence.md) subsequently initialized
the 225 new player-day ratings, incorporated current days into career totals and
refreshed current NHL season stats. Official daily-stat corrections received
after this audit are now paired with rating recalculation in the frequent path.
The historical snapshot counts above remain the evidence for that earlier audit;
they are not a claim that an active season stops changing.
