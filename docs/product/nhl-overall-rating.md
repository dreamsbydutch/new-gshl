# Reviewed NHL overall rating

The reviewed profile `nhl-hockey-overall-reviewed-v1` estimates **season goals
contributed above an NHL replacement player at the same position**. Forwards,
defensemen and goalies share one goal scale and one overall ordering. Actual
workload matters. Sustainable ability remains a separate diagnostic and never
enters this overall score or rank. GSHL fantasy categories do not enter it.

The selected calculation uses whole-game cross-fitted nonlinear shot
probabilities, the existing adjusted-impact decomposition, and annual
same-position replacement references. Production stores this profile in its own
model namespace: `seasonValue` is the signed goal contribution and `rank` is the
single ordering across positions. `hockeyOverall` retains separate ability,
coverage, components and depth sensitivities. Existing v1/v3 and GSHL category
ratings remain preserved. Original research artifacts retain their research-only
flags; the production publisher independently verifies and reconstructs the math.

The [fixed production policy](nhl-hockey-overall-production-policy.md) governs
publication. Completed seasons and dated season-to-date snapshots remain
distinct; future seasons have no fabricated records. These imports are immutable
snapshots. Refreshing an already published season requires a separately reviewed
update/version workflow rather than silently replacing its source.

## Calculation

1. Reconcile official NHL games, identities, clocks, shifts, attempts, goals and
   season appearances/minutes. Require complete source scope, at least 98%
   verified process exposure and individual attempts, and explicit player
   qualification. Preserve unknown or unpriced events rather than invent credit.
2. Estimate ordinary-shot probabilities with the reviewed 21-feature histogram
   gradient learner. Five whole-game folds exclude each scored game from both
   fitting and parameter selection. Geometry/type/sequence and game context enter;
   shooter and goalie identities do not. Penalty shots use the separate,
   preceding-five-season historical probability.
3. Fit separate offensive/defensive skater effects by strength family, adjusting
   for teammates, opponents, manpower, venue, score and zone context. The reviewed
   full-season ridge is 4. Add finishing (`goals - expected goals`), goalie saving
   (`expected goals against - goals allowed`) and verified penalty opportunity
   value. Recompute every component consistently from the same event labels.
4. Subtract a same-position replacement reference over the player's actual
   exposure. The annual depth policy is 13 F / 7 D / 2 G per official NHL team,
   with the existing PP 11 / SH 9 policies. Select cohorts by deployment and
   coverage, independently of their scores. Unsupported references remain null.
5. Sum the replacement-relative components and rank everyone together, with
   competition ties. Preserve component breakdowns, qualification and separate
   ability. Report the fixed narrow `12/6/1.5` and wide `14/8/2.5` depth
   sensitivities alongside the primary score; they are not confidence intervals.

The skater terms describe chance creation/prevention, finishing and penalties.
Goalie terms describe shot stopping and verified individual events. This permits
different skater styles to contribute through different components without a
position multiplier or a fantasy-category weight.

## Evidence and decisions

Three complete seasons were reconstructed from retained public sources:

| Season  | Games | Ordinary shots | Qualified players | GB Brier improvement vs OOF GLM |
| ------- | ----: | -------------: | ----------------: | ------------------------------: |
| 2023-24 | 1,312 |        114,793 |               805 |                           1.02% |
| 2024-25 | 1,312 |        112,207 |               793 |                           0.99% |
| 2025-26 | 1,312 |        112,058 |               801 |                           1.05% |

Both shot errors improve in every season. All 339,058 predictions replay
independently in TypeScript to numerical precision. The 2025 reconstructed
workflow passes every sealed shot criterion, including its paired error ranges
and all eight adequately populated context guards. Both full-season impact fits
converge in each year. Player qualification/coverage agree across learners;
stored finishing and saving reconcile per player against raw events, including
provisional players. Three-season shot evidence is supporting descriptive
evidence, not proof of causal allocation among players.

The first-60%-frozen nonlinear forecasting arm failed its separate two-season
team-goal condition and remains rejected. Retrospective cross-fit labels never
enter a claimed chronological test. A 10,000-minute historical goalie-reference
blend reduced the 2025 point error by about 17.5%, but failed its predeclared
uncertainty condition in both learners. The annual reference therefore remains
primary. Shared-cohort impact priors and other unsuccessful experiments remain
research, rather than silently entering this score.

The recovered legacy snapshot already included 2025-26 outcomes used in earlier
ability/reference research. Its new reconstructed workflow was sealed before
its results were inspected, but the season was not globally untouched and is
not a prospective trial. Conditional bootstrap ranges also omit refitting and
other shared-model uncertainty.

## Precision and scope

Replacement depth is an explicit approximation to availability. Its sensitivity
can exceed the changes caused by a better shot learner. The output retains that
sensitivity rather than presenting the point estimate as an exact counterfactual.
Teammate/team confounding remains after regularization. Chance probabilities
omit tracking information and retain some subgroup calibration gaps.

Goalie rebound control, puck handling and chance prevention are not separately
identified by the current score. Source diagnostics and primary-method review
support further study, but do not justify adding a causal component now. This
is a material scope limitation against a complete measurement of every style.
The [goalie review](nhl-goalie-holistic-credit-review.md) records the evidence.

The implementation and rejected alternatives are detailed in the
[iterative review](nhl-rating-iterative-review.md). The
[sealed 2025 protocol](nhl-2025-retrospective-confirmation-protocol.md) and local
seal ledger preserve decisions, source/code hashes and prior-inspection limits.
The operator entry points and their purpose are in
[scripts/README.md](../../scripts/README.md); command `--help` owns flags.

## Saved results and verification

Local artifacts live under `.local-data/nhl-rating/review-20261018/`:

- 2023-24: `2023-reconstruction/reviewed-overall/`
- 2024-25: `reviewed-overall-2024/`
- 2025-26: `2025-reconstruction/reviewed-overall/`

Each contains `ratings.json`, `ratings.csv`, `sensitivity.json`,
`references.json` and an independent `reconciliation.json`. The primary
exporter is `scripts/src/commands/ratings/preview-nhl-hockey-overall.ts`.
`hockey-overall-independent-composition-audit.json` independently reproduces
every primary score, component, rank, qualification and depth sensitivity for
all three seasons. Ability estimates remain unchanged and separate.

`final-verification.json` records the exact commands: 170 focused tests and
31 ranking-engine checks passed, along with scoped strict TypeScript,
formatting, backend lint and whitespace checks. Exporter boundary probes also
reject invalid inference errors and reversed uncertainty intervals. No whole
application build, frontend architecture check or production action ran.
