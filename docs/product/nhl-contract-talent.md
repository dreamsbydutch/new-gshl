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

The v3 forecast uses completed seasons through 2025-26. A chronological,
regularized one-year regression estimates the initial contribution from recent
reviewed contribution, workload, age and support indicators. Its age and age-squared
features alone were insufficient to define a coherent multiyear career path:
the previous independent horizon models could slope downward during development.

The broad reference follows a shared, position-specific development/decline
curve. Consecutive returning-player GAR/82 changes, weighted by the smaller
of the two season game shares, fit a continuous two-sided quadratic curve.
A grid from peak ages 20-32 chooses the lowest weighted error; development and
decline rates are constrained nonnegative. The final fitted population peaks
are age 25 for forwards, 24 for defenders and 26 for goalies. These are pooled
curve estimates, not promises about any individual's peak. Changes in usage,
selection and regression to the mean are not fully isolated causal aging.

### Individual development from comparable careers

Starting contribution was already individual, but v2 added the same broad
position development increments to every player's path. V3 also estimates an
individual development shape from comparable histories. Peers must share the
F/D/G role and be within two years of the player's age at the comparison origin.
Distance uses current and previous GAR/82, their change, minutes, game shares,
and known-history indicators. It does not use salary, names, eventual peak
performance or future career success. Only one closest origin per other NHL
player is retained, with at most 60 selected players; the player being projected
cannot be their own peer.

Selection happens before inspecting follow-up outcomes. Missing or unsupported
later performance reduces evidence and never causes another player to be
substituted. The first selected-origin transition is omitted: the one-year
baseline already handles initial regression to the mean. Later measured
returning-player changes fit the development/decline shape. Calendar-step
normalization limits the influence of long observed careers. Exits remain in
the separate official-cohort NHL participation model.

At least five contributing players and ten changes are required. Curve changes
are blended with the broad reference using effective peer count with 20 prior
peers, reduced further by the absolute similarity of the nearest match. A large
effective count alone does not establish good comparability. The fitted
artifact retains nearest IDs, comparison origins, distances and support.

An additional historical calibration estimates how much the peer adjustment
actually improves prediction. Groups distinguish development ages (through 23),
prime ages (24-29) and older players (30+), crossed with contribution above or
below the current same-age peer median. Classification uses only information
known at that origin; small groups fall back to role-wide evidence.

Calibration minimizes squared error plus `100 * weight^2`, constraining weight
to 0-1. It requires 100 rows, two origins and 20 unique players. For each outer
forecast, only original earlier-origin predictions whose target seasons have
already completed can train this weight. The final annual estimate blends the
broad and peer-based paths with one weight across horizons, retaining a coherent
curve. Qualification and residual ranges use these nested blended forecasts.
Unsupported peer cases remain in calibration with zero incremental adjustment.
Rows from overlapping horizons and repeated careers are dependent observations.

This avoids asserting that being ahead at 21 guarantees unusually fast future
growth. Leo Carlsson's raw comparable-career path peaks around 14.28 GAR/82 at
26, but historical calibration supplies only a small peer adjustment for strong
young forwards; his main expected peak is about 12.38 at 25. Neither value is
a prescribed ceiling or a manual player override. The difference reflects
uncertainty in how much these peers add beyond his already individual starting
estimate. Group definitions and diagnostic seasons were inspected during this
revision; this is not untouched prospective confirmation.

Against v2 on the same pooled historical years-two-through-five rows, calibrated
personalization improves defender MSE slightly and worsens forward and goalie
MSE slightly. This adds conservative individual development patterns; it is
not evidence of an overall predictive accuracy improvement.

### Participation, full terms and validation

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

### Recorded contribution, playing talent, and expected output

NHL Explorer separates three quantities. Recorded GAR and observed GAR/60
describe the stored retrospective hockey model; these are estimates of past
contribution, not direct observed goals or forecasts. The existing annual
contract forecast is labeled expected contribution because it includes
participation and workload. Its numerical values are preserved.

