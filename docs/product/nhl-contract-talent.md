# Holistic NHL contract talent

Contract analytics now provides independent salary, delivered-hockey and
remaining-hockey rankings. Salary-cap normalization retains its existing
calculation. The hockey scores never use salary, cap hit, contract AAV or
fantasy-category ratings as predictors or scale factors.

The common hockey unit is **goals above the reviewed same-position replacement
reference per 82 NHL team-game opportunities** (GAR/82). These are goal units,
not wins or percentiles. Zero denotes replacement and negative values remain
negative. All positions use the same final units. This estimates contribution
given skill, deployment and availability; it is not a pure causal talent trait.

## Delivered contract average

For each complete supported contract season:

`annual GAR/82 = reviewed season GAR × 82 / completed league-average team games`

The main delivered rating is the equal-year average across every completed
contract year. It remains unavailable if any required past year is missing or
provisional. A final full-contract average requires the entire term to be
complete. A contract with no completed years has no delivered average. Current
raw contribution appears separately without turning a partial season into an
annual pace. Future seasons do not contribute zero to a historical average.

The denominator describes the league's schedule, not the individual player's
games. Injuries, scratches and limited deployment therefore still affect
delivered contribution. The reviewed 2019–20 denominator is 2,164 team-games /
31 teams; 2020–21 uses 56. The 82-game target is a common comparison standard,
not an assumption that every NHL season has an 82-game schedule.

Each supported value requires the exact reviewed core regular-season model,
source/player/season/position identity, rated qualification, matching GP,
matching rounded official TOI and source timestamp when the association stores
one. Source IDs, hashes and dates accompany the calculation. A missing future
appearance is not a model value. A historical no-NHL-games year can count as
zero contribution only after the whole official positive-GP population's
canonical identity/GP SHA matches the frozen complete-season reference. A
positive-GP player with no supported hockey value always remains unknown.

## Remaining-term estimate

The v2 forecast uses completed seasons through 2025-26. A chronological,
regularized one-year regression estimates the initial contribution from recent
reviewed contribution, workload, age and support indicators. Its age and age-squared
features alone were insufficient to define a coherent multiyear career path:
the previous independent horizon models could slope downward during development.

Subsequent years now follow a shared, position-specific development/decline
curve. Consecutive returning-player GAR/82 changes, weighted by the smaller
of the two season game shares, fit a continuous two-sided quadratic curve.
A grid from peak ages 20-32 chooses the lowest weighted error; development and
decline rates are constrained nonnegative. The final fitted population peaks
are age 25 for forwards, 24 for defenders and 26 for goalies. These are pooled
curve estimates, not promises about any individual's peak. Changes in usage,
selection and regression to the mean are not fully isolated causal aging.

A separate regularized logistic model estimates NHL return probability from age,
older-age curvature, contribution, game share and missingness indicators.
Every official positive-GP player contributes an annual return/absence label,
including unsupported GAR players. Only absence from a verified complete
next-season official cohort supplies a nonreturn label. Future conditional
return probabilities compound after the first forecast year; the one-year
baseline already incorporates first-year participation risk and is unchanged.
Return calculations use projected mean contribution and fixed origin game share
as approximate future states. Reentry and joint usage/talent uncertainty remain
limitations. A weak intercept prior keeps all-return samples finite.

For later years, divide the initial expected contribution by its modeled
first-year return probability to obtain a conditional performance estimate.
Apply the age-curve change relative to the first projected year, bound that
conditional contribution by historical position-specific observed extremes,
then apply all participation probabilities, including the first year's. Signed
negative values remain possible; eventual absence tends toward zero NHL
contribution. Missing age or unsupported curve/return history stays unavailable.
No player-specific ID overrides, salary, cap or fantasy inputs affect this path.

All fitting, including the age curves, bounds and participation models, uses
only data completed at each historical forecast origin. Ridge strength uses
earlier chronological errors. Each player/origin appears once, regardless of
how many contracts that player has. Validation retains same-horizon,
training-only position-mean and latest-observed comparators. Incomplete current
seasons never enter fitting.

