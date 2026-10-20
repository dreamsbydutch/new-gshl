# GSHL player-day coverage and roster review

The original October 19, 2026 production audit scanned 522,226 stored player days across
335 calendar weeks. A separate global table scan verifies the exact same row IDs
and week references; there are no rows outside that inventory. The complete
canonical player inventory resolves every player reference, and no duplicate
player/season/date assignments were found.

Roster completeness is a count-based review, as requested. It does not invent
historical roster membership or carry the last known roster forward. Every team
is checked during the regular season. Postseason dates require a recorded
matchup, including losers-tournament and consolation games, or a later-round
appearance establishing a possible bye. Teams with no current or later
postseason matchup are inactive. An entirely missing playoff-week schedule stays
uncertain and is not used to exempt all teams. Future dates and off-season dates
are excluded. Week calendars take
precedence over conflicting season-level start/end metadata; ten boundary
disagreements are disclosed separately. The 2013-14 NHL-reference season has no
GSHL teams or weeks, so no GSHL roster is fabricated for it.

The current review flags 52 team-dates:

- 52 nonempty rosters are at least two players below the season's configured regular capacity.
- No additional unusual-drop-only flags remain. The previous 230 were drops of
  two to four players and were removed when the review threshold changed to
  strictly more than four players.

There are **zero missing active team-dates**. The original review incorrectly
flagged 2,453 empty postseason dates by expecting every team to continue through
the final week. All 2,453 are unscheduled postseason dates with no later matchup
for that team. They are removed from the review, rather than treated as missing
rosters. The model separately records 2,474 inactive postseason team-dates;
21 of these still have stored roster rows, which remain untouched. That playoff
correction retained 662 nonempty team-dates; the subsequent count-drop threshold
change left 432 undersized-roster flags. Requiring at least two missing players
then removes 379 one-player shortages, leaving 53: 50 are two players short,
two are three players short, and one is seven players short. Three
last-active-date flags now correctly show the following inactive date as outside
the comparison window, rather than as a zero-count roster.

The seven-player shortage was subsequently restored for Toe Dragons on March 29,
2015, leaving 52 review flags: 50 two-player shortages and two three-player
shortages. The supplied dated screenshots identify all 23 players and lineup
slots, matching the stored March 28 roster. March 30 has no Toe Dragons rows or
matchup after their March 29 quarterfinal loss, so that day was not used to infer
continued ownership. Seven rows were added, bringing March 29 from 16 to 23;
all 1,298 previously stored rows in the affected week and both adjacent dates
were preserved. None of the seven had an official NHL appearance on March 29.
James Neal's team played, so only his missed-game flag and verified game context
were populated. Lineup optimization fields were left unknown rather than copied
from a different date. The repeat run proposes zero additions.

Regular capacity includes starters and bench spots and excludes optional IR and
IR+ spots. For example, the current season has 15 regular spots, 11 starting
spots and 17 total spots. Historical configurations are used separately:
2014-15 has 23 regular spots and 2015-16 has 18. Nearby comparisons use observed
dates within three calendar days and flag a drop of at least five players.
Nonempty flags indicate a possible hole; a legal empty roster spot can produce
the same signal. Counts alone cannot prove exact membership or lineup accuracy.

The reusable read-only `stats:audit-player-days` operator verifies snapshot hashes
and generates a detailed JSON report and `roster-flags.csv`. The CSV includes the
team, season, date, actual count, configured capacities, nearby counts, severity
and reasons. Consult command `--help` for its inputs. Audit and source artifacts
are under `.local-data/player-day-completeness-20261019/`; independent verified
backups are outside the workspace and OneDrive at
`C:/Users/choug/gshl-backups/player-day-completeness-20261019/`.

## Daily statistics

Inactive historical scoring categories are intentionally blank and are excluded
from missing-stat faults. Blank GP is not assumed to prove a missed game; it is
checked against an independently collected official NHL game report using the
canonical NHL ID and exact game date. Fantasy `GS` denotes a fantasy starting
slot, rather than official goalie games started.

The source review identifies 154 existing rows with 1,216 missing numeric fields
that can be restored without replacing an existing native value. This includes
121 missing NHL appearances and 266 missing hits/blocks verified in fresh
official per-game realtime reports. Their associated fantasy flags and target
ratings are reviewed with full-season rating comparison pools. Roster ownership,
eligibility and daily lineup assignments remain outside these stat fills.

The repair was applied and verified in production. A separate two-row correction
uses agreement between cached NHL summaries and freshly fetched official box
scores: Alexander Burmistrov's missing penalty minutes and incorrect plus/minus
and shots, and Andrei Vasilevskiy's complete workload and rates together. The
combined operation changes 156 existing rows: 1,219 missing native fields,
seven independently corroborated existing native values, associated fantasy
flags and 125 target ratings. Ratings use full season comparison pools while
unrelated stored peer ratings remain unchanged, following scoped-sync policy.

Fresh reads of all 26 affected weeks verify each exact patch and preservation of
every other field. The table remains 522,226 rows; no roster rows were inserted,
deleted or reassigned. Both repair plans repeat with zero changes. A fresh
335-week audit reports zero missing active-category fields among recorded
played-game rows, zero duplicate player-dates and zero invalid canonical
references. The later playoff-aware correction changes only roster expectations
and review output, with no production writes. The latest CSV and JSON outputs
are under `.local-data/toe-dragons-20150329/updated-roster-review/`, using the
original verified audit snapshot with a fresh read of the restored week.
The former `two-short-review/` is preserved within the original artifact directory;
`drop-over-four-review/`, `playoff-aware-review-final/` and `roster-review/` are preserved as superseded
evidence.

Verification includes 24 pure audit tests and 37 offline rejection cases for the
repair operator, scoped strict TypeScript, formatting and focused diff checks.
Independent numerical reviews verify every native/derived field, both source
families for the two corrections, and exact full-engine rating parity on 1,052
and 902 actual-row fixtures. No shared ranking-runtime contract was changed.

The initial generic candidate-based writer stopped after four verified repairs;
the remaining work used exact-ID updates, with a fresh dry run proving those
four were already complete. Full pre-read and post-read checks protect the
reviewed historical scope; they are operator checks rather than an atomic
server-side compare-and-swap. Each complete individual row patch is atomic and
maintains its performance index. No schema or backend deployment was required.

Source conflicts, 237 unmatched-date observations, 28 official goalie counting
inconsistencies and possible lineup-optimization changes remain explicit
diagnostics. This operation does not reconstruct missing rosters, replace the
remaining nonmissing source disagreements, rerun lineup optimization, rebuild
season/week rollups, or certify the entire historical source as complete and
correct. Counts and recorded-GP checks cannot resolve every possible missing
individual player within a nonempty roster.

After the user confirmed the player-day population, a separate
[season rollup reconciliation](season-rollup-reconciliation.md) recalculated
the six player/team season statistics tables from all 522,233 source rows.
That rebuild was subsequently [rolled back](season-rollup-rollback.md) after
Yahoo evidence exposed non-league game stats in existing player-day inputs.