The separate conditional playing-talent reference is
`src/lib/data/nhl-conditional-talent.json`. It estimates GAR/60 from rated,
positive-minute seasons with a random-walk rate filter. Observation precision
depends on minutes. A missing or unrated season supplies no zero-rate
measurement. Calendar time advances a fitted within-player age drift and latent
uncertainty; it does not multiply ability by an NHL-return probability.
Confirmed NHL absence and stale rated evidence are tracked separately.

The current reference uses 18 verified complete cohorts, 2008–09 through
2025–26, and is a preseason 2026–27 estimate. It does not ingest current partial
season play, medical recovery information, or salaries. Hyperparameters and
individual-signal pooling are selected chronologically using only earlier
forecast errors. Evaluation targets are returning players with rated GAR/60;
absent and unrated outcomes are undefined rate targets, not zeros. These
retrospective seasons were inspected during model development and are not an
untouched prospective confirmation set.

Across 14 evaluated origins, the conditional reference has 5,375 forward,
2,951 defenseman, and 884 goalie targets. Forward and defense models beat both
the last-rate and exposure-weighted position-mean baselines, winning against
the position mean in all 14 origins. Goalies win only 7/14, so individual goalie
rates remain research estimates despite a small aggregate improvement. A
supported label also requires wins in at least two-thirds of evaluated origins,
recent rated evidence, known age and sufficient minutes.
Return-after-absence samples are only 71/37/21 by position; no medical recovery
calibration is claimed. Latent-filter standard deviation is not a calibrated
confidence interval around the pooled rate forecast.

The v2 conditional reference adds an origin-safe skater deployment calibration.
The original filter shrank short histories toward the same position mean, which
overrated low-usage forwards as a group. A two-feature standardized ridge model
predicts next-season rate residuals from the original rate forecast and actual
minutes per appearance over the last three rated seasons (weights 1, 0.5, 0.25).
These are played-season measurements; missing seasons supply no zero usage.
Usage is predictive evidence of deployment, not a multiplier for availability
and not an estimate of a player's causal effect or future coaching decisions.
No salary, player-name exceptions, target-season usage or fantasy categories
enter this calibration. Recorded GAR and annual expected-output models are
unchanged.

At each historical origin, both standardization and coefficients use only
completed earlier forecast outcomes. Selection among no correction and ridge
penalties 1/10/100/1000 uses earlier forecast errors, with three calibration
origins of warmup. All original validation rows remain, including warmup rows
that retain the original forecast. The final forward fit chooses ridge 10;
defense chooses no correction, and goalies are excluded because minutes per
appearance has a different interpretation for them. Calibration applies to the
first projected season only.

On the same 5,375 forward targets, MSE changes from 0.1007813 to 0.1003185
(0.46% lower), with improvement in 9/14 origins. For the 713 origins with under
1,000 historical rated minutes it changes from 0.1252285 to 0.1184289; for 817
origins under 12 minutes per appearance, from 0.1194428 to 0.1120489. Error
increases for the 1,685 origins above 17 minutes per appearance, from 0.0960782
to 0.0971821, and for 71 return-after-absence targets, from 0.097035 to 0.098282.
This is a targeted role/sparse-history bias correction with a modest overall
gain, not a universal improvement or demonstrated injury-recovery model.
The feature comparison was inspected during development; these seasons are
not an untouched holdout. Independent numerical replay matched all 9,210
forward/defense/goalie forecasts and chronological selections.

Under 1,000 lifetime rated minutes or fewer than two measured NHL seasons is
marked research. These are conservative reporting policies, not learned cutoffs
or proof that ratings above them have reliable individual ordering. Explicit
confidence reasons distinguish a single measured season, limited minutes,
older evidence, missing age, experimental trend adjustments and insufficient
position-level validation. These labels do not change numeric forecasts.
The exposed latent standard deviation
continues to describe the original filter before deployment calibration; it is
not uncertainty for the adjusted prediction. Current model and replay evidence
are in `.local-data/nhl-rating/florida-audit-20261023-v1/conditional-role-fit-v1/`.

