# Season rollup rollback and source eligibility diagnosis

The subsequent cleaned-source rebuild is documented in the
[post-cleanup reconciliation](season-rollup-post-allstar-reconciliation.md).
That rebuild passed independent calculations, production readback and a
zero-change repeat; this page preserves the earlier rollback diagnosis.

All 1,008 records changed by the October 19 six-table rebuild were restored in
production `polished-tern-709`. The readback verified all 8,599 changed fields
against their exact pre-rebuild values and preserved unrelated current fields.
There were no inserts, deletions or conflicting later edits. A fresh dry run
found zero remaining changes. The rollback timestamp is retained as an audit
timestamp; the restored statistics use their original values and types.

| 2021–22 Week 16 team | Restored wins | Restored GAA | Restored SV% |
| -------------------- | ------------: | -----------: | -----------: |
| BlazerDri            |             1 |      2.51004 |       .92647 |
| Butabi Brothers      |             1 |      3.00287 |       .89623 |
| Oxford Dandellions   |             1 |      4.18151 |       .86567 |

The BlazerDri Yahoo screenshot shows 1 win, 2.51 GAA and .926 SV%. The actual
calculator reproduced the incorrect 3.70599/.78750 from the saved source.
Removing only the February 5 exhibition row restored 2.51004/.92647 exactly.
The equivalent exclusion also reproduced the original Butabi and Oxford rates
exactly, without changing time units, roster ownership or rounding rules.

The offending Vasilevskiy row had GP=1, GA=3, SV=0, SA=12, TOI=10 and opponent
`@CEN`. Counting it changed his weekly GA from 5 to 8, shots against from 68 to
80, and minutes from 119.52 to 129.52, while saves stayed at 63. It was not a
fantasy-eligible NHL league game. Similar February 5 rows affected Demko and
Campbell. The source eligibility contract was missing: aggregation treated
GP=1 in a starting slot as sufficient evidence to include a game. The daily
Python fetcher also accepted all scheduled game types, providing an upstream
path for this class of contamination. The historical writer responsible for
these particular imported records has not been established.

The earlier independent oracles used the same contaminated source corpus and
the same declared eligibility assumption. They verified the sums, not whether
the summed games belonged in fantasy scoring. A recorded positive GP and
nonblank fields were insufficient source-quality checks. The earlier claim of
accuracy therefore exceeded what those checks established.

A targeted scan found 71 GP-positive source rows with exhibition/division
opponents across 2021–22 and 2022–23, covering 31 team-week source groups. It
also found 40 goalie rows where saved SV + GA differs from SA, including some
of the exhibition rows. These are diagnostic candidates; the scan does not
claim to certify all other historical rows against official game schedules.
Raw player days were preserved during both the original rebuild and rollback.

The daily fetcher now includes only game types 2 and 3 and refuses a mismatch
between schedule and boxscore game type. The aggregate calculator fails before
calculation on identified exhibition opponents, GP greater than one, or
inconsistent goalie counting inputs. It preserves those source records for
review rather than silently rewriting them or publishing guessed results.
Original goalie fixtures and explicit rejection tests cover the demonstrated
bug. Another full rebuild requires source game-eligibility reconciliation and
comparison with independent Yahoo results before production application.

Validation passed: 12 TypeScript aggregation/source tests, two Python fetcher
tests, scoped TypeScript checking, focused whitespace checks, real-source
three-team reproduction and complete rollback readback. The rejection and
import-eligibility tests were observed failing before their respective fixes.
No frontend build, unrelated suites or ranking-runtime parity run was needed;
those boundaries were unchanged. Operator TypeScript is excluded by the
repository ESLint configuration.

Evidence lives in `.local-data/rollups-20261019/`:

- `source-game-diagnosis.json` and `yahoo-three-team-proof.json` explain and
  reproduce the three affected teams.
- `rollback-dry-run-v2/` is the exact reviewed rollback preimage and plan.
- `rollback-apply/proof.json` and `rollback-apply/after.json` verify restoration.
- `rollback-dry-run-v3/summary.json` reports zero remaining changes.

The original before/after backups remain intact. The independently verified
rollback preimage is at
`C:/Users/choug/gshl-backups/rollups-20261019/rollback-before-v2/manifest.json`.
The rollback after-backup and validation receipt are saved separately under
the same backup root. No NHL ratings, standings, matchups, careers or source
player days were changed by the rollback.
