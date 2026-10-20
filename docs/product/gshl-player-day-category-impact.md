# GSHL player-day category impact

The recommended local implementation is `schedule-kernel` with bandwidth 0.15,
empirical category margins and equal side-week weighting over earlier history.
It is implemented as an explicit profile; stored production ratings remain
unchanged. The revised model has full coverage over the 62,296 tested modern
player days. Later-season results are retrospective diagnostics, with the
original confirmation failure retained below.

The main rating describes a completed performance's expected contribution to
the league's fantasy categories. It uses a common historical reference so
ownership and the current matchup score cannot change the rating. Actual
completed-matchup impact is a separate diagnostic.

## Meaning and calculation

One category has utility 1 for a win, 0.5 for a tie and 0 for a loss. The value
of an appearance is the expected change in the sum of those utilities when
adding its stat line to a historical background with one appearance removed.
The reference uses real paired opponent weeks. It therefore accounts for the
distribution of differences between teams, rather than treating one goal,
shot, hit or block as equally scarce.

Each historical side-week has equal weight by default; appearances within that
side share its weight. Skaters share a reference across forwards and defense.
Only categories active under the target scoring rules contribute. Correlated
categories such as goals, assists and points still count separately when the
league awards them separately.

Each category uses earlier weeks where that category was active and available.
Categories introduced later therefore have shorter histories. The sum does not
assume categories are independent, but its category-specific references can
represent different eras. The trailing-history comparison tests sensitivity
to that limitation; per-category support remains visible.

Goalies use the joint weekly wins, saves, shots against, goals against,
shutouts, minutes and appearance counts. Inserting a game recomputes pooled
GAA and save percentage, and can change goalie-minimum qualification. The
calculation retains negative impact and reports qualification credit
separately. A relief appearance counts under the same verified appearance
convention as the historical weekly calculator.

The display scale is 100 rating units per expected category point. This is
category utility with half-credit for ties, rather than the number of categories
recorded as wins in the standings. Existing legacy grade bands do not apply.

`ifStarted` describes the performance. `counted` is zero for a bench or injured
reserve row. Where the caller supplies completed matchup totals, the diagnostic
reports the exact change from removing that counted appearance. The main value
does not read those totals. Marginal contributions are not additive across
teammates, and this score does not estimate sustainable player ability.

## Historical evidence and safeguards

The reviewed source contains 2,059 completed paired matchups and 182,040
started appearances. Source checks found no duplicate appearances or missing
active category cells in those pairs, and verified that the appearances sum
to each side's raw workload. Forty losers-tournament pairs remain included.
Future or incomplete matchups are excluded.
These checks verify the saved roster days and their arithmetic; they do not
independently reconstruct every historical Yahoo roster.

An independent implementation checked 165,710 development and validation
appearance targets, including 1,786,741 category comparisons, with zero
differences from the runtime's completed-matchup arithmetic. It did not inspect
the final test season's labels.

Historical goalie policy was checked against 2,021 unaffected stored matchup
results: comparison at five decimals for GAA and save percentage, and minimum
qualification on every active goalie category, reproduced every result.
The first GSHL season used a one-appearance minimum; later seasons used two.
Known official goalie accounting exceptions remain intact: goals against plus
saves need not be forced to equal shots against.

References use only contexts ending before their explicit cutoff. The public
adapter also requires that cutoff before the target week starts. It rejects a
populated performance with unknown GP. Missing active fields or unsupported
historical week lengths remain unavailable. The first historical seasons may
therefore lack a usable earlier reference; they must not borrow future seasons
silently.

## Evaluation and operation

Four prespecified comparisons use all earlier history, a trailing three-year
history, appearance weighting, or a normal counting-margin distribution.
They are compared with the legacy same-date rating and a simple category-margin
baseline, each calibrated to category-point units using earlier seasons only.
Validation uses 2022-23 through 2024-25; the final primary season is 2025-26.
Partial 2026-27 is a separate secondary check. Paired uncertainty resamples
whole fantasy weeks within seasons.
Those intervals condition on the fitted references; they do not include every
source of training or future-season uncertainty.

Before viewing results, acceptance required lower overall error than both
baselines, at least 95% supported coverage overall and within each role, and
no more than 5% error regression for F/D/G groups with at least 1,000 cases.
Final confirmation additionally requires a whole-week 95% interval entirely
below zero for the error difference against the legacy baseline.

Completed-matchup leave-one-out impact is an independently computed but noisy
proxy for context-neutral expected value. Team composition and lineup choices
can correlate with performances, so lower held-out error supports a reference
choice without proving it uniquely optimal. The rating measures category
utility, not matchup-win probability, standings points or the opportunity cost
of choosing one player over another. A weak goalie game can still help by
reaching the minimum; the qualification breakdown makes that credit visible.

The adapter is opt-in. Local evaluation and preview commands save input/code
hashes and new artifacts; neither publishes ratings. Exact caching speeds up
goalie scoring without reducing the reference: 3,660 comparisons against the
original implementation, including hydrated models, had zero differences.
Production adoption remains a separate reviewed data operation.

## Frozen validation result

The full-history empirical reference was selected before opening final-season
targets. On 44,379 common appearances from 2022-23 through 2024-25, its mean
squared error was 0.186776, compared with 0.195412 for the calibrated legacy
profile and 0.191261 for the simple margin baseline: reductions of 4.4% and
2.3%. F/D/G errors each improved against legacy. Supported coverage was 96.55%;
1,587 appearances in 10-, 11- and 21-day weeks lacked earlier matching contexts.