Current team talent fills 14F/8D/2G from the official NHL organization listings.
The official current NHL roster is the first tier; remaining slots use the
highest-rated depth players. Within each tier, selection uses conditional rate
(or annual output in the expected-contribution view). The source combines the
official club rosters with the NHL player-search directory's current team
affiliations, including listed minor-league players and prospects. It does not
infer NHL roster status from GSHL's `players.isActive`, salaries, or old season
teams. The official roster listing may include injured/reserve people; it is
not a separately verified 23-man active-roster register. The current source
check contains 32 clubs and 1,994 unique people, enough to fill every group.

The public source is bounded to 32 season-matching clubs and fewer than the
10,000 requested directory records. Canonical NHL IDs join roster, directory
and forecasts. Club-roster membership overrides an old directory affiliation;
unresolved duplicate identities or position conflicts fail closed. The shared
server cache refreshes hourly, with throttling and bounded retry handling;
HTTP failures do not create an empty successful organization snapshot.
Historical contribution and salary/contract rosters retain their existing
sources and selection behavior.

An unrated NHL-roster player retains a selected slot ahead of a rated depth
player. Named roster completeness and GAR coverage are separate: unknown
players display a dash and leave their workload unpriced. Filling 24 names
does not invent a GAR estimate or make a partially priced total complete.
Outside-depth unrated prospects do not invalidate an otherwise priced selected
roster. If a future source pool really lacks enough people, the UI reports
missing slots explicitly.

The standard playing-talent comparison allocates a shared
standard lineup budget: 180 forward, 120 defense and 60 goalie minutes per team
game. Depth-slot weights include small reserve rotation shares; goalies split
65/35. Rates times allocated minutes produce GAR over 82 regulation-game
equivalents. This is a comparison scenario, not predicted coaching usage or
availability. Missing slots retain missing workload, signed negative values
remain, and partial rosters show a subtotal. Only complete 14F/8D/2G rated
lineups receive an overall team rank. Incomplete teams follow in alphabetical
order; ranking their subtotals would implicitly treat missing contributions as
zero. Complete teams can still carry lower-confidence estimates and are labeled
provisional accordingly. Historical contribution and the
existing expected-output ranking remain separately selectable.
In the standard-usage comparison, allocated minutes per team game are visible
alongside GAR/60 and lineup GAR. Those are fixed normalized depth-slot weights,
not a statistical forecast of individual coaching usage. The identity is
`lineup GAR = projected GAR/60 * allocated minutes/game * 82 / 60`.

The default playing-talent view instead uses a separately fitted deployment
reference, `src/lib/data/nhl-lineup-usage.json`. It forecasts next-calendar-season
minutes per appearance for skaters, conditional on playing. Features are latest
usage, exposure-pooled three-season usage, known age and consecutive usage
change. Missing age is imputed with the earlier training mean; missing seasons
are not zero usage. Positive-exposure seasons remain eligible even when their
GAR is unrated. Selection among latest usage, weighted usage and ridge residual
models uses only earlier forecast outcomes, including standardization and age
imputation. Inference does not refit in the browser.

Across 8,659 forward and 4,546 defender historical targets, deployment MSE changes
from 4.464819 to 4.086900 and from 7.243764 to 6.591811, respectively (minutes
squared). Both positions improve in thirteen origins, with four warmup origins
unchanged. Gains also hold for game-weighted error, short seasons, 20-plus-game
seasons and returns after absences. Short seasons still show overprediction,
consistent with truncated appearances/injury uncertainty; this is not a medical
recovery or games-played model. Single-season, short latest season, stale or
unknown-age evidence receives a research label. All 13,205 forecasts were
independently replayed. Previously inspected historical data is not an untouched
prospective test.

