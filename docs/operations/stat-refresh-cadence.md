# Stat refresh cadence

The operator runner uses Toronto time with daylight-saving transitions.

| Data                                                                            | Frequency                                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Player days, player weeks, team days, team weeks and their contribution ratings | Hourly during the day; every five minutes during LIVE/CRIT NHL games    |
| Yahoo rosters and lineup metadata                                               | Hourly, 08:00–22:00, until the scoring date is locked                   |
| Player splits/totals, team seasons and native/rated careers                     | Overnight, after all active games from the previous scoring date finish |
| NHL player/team season stats and NHL category season ratings                    | Same completed-slate overnight stage                                    |

The five-minute trigger polls public NHL states, then skips work that is not due.
It excludes All-Star and preseason games. After midnight it checks both calendar
dates so late games keep the frequent refresh active. Postponed/cancelled games
and known empty slates permit overnight work; unknown or unfinished states do
not. The overnight completion marker advances only after both GSHL and NHL
stages succeed. Failed stages retry, including a final-season two-day grace
window. The NHL season end can extend past the fantasy week calendar.

Frequent calculation reads only affected weeks, retaining prior-date context
for acquisition flags. It updates the four rating fields together and preserves
native player-day source cells. Non-live hourly correction passes revisit the
two most recent open matchups. Overnight GSHL calculation reads the entire season
and composes careers from historical season periods plus the fresh current one.
Eliminated playoff teams do not require fabricated roster days.

The Windows runner has process and task overlap protection and uses the signed-in
operator's existing Yahoo profile and Convex CLI authentication. It stores no
credentials in task arguments. The PC must be awake, connected and signed in.
After final-stat reconciliation, the installed stat task finalizes ended matchups,
refreshes standings and entering-week power, then releases their Press Box editions.
Its season calendar is explicit; configure the next season when its weeks exist.

Use the installer script's preview and the commands' help for invocation details.
Checkpoint, log and status files live under `.local-data/yahoo-sync/`. Initial
setup proofs and readbacks are under `.local-data/stat-refresh-20261020/`.

## NHL model boundary

Official NHL native stats and category ratings refresh nightly. The immutable
reviewed hockey-model publication workflow requires a separate model rebuild
and reviewed publication when source statistics change. The nightly stat job
clears stale hockey contributions to null with an explicit status rather than
pretending an old model covers new games. It does not overwrite authoritative
model records, salaries or fantasy rights. See [NHL nightly details](nhl-nightly-refresh.md).

## Transport and validation

The direct Node TSX loader retains `--use-system-ca`; the TSX CLI subprocess
dropped that flag in the tested Windows runtime. Python uses a verified SSL
context with OS roots. Neither path disables certificate checks for the task.
Focused tests cover timing, midnight/DST, final-slate gates, partial scope,
acquisition boundaries, roster participation, official-stat reconciliation,
identity intake, protected fields and deployment allowlists.

## Activation on October 20, 2026

The Windows task `GSHL-Stats-polished-tern-709-m9774darbpss4t79nxdbe871318and9f`
was enabled with a five-minute repeating trigger. It targets production
`polished-tern-709`, Yahoo league 44541 and the 2026–27 GSHL season. The fantasy
calendar runs September 29 through April 10; NHL season refresh continues
through April 19. Its first unattended cycle completed successfully, and the
following trigger exited successfully without source requests because no work
was due. The schedule uses Toronto time for its work policy.

The initial NHL refresh verified 763 player season rows and 32 NHL team season
rows after writing. Seven player season rows were new. Official identity intake
created Cole Knuble's canonical player record from his verified NHL identity.
An independent comparison confirmed that protected fields on all 756 existing
current-season NHL rows were preserved. The 40,233 authoritative hockey-model
records were outside the write target.

The initial full GSHL reconciliation completed successfully from 4,916 stored
current-season player days. It initialized ratings on 225 new roster days and
updated affected period/career rows without deleting rows. The source pass also
accepted four official NHL daily-stat corrections. Subsequent frequent runs
reconcile those native statistics and their ratings together. Career contribution
totals include the refreshed current season.

A fresh read-only replay of the current matchup found no remaining daily-rating
changes across 450 player days and exact stored values for 225 player weeks,
28 team days and 14 team weeks. An independent career check rebuilt all 13,045
careers from the 16 seasons' published player splits/totals: 380,170 native and
metadata fields matched, including every GP/GS value. Another 52,180 rating-field
checks matched exact published season contributions and appearance counts.
These checks performed no production writes.

Of the 1,201 career-total updates in the initial reconciliation, 1,197 only
reordered metadata arrays without changing their members. The remaining four
included official HIT/BLK/SOG corrections and their contribution ratings. No
career GP/GS values changed. The independent before/after explanation is retained
with the career audit.

