# NHL Season Value v3 implementation audit

Inspected October 18, 2026. Goal: estimate offensive, defensive and goaltending
contributions independently of GSHL categories, treating different playing styles
fairly and ultimately supporting meaningful comparisons across F/D/G.

The implementation is a credible foundation for that goal, but the evidence does
not establish an optimal individual-player model or a calibrated overall rating
across positions. Correct implementation, useful team prediction and accurate
individual attribution are separate claims.

## Scope and evidence

Inspection followed the active entry point
`scripts/src/commands/ratings/preview-nhl-value-v3.ts` through source reconciliation,
shot quality, adjusted impact, season accounting, performance preview and the
publication contract. Relevant sources include:

- `scripts/src/runtime/nhl-shot-quality.ts`
- `scripts/src/runtime/nhl-adjusted-impact.ts`
- `scripts/src/runtime/nhl-game-season-value.ts`
- `scripts/src/runtime/nhl-performance-rating.ts`
- `scripts/src/domains/nhl/game-value-input.ts`
- `scripts/src/domains/nhl/game-value-publication.ts`
- `convex/nhlSeasonValues.ts`

Local historical artifacts referenced in `docs/RANKING.md` are absent from this
checkout. Historical evaluation numbers in that document were not independently
reproduced. No live data, production publication or deployment was used to assess
the current implementation.

That describes the initial inspection. The subsequent
[iterative review](nhl-rating-iterative-review.md) recovered read-only historical
rating components, began public source reconstruction, and follows the user's
clarified target of value above a same-position NHL replacement player. Its
evidence and changes supersede the initial data-access limitation above.

The later sections of `docs/RANKING.md` document a 13-season component audit,
a 404-team-season success audit and a finalized 2019-20 review. These are relevant
existing evidence, not missing work. In particular, the recorded 2024-25 defensive
ablation reduced team xG error by 3.9% compared with removing defense. The
team-success audit reports strong retrospective association with regular-season
results, while its postseason probability comparison did not establish an
improvement over points percentage. The 2019-20 model failed its original
held-out improvement gates and was finalized with those limitations retained.
These documented results support a useful model without establishing optimal
individual attribution or predictive superiority. Their artifacts were not
available for replay during this inspection.

## What is sound

The model uses goal-equivalent offensive creation and defensive prevention rather
than awarding points simply for hits, blocks or other fantasy categories.
Changing lineups, teammates, opponents, strength, score, home ice and faceoff
context enter an exposure-weighted ridge fit. Equal offensive and defensive
signals receive equal numerical credit in the existing controlled fixtures.

