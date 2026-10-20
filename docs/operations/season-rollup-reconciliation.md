# Season statistics reconciliation

**Status: the 1,008 production updates described below were subsequently
rolled back.** Yahoo evidence exposed exhibition-game contamination in the
source player days. The numerical checks below demonstrated consistency with
those inputs, not historical fantasy scoring accuracy. See the
[rollback and root-cause report](season-rollup-rollback.md) for the current state.

The October 19, 2026 operation recalculates the six GSHL season statistics
tables from the user-confirmed player-day population in production
`polished-tern-709`. Evidence is stored in the ignored operator directory
`.local-data/rollups-20261019/`; independent backups are outside the repository
and OneDrive in `C:/Users/choug/gshl-backups/rollups-20261019/`.

The source snapshot contains 522,233 player days across the 13 GSHL seasons
from 2014–15 through the current 2026–27 season. The 2013–14 NHL reference season
and future season documents are distinguished from played GSHL history.
Current-season results are a snapshot through October 19 in Toronto, rather
than a claim that the unfinished season is complete.

The operation uses the existing season calculator and writes only player
weeks, player splits, player totals, team days, team weeks and team seasons.
It preserves source player days, ratings, power and award metadata, standings,
matchups, careers and NHL season rows. This is a statistics reconciliation;
preserved ratings are not newly calculated or validated by this operation.

Calculation corrections cover the first season's one-goalie-start minimum
through canonical/legacy identity, full source precision until final goalie
rate calculation, elapsed Toronto dates, and actual playoff roster
participation. Losers-tournament contributions remain part of postseason
totals. Weekly team goalie minimums still apply; individual player totals retain
their contributions even in a team week that did not qualify.

The write completed with 1,008 existing records updated, zero inserts and zero
deletions. Fresh production readback verified 129,465 required aggregates and
3,172 retained inactive placeholders, with zero missing rows, duplicate keys or
unexpected changes. All 522,233 source player days across 335 week files and
all season/week/team metadata remained identical to the before snapshot.
Every protected rating, rank, power, award and identity field was preserved.

| Rollup        | Required rows | Source-backed updates | Inactive updates |
| ------------- | ------------: | --------------------: | ---------------: |
| Player weeks  |        74,900 |                   124 |                8 |
| Player splits |        11,180 |                   104 |                0 |
| Player totals |         7,587 |                   100 |                0 |
| Team days     |        31,344 |                   122 |                0 |
| Team weeks    |         4,144 |                   126 |              258 |
| Team seasons  |           310 |                    96 |               70 |

The 3,172 retained inactive records include
future schedules and nonparticipating playoff teams. Source-derived numeric
counts on those records are zero and goalie averages are undefined; existing
ranking and identity metadata remains. They are excluded from played
population counts, and no inactive rows are newly inserted.

Roster ADD values are inferred from player presence across consecutive dates,
not certified Yahoo transaction records. MS/BS depend on saved lineup metadata.
Existing nonstandard All-Star source rows retain the calculator's established
starter rules. The source audit checks recorded games and active categories;
it does not convert unknown game participation into invented zero stats.

The exact reviewed plan, independently calculated numerical proofs, application
summary and post-write reconciliation are the authority for execution status.
Command flags belong to `scripts/README.md` and the command's `--help` output.

The repeat dry run against the fresh production snapshot proposes zero inserts
and zero updates in all six tables, including the retained inactive records.

Verification includes two independent source-day numerical
implementations (4,035,796 and 2,558,266 comparisons), 4,221,949 stored-field
checks on the fresh readback, eight aggregation tests, a scoped TypeScript
check, Prettier and a focused whitespace diff check. The source audit found no
active-category holes among 201,311 recorded GP-positive rows. Operator
TypeScript files are excluded by the repository ESLint configuration. A full
application build, frontend architecture check, ranking-runtime parity check
and unrelated test suites were outside this statistics-only change.
