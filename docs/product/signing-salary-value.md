# Historical signing value by salary

The draft page compares each signing's actual regular-season overall rating with
the historical performance expected at their contracted salary. This is a
display-only benchmark; it contributes nothing to Calder ratings or winners.

```text
expectedRating = 34.482782976600674
               + 17.762094214653004 * sqrt(contractSalary / 1,000,000)
valueOverSalary = actualRegularSeasonOverallRating - expectedRating
teamSigningValue = mean(valueOverSalary for graded signings)
```

Only salaries between **$1,000,000 and $12,500,000**, inclusive, receive an
expectation. Missing, invalid, ambiguous, or unsupported salaries keep their
expectation and value blank. Missing outcomes are not zero outcomes. Keep the
recorded salary visible even when it cannot be graded. The pure display
implementation is [signing-value.ts](../../src/lib/utils/features/signing-value.ts).

## Primary sources and salary linkage

The [league rulebook](../../src/content/rulebook.ts) establishes that contract
salaries stay fixed during the contract, while RFA and UFA premiums can increase
the signing price above the base salary list. Therefore the benchmark uses
`Contract.contractSalary`, not the current NHL-derived salary estimate and not
the buyout cap charge. The underlying stored contract and rating fields are
defined by [schema.ts](../../convex/schema.ts).

Join the signing's player and team's franchise owner to the contract covering
season opening: `startDate <= seasonStart <= expiryDate`, with signing date no
later than opening. If multiple records qualify, prefer latest start date, then
latest signing date. Conflicting salaries at that same latest date are unknown.
This follows the existing opening-season coverage semantics in
[draft-signings.ts](../../scripts/src/domains/maintenance/draft-signings.ts);
`capHitEndDate` is not playing coverage. Salaries missing from old records must
not be reconstructed from today's prices.

The analysis uses cached first-party league records, collected during the prior
read-only draft research and signing reconciliation. No external NHL salary
comparison is appropriate because GSHL prices and ratings are league-specific.
The rating target is `PlayerTotalStatLine.Rating` for `RS`, the same overall
outcome displayed in the table. Position-normalized rating behavior is described
in [RANKING.md](../RANKING.md). Usage and roster status can cover playoffs without
changing this rating target.

## Coverage and reproducibility

[research-signing-value.mjs](../../tools/research-signing-value.mjs) reads cached
JSON only, prints aggregate results, and performs no database access or writes.
With Node 24, run `node tools/research-signing-value.mjs` with the original cached files, or pass
performance and contract snapshot paths as its two positional arguments. It
reproduces coverage, fitted coefficients, validation, and source hashes.

| Snapshot                                      | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `.local-data/draft-slot-research/source.json` | `6efe2230f7b9b37a51a5d9bc882cb3433248fdfbd9e21d8fe00fff84c5400489` |
| `.local-data/draft-signings-source.json`      | `8f4a33e7ead5c2c896a94292861be3c5b867257b505b09d073d8f8d931fb0f05` |

The performance snapshot was collected at `2026-09-22T01:01:03.388Z`. Include
only seasons whose stored end date precedes that collection date, using the
snapshot's canonical IDs and signing selections. The resulting cohort has
**258 player-season observations, 112 distinct players, and five completed
seasons**. Every matched signing has an observed RS rating; none has a conflicting
qualifying salary. These coverage counts and all numerical findings below come
from the linked reproducible analysis.

| Season  | Signing selections | Graded salary/rating pairs | Missing contract salary |
| ------- | -----------------: | -------------------------: | ----------------------: |
| 2018-19 |                  1 |                          0 |                       1 |
| 2019-20 |                  1 |                          0 |                       1 |
| 2021-22 |                 48 |                         48 |                       0 |
| 2022-23 |                 49 |                         46 |                       3 |
| 2023-24 |                 62 |                         62 |                       0 |
| 2024-25 |                 50 |                         50 |                       0 |
| 2025-26 |                 52 |                         52 |                       0 |

## Model comparison

Fit ordinary least squares with nonnegative slope to salary in millions, its
square root, or its natural logarithm. Compare a constant mean as the baseline.
Every held-out season refits its coefficients using the remaining seasons. The
temporal check trains on 2021-22 through 2023-24 and predicts the latest two
seasons, comprising 102 observations. Final coefficients refit all 258 rows.

| Model                  | Held-out season RMSE | Held-out season MAE | Latest two seasons RMSE |
| ---------------------- | -------------------: | ------------------: | ----------------------: |
| Constant mean          |               22.503 |              18.819 |                  23.622 |
| Linear salary          |               18.471 |              14.523 |                  17.844 |
| **Square-root salary** |           **18.307** |          **14.380** |              **17.599** |
| Log salary             |               18.380 |              14.488 |                  17.716 |

As a repeat-player sensitivity check, withholding all seasons for each player
yields RMSE 18.265 for square root, 18.457 for linear, and 18.305 for log. This
supports square root without depending on repeated contracts appearing in both
training and validation.

Position adjustments were investigated: 192 forward, 46 defense, and 20 goalie
observations. Adding each position's mean residual reduced held-out season RMSE
to 17.727; shrinking that residual toward zero with 25 pseudo-observations gave
17.847. The chosen shared curve favors a simple salary comparison and avoids
separate estimates from only 20 goalie observations. Its position-specific
errors remain a limitation. No year offset is fitted: the display uses one fixed
historical expectation, with the temporal check measuring sensitivity to later
seasons. This is retrospective benchmarking, not a reconstruction of forecasts
available on each signing day.

| Salary | Expected overall rating |
| ------ | ----------------------: |
| $1m    |                    52.2 |
| $2m    |                    59.6 |
| $4m    |                    70.0 |
| $6m    |                    78.0 |
| $8m    |                    84.7 |
| $10m   |                    90.7 |
| $12.5m |                    97.3 |

## Team display ranking

Rank teams within the selected season by the equal-weight mean surplus of their
graded signings, highest first. A sum would systematically favor teams with more
signings. Keep full precision through per-player differences and averaging; round
the team mean to one decimal for both display and competition ties (1, 1, 3).
Teams without graded observations receive no rank. Show graded/total signing
coverage so missing contracts cannot look like a complete evaluation.

This is realized overall player value relative to salary, not value per game or
team-specific production. It does not measure contract term risk, draft picks
forfeited for keepers, or buyout liabilities. One-signing averages are volatile,
and the roughly 18-point individual prediction error argues against treating
small surplus differences as precise estimates. The existing Calder calculation
and its non-signing selection cohort remain unchanged, as specified by
[RANKING.md](../RANKING.md).