Deployment forecasts order the twelve primary forward and six primary defense
roles within NHL roster membership tiers. Two reserves per group keep the same
small rotation shares as the standard comparison; remaining primary minutes
are proportional to predicted usage. The position budgets remain 180/120, so
allocated minutes are normalized scenario weights, not exact future coaching
minutes. Goalies retain the stated 65/35 comparison policy. The standard-usage
view and annual expected-output model remain separately selectable. Individual
GAR/60 and recorded historical GAR do not change. Missing role estimates and
absent slots hold their standard minute shares and primary/reserve places;
known roles allocate only the remaining budget. These partial scenarios are
explicitly labeled and do not receive complete-team ranks. Backtest eligibility
matches the shipped four-year stale-history boundary; older return cases are
not silently counted as supported forecasts.

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

## Component forecasting checks

Offline component research reconciled all 13,325 rated annual records to GAR,
using exact NHL IDs across 18 saved seasons. Offensive process, defensive
process, finishing, penalties and saving were checked separately. No missing
component was treated as zero and no source GAR was changed.

The initial component-history residual ridge model worsened forward MSE by
1.01%, including sparse and low-usage groups; it was rejected. Separately
fitting each component's core rate filter and choosing a convex blend using
earlier forecast errors improved aggregate forward MSE by 0.69%, but worsened
sparse, low-usage and late-growth errors. A restricted version retained the
baseline for single-season, under-1,000-minute, under-12-minute-per-appearance,
stale and post-absence evidence. Its forward MSE improved by 0.95%, with eight
wins in eleven changed origins, but late-growth error worsened by 1.10%.

A final sensitivity preserved the baseline whenever the component adjustment
would lower a player with two consecutive measured improvements, at any age.
Aggregate forward MSE improved by 0.97%, winning ten of eleven changed origins,
but late-growth error still worsened by 0.38% from allowed upward adjustments.
Defense and goalie candidates did not improve consistently. These inspected,
iteratively developed candidates are not untouched holdout evidence. None was
promoted; numeric forecasts retain the existing reference. Component-specific
persistence remains a research direction rather than a validated upgrade.

The retained change strengthens reporting: 24 one-season profiles move from
qualified to research without changing any of the 1,231 forecast values. Team
roster messages distinguish lower-confidence ratings included in the total from
unrated selected players whose contribution is missing. Research scripts,
input hashes, chronological forecasts and independent reviews are under
`.local-data/nhl-rating/nhl-components-20261023/`.

Further source-level checks also retained the existing numeric reference.
All 18 raw game-value artifacts were matched to their published hashes before
testing lagged source ability with the same annual replacement offset. This
denoised estimate is not independent evidence: its source ability and raw value
are rounded, and it must not count as an extra season. Every position selected
zero final blend weight; historical forward error worsened slightly.

Annual reference changes can also resemble changes in player level. An
exposure-weighted position/year centering experiment reconstructed forecasts
using only the origin year's mean, never the future realized mean. It modestly
improved aggregate F/D error but lacked stable wins and worsened sparse,
low-usage or late-growth groups. Cohort composition also affects those means,
so this was a context proxy, not an exact replacement-reference correction.
The experiment and future-label invariance proof are saved as
`research-year-context-v1/`; denoised-source evidence is saved under
`.local-data/nhl-rating/florida-audit-20261023-v1/source-ability-signal-v1/`.

Source completeness is distinct from identifying individual process effects.
Offense and defense use player-by-strength ridge coefficients. Players who
share most of their shifts can have correlated design columns; a unique ridge
solution does not imply that the data independently identify their effects.
The existing season-value bootstrap keeps those coefficients fixed, so it does
not quantify coefficient-assignment uncertainty. Source reconstruction and
shared-lineup diagnostics are saved under `process-identifiability-v1-run3/`.
Coefficient-refit sensitivity must still be described as conditional on the
chosen regularization and shot model, not a guaranteed talent interval.

## Experimental sustained-change adjustment

