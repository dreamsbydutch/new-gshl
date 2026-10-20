# Holistic goalie credit: scope and experimental boundaries

Research assessment, October 18, 2026. No goalie-process fit or default rating
change is authorized by this note. The nonlinear-shot impact replication remains
the active experiment. The numerical examples below are constructed accounting
examples, not estimates of actual players.

## Material scope gap

The current implementation excludes goalies from offensive and defensive xG
process columns. Its goalie contribution is shot-stopping residuals, individual
finishing and attributed penalties. It therefore cannot separately credit a
goalie's effect on the frequency or quality of future chances. That is a real
limitation against the requested goal of covering different styles; its size and
sign for actual players are not established by this inspection.

Goalies describe routine puck plays and reducing forecheck pressure as useful
beyond scoring totals. [NHL goalie interviews](https://www.nhl.com/news/unmasked-goalie-puck-handling-skills-can-provide-big-boost)

MoneyPuck models expected rebounds and freezes separately. Its explanation
explicitly notes that excess rebounds can reflect either goalie control or
teammates' clearing. Its flurry adjustment discounts later chances for the
probability that an earlier shot would have scored. That changes sequence
accounting but does not identify who caused a rebound.
[MoneyPuck methodology](https://www.moneypuck.com/about.htm),
[goalie definitions](https://www.moneypuck.com/glossary.htm)

## Accounting identity versus identification

Let Q be observed expected goals against, A actual goals allowed, and Q0 the
counterfactual expected goals against with a reference goalie on the same
pre-action opportunities. If goalie process prevention could be measured as
P = Q0 - Q, then P + (Q - A) = Q0 - A. In that oracle decomposition, process
prevention plus shot stopping does not double count and removes credit from
self-created danger.

For example, suppose a .10 initial shot is stopped. Freezing it produces Q=.10,
A=0 and saving=.10. Allowing a .50 rebound and stopping that too produces Q=.60,
A=0 and saving=.60. If the goalie caused the additional danger, process credit
of -.50 restores the same total .10. If the rebound scores, the same accounting
gives -.90 instead. Current GSAx alone cannot distinguish this mechanism.

However, a regularized goalie coefficient is a fitted association, not observed
Q0-Q. It allocates residual differences among correlated goalie, skater and
context columns; ridge changes that allocation. Its integrated effect need not
cancel the particular observed rebound xG included in GSAx. Adding a goalie
coefficient is therefore an estimable modeling hypothesis, not an algebraic fix
with guaranteed attribution. Puck handling may also affect both teams' future
chances, while goalie placement can influence whether a recorded miss occurs.

## What the primary literature does and does not support

Evolving-Hockey's RAPM documentation lists defensive goalie variables, but its
explicit note restricts them to the actual-goals regression. It does **not**
include them in the xG or Corsi regressions. This supports controlling for
goalies when modeling goals, not a claim that xG-goalie process is established.
[Evolving-Hockey RAPM specification](https://evolving-hockey.com/glossary/regularized-adjusted-plus-minus/)

Macdonald directly tested offensive goalie columns. Extreme noisy goalie
coefficients redistributed offensive credit among teammates, and heavy-start
goalies could act like team or coaching indicators. The paper also reports
failure to cleanly separate defensive goalie and team effects; adding team
variables worsened uncertainty. This is an especially relevant warning against
interpreting a new coefficient as isolated puck-handling talent. Ridge can
stabilize a solution without resolving that identification problem.
[Macdonald, sections 3.3 and 4.5.1](https://arxiv.org/html/1006.4310)

The weighted-shots paper explains the conventional separation of chance quality
from goalie residuals and documents rink-recording sensitivity. Its predictive
comparisons also distinguish explaining a season from estimating future talent.
These support retaining both source checks and an explicit estimand.
[Macdonald, Lennon and Sturdivant](https://arxiv.org/pdf/1205.1746)

## Bounded next experiments, before any fits

1. **Opportunity diagnostics first.** Count verified initial on-goal attempts,
   subsequent same-team shots and freezes using explicit sequence rules. Fit
   expected continuation chance from pre-save information only. Compare actual
   continuation xG against expected continuation xG, conditional on opponents,
   strength and teammates. A shot missing or being blocked is not automatically
   a goalie-generated rebound. Our current `reboundWithin3s` feature can follow
   a miss or block, so it is an opportunity proxy, not an attributable goalie
   action. No direct credit follows merely from the proxy.

2. **Small predictive RAPM screen.** With source/shot model fixed, compare the
   present model against defensive-goalie-only and offensive-plus-defensive
   goalie columns, at two fixed stronger goalie penalties (4 and 16 times the
   selected skater penalty). Keep all other features, weights, chronology and
   target support fixed. This is four candidates, not an open search. Select on
   earlier validation actual-goal error with separate finishing/saving rates fit
   only from earlier games. Freeze the selected specification before a genuinely
   uninspected later season. Passing the existing two-season support/convergence
   and 1% goal-error guardrails is necessary, not proof of individual credit.

3. **Confounding checks are required.** Compare against an earlier-fit team
   nuisance model. Report within-team goalie overlap, opponents, rest and start
   allocation, trades and connected exposure. Shuffle goalie identities within
   team and earlier time blocks as a falsification diagnostic, preserving team
   context and workload distributions. If shuffled goalie labels produce similar
   predictive gains, the new terms mainly function as team controls. Report
   sensitivity of skater and goalie allocations to priors and team nuisances;
   weak or prior-dominated absolute effects cannot justify common goalie ranks.

4. **Credit only after that assessment.** A nuisance-only fit may improve skater
   adjustment while leaving goalie process credit unclaimed. A successful
   predictive goalie-process fit may justify a research decomposition P plus
   GSAx, with explicit uncertainty, without establishing causal puck handling.
   An actual-goal goalie coefficient already includes stopping effects: it must
   **replace** the stopping component or be decomposed consistently, never be
   added whole to GSAx. Flurry-adjusting probabilities likewise requires jointly
   changing process, finishing and saving accounting; adjusting only goalie
   totals would break component consistency.

The four-candidate screen is a proposal, not a frozen executed experiment.
2023-24 and 2024-25 results have already been inspected for other hypotheses.
They can diagnose this gap but cannot become untouched confirmation simply by
changing the model. A new component must not be selected because it makes a
preferred goalie, defender or overall leaderboard look more plausible.

## Bounded 2024-25 source diagnostic

The pure diagnostic and nine fixtures are in
`scripts/src/domains/nhl/goalie-opportunity-diagnostics.ts` and its adjacent
test. The local runner verifies all original game-source hashes and uses the
unchanged baseline probabilities. It does not fit expected rebound rates or
assign any new value.

The 1,312-game scan retains 66,296 verified ordinary saves: 62,583 exclusive
initial chains, 3,702 continuation saves absorbed into those chains, and eleven
individual-only saves excluded because active lineup exposure is uncertain.
There are 6,502 chains with another same-attacking-team attempt within three
seconds. Their 7,253 continuation attempts include 3,702 on-goal shots, 1,780
misses, 1,022 blocks and 749 goals. Verified unblocked continuations sum to
806.06 baseline xG. This is chance exposure, **not** a count of goalie errors,
an estimate of avoidable danger, or a defensible new goalie component.

The scan finds 16,980 goalie-stoppage proxies and 232 unspecified puck-frozen
endings adjacent to the retained sequences. All 58,684 raw stoppages have
reason text, 13,179 also have a secondary reason, and none has a player or
goalie identity field. Individually attributable freezes therefore remain
unavailable. Lack of another event is censored, never silently called a freeze.

Blocked-shot ownership is checked against rostered shooting and blocking
players, rather than assumed. In 40,001 events with opposing known actors,
official event ownership is the shooting team; none uses the blocking team.
Another 3,864 have same-team actors and twelve have unknown actor evidence;
these are treated as ambiguous. There is no observed defensive-owner bug
requiring a change to the frozen shot-feature extractor. The diagnostic can
handle either ownership convention when opposing actor identities establish
the attacker's team.

The derived artifact is
`.local-data/nhl-rating/review-20261018/goalie-opportunity-2024.json`, with source,
implementation and runner hashes. Its fixed-window, conservative interruption
rules do not establish possession, physical rebound causation or puck-handling
quality. The continuation exposure is sufficient to show a concrete missing
measurement domain; its individual causal contribution remains unresolved.

## Targeted counterpoint: Magnus 7 rebound terms

Magnus 7 already models goalie-specific rebound shot-rate terms. Its goalie
exposure equals the observed shot count in that response row, a dependency the
author explicitly acknowledges. It reports slight predictive improvement and
year-to-year correlation 0.10, without conditioning on incoming-shot difficulty.
The stated goal is ability estimation.
[Magnus 7, covariates and rebounds](https://www.hockeyviz.com/txt/magnus7EV)

This is a relevant alternative to broad offensive-goalie RAPM. Low repeatability
does not rule out descriptive season contribution. Missing freeze identities
also do not prevent studying goalie-associated continuation rates: our verified
save anchors identify the goalie and the following opportunity. But a fitted
association still mixes skill, initial difficulty, teammates and recording.
Observed same-row shot count must not enter a forward predictor as known input;
any prospective interpretation needs a separately declared exposure prediction
or joint generative model. A safer next hypothesis conditions continuation on
pre-save opportunities and shot difficulty, with uncertainty and team controls.
No model is fitted or goalie credit introduced here.

Magnus 7 also uses a 13-forward/7-defender depth proxy. This supports the
precedent for those roster cutoffs, not exact availability or our goalie cutoff.
[Magnus replacement discussion](https://www.hockeyviz.com/txt/magnus7EV)
The same EV cutoffs are specified by
[Evolving-Hockey's replacement methodology](https://evolving-hockey.com/blog/wins-above-replacement-replacement-level-decisions-results-and-final-remarks-part-3/).