This is an expected-value model, so squared error is the selection criterion.
Mean absolute error was slightly worse than legacy (0.282562 versus 0.277486).
The improvement over the simple baseline concentrated in goalie-minimum
crossings; outside those cases the simple baseline had lower squared error.
The model also identified fewer negative actual outcomes than that baseline.
These tradeoffs prevent a claim that it dominates every metric or subgroup.

## Original confirmation failure and exposure revision

The frozen calendar-length model failed its 2025-26 confirmation. On 13,903
supported appearances its squared error was 0.184038, versus 0.188907 for legacy
and 0.181729 for the simple baseline. Its paired 95% interval against legacy
crossed zero. It covered only 94.0% of the 14,791 appearances because 888 fell
in a previously unseen 28-day week. The failure is retained in the local
confirmation artifacts and is not overridden by partial 2026-27 results.

The calendar label concealed opportunity: February 2 through March 1, 2026 had
77 NHL games on nine playing dates, including a 19-day break. The prior season's
21-day break week had 75 games on nine dates. Exact calendar matching also gave
rare six- and eleven-day weeks small, noisy reference pools.

The revised optional `schedule-kernel` profile conditions on league-wide NHL
games per team: twice the regular-season games in the week divided by the
season's NHL team count. It borrows all earlier paired backgrounds with a
Gaussian weight in the logarithm of their exposure ratio. This preserves raw
count distributions and whole goalie workloads; it neither scales integer
appearances nor fabricates games. Owners and individual players' NHL team
schedules do not enter the main score. Category support, effective weighted
side-weeks and extrapolation are reported.

Three smoothing bandwidths (0.15, 0.30 and 0.60) were fixed before this revision's
results. Selection uses 2022-23 through 2024-25. Subsequent 2025-26 results are
explicitly diagnostic because that season informed the revision; they are not
a new untouched confirmation.

Historical official schedule caches contain dates and team identities as
collected after those seasons. They provide outcome-free, owner-independent
retrospective exposure, but may include later schedule revisions. Historical
testing therefore does not prove those schedule values were known before each
week. Prospective use should freeze the public schedule before the week starts.

## Schedule-exposure results

The initial exposure grid selected bandwidth 0.15, which had the lowest squared
error in each validation season. It rated all 45,966 validation appearances,
including the 1,587 previously unsupported cases. Full-cohort squared error was
0.185066 versus legacy's 0.194931, a 5.06% reduction. On the original common
cohort it also improved over the calendar model and the standardized baseline.
Independent replay reproduced all source hashes, prediction identities,
metrics, bootstrap intervals and the selected setting exactly.

For 2025-26, the same setting covered all 14,791 appearances, including the
888 in the long break week. Its squared error was 0.179772 versus legacy's
0.187158, a 3.95% reduction. On the original 13,903-case common cohort, squared
error was 0.181605 versus the simpler baseline's 0.181729: a small point
difference, not a decisive advantage. The long break week is one week of
evidence, not 888 independent historical weeks.

Partial 2026-27 covers 1,539 appearances over only three weeks. Error was lower
than legacy there too, but that small secondary sample is not a substitute for
an untouched future confirmation. Independent replay reproduced both later
seasons' full, common-cohort and newly supported results exactly.

Absolute error remained slightly worse than legacy in validation and nearly
equal in 2025-26. The rating estimates expected utility, which motivates the
squared-error criterion; it does not dominate every alternative metric.

One bounded refinement tests bandwidths 0.05 and 0.10 against 0.15 using only
2022-23 through 2024-25. Its rule is fixed before fitting: among settings that
pass coverage and position guards, prefer the broadest setting within one
paired-week bootstrap standard error of the minimum. Reference-support
diagnostics are retained. This closes the bandwidth check without an open-ended
search over the already inspected later seasons.

The bounded check retains 0.15. Bandwidth 0.10 had slightly lower squared error
(0.185003 versus 0.185066), but the difference of 0.0000627 was smaller than its
paired-week bootstrap standard error of 0.0000920. Bandwidth 0.05 was worse.
All position guards passed. Independent replay reproduced the refinement and
the fixed stopping decision exactly; no additional grid search was performed.

## Verification and artifacts

The shared `npm run ranking-engine:check` suite passed all 37 checks. Direct
`npx tsx --tsconfig scripts/tsconfig.json --test` runs passed the core impact,
adapter, independent evaluator, calendar helper, preview command and both
evaluation-command fixtures. Core coverage includes 20 numerical cases. The
calendar and preview tests also verify future exclusion, serialized-reference
replay and strict source binding. An independent direct calculation checked
252 kernel category contributions within floating-point precision.

Scoped TypeScript checking covered the changed commands, domain adapters and
their tests. Changed source and documentation passed Prettier checks, and
`git diff --check` found no whitespace errors. ESLint excludes this operator
package, so its invocation did not lint these files. A full application build
and frontend architecture checks were not run; no frontend code changed.

Local evidence is under `.local-data/player-day-impact-20261019/`: the original
validation and failed confirmation, exposure validation and diagnostics,
bounded-refinement summary, independent replay proofs, source hashes and the
reviewed 2026 reference. The bare saved model is
`recommended-day-impact-reference-2026.json`; its separate manifest records
selection, source and model hashes and a saved-model readback comparison.
The operator preview accepts explicit week contexts and can show completed
actual-matchup impact separately when given the corresponding source corpus.
That option verifies the starting appearance's identity and stat fields against
its own completed team week. Its numeric fixture holds the main rating at 25
(0.25 expected category points) while actual impact changes from 0.5 to 0
category points as the opponent changes; bench actual impact is zero. The saved recommended reference was read back and reproduced
all 1,539 current-season predictions and category contributions with zero
differences.

No production recomputation, deployment or database writes were performed.
