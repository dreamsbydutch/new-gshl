# NHL Season Value: methodology audit

Research date: 2026-09-29. Scope: the current independent
`nhl-season-value-v1` implementation and practical methods for improving its
interpretation. This note does not validate a replacement model or change any
stored rating.

## Finding

The current rating goes beyond points, but is a **descriptive statistical
index**, not an established estimate of an individual player's contribution to
team wins. Reproducible calculations and plausible leaders do not establish
construct validity. The next major improvement should be better attribution and
shot-quality adjustment, rather than additional arbitrary category weights.

This conclusion follows directly from
[`nhl-season-rating.ts`](../../scripts/src/runtime/nhl-season-rating.ts) and
[`season-rating-input.ts`](../../scripts/src/domains/nhl/season-rating-input.ts):

| Current design                                                       | Interpretation limit                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary/secondary scoring, relative shot share, discipline           | Useful non-fantasy inputs, but coefficients are policy choices rather than estimates fitted to a hockey outcome.                                                                                                   |
| Negative EV and PK on-ice goals against per 60                       | Attributes outcomes influenced by the goalie, teammates, system, and opponents to the skater. EV also includes situations outside 5-on-5, while its accumulated value uses 5-on-5 minutes.                         |
| On-ice minus off-ice shot-attempt percentage                         | Measures a contextual difference; it does not independently control linemates, opponents, deployment, score state, or shot quality.                                                                                |
| Goalie save percentage, shrunk by shots, accumulated through minutes | No shot-quality adjustment in the published core profile. Equal save percentages and minutes can produce different estimates solely through shrinkage, but actual excess saves are not accumulated by shots faced. |
| A 0.5 index-unit offset per 1,000 minutes                            | Gives average performance positive accumulated value against an assumed reference; this is not an empirically identified replacement player.                                                                       |
| Position-specific Z scores and percentiles                           | A forward and defender at the same percentile need not contribute equally. Values have no goal or win units and season percentiles do not compare absolute performance across years.                               |
| Optional EDGE high-danger shots/location buckets                     | Adds information, but shooter danger volume is not full chance creation, and coarse save buckets are not expected goals.                                                                                           |

The separate position pools, explicit missingness, situation-specific minutes,
small-sample shrinkage, and separation from GSHL are worth preserving. Neither
prior sample sizes nor clipping limits have yet been shown to be calibrated.

## What stronger public methods measure

