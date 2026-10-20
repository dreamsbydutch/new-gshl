# Shared replacement-cohort process experiment

Candidate fixed October 18, 2026, after inspecting the 2024–25 reference
diagnostics and before inspecting reconstructed 2023–24 model results.
This is an experiment. The existing default impact fit and published revisions
retain their original regularization and feature definitions.

The current model estimates each skater's offensive and defensive process effect
with an independent zero-centered ridge prior. Replacement cohorts contain many
players with little process exposure. Averaging their shrunken coefficients can
shrink the reference toward zero even when the cohort collectively supplies
substantial exposure. Goalie season saving, by comparison, is an observed
residual. A leaderboard cannot establish which estimate is wrong.

The candidate keeps each individual coefficient, while sharing its prior with
the same-position, same-family replacement cohort. For a cohort of n coefficients
with arithmetic mean m, its penalty is
`lambda * sum((beta_i - m)^2) + lambda * m^2`.
Within-cohort deviations retain the original penalty; the common direction's
penalty eigenvalue changes from lambda to lambda/n. Singleton cohorts exactly
match the baseline. Other players and nuisance terms retain their original
penalties. This is a numerical prior, not a positional multiplier.

Cohorts use the fixed 13F/7D even-strength and 11/9 combined-skater special-team
depths per NHL team. Empty-net cohorts use the EV player cohort. At least five
positive-exposure members are required. Unknown family time gives an upper
exposure bound; certain replacement membership requires enough other players'
verified lower bounds to exceed that upper bound. Ties remain regular. Offense
and defense use exactly the same whole players. Membership and exposure come
only from the games available to that fit, not later deployment or outcomes.

The existing chronological 60/20/20 partition and lambda grid 1/4/16/64 are fixed.
Choose lambda on validation xG differential MSE, refit before the final test
block, and fit the complete-season candidate separately for the overall preview.
Compare against the unchanged baseline on identical supported held-out games.
Report paired whole-game error differences and replacement-reference/rank changes.

The screening criterion requires xG differential MSE improvement in both
reconstructed 2024–25 and 2023–24 seasons, at least 95% supported test coverage,
converged fits and no greater than 1% increase in either goal differential or
team goal MSE in either season. The 1% allowance is an explicit operational
guardrail, not a significance threshold. Numerical review must verify the sparse
operator against an independent dense system. Passing this screen cannot prove
causal individual attribution or optimal replacement availability; it only earns
further comparison, including later independently reconstructed seasons.

Weaker shrinkage of a shared cohort mean may worsen identifiability or prediction.
Solver residuals, individual estimates and reference sensitivity must therefore
be inspected; there is no automatic promotion or automatic change to production.
