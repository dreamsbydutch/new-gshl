# NHL Season Value v2

Implemented and evaluated September 30, 2026. This is an independent NHL model;
GSHL rankings, salaries and production data were not changed. V1 remains a
frozen comparison and the currently persisted model.

## What changed

The pure runtime is `scripts/src/runtime/nhl-season-value-v2.ts`. The active
operator entry point is `scripts/src/commands/ratings/preview-nhl-value-v2.ts`;
see `scripts/README.md` for running and replaying it.

| V1 limitation                                       | V2 behavior                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Defensive goals against mix in goalie results       | Uses expected chances allowed, separating skater defense from realized saves                                 |
| Shot-attempt share ignores shot quality             | Uses flurry-, score- and venue-adjusted on-ice expected goals                                                |
| One rigid off-ice comparison                        | Combines league and partial off-ice context; exports sensitivity to that assumption                          |
| Goalies use raw save percentage                     | Uses expected goals minus actual goals, actual shots faced, and a league calibration correction              |
| Special-team category coefficient is arbitrary      | Accounts for PP and PK offense and defense separately in goal-equivalent units                               |
| Scoring-rate penalty field has ambiguous sign/scope | Uses explicit season penalties drawn minus penalties taken                                                   |
| Fixed shrinkage in every historical season          | Fits exposure priors using only earlier adjacent-season pairs                                                |
| Automatic positive reward for minutes               | Minutes accumulate demonstrated contribution, with no reference offset                                       |
| Only a composite rating is visible                  | Observed contribution, conservative estimate, per-60 rate, components, reliability and coverage are exported |

## Data and coverage

