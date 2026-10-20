# Uniform GSHL contribution ratings

Status: complete. All 667,613 captured GSHL stat lines were rated in production,
verified against the complete audited plan, and enabled for ongoing imports.
Verification completed on October 20, 2026 at 08:09:19 UTC.

The requested publication covers all nine GSHL player and team stat-line tables:
522,233 player days, 74,908 player weeks, 11,180 player splits, 7,587 player season
totals, 10,892 player career splits, 1,851 player career totals, 33,802 team days,
4,752 team weeks and 408 team seasons: 667,613 existing rows in 16 seasons.

`Rating` measures total owner-independent category contribution, in expected
category points multiplied by 100. `averageRating` measures performance per
counted appearance. `ratingAppearances` supplies that denominator and
`ratingVersion` identifies `gshl-category-impact-v3`. Empty periods receive zero.
See [the numerical contract](../RANKING.md#uniform-gshl-category-contribution).

Weekly contributions evaluate complete starter blocks against historical
category margins. Longer periods sum distinct weekly contributions; careers
sum published season contributions at five-decimal precision. Daily bench rows
retain their if-started potential, while bench-only weeks contribute zero.
Actual opponents do not affect the main rating.

Historical comparison excludes the target season except categories present in
only one season (SV and SO in 2014–15). This is a retrospective reference that
can include later seasons. It is not an untouched prospective forecast. Ongoing
imports extend missing target-week exposure using the official NHL schedule;
the reviewed historical fitting corpus remains fixed.

The migration patches only the four rating fields, using complete source-row
compare-and-swap checks and transactional player-day performance-index updates.
It does not change native statistics, ownership, rosters, game inclusion,
matchup results, NHL ratings, player talent, salaries, awards or power ratings.
Compatibility code keeps the new contribution units out of legacy salary,
award and talent formulas. The UI presents total and average ratings together.

The source audit confirmed every played row has the required scoring fields.
It also classified 39 populated rows with no recorded appearance: 34 excluded
NHL playoff rows, four zero-stat placeholders and one officially verified DNP
with stale source cells. The rating honors the recorded appearance flags and
assigns zero to these rows; this migration does not repair their native cells.

The career audit also found four zero-appearance rows with pre-existing native
GP/GS mismatches: career
splits for Dylan Holloway, Ryan Strome and Filip Zadina, plus Zadina's career
total. Those career rows retain GP/GS counts of 1/1, 1/1, 2/2 and 2/2,
respectively. Their corresponding season periods have GP/GS zero; an independent
scan of all 522,233 player days found no played appearances in those ownership
periods. These are opening-week DNP records from October 2022. Their contribution,
average and counted appearances are correctly zero. The native career counts
remain unchanged and are explicitly recorded in the rating audit.

Source snapshots and reviewed calculation artifacts live under
`.local-data/gshl-uniform-impact-20261020/`. An independent, hash-verified backup
is outside OneDrive at
`C:/Users/choug/gshl-backups/gshl-uniform-impact-20261020/`. The apply command
requires that independent backup and verifies its complete source/plan coverage.
Rollback restores the original values and field presence, guarded by the exact
rating postimage.

The frontend release was built from production commit
`aba724695bdd4e056a978f24f33db06cde8f9ba2` in an isolated checkout with only the
reviewed rating display changes. Deployment
`dpl_4k9qmEfAtxZKDcS1Jzbjc28YZZRo` is promoted to
[the production application](https://gshlapp.vercel.app). Independent HTTP checks
confirmed the production alias and five public route shells. Those shell checks
do not assert authenticated data rendering.

Three disjoint batches applied 366,180, 173,075 and 128,358 rows. Their 433
scopes partition the complete source population; all patch hashes match the
complete final plan. Post-apply sample checks passed 59, 52 and 80 rows. The
subsequent full read-only verification found exactly 667,613 already-correct
rows, zero updates and zero remaining differences. Full source-row comparison
also verified that native statistics, ownership and identities were preserved.

All 16 season performance indexes are ready, covering exactly 522,233 player
days. A repeated readiness preview found no remaining preparation work. The
active operator reference configuration is byte-identical to the reviewed
proposal; the actual integration discovered and hash-validated it. Ongoing GSHL
imports and rollups use the same versioned total/average calculation boundary.

The completion evidence is available locally:

- [Complete rating plan](../../.local-data/gshl-uniform-impact-20261020/final-v3/plan.json), SHA-256 `9eaa11fa3666eb03062e140d81a59a304a217a415e8b8556f6f202d91649a7ae`.
- [Independent all-nine-table audit](../../.local-data/gshl-uniform-impact-20261020/final-v3-audit-2/proof.json), SHA-256 `10b5c0cd4253ba2ba9fbf43ab8307b61934d0402b240fcb4d632934cbedc554b`.
- [Full production verification](../../.local-data/gshl-uniform-impact-20261020/final-v3/verify-1792483759115.json), SHA-256 `5edc74f9048240d75ec406b290cd1967724824b0551391111b96af7bf27ca2c4`.
- [Complete index readiness](../../.local-data/gshl-uniform-impact-20261020/performance-coverage-coordinator-2/verified.json).
- [Profile activation](../../.local-data/gshl-uniform-impact-20261020/activation-proof.json), SHA-256 `a41691236326569942019eb87a5825217af3a36b617ec2e4069f70204da3ef14`.

The independent `complete-backup.json` manifest binds 1,383 archived files and
666,708,892 bytes, including the original 467-file source backup, complete plan,
reviewed runtime and reference inputs, public target-calendar cache, and audit
journals. Its SHA-256 is
`37ea1244854656d3100787906efc0380fac2c3e2c2c372f2e717b53214f84efe`.
The final subset's `remainder-backup.json` also binds its separate plan and
completed prior-stage evidence. The first two interrupted write attempts were
resumed against immutable postimages; reduced write concurrency completed all
remaining batches, followed by the successful full verification. No native
statistics were repaired as part of those resumes.

Validation performed for this change includes the direct period-impact,
uniform-impact, career-impact, rating-output, Yahoo-update and calendar tests;
the Convex rating transaction/client tests; award-unit and draft compatibility
tests; and scoped TypeScript checks. `npm run ranking-engine:check` passed all
39 contracts. The isolated frontend passed 57 focused tests, its architecture
check and the production build. Changed frontend/backend files passed focused
ESLint and formatting checks; operator files are excluded by ESLint and are
not claimed as linted. The root checkout's full build was not run because it
contains unrelated pre-existing changes. `git diff --check` passed, with Git's
existing Windows line-ending warnings.

The complete local rating audit covers 433 scopes and all 667,613 source rows.
It independently checks identities, patch allowlists, appearance counts, period
conservation, five-decimal career composition and source/reference hashes. The
first audit's partial evidence is preserved. A fresh complete audit records the
four native-career count discrepancies and retains every rating arithmetic
check. The audit is an independent conservation check, not a separate model
refit or a claim of prospective predictive validation.

Subsequent native-stat repair: the four career count discrepancies above are now
resolved. The [career reconciliation](career-stat-reconciliation.md) corrected
681 GP/GS discrepancy rows, repaired other stale career values and added 302
missing current-season career entries. Its fresh full verification covers all
13,045 career rows and preserves existing published ratings. The rollout counts
and native-stat preservation statements above describe the earlier rating-only
migration; the later career repair has its own source snapshots and proof.