Partial postseason imports use only active matchup teams for fetching and all
three roster plans. They preserve eliminated-team rows and skip global ownership,
buyout and optimizer maintenance, preventing an empty eliminated roster from
becoming a set of player drops.

Verification included the 39-test ranking-engine contract suite, the 44-test
timing/NHL/deployment group, 20 calendar/roster tests, three Python eligibility/TLS
tests, focused backend tests and scoped strict operator TypeScript. The full
application build was not required for this operator/backend change. The broad
scripts typecheck has an existing computed-key error in
`retrospective-audit-compatibility.test.ts`; the scoped check passes. Operator
files are excluded by the repository ESLint configuration.

Retained evidence includes the first-run log/status, GSHL apply summary, NHL
before/after snapshots, independent protected-field comparison and deployment
plans under `.local-data/stat-refresh-20261020/`. Independent copies are under
`C:/Users/choug/gshl-backups/stat-refresh-20261020/`.

## Windows host transfer

The original PC's task was disabled on October 20 at the user's request because
that computer is not reliably online. It was idle at cutover; no run needed to be
stopped. The five-minute production schedule is not active on that PC. Production
code and previously reconciled statistics remain deployed.

The prepared transfer bundle is
`.local-data/stat-refresh-transfer-20261020.zip`. It contains verified copies of
the frozen category corpus/calendar, a resume checkpoint, installation/preview
scripts and setup instructions for the other Windows computer. It excludes all
credentials and browser profiles. The bundle is needed in addition to a Git
checkout because the frozen reference files are not stored in Git. Its installer
rewrites reference paths for the destination checkout and defaults to local file
preparation plus a task preview. Only its explicit `-Apply` installs a task.

The destination needs its own Convex login and Yahoo importer browser session,
plus Node/Python dependencies. Run a read-only daytime preview before installing
and inspect the first scheduled status afterward. Keep the original task disabled
and use only one production scheduler. The user confirms that jobs already run
on the destination computer; its current scheduler health has not been verified
from this workspace.

## Roster recovery on October 21, 2026

The agent incorrectly interpreted the repair request as authorization to resume
recurring updates on the original PC. After the user clarified that another
computer already runs the jobs, the task on `DUTCHGRAM` was disabled again and
verified idle. Keep this computer's task disabled. Reliability must be checked
on the destination computer; a successful local run does not establish the
destination scheduler's health.

The app had missed Dutch Rudders' drops of Owen Tippett and Mikael
Backlund and additions of Josh Anderson and Michael Brandsegg-Nygård. An
all-team preview also exposed a missing Yahoo identity: the roster displayed
"M. Brandsegg-Nygård" while its player link's title contained his full name.
The importer now reads that full-name title, falling back to visible text,
so the existing unique exact-name reconciliation can resolve missing IDs
without matching initials approximately. His missing Yahoo ID was filled after
verifying the unique canonical player and source identity.

The applied current-day reconciliation created 226 roster days and updated
13 players across 14 teams, with no contract buyouts. An independent readback
verified every roster-day ownership assignment and confirmed Tippett's owner,
team and lineup position were cleared. A fresh Yahoo preview reported 226
unchanged days and zero remaining player changes or conflicts.

The Windows wrapper now supplies an independent recovery directory under
`~/gshl-backups/yahoo-sync` to the existing backed-up reconciliation workflow.
Previously, its missing recovery configuration would block subsequent same-day
drops when superseded player-day rows already existed. Source confirmation,
hash-verified backup and exact-document checks remain required before removal.
The backend removal function was verified present in production; no backend
deployment was needed for this recovery.

Player/contract/day snapshots and task/checkpoint backups are retained outside
OneDrive in `C:/Users/choug/gshl-backups/roster-recovery-20261021/`. The name
regression failed before the parser change and passed afterward. The focused
35-test roster, maintenance, schedule, backup and verified-removal group passed.
PowerShell parsing and changed TypeScript formatting were checked. Operator
files are excluded by repository ESLint configuration; no application build,
architecture check or ranking contract check was needed for these changes.

The complete applied Windows scheduled cycle finished successfully at
11:49 a.m. Toronto on October 21, with Task Scheduler result 0. Its checkpoint
advanced through October 20 with the October 21 morning recheck complete.
The October 20 source reconciliation added four missing rows, updated eight
and removed the two superseded Dutch Rudders rows after source reconfirmation
and a verified independent backup. Final readbacks verified 227 October 20 rows,
226 October 21 rows, initialized current-day ratings and no stale ownership.
