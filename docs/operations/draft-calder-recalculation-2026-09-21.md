# Draft and Calder recalculation — September 21, 2026

Applied to production `polished-tern-709.convex.cloud` using the empirical
[draft-slot quality curve](../product/draft-slot-quality-curve.md).

The recalculation graded all 1,590 selections with regular-season ratings across
eight recorded drafts and patched 124 regular-season team records. Only
`calderRating` and `calderRk` were written. Draft expected ratings and over-slot
values are calculated by the page rather than stored on draft-pick documents.
The local audit includes all 1,860 draft rows across those seasons, including
263 excluded signings and seven selections with missing ratings.

| Season | Calder records updated | Ranks changed | Recalculated leader changed |
| --- | ---: | ---: | --- |
| 2018–19 | 16 | 13 | Yes |
| 2019–20 | 16 | 10 | Yes |
| 2020–21 | 16 | 11 | No |
| 2021–22 | 16 | 13 | Yes |
| 2022–23 | 16 | 14 | Yes |
| 2023–24 | 16 | 11 | Yes |
| 2024–25 | 14 | 8 | No |
| 2025–26 | 14 | 11 | No |

Recorded trophy recipients were preserved. Earlier configured seasons contain
no stored draft picks and could not be regraded; future seasons remain ungraded.
Player ratings, other award ratings, power, matchup results, rosters, and draft
source records were not written. Maximum absolute Calder score movement was
13.59 points.

## Apply and verification

The reusable operator is
`scripts/src/commands/draft/recalculate-draft-ratings.ts`; its `--help` owns
the options. A one-season dry run preceded the all-history review. The live
apply required the reviewed plan hash, preventing a changed input plan from
being applied silently. Before-values were saved before the field patches.

- Reviewed/applied hash: `ff664b43e2128040430652fabfe5ae5471897201d8558fb9aa9f2c9839555c7d`.
- Applied rows: 124, with no duplicate targets or non-finite scores.
- Fresh all-history read-back: zero proposed changes in every season.
- Local audit directory: `.local-data/draft-ratings/`, containing scoped and
  full dry runs, `applied-all-seasons.json`, its completion journal, and
  `verified-all-seasons.json`. These are local audit files, not independent
  archival backups.

Validation passed: 13 draft/roster/curve tests, four research/Calder tests,
22 shared ranking checks, application and scripts type checks, frontend
architecture checks, changed frontend/backend file lint, calibration parity,
and whitespace checks. The repository excludes operator scripts and the sync
tool from ESLint. No full app build or live browser verification ran.

The page's Overall / Team days / Usage layout and the new browser expectation
code are implemented locally. No Convex function or web deployment was made
as part of this data recalculation.

## Follow-up: trophy reassignment

The user subsequently explicitly requested that trophy recipients also change
to match the recalculated yearly rankings. The focused
`scripts/src/commands/awards/reconcile-calder-winners.ts` operator updated all
eight rated seasons' existing Calder award records in production, including the
two nominees. Five winners changed:

| Season | Previous winner | New winner |
| --- | --- | --- |
| 2018–19 | Auto Draft All-Stars | BlazerDri |
| 2019–20 | Peps | Hubie's Beauties |
| 2021–22 | Sauce Puck | Toronto Maple Reg's |
| 2022–23 | BlazerDri | Ben Eagers Hands |
| 2023–24 | Robert Thomas | Zacharius Jones |

The other winners remain Hubie's Beauties (2020–21), Dutch Rudders (2024–25),
and THE WAUPOOS FLASH (2025–26). Seasons 2013–14 through 2017–18 have no rated
Calder rankings and remain unchanged; no history was invented.

A scoped dry run preceded the all-years review. The applied plan hash was
`25395a80fd9d77a17c9922fbc813d2180d34b1dacf2e0f189ecc93a48ad452ab`.
Read-back verified all 179 team award rows, preserving every non-target row
and target metadata. A fresh all-years dry run found zero changes. Audit files
and before-images are in `.local-data/calder-winners/`.

Four existing award-calculation tests, scripts type-checking, and whitespace
checks passed. ESLint excludes the operator package. No app build or code
deployment was needed for these award-data updates.