This is consistent with the purpose of
[Evolving-Hockey's documented RAPM approach](https://evolving-hockey.com/glossary/regularized-adjusted-plus-minus/):
use stint exposure and regularization to separate player effects from measured
context. That supports the method family, not equivalence to its model or accuracy.

Season contribution retains actual finishing and saves; the ability estimate
shrinks those noisy components separately. The solver verifies its normal-equation
residual. Exact design rows are pooled without changing the weighted objective.
Chronological selection keeps the final test outcomes out of parameter selection.
Source gaps, uncertain intervals and provisional players are explicitly represented.
These behaviors are worth preserving.

## Findings and corrections

### 1. Unknown player effects could qualify as measured zero impact — corrected

`rankGameSeason` previously used `coefficient ?? 0` for missing offensive and
defensive effects while adding the entire stint to modeled player minutes.
This is reachable when a player/situation appears only in partially verified
games omitted from model fitting, or when replay uses a model lacking that effect.
It could qualify a player for an official rank despite missing process estimates.

The calculation now requires both fitted effects for each credited skater/family.
Unsupported minutes are omitted from process value, process coverage and the
associated breakdown; verified individual finishing and penalties remain usable.
A warning identifies the gap. Explicit zero coefficients remain supported.
Existing coverage thresholds determine whether the result can be ranked.

Revision `2026-10-18-fitted-process-coverage` identifies the corrected calculation.
The backend accepts both this revision and the previous revision, preserving
historical records. The publisher requires current configuration and fresh
verification evidence for new calculations.

Expected movement: only skaters with absent model effects lose credited process
coverage/value. They may become provisional, and remaining qualified players'
positional percentiles can move as that pool changes. Goalies and fully supported
player calculations keep their scoring formulas. No historical movement was
measured without the source artifacts. This applies to regular season and playoff
runtime inputs; publication currently admits regular seasons only.

### 2. Invalid inputs could silently corrupt season values — corrected

Repeated game IDs accumulated process and event value twice while overwriting
some official exposure fields in the same per-game record. The runtime now rejects
duplicate games. It also rejects negative or non-finite shrinkage priors, which
could otherwise inflate ability or produce non-finite outputs. Valid priors,
including zero, retain their formulas.

## Remaining model gaps

### 3. A common unit is not yet a validated common positional baseline

`seasonRank`, `abilityRank`, `seasonRating` and the performance preview all use
separate F/D/G pools. Equal displayed scores indicate similar standing within a
position, not equal contribution across positions.

Raw goal-equivalent values are more informative, but sorting them globally does
not settle the issue. With a fixed three-forward/two-defense lineup, shifting every
forward's offensive coefficient by `a` and every defenseman's by `-1.5a` leaves
the lineup prediction unchanged. Ridge selects a solution, but that choice alone
does not establish the correct average value of one position versus another.
Real deployment variation can supply information, but its sufficiency must be
tested. Goalies use a different residual-based measurement whose calibration
also matters. A single overall score needs an explicit reference and evidence
for these comparisons; positional percentile normalization cannot supply it.

Recommended next step: define contribution relative to an explicit positional
reference, retain goal-equivalent values as the accounting unit, and test pooled
comparisons separately. An above-replacement interpretation requires measuring
that reference rather than labeling current values GAR/WAR.

### 4. Team prediction is insufficient validation of individual attribution

Lambda selection and primary impact admission use game xG/goal differential MSE.
Team-level MSE and offense/defense ablations are reported but are not selection
or admission requirements. Differential errors can cancel when both teams'
scoring is misestimated; an existing numerical fixture demonstrates this.
Moreover, players who share most of their minutes remain difficult to separate
even when lineup predictions are good. The evaluation conditions on actual
deployment, so it is not a pregame forecast.

Recommended next step: predeclare a development objective that examines team
scoring calibration as well as differential error; evaluate offensive and defensive
components separately; and test future player contribution, teammate changes and
role changes on fresh seasons. Select policy before examining final test rankings.
Do not add an arbitrary component gate that merely makes inspected seasons pass.

### 5. Ability and the performance preview require their own validation

V3 imports shrinkage priors from the season-level v2 model. Its centered
season-aggregate components and provider xG differ from the v3 event-based
components. Matching exposure units does not establish transferable reliability.
`abilityPer60` therefore remains an estimate, not validated predictive talent.

The performance preview adds position-specific median/MAD scaling, bounded
transforms, sample moderation and a workload-dependent blend with season value.
Its games and minutes targets are policy choices. It cannot establish cross-position
equivalence and it has not demonstrated superior individual predictions merely
because its ranking looks plausible.

Recommended next step: fit priors to earlier v3 player-season pairs only, compare
against simple multiseason baselines, and evaluate whether the additional preview
blend improves the explicitly chosen target. Preserve separate season-contribution
and ability outputs rather than hiding their different meanings in one number.

### 6. Shot quality and uncertainty constrain the claim of completeness

The local xG model uses a small logistic feature set. It includes distance, angle,
type, coarse prior-event/rush indicators, empty-net state and net skater advantage.
For example, net advantage alone does not distinguish 3v3 from 5v5. Aggregate
Brier error and total-goal calibration do not establish calibration for every
strength, shot type, team or goalie workload. A bias in chance probabilities can
shift credit between finishing and saving, affecting comparisons across positions.

[MoneyPuck's model documentation](https://www.moneypuck.com/about.htm) describes
richer prior-event information, exact manpower context, player time on ice and
shot handedness. It also explains flurry adjustment. These suggest candidate
experiments; they do not prove that substituting another model improves this one.
Any comparison must use time-appropriate sources and independent test seasons.

Game bootstrap intervals keep fitted coefficients fixed. They omit uncertainty
from shot-model fitting, player-effect fitting and attribution choices. Tight
conditional ranges cannot be presented as total confidence in player ordering.
Public events also leave passing, screening and positioning partly unobserved.

Recommended next step: inspect calibration by situation and cohort, benchmark
alternative shot models on the same frozen inputs, and estimate uncertainty by
refitting within an appropriate season/game resampling design. Report omitted
information explicitly rather than assigning invented credit.

## Validation for this change

New numerical tests reproduce the missing-effect qualification defect and the
invalid-input behavior. They failed against the previous implementation and pass
with the correction. Publication tests cover acceptance of the new revision and
continued acceptance of the historical revision.

Verification passed 35 tests across `nhl-adjusted-impact.test.ts`,
`nhlSeasonValues.test.ts` and `game-value-publication.test.ts`, plus all 31 tests
in `npm run ranking-engine:check`. Scoped strict TypeScript checking covers the
changed runtimes and numerical tests. ESLint passed for the two changed Convex
files; repository configuration excludes `scripts/` from ESLint. Formatting
checks passed for the changed TypeScript and this audit. `docs/RANKING.md` has
existing formatting differences outside the edited sections, which are preserved.
A full application build, frontend architecture check,
production recomputation and fresh historical model validation are outside this
verification. The corrected implementation is more faithful to its coverage
contract; no claim of improved historical predictive accuracy follows from it.
