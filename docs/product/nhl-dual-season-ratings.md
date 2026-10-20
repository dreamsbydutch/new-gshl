# NHL season ratings through hockey and fantasy lenses

The [complete season-stat cleanup](nhl-season-stat-cleanup.md) is the latest
operation. Production now has 13,915 canonical positive-GP rows across all
14 played seasons, including 756 rows for 2026-27. It repairs source statistics,
identities and duplicate populations as well as replaying both ratings. All-row
production readback, full-table parity and backend idempotency verification have
passed with zero remaining changes. The counts and preservation statements below
record the earlier association-only rollout and are historical.

Each existing `playerNhlStatLines` row receives a `hockeyRating` association beside
its existing GSHL category `seasonRating`. The hockey contribution is the reviewed
model's signed goals above a same-position replacement reference; it is not a
win-unit WAR conversion. Sustainable hockey ability remains separate in the
authoritative model. Fantasy `overallRating` remains multi-season talent and
does not become the hockey contribution.

The category engine uses G/A/P/PPP/SOG/HIT/BLK for skaters and W/GAA/SVP for goalies,
with the existing position comparison pools and scoring profiles. A fresh replay
of all 13,302 existing NHL season stat lines exactly matched every stored category
score. This uses the current NHL fantasy profile consistently across history;
it does not reconstruct past league category rule changes.

The hockey association retains the authoritative source ID, model, signed goal
value, rank, qualification, source date, source games and position, and reasons.
Provisional or otherwise unsupported values remain null. A source/stat exposure
conflict also withholds the hockey score. Zero-game placeholders retain an
explicit no-games status. None receives an invented ranked contribution.

The identity review found 25 rows whose original references did not identify
their true statistical season. Reviewed source associations match all known
shared native integer stats and exact ice time rounded to two decimals, and
must uniquely identify one official player-season. Eighteen use complete shared
fingerprints; seven disclose one unknown category and verify every other known
field. Unknown counts never become zero. Goalies require at least five known
counts including GP/GA/SV/SA; skaters require six including GP/G/A/P/SOG. Twenty-four
have exact teams. One Boedker row has a contradictory stored team and six other
seasons corroborating the same dangling legacy reference; that conflict is
explicitly retained. Player identities and source stats are not repaired by this
rating association.

Richard Bachman's 2014–15 games played and an unlinked Sergei Murashov row's
saved-shot totals conflict with the official source. Their hockey values stay
unavailable pending stat/identity reconciliation. Existing duplicates are
preserved and must not be counted twice in downstream player totals.

The operator runs bounded season reads, all-batch preflight, full live population
comparison before applying, per-row optimistic concurrency checks, and exact
post-read preservation and idempotency checks. Only `hockeyRating` and, if the
category replay changes, `seasonRating` may be patched. Source stats, player
references, salary, multi-season fantasy talent, timestamps and all original
`nhlSeasonValues` remain unchanged. Reconciliation is explicit operator work;
this rollout does not schedule automatic refreshes.

Existing reviewed-source associations require explicit fresh review evidence on
every reconciliation; a later ordinary run cannot silently replace them through
the unresolved canonical reference. Source-cache identity includes both path and
expected SHA, so every claimed source hash is enforced.

Production coverage on October 19, 2026 is 13,302 stat lines across 2013–14 through
2025–26: 10,007 qualified hockey scores, 3,168 provisional assessments, 125 no-game
placeholders, one source-exposure conflict and one unresolved player. All 13,302
retain finite GSHL category scores. The 2026–27 season has a separate dated hockey
model snapshot but no `playerNhlStatLines` rows; this reconciliation does not
create season stats. The two future seasons remain empty.

Exact post-write reads preserve every original stat-line field except the added
hockey association; all category scores were already current and remain
unchanged. All 40,233 authoritative hockey model rows, including legacy versions,
also match their independent pre-write snapshots in every field.
The all-row production replay covers all 13,302 lines and proposes zero changes.

Verification passed 82 focused/shared tests covering backend reconciliation,
legacy import/finalization, deployment preservation, category replay, identity
evidence and the ranking-engine contract. Scoped strict TypeScript, lint on
changed lintable backend files, formatting and focused diff checks passed.
Operator files are excluded by the repository's ESLint policy; no frontend build
was run because this task changes database/operator behavior and type-only
frontend contracts.

The scoped backend deployment adds only optional `playerNhlStatLines.hockeyRating`
and the reviewed reconciliation logic. Its post-deploy dry run has no remaining
module changes. No frontend deployment is part of this database operation.

Local audit evidence lives under
`.local-data/nhl-rating/dual-rating-audit-20261019/`. Independent before/after
snapshots and verified manifests live outside the workspace and OneDrive under
`C:/Users/choug/gshl-backups/nhl-dual-ratings-20261019/`. The earlier NHL model
archive remains separate. These backups preserve this data operation and its
sources; they do not claim to be a standalone application restore.
