# Nightly NHL season statistics

`scripts/src/commands/stats/refresh-nightly-nhl-stats.ts` owns the nightly NHL
refresh. Its help output documents the invocation. The command defaults to a
read-only production preflight; the separate cycle runner decides when to apply.
GSHL player-day and rollup refreshes have their own cadence.

The source is the official NHL regular-season statistics API, joined by NHL
player and team IDs. A public team directory supplies team abbreviations for
canonical `nhlTeams` links. `nhlTeamSeasonStatLines` stores season records and goal
totals; `nhlTeams` remains the team directory. Positive-game players are inserted
or updated in `playerNhlStatLines`. A new debutant's official NHL ID, summary
name and position must agree with the official landing page and valid birth
date before creating an unowned player without signing rights. Existing names
can be linked only with a unique exact name, birth date and role match and no
assigned conflicting NHL ID. Ambiguous identities stop for review; no name-only
merge or player deletion is performed.

Every active regular-season or playoff game on the requested NHL calendar day
must be final with an ordinary resolved schedule state. A confirmed empty or
exhibition-only slate, or games explicitly marked PPD/CNCL, allows the full-season
refresh to proceed. Live or unknown states defer the job. A deferred apply exits nonzero
so the cycle runner cannot mark the nightly job complete. This job refreshes
regular-season totals even when the requested date contains playoff games.

Before any writes, the job checks that team appearances equal twice the completed
regular-season game count, that every completed game has two official goalie
starters, and that every goalie's per-game GP/GS/GA/SV/SA totals equal the season
report. Skater summary, TOI and realtime reports must have identical player
populations and GP. The requested day's schedule is checked again after source
collection. These checks detect several common forms of report lag; the NHL
does not provide a transaction spanning all public reports.

Category `seasonRating` is recalculated using the existing PlayerNHL engine and
the entire official season cohort. QS and RBS use the established starter-level
policy: QS when save percentage reaches the season league average, or reaches
.885 on at most 20 shots; RBS below .85. Zero-shot starts are neither QS nor RBS.
Official GA+SV discrepancies with SA are preserved, and undefined save percentages
remain null.

This job does **not** refit the reviewed holistic hockey model. Existing hockey
contributions remain usable only when the existing reviewed association, native
stat fingerprint and source exposure still match. Changed native stats clear the
contribution and rank to null with an explicit stale-source reason; they do not
become fabricated current hockey values. A later identical refresh cannot revive
a stale association. The reviewed build/publication workflow must supply a new
hockey model before that contribution can be restored.

Every run retains its source responses, source SHA, full preimage, proposed
fields, identity evidence and result under a new local audit directory. Identity
creation/linking checks the full canonical ID population first. A dry run with
pending identities calculates the complete proposed cohort locally and explicitly
defers stat-batch preflight until real canonical IDs exist. Applied runs resolve
those identities, reread the snapshot, then preflight every stat batch.
Writes use bounded batches
and compare the full season rating population, individual rows and season
configuration against the reviewed snapshot. Older source timestamps are
rejected. Applied rows are reread and checked against the plan. Salaries,
overall ratings, legacy IDs, timestamps and authoritative `nhlSeasonValues`
are outside the managed field set. A failure between batches can leave a partial
refresh; the job remains incomplete and a fresh run rebuilds its plan from the
current database state. Current-season snapshots are labeled by actual fetch
time, rather than claiming historical point-in-time availability.
