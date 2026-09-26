# Preseason standings and in-season matchup strength

The [subsequent refinement](power-ranking-refinement.md) updates the form
weights and goalie-forfeit handling described in the original evaluation below.

Preseason targets final regular-season standings. In-season power targets
current matchup strength. No result here establishes a best-possible model.

## Preseason formula

```
ownerWinRate = (weightedWins + 0.5 * weightedTies + 10) / (weightedGames + 20)
ownerScore = (ownerWinRate - 0.5) / 0.15
standingsScore = leagueZ(0.5 * rosterScore + 0.5 * ownerScore)
rating = 50 + 25 * standingsScore
```

Only the previous four regular seasons count, with weights 1, 0.7071, 0.5,
and 0.3536. The 20-game average-owner prior limits small-sample extremes.
Missing history is neutral. Records follow owners across franchises; explicit
team ownership takes precedence over the franchise directory. Trophies,
playoff results and prior power ratings do not enter this new owner signal.
Home tiebreak wins are already included in teamW and are not counted twice.
The owner signal measures win percentage, not standings points percentage.

The roster model still uses only the selected season's categories: no plus/minus
for 2026–27. Selected draft players contribute through roster production;
unused future picks are not current playing strength. The blend is standardized
after combination. Coefficients of 50/50 do not imply equal variance: owner
scores are deliberately shrunk first. Ratings are indices, not percentages;
the existing linear scale can exceed 100.

## Retrospective evidence

Years refer to season ending years. Candidate owner coefficients were 0, 0.25,
0.5, 0.75 and 1. Selection minimized mean per-season absolute final standings
rank error on 2019–2023 (80 team-seasons), selecting 0.5. Evaluation used
2024–2026 (44 team-seasons).

| Metric                      | Roster only | Selected blend |
| --------------------------- | ----------: | -------------: |
| Training rank error         |       3.775 |          3.625 |
| Evaluation rank error       |       4.119 |          3.696 |
| Evaluation rank correlation |       0.234 |          0.460 |

Evaluation error fell about 10.3%. Improvement was not uniform: 2019 and 2023
became worse. The 0.75 candidate scored better on evaluation years but lost on
training error, so was not selected. These are retrospective temporal
comparisons using corrected historical data. Evaluation years also appeared in
earlier exploratory analysis; this is not a pristine prospective holdout.
Confidence intervals were not fit, and the other owner parameters were fixed.

Stored teams currently resolve owners through the franchise directory, not
immutable season-specific ownership snapshots. An ownership transfer without
a historical snapshot can misattribute past results. The pure model supports
an explicit owner override, but this change adds no ownership storage.

## Transition and midseason decision

Entering Weeks 1–5, the preseason forecast receives 100%, 75%, 50%, 25%, then
0% of the composite. The existing four-week policy was not optimized here.
Week N results still cannot change the rating entering Week N.

After transition, current weights are recent-form EWMA 55%, matchup Elo 20%,
roster talent 15%, GM ladder 10%. History therefore
remains in Elo/talent and the small GM term after the explicit forecast expires.

A first coefficient ablation compared the former defaults (25% previous week,
30% EWMA) with four alternatives that removed
the GM term. It used stored entering-week inputs and subsequent regular-season
matchups from Week 5 onward: 632 training and 397 evaluation matchups.
Same-week statistics and postgame Elo were excluded from predictors.

| Variant                  | Training accuracy | Evaluation accuracy | Evaluation Brier diagnostic |
| ------------------------ | ----------------: | ------------------: | --------------------------: |
| Existing                 |            69.70% |              70.53% |                      0.2013 |
| Add 10% to EWMA          |            70.02% |              69.02% |                      0.2032 |
| Add 10% to roster        |            69.38% |              69.77% |                      0.2071 |
| Add 5% each to Elo/EWMA  |            69.54% |              70.53% |                      0.2019 |
| Add 10% to previous week |            69.86% |              69.52% |                      0.2040 |

Ties receive half credit. The Brier diagnostic uses a fixed logistic conversion,
not calibrated probabilities. Defaults had the lowest training Brier diagnostic;
no alternative improved evaluation accuracy. There is insufficient evidence to
replace the midseason weights. Snapshots were historically recomputed: this is
an ablation, not a replay from immutable opening inputs. A league-wide order
cannot capture every pairwise category advantage, NHL schedule or injury.

## Current preview and implementation

Read-only 2026–27 input covers 14 teams, 210 players and 3,124 prior NHL rows.
Thirteen owners have qualifying history; TBD receives a neutral owner score.
The new top three are Hubie's Beauties, Dirty F & Gs and Ben Eagers Hands.
Examples of rank movement: Sauce Puck 2 to 4, Peps 10 to 7, Dutch Rudders 12
to 8, and The Poo Balances 6 to 10. This iteration is local and has not been
deployed or used to rewrite weekly rankings.

The Convex preview and operator replay share the pure standings projector.
Owner records use a separate cache from legacy GM/history inputs, preserving
midseason behavior. No schema or frontend boundary changes are required.

`scripts/src/commands/power/evaluate-power-objectives.ts` reads cached inputs
and writes local reports; `--fetch` additionally refreshes weekly history using
read-only production queries. See its `--help`. The preview command reads
production and writes local files only. Reports are under
`.local-data/power-objectives/`.

## Verification

Passed: `npm run ranking-engine:check` (22 fixtures), direct preseason/owner
tests (12 fixtures), matchup-evaluation test (1 fixture), scripts TypeScript,
`tsc --noEmit -p tsconfig.build.json`, ESLint on `convex/lib/preseasonPower.ts`,
and `git diff --check`. The retrospective evaluation and read-only production
preview also ran. Scripts are excluded by the repository ESLint configuration.
No full application build, browser test, deployment or production recomputation
was run for this iteration. No frontend boundary changed, so architecture
checks were not repeated.