Conditional playing talent v3 adds a bounded adjustment for defenders whose
last three rated calendar seasons show two consecutive changes in the same
direction. It moves the existing GAR/60 estimate toward the exposure-weighted
level of the latest two seasons. Coherent changes and larger measured samples
receive more weight: the reliability factor is the smallest of
`minutes / (minutes + 600)` across those three seasons. This fixed policy scale
is not a fitted uncertainty interval. The adjustment has no age ceiling and does
not extrapolate the trend indefinitely. The underlying filter still responds to
each observed season; one isolated jump does not trigger this extra adjustment.

Candidate weights 0, 0.25, 0.5 and 1 are selected using earlier forecast origins
only, after three warmup origins. Final retention requires improved overall and
age-28-plus sustained-growth errors, sufficient samples, and wins in at least
two-thirds of changed origins. Saved references enforce these same guards.
Candidate forecasts and unadjusted deployment forecasts remain separately
recorded. Final retention uses the complete validation results, so headline
retained-model comparisons are post-selected, not an untouched holdout test.

Defender weight 0.5 improved MSE from 0.05454183 to 0.05445802 across 2,951
historical rows, and from 0.05267207 to 0.05185823 across 142 late-growth rows.
Five of six changed origins improved. All 530 unconfirmed upward jumps retained
the underlying forecast. However, the player-by-origin bootstrap difference
interval crossed zero, and sustained-decline and stale-history subgroup errors
slightly worsened. This is a small experimental improvement, not a demonstrated
universal gain. Forward candidates failed retention; forward and goalie scores
remain unchanged. Nonzero adjustments always receive research status. The
original latent standard deviation does not quantify the extra adjustment's
forecast uncertainty.

Official annual team affiliations and minutes per appearance provide context,
not automatic bonuses. Exact NHL IDs join saved source snapshots; franchise
relocations are normalized before comparing unordered affiliation sets. A trade
or increased workload alone does not prove improved ability, and falling usage
does not veto measured growth. Missing years are not zero observations. A stale
three-season sequence can retain historical growth evidence but remains research
evidence rather than proof of a current role change.

This adjustment applies only to the first forecast year of the conditional
playing-talent model. It does not change recorded GAR, the separate annual
expected-output model, or fixed lineup minute allocations. It currently uses
completed annual observations; it cannot immediately detect a midseason trade
breakout. Local research, chronological replay and subgroup checks are under
`.local-data/nhl-rating/nhl-adaptation-20261023/`.

## Projected total GAR as the main comparison

The player leaderboard defaults to total **Projected GAR**, in replacement-based
goal units, using the same healthy-team lineup scenario as the team rankings.
Recorded GAR remains actual delivered contribution; expected season GAR remains
the separate annual forecast including participation risk. The visible primary
metrics do not use `/60` or `/82` denominators. Internally a conditional rate is
still multiplied by allocated season minutes and divided by 60: playing time
belongs in total contribution, even when it is not the displayed comparison.

`buildProjectedNhlLineupGar` supplies both feature hooks. NHL roster members get
priority in each organization's 14F/8D/2G selection. Existing forward/defense role
projections determine relative deployment within shared 180F/120D/60G regulation
minute budgets, including reserve rotation. The scenario covers 82 team games
at full availability. Goalies retain the explicit 65/35 comparison split assigned
by the existing talent order; this is not a fitted starter or backup workload
forecast. No new injury, recovery or goalie-start model is claimed.

Each player's displayed total matches the amount included in the team's modeled
subtotal. Missing role estimates retain marked standard slot shares and research
status, as in the team comparison. Unsupported ratings remain null. Outside-depth
players have no allocated lineup projection rather than an invented zero or full
starter workload. Their playing-ability estimate and the separately labeled
above-average comparison remain available. Unselected or unknown players do not
receive extra minutes redistributed from missing slots. Team ranks still require
complete supported lineups. The projected roster display orders players by their
total GAR after allocation, without changing which players or minutes were selected.