Credit **MoneyPuck.com** for expected-goal inputs. The implementation downloads
only its documented season-summary skater and goalie CSV endpoints. NHL Stats
supplies canonical NHL player identities, total games and minutes, and the
`skater/penalties` report. It does not scrape private data or require credentials.
See [MoneyPuck downloads and terms](https://www.moneypuck.com/data.htm) and
[shot-quality methodology](https://www.moneypuck.com/about.htm).

Snapshots retain raw inputs, source URLs, timestamps and SHA-256 hashes. Joins
use player ID, never fuzzy names. Duplicate player/situation rows, wrong seasons
and malformed numbers fail. An absent situation remains missing; a present
zero-minute situation contributes zero.

Provider time must agree with NHL time to within 2% or one minute, and provider
games must be between 97.5% and 100% of NHL games. Smaller discrepancies carry
warnings and are not extrapolated into unobserved games. Larger discrepancies
produce incomplete values with no official rank. Source coverage and modeled
situation coverage are different fields. Skater components cover 5-on-5,
5-on-4 and 4-on-5; mixed `other` situations, including empty-net play and 3-on-3,
are deliberately not conflated with those deployments. Goalies use all situations.

The final historical run at
`.local-data/nhl-rating/value-v2-final-20260930` contains all 13 seasons from
2013-14 through 2025-26:

- 13,159 player-season records: **9,960 rated, 3,022 provisional, 177 incomplete**.
- Rated skaters require 200 modeled minutes; goalies require 300.
- Mean modeled coverage among rated records is 97.1% of total NHL minutes.
- 1,238 rated records carry a provider-coverage or counting-convention warning.
- All 2023-24 and 2024-25 records have complete required inputs; small samples
  can still be provisional. Earlier seasons include genuine source disagreements.

The report includes an incomplete-player list for each season. These are not
silently filled with v1 values. In particular, provider ID/game-total anomalies
must be resolved upstream before those players can be ranked reliably.

## Contribution accounting

V2 is an **estimated goal-equivalent contribution above average**, not goals
above replacement, wins, or a causal estimate. It makes the following explicit
accounting choices instead of summing unrelated position-specific Z scores.

For each of 5-on-5, 5-on-4 and 4-on-5:

1. Calculate exposure-weighted league expected-goal rates.
2. Subtract half of the player's off-ice raw-xG rate deviation from the raw
   league rate, attenuated by `benchMinutes / (benchMinutes + 300)`.
3. Compare adjusted on-ice expected goals with that contextual baseline through
   actual situation minutes. Offense rewards creation; defense rewards suppression.
4. Allocate the on-ice difference equally across five skaters, or four on the PK.

The on-ice measure uses adjusted xG; the separate off-ice correction is centered
on raw league xG, matching the provider's raw off-ice data. The model never
subtracts an uncentered raw rate directly from an adjusted rate. This is only
partial team context: it does not control individual linemates, opponents or
zone-start deployment. Equal allocation is a conservative policy, not proof of
each player's causal share. It can understate exceptional individual playmaking.

Finishing adds actual individual goals minus individual raw xG within the same
modeled situations, centered on each situation's league rate. Thus actual goals
are not added again in full on top of expected chance value. Goals, assists,
points and shot volume are not added as overlapping bonus categories.

Penalty value uses explicit NHL `penaltiesDrawn - penalties`. Its approximate
per-event benefit comes from league PP and short-handed expected-goal rates,
allowing for a two-minute penalty ending when the PP scores. It is centered on
league net-penalty rate. This is an approximation: coincidental penalties,
double minors, majors and misconducts cannot be precisely valued from these
aggregate counts. Differences from the NHL's separately reported `netPenalties`
convention are flagged. V1's scoring-rate field is not substituted here.

For goalies, observed saving is `xGoals - goals`, less the league-wide xG error
per shot multiplied by actual shots faced. Raw provider GSAx remains visible
as `goalieGsax`; the conservative estimate is explicitly a different quantity.

Each component's observed excess is multiplied by
`exposure / (exposure + prior)`. Skater exposure is situation minutes; goalie
exposure is shots. The sum is `seasonValue`. The unshrunk sum is `observedValue`.
`impactPer60` is now literally `60 * seasonValue / total NHL minutes`, not v1's
0-100 display transformation. `seasonRating` remains a within-position percentile.
An average player does not accumulate positive value just by playing longer.

The nominal goal scale makes component tradeoffs interpretable, but attribution,
shrinkage and omitted situations mean these values do **not** exactly sum to team
goal differential or establish interchangeable goalie/skater value.

## Historical calibration and checks

Before scoring season T, the command fits component/position priors using only
adjacent-season pairs ending before T, with at least 50 pairs. It chooses among
the documented exposure-prior grid by weighted next-season rate error. Initial
seasons use declared defaults, and an isolated single-season run uses defaults.
Output preserves fitted priors, pair counts and training error. Exposure thresholds
and future-exposure caps keep very small samples from driving the fit.

An expanding-window evaluation uses 2020-21 through 2025-26 as target seasons.
Every prediction uses a prior selected before its target. Against unshrunk
component-rate predictions, squared error falls by approximately:

| Component                      | Forwards | Defensemen |
| ------------------------------ | -------: | ---------: |
| 5-on-5 chance creation         |    20.5% |      30.8% |
| 5-on-5 chance prevention       |    32.1% |      32.5% |
| Power-play chance creation     |    28.1% |      25.5% |
| Penalty-kill chance prevention |    45.3% |      48.3% |

Goalie saving-rate error falls 43.4%. Sixteen of 17 component/position groups
also beat a zero-excess baseline. Defender finishing does not: its error is
about 0.25% worse than that baseline. PK prevention and goalie saving show only
small gains over zero, supporting caution about fine individual distinctions.

These are **repeatability diagnostics**, not independent validation of total
hockey value. Targets use the same provider, include only returning qualified
players, and historical xG files may contain later provider revisions. Repeatable
team context can also survive the correction. Shrinkage estimates a conservative
performance signal; `observedValue` is available when the question is the season's
unshrunk statistical accounting. No claim of calibrated uncertainty or held-out
team-win superiority is made.

For 2024-25, median rank movement versus v1 is 63 forward places, 50 defender
places and 10 goalie places among common qualified players. Slavin moves from
117th to seventh among defenders; Oettinger from sixth to 22nd among goalies.
These examples are consequences, not tuning targets. Barkov remains 78th among
forwards, illustrating why plausible leaders cannot establish completeness.

The context-policy sensitivity compares weights 0, 0.5 and 1 while holding
calibrated priors fixed. Median movement is about 7-8 skater places, but individual
players can move far more. Every complete record exposes its value/rank range.
These ranges are policy sensitivity, **not confidence intervals**.

Special-team impact is larger than v1 but remains limited after empirical
shrinkage: in 2024-25, PP accounts for about 7.3% of absolute forward components
and 3.7% of defender components; PK accounts for 2.1% and 3.0%. Penalties account
for 24.1% and 39.2% respectively. Those shares are not explained variance or
causal importance. In particular, penalty influence and equal on-ice allocation
remain important assumptions to test with finer event/stint data.

## Verification and remaining limits

Direct fixtures cover average workload neutrality, chances without points,
goalie difficulty, finishing decomposition, penalty sign, zero versus missing
deployment, identity joins, provider coverage, and prevention of future-data
leakage in calibration. Scoped TypeScript and `ranking-engine:check` pass.
An offline replay verifies the saved season reports deterministically.

This is a substantial input and accounting improvement, but still not full RAPM
or validated WAR. Controlled entries/exits, retrievals, screens, passing quality,
off-puck positioning and leadership are not independently measured here. Full
teammate/opponent/deployment attribution requires stint/event data and a separate
validated model. Adding hits, blocks, speed or giveaways as arbitrary positive
bonuses would not solve those gaps and could reward the wrong game situations.

The v1 production publisher rejects v2 by version/profile/configuration. V2
changes component fields and per-60 units; publication requires a deliberate
storage-contract migration, replay verification and authorized data operation.
