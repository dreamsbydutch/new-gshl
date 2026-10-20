# All-Star player-day cleanup

On October 19, 2026 (Toronto), production `polished-tern-709` was repaired using
official NHL schedule responses identifying game type 4. Regular-season and
playoff games use types 2 and 3 and were excluded from the repair scope.

The audit covered all nine All-Star dates during the stored GSHL history:
2015-01-25, 2016-01-31, 2017-01-29, 2018-01-28, 2019-01-26, 2020-01-25,
2022-02-05, 2023-02-04 and 2024-02-03. None had an NHL regular-season or playoff
game. All 52 official schedule response files were retained with checksums.

The repair updated 155 source rows:

- 27 recorded All-Star appearances on 2022-02-05 and 44 on 2023-02-04 had their
  game participation, statistics, opponent, score and nonzero daily rating cleared.
- All 71 division team labels were restored to NHL clubs using matching roster
  records before and after the date, verified against fresh production reads.
- Another 84 rows had only erroneous missed-game or injury-game counters cleared
  on dates without NHL league games. Daily roster injury slots were retained.

All 2,371 roster records across the nine dates retained their canonical IDs,
ownership, lineup slots, eligibility and acquisition history. There were no
inserts or deletions. Exact readback verified every intended field change and
every unrelated preserved field. The transactionally maintained performance
index was checked for residual exhibition scores. No archived player-day
highlights existed on the audited dates.
An independent repeat dry run found zero remaining All-Star appearances and
zero remaining patches across all nine dates.

The six aggregate tables previously restored in the
[rollup rollback](season-rollup-rollback.md) were not recalculated by this repair.
NHL season totals, ratings, standings and careers were outside the write scope.

The daily NHL importer filters schedule game types before fetching boxscores,
accepting only types 2 and 3, and rejects schedule/boxscore eligibility conflicts.
Two importer regression tests, three cleanup tests and twelve nearest aggregation
tests passed. A focused TypeScript check and formatting check passed. ESLint
ignores the operator TypeScript files by repository configuration; no full
application build or unrelated ranking checks were run.

The local operation evidence is `.local-data/allstar-cleanup-20261019/`:
official schedules, original date preimages, adjacent club proofs, reviewed dry-run
plan, exact applied plan, post-write records, index records and verification proof.
The independently readback-verified pre-write backup is
`C:/Users/choug/gshl-backups/allstar-cleanup-20261019/before/manifest.json`
(72 files, 7,431,854 bytes). Command usage is maintained in
[scripts/README.md](../../scripts/README.md), under `stats:clear-allstar-days`.
