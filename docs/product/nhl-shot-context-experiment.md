# Frozen shot-context experiment

Policy fixed October 18, 2026, after inspecting 2024-25 diagnostics and before
inspecting reconstructed 2023-24 shot-model results. This is a research candidate,
not a production feature or rating change. Results from either retrospective
season remain exploratory; an inspected season cannot become an untouched
confirmation trial.

MoneyPuck documents exact manpower counts, empty nets and event history as shot
model inputs. Its current model was trained using 2023-24 through 2025-26 data;
its retrospective results are therefore not an independent benchmark for those
seasons. [MoneyPuck methodology](https://www.moneypuck.com/about.htm)

Evolving-Hockey describes separate EV, PP, SH and empty-net models, rare-state
sample limitations, and unobserved passing information. This motivates testing
context, without establishing that our candidate improves predictions.
[Model methodology](https://evolving-hockey.com/blog/a-new-expected-goals-model-for-predicting-goals-in-the-nhl/)

The candidate uses a separate 16-dimensional logistic calibrator: intercept,
geometry-model logit, shooting-side home indicator (home +1, away -1, unknown 0),
own goalie absent, opposing goalie absent, and indicators for shooter-relative
3v3, 4v4, 5v4, 4v5, 5v3, 3v5, 4v3, 3v4, 6v5 and 5v6. The last indicator denotes
other or unknown strength; 5v5 is the reference. Missing or malformed metadata
retains the shot in every comparison with the unknown indicator; no shooting
side is inferred from net skater advantage. Official absolute situation codes
such as 1451 contain both teams' shots and are not uniformly PP shots.

Both geometry and calibrator ridge grids are fixed at 1, 10 and 100. Date groups
use the existing first-40% training, next-20% selection and final-20% evaluation
partition. The intervening 60-80% block is unused, preserving the existing
pre-impact freeze. Select the geometry/calibrator pair jointly on validation
Brier error; ties favor the smaller geometry ridge, then smaller calibrator
ridge. Refit both selected stages only on dates before the 60% boundary. The
calibrator trains on in-sample fitted geometry logits; this explicit two-stage
choice can overfit and is assessed on later data. The baseline independently
uses the existing chronological geometry-only implementation and selection.

All comparisons retain exactly the same shots. Report Brier error, log loss,
total calibration, official-state calibration and paired game error differences.
Before running either candidate, freeze this screening rule: overall Brier error
and log loss must improve in both 2024-25 development and the 2023-24 second-season
comparison; the pooled paired game-bootstrap 95% upper error-difference endpoint
must be below zero. No shooter-relative context group with at least 1,000 test
shots may worsen Brier error by more than 2% relative to the baseline, and total
expected-goal bias must remain within 10% of actual goals in each season. The
1,000-shot threshold is an operational screening policy, not a significance
claim; smaller groups remain fully reported. Unknown metadata stays in every
overall metric. Passing this screen does not authorize adoption: subsequent RAPM
goal-outcome and overall-rating comparisons must not materially worsen. Do not
choose a model from final-test subgroup results. Improved shot prediction alone does not establish
better individual attribution or a valid replacement baseline. Home effects
can capture recording or player-selection differences as well as hockey context.
Shooter and goalie identities are intentionally excluded so measured finishing
and saving are not absorbed into chance difficulty.
