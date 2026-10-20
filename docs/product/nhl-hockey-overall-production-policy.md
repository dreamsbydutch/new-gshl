# Reviewed NHL hockey overall method

Status: **SEALED fixed production method**. This policy fixes the calculation;
it does not attest that an individual season has complete source evidence.

The primary quantity is observed season contribution in goals above an
exposure-defined NHL replacement proxy at the same position. Use the reviewed
nested whole-game crossfit GB shot learner and independent-prior impact ridge
lambda 4. Preserve the GLM comparator as an audit arm; never switch learners
because one season's comparator looks better. This is retrospective contribution,
not a prospective forecast or a claim of complete causal hockey talent.

Use the existing deterministic five outer folds (SHA256 of
`season:gameId:retrospective-v1:14731`, first eight hex digits modulo five).
Within each outer training set, use the existing 40%/60% date boundaries for
inner training/validation. Keep GB leaves 7/15/31, L2 1/10, 300 iterations,
learning rate .05 and the existing fixed numerical implementation and tie rules.
Every ordinary-shot probability must exclude its entire game's outcomes from
parameter fitting and model selection. Verify every exported probability with
the native scorer. Penalty shots retain their independent earlier-season prior.

Use annual same-position replacement references: EV 13 forwards and 7 defenders
per official NHL team; PP 11 skaters, SH 9 skaters; goalie depth 2 per team.
Keep the existing exposure-bound membership, cutoff ties, minimum five usable
reference members, coverage and qualification rules. Finishing/penalties and
goalie saving follow the existing annual reference composition. No pooled or
blended historical goalie reference is used. Narrow/wide depth alternatives are
diagnostics, not confidence intervals. Sustainable ability is a separate
shrinkage-based per-60 estimate with exploratory predictive calibration.

Require reconciled canonical official season-to-date exposure, complete download
of the declared completed-game snapshot, at least 98% verified process exposure
and individual shots, all-row OOF inference parity, converged lambda-4 fits,
and actual per-player finishing/saving reconciliation. Incomplete sources do
not acquire official ranks. Small-sample and unsupported reference values remain
withheld under the runtime rules. No season-specific accuracy gate changes the
selected learner, and failed source/numerical gates are never waived.

Regular seasons only. An ongoing season is explicitly a season-to-date snapshot
with source timestamps and an as-of inventory label, never a completed season.
The schedule collector returns completed games, so completeDownload alone does
not establish season completion. Shortened seasons use actual exposure; 2019-20
requires its own fresh evidence and receives no inherited exception from older
v3 finalization. Playoffs require a separately reviewed opportunity/depth policy
and are outside this method. Seasons without usable source/fold/reference support
remain explicit failed or withheld entries; do not synthesize ratings.

Freeze and hash this policy, the inventory, canonical inputs, source manifest,
fold models, all-row parity evidence and calculation code for each run. Existing
reviewed artifacts may be reused after exact hashes, native inference, source
links and annual values reproduce; preserve their actual original ability priors.
Fresh official-only canonical snapshots use explicit default ability priors
(`calibration: {}`), invoking the unchanged runtime defaults without MoneyPuck.
No history snapshot, fixed 2025 experimental review, or future season outcomes
are production prerequisites. The earlier failed goalie blend is research
evidence, not an adaptive production selection step.

Store under a distinct reviewed overall model version. Preserve old v1/v3
records and GSHL category ratings. Local orchestration does not publish data;
publication separately verifies immutable artifacts, dry-runs the exact target,
applies authorized additive/upsert changes, then verifies all records unchanged.