The main remaining-term rating now averages **every remaining contract year**,
including explicitly labeled long-range extrapolations. Horizons through 30 years
cover future-starting contracts as well as current terms. Each horizon retains
its own historical support checks; a full-term average containing any unsupported
horizon is labeled estimated, rather than being blank or presented as fully
validated. A missing required annual estimate still prevents an average.

An expired contract has no remaining rating. A future contract starts at its
actual first year. Current-year predictions are preseason full-season estimates,
not additional value still to be earned; observed current contribution is never
added to them. A reference for another preseason is marked stale.

The historical qualification still requires at least 30 fitted examples, 100
outer validation observations, three validation origins, 80% known-target
coverage, and lower outer MSE than both baselines. Horizons one through five
pass for all positions. Horizon six has only one outer origin, and seven onward
have none: they remain numeric structural extrapolations, without invented
historical residual intervals. The annual table shows projected age and support
status. No claim of equally accurate distant forecasts is made.

The fitted reference reproduces 43,886 chronological validation rows. At horizon
one, mean squared error was:

| Role     | Forecast | Latest observed | Position mean |
| -------- | -------: | --------------: | ------------: |
| Forward  |    22.00 |           32.44 |         35.96 |
| Defender |    17.33 |           25.06 |         21.86 |
| Goalie   |   157.32 |          241.08 |        184.76 |

These are retrospective, conditional known-outcome comparisons. Historical
hockey labels are reconstructed with the fixed reviewed method; they are not
archived forecasts that were actually deployed at those historical dates.
Unknown positive-GP outcomes produce selection limitations. Earlier experiments
have been inspected, so this is not a new untouched confirmation. Per-year 80%
residual ranges summarize observed out-of-sample errors, not guaranteed future
coverage or a confidence interval for intrinsic talent. They are not averaged
into a contract uncertainty range because errors across years can be correlated.

## Integration and refresh boundary

The commissioner contract view can sort globally by normalized salary,
delivered talent or remaining talent, including explicitly labeled extrapolated
term estimates. It shows signed values,
completed-year coverage and annual breakdowns. All contracts for the same
canonical player share bounded indexed season reads; source data is not loaded
once per contract. Identity conflicts, source mismatches, population changes and
overflow fail closed. Canonical player IDs and verified NHL IDs are joins;
player names are presentation.

The actual view reads current stored source associations. The forecast is a
validated, immutable fitted reference: inference does not refit in the browser.
The offline fit command accepts a verified official-cohort snapshot, an ending
cutoff year and a new output directory. Its artifact, validation rows and receipt
are reviewable local outputs; it never publishes or replaces the shipped model.
An annual reference refresh must repeat source validation, historical checks and
review before replacing it. Native nightly NHL updates do not refit this model.

Exact numerical reference and provenance live in
`src/lib/data/nhl-contract-talent-forecast*.json`; complete-season population and
opportunity references live in `convex/lib/nhlContractTalentSeasonReferences.json`.
Full local evidence is under
`.local-data/nhl-rating/contract-talent-20261020/`. Backend replay matched all
13 complete population hashes and all 10,029 ranked source associations in the
saved snapshot. This implementation does not itself publish production changes.

## Aging revision checks

The first-year forecast is unchanged. Against the preceding independent-horizon
model on the same chronological rows, v2 improves MSE in all forward and defender
years two through five. Goalie years two and three improve; years four and five
have higher error than v1, while still beating both prespecified baselines.
A smoother, interpretable aging path does not guarantee universal error reduction.
Leo Carlsson (canonical NHL ID 8484153) is a regression fixture: his projected
age-22 contribution rises through the pooled forward peak before declining, and
his full extension can include years beyond the old eight-year ceiling.
Evidence is in `.local-data/nhl-rating/contract-talent-aging-20261021/`.

For methodological context, [Schuckers, Lopez and Macdonald](https://arxiv.org/abs/2110.14017)
show why player effects and missing observations matter to age-curve estimation;
[the original Hockey Graphs aging analysis](https://hockey-graphs.com/2017/03/23/a-new-look-at-aging-curves-for-nhl-skaters-part-1/)
discusses returning-player delta methods and selection at the edges. The curves
here are fitted from this project's verified data, not copied coefficients.
