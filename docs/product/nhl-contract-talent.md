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

The independent forecast uses completed seasons through 2025–26 and predicts
annual GAR/82 at direct horizons one through eight. It fits forwards, defenders
and goalies separately while preserving common output units. Features describe
recent reviewed contribution, workload, age and support/absence indicators.
Recently absent players remain eligible, and confirmed nonreturners enter
training with zero delivered contribution. Unsupported played seasons are
excluded as unknown outcomes and their frequency is reported.

Ridge strength is selected from a fixed grid using earlier rolling origins.
For every outer forecast, fitting and tuning use only outcomes already completed
at its origin, including for multi-year horizons. No contract is a training
observation: each player/origin/horizon occurs once, so multiple contracts cannot
increase that player's training weight. Incomplete current-season data never
enters the completed-season reference.

The main remaining-term rating averages annual predictions equally, only when
**every** remaining season passes the fixed support and comparative-error rules.
An expired contract has no remaining rating. A future contract starts at its
actual first year, not horizon one. Current-year predictions are full-season
preseason estimates, not additional GAR still to be earned; observed current
contribution is never added to them. A reference for a different preseason is
marked stale rather than silently reused as a current estimate.

The fixed historical qualification requires at least 30 fitted examples, 100
outer validation observations, three validation origins, 80% known-target
coverage, and lower outer MSE than both latest-observed and position-mean
baselines. The current reference passes these rules at horizons one through
five for every position. Horizons six through eight remain research-only and
cannot supply the main contract rating. Rookies or unsupported histories may
also lack a main forecast.

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
delivered talent or validated remaining talent. It shows signed values,
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
