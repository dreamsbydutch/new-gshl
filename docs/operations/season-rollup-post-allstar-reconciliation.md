# Post-All-Star season-stat reconciliation

Production `polished-tern-709` was reconciled on October 19, 2026 (Toronto), using all 522,233 stored player days. All six aggregate tables now match the repaired source under the agreed league rules. 2,671 existing aggregate records were corrected. There were no inserts or deletions and no missing active aggregate keys.

| Aggregate     | Active records verified | Records corrected |
| ------------- | ----------------------: | ----------------: |
| Player weeks  |                  74,900 |               496 |
| Player splits |                  11,180 |               427 |
| Player totals |                   7,587 |               419 |
| Team days     |                  31,344 |               248 |
| Team weeks    |                   4,144 |               786 |
| Team seasons  |                     310 |               295 |

The verification covered all 13 seasons with player days; NHL-only reference and future seasons were also checked without inventing played statistics. Another 3,172 existing inactive placeholder records were preserved with zero/empty source-derived stats. Eliminated playoff teams were not given fabricated roster days or games. Losers-tournament weeks map to postseason totals.

## Source repairs before calculation

The earlier [All-Star cleanup](allstar-player-day-cleanup.md) had already cleared 71 exhibition appearances. This audit additionally cleared 166 exact player/date joins to official preseason boxscores on October 7-8, 2022, plus 58 nonparticipant game counters on those dates. All 26 SJS/NSH roster rows for the real season openers were preserved, including 25 played rows and one backup-goalie row. Five goalie performances were corrected using agreeing official summary and fresh boxscore evidence. The exact 229 source patches preserved roster identity, acquisition, eligibility and unrelated fields; 522,004 other rows were unchanged. Repeat source dry run: zero changes.

Seven official NHL goalie records retain inconsistent GA+SV versus SA across multiple official sources. Exact date/club/opponent/count/time fixtures permit only those corroborated inputs; changed tuples still fail validation. Native official values were preserved rather than inventing replacement saves or shots. Evidence and public source URLs are retained in the official accounting review and fixture.

## Agreed calculation rules

Fantasy scoring counts starting slots; roster participation and bench/injury/acquisition helpers remain separate. Player transfers split by actual daily team ownership. Team season goalie totals include every actual credited starter appearance, even when a week misses the matchup minimum. Weekly W/SO/GAA/SV% qualification still applies; raw weekly GA/SV/SA/TOI remains stored. Season rates pool underlying counts and unrounded source minutes, without averaging percentages. Eligibility consumers in standings and rating code were adjusted to use scored categories when testing weekly qualification.

The Yahoo-verified 2021-22 Week 16 examples were reproduced unchanged:

| Team               |   W |     GAA |     SV% |
| ------------------ | --: | ------: | ------: |
| BlazerDri          |   1 | 2.51004 | 0.92647 |
| Butabi Brothers    |   1 | 3.00287 | 0.89623 |
| Oxford Dandellions |   1 | 4.18151 | 0.86567 |

## Verification and preservation

An independent oracle reconstructed the six populations directly from source without importing the calculator: 4,035,796 field comparisons passed. Full fresh production readback verified every expected/inactive aggregate value, canonical membership and unrelated preserved fields. All source-week files and inventory remained unchanged during aggregate application. Repeating the complete rebuild dry run found zero updates and zero inserts across all six tables. Ratings, ranks, power snapshots, standings, matchup results, careers and NHL season records were preserved.

Validation passed: 19 focused source/aggregation/cleanup tests, two Python importer eligibility tests, 37 ranking compatibility tests, targeted standings tests, scoped TypeScript checks, formatting and focused whitespace checks. Repository ESLint excludes the operator files. No frontend build or unrelated application suite was run.

Exact field-level team-week changes are in `.local-data/rollups-post-allstar-20261019/team-week-changes.csv` (786 team weeks). Of these, 53 have changes to scoring fields; 733 change only raw workload or helper counts. The focused review is `.local-data/rollups-post-allstar-20261019/team-week-scoring-changes.csv`. Complete source, dry-run, applied, after-readback and repeat-run evidence lives in that operation directory. Independently readback-verified backups are outside OneDrive under `C:/Users/choug/gshl-backups/rollups-post-allstar-20261019/`, with separate source-before, aggregate-before and after manifests.