Evolving-Hockey's RAPM uses stint-level ridge regression with exposure weights
to estimate player offense and defense while accounting for teammates,
opponents, and game context. Its own documentation explicitly identifies
goaltender contamination in goal-based defensive estimates. This supports using
expected goals and attempts as complementary outcomes; it does not make RAPM a
perfect causal measure. [Model owner's RAPM methodology](https://evolving-hockey.com/glossary/regularized-adjusted-plus-minus/)

Its GAR framework expresses EV offense/defense, special teams, and penalties in
goal units, and estimates replacement benchmarks from defined player cohorts.
These are different operations from adding standardized categories and a
constant. A locally built model should document its own reference population and
calibration rather than adopt another model's published coefficients without
their training procedure. [Model owner's GAR definitions](https://evolving-hockey.com/glossary/goals-above-replacement/)

MoneyPuck assigns each unblocked attempt a goal probability using features such
as distance, angle, shot type, strength, and preceding events. It also describes
flurry and rebound-creation adjustments. These illustrate why a high-danger
count cannot substitute for contextual shot probabilities. Using such estimates
still leaves model error and omitted context; credit assignment among passer,
shooter, screen, and defender remains a separate modeling problem.
[MoneyPuck methodology](https://www.moneypuck.com/about.htm)

## Data feasibility for 2013-14 through 2025-26

MoneyPuck's download page lists season and game data back to 2008-09 and shot
data back to 2007-08, covering the requested historical window in principle. The
page provides skater, goalie, line, and team downloads. It permits noncommercial
use with attribution; other uses require inquiry. Listing a season does not
prove complete player, situation, or game coverage: verify files before a
backfill. [Official downloads and terms](https://www.moneypuck.com/data.htm)

For a bounded initial comparison, these exact links appear on that page:

- [2024-25 skater season CSV](https://www.moneypuck.com/moneypuck/playerData/seasonSummary/2024/regular/skaters.csv)
- [2024-25 goalie season CSV](https://www.moneypuck.com/moneypuck/playerData/seasonSummary/2024/regular/goalies.csv)

The current NHL adapter supplies official aggregate reports, not the stint
design matrix required for full RAPM. Season-level on/off xG would be a useful
intermediate diagnostic, but must not be described as a teammate-adjusted RAPM
model. Reconstructing stints requires separately auditing historical shift and
event coverage and on-ice joins. Availability of aggregate downloads alone does
not establish that feasibility.

Public NHL EDGE coverage begins in 2021-22, too late to be a uniform foundation
for all 13 seasons. [NHL announcement](https://www.nhl.com/news/nhl-edge-advanced-stats-section-brings-fans-closer-to-game)

Do not infer possession-level passing, exits, entries, screening, or off-puck
defensive positioning from season speed/distance totals. Such skills may affect
on-ice outcomes indirectly, but a direct skill breakdown requires suitable
event/tracking inputs. No comprehensive public tracking feed covering the
entire requested period was verified in this research.

## Recommended next model and promotion gate

These are proposed experiments, not validated coefficients:

1. **Define the target.** Make season contribution the primary retrospective
   result; maintain a separate uncertainty-aware ability/rate estimate. Future
   prediction is a validation tool, not the sole definition of past value.
2. **Improve defense and goaltending first.** Compare EV/PK xGA suppression with
   current GA suppression. For goalies evaluate expected goals against minus
   actual goals allowed, using one provider's consistent event universe and
   empty-net exclusions. Keep raw contribution and a shrunk rate distinct.
3. **Model context.** If audited stint data supports it, fit offense and defense
   by strength with teammate/opponent and game-context controls. Preserve team
   stints for traded players before aggregation. If only seasonal aggregates
   are feasible, label the resulting model accordingly.
4. **Calibrate one contribution scale.** Estimate goal-value components and an
   explicit reference baseline from training data. Treat goals above average as
   a clearer interim target than claiming replacement value without estimating
   replacement. Add finishing separately only with an explicit allocation rule
   that prevents double credit for the same offensive outcome.
5. **Retain explanations and uncertainty.** Publish offense, defense, special
   teams, discipline, goalie contribution, sample exposure, coverage, and
   uncertainty alongside the headline. Do not promise to quantify leadership,
   locker-room influence, or every off-puck action.

Before replacing v1, freeze a multi-season evaluation protocol:

- Audit IDs, seconds/minutes, team-stint aggregation, strength and empty-net
  definitions, source revisions, and missingness by season and role. Include
  shortened seasons and low-minute players.
- Use rolling time-held-out evaluation: fit coefficients, reference levels,
  priors, and hyperparameters only on earlier training data. Keep a final later
  season untouched until decisions are frozen. Record if third-party historical
  xG was retrospectively revised; provider outputs are not automatically a
  leakage-free historical forecast.
- Benchmark against TOI alone, points/rate, the existing index, and simple on-ice
  xG/goalie save models. Assess held-out outcome error and calibration, not just
  correlations with awards or recognizable stars.
- Run component ablations, prior/weight sensitivity, and rank stability by
  position, deployment, team, and exposure. Report uncertainty intervals or
  bootstrap rank bands. Strong correlation with points does not by itself prove
  failure; weak correlation does not prove useful additional information.
- Check whether skater defense follows team goaltending and whether apparent
  improvements persist for traded players. These are diagnostics, not causal
  proofs: trades and usage changes are not random experiments.
- Evaluate aggregate team accounting and prevent double counting between
  skaters and goalies. Compare independent model families as a robustness check;
  agreement is not ground truth, especially when they share source data.
- Predeclare acceptance criteria and report confidence intervals for improvement
  over baselines. Production replacement should follow a versioned comparison
  report, not a weights change chosen to make a familiar leaderboard.

Research verification: reviewed the local runtime, adapter, and ranking contract;
consulted primary model-owner documentation and the official NHL announcement;
verified MoneyPuck download URLs from its live download-page HTML. No production
read/write, runtime edit, bulk data download, or empirical model fit was performed
for this note.