Changing the unit alone does not resolve cross-position model calibration. The
saved organization replay's raw projected top 50 contains 18F/3D/29G among 727
rated selected players. Many goalie forecasts shrink toward a positive historical
replacement offset, and the starter scenario turns that into similar positive
season totals. This is a remaining limitation, not evidence of equal positional
value or a successful balance correction. No position quota, boost or relabeling
of above-average goals as GAR is used. The separate above-average model has its
own validated rate target; its better positional representation is not evidence
that an offset-restored replacement forecast would improve.

## Projected value above average

The secondary playing-value comparison shows **projected goals above an average
player at the same position over a standard role season**. This is a
separate estimand from recorded GAR and replacement-based playing talent. The
main ordering uses total projected lineup GAR. Recorded GAR, contract averages,
expected season GAR and team lineup GAR retain their existing baselines.

The previous raw GAR/60 list contained 49 forwards, one defenseman and no goalies
in its top 50. Defense was not omitted: the source includes teammate/opponent-
adjusted chance prevention, finishing, penalties and goalie saving, in common
goal units. The comparison combined different positional workload opportunities
with annual replacement-reference offsets and stronger goalie shrinkage.

The new `nhl-average-talent-v1` artifact centers every rated season observation
by that season and position's exposure-weighted GAR/60 mean. Null ratings remain
null. Offensive and defensive terms retain their original contribution within
each player's centered total. The existing chronological conditional fitter,
deployment calibration and sustained-change policy then fit the centered
observations. This also prevents annual replacement-reference variation from
being interpreted directly as a change in talent. It is not a percentile,
position multiplier, fixed allocation of goal credit or position quota.

The public artifact uses distinct above-average units and observation names.
Only a private numerical adapter reuses the conditional fitter's historical
`gar` field name. It never enters the recorded GAR source or replacement-based
UI. The baseline is the rated, exposure-weighted positional population, not an
unweighted average of names or an assertion of complete measurement coverage.

For cross-position ordering, projected above-average rate is multiplied by a
declared standard workload and divided by 60. Workloads use the last three
complete seasons. Forwards and defenders use 82 times pooled minutes per
appearance among the league-wide highest-minute 12F/6D team equivalents. Goalies
use mean seasonal minutes among the highest-minute one-goalie team equivalents,
normalized to 82 team games. Club counts come from verified season affiliations.
These cohorts use playing time, never ratings. They are league-wide cohorts,
not reconstructed lineups for each club; traded minutes are not assigned to
guessed clubs. The resulting benchmarks are 1,292.615 forward minutes,
1,638.215 defender minutes and 2,962.724 goalie minutes. All players of a position
receive the same comparison opportunity, independently of their own injuries.
This is a standard role comparison, not expected personal season output, and
these scores must not be summed as a team's actual lineup contribution.

An independent replay reconciled all 54 position-season baselines and 9,210
validation labels from the verified 18-season source. The comparator is the
previous replacement-rate forecast minus the position average known at its
forecast origin. The outcome is recorded rate minus the realized target-season
average. Target-season means define outcome labels only; they do not enter
predictions, workload selection or earlier parameter selection.

| Position | Rate MSE improvement | Improving forecast origins |
| --- | ---: | ---: |
| F | 1.62% | 12 / 14 |
| D | 1.08% | 9 / 14 |
| G | 9.73% | 14 / 14 |

These are historical rate-error comparisons, not a separate validation of
standard-season goal totals or a claim of an untouched prospective trial.
Defensemen's late-growth subgroup has about 0.96% higher error; small goalie
sparse-history and return-after-absence subgroups also remain less certain.
Individual confidence reasons remain visible. With the untuned workloads, the
saved model's top 50 contains 34 forwards, 12 defensemen and four goalies; that
mix is a descriptive result, not a fit target or acceptance condition.

The local fit and independent reports are under
`.local-data/nhl-rating/nhl-average-value-20261024-v1/`. The source SHA-256 is
`4de1582781f98f235ada75ca1a30cb2250df4300233bed0df8cd3fa01dba3f4d`.

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
