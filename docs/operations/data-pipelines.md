# Data pipelines

[Wiki home](../README.md)

GSHL currently spans Convex, a Next.js application, local operator tooling,
Google Apps Script, Google Sheets, and several external hockey data sources.
These runtimes have deliberate but different responsibilities.

## System boundaries

```text
External sources
  ├─ Yahoo Fantasy
  ├─ NHL API
  ├─ Hockey Reference
  └─ PuckPedia
       │
       ├─ local scripts ────────────────┐
       ├─ managed Convex source capture │
       └─ Apps Script active-season flow│
                                        ▼
Google Sheets compatibility ──────── Convex
                                        │
                                        ▼
                                  Next.js application
```

This diagram describes available paths, not one universal source of truth for
all operations:

- The Next.js data adapter defaults to Convex and retains Sheets compatibility.
- `scripts/` is the main home for historical repair, backfill, migration,
  parity, maintenance, and archive work.
- `apps-script/` remains the production writer for the active-season Sheets
  pipeline.
- Convex managed jobs provide run state, scheduling, locks, events, artifacts,
  and external task leasing. Several processors are still parity-stage
  implementations; see [Managed jobs](managed-jobs.md).

## Application data access

The browser uses a Convex React provider. Server-side data adapters under
`src/lib/data/` call protected Convex functions. The older Sheets reader and
writer remain under `src/lib/sheets/` for compatibility and migration paths.

`GSHL_DATA_BACKEND` selects the active adapter. Direct Sheets writes are
blocked when the Convex backend is selected; code should use the data adapter
instead of bypassing that boundary.

The shared frontend database types and scripts database types still contain
legacy identifiers because imported records and cross-runtime reconciliation
must map old IDs to Convex document IDs.

Generic Convex writes to player-day, player-week, team-week, or matchup rows
schedule the affected week's League Wire materializer. The materializer uses
idempotent source keys, so retries update the same durable roster move, weekly
missed-start report, matchup final, league-wide Three Stars, or power-ranking
post instead of duplicating it.

## Operator-script model

Run scripts from `scripts/`. The package is intentionally independent from the
Next application build and Apps Script deployment.

Common command families are:

- player identity, biography, contract, eligibility, ownership, and salary
- player and team rating rebuilds and parity checks
- standings, awards, power, and lineup repair
- season aggregation from player-day source rows
- Yahoo, NHL, Hockey Reference, and PuckPedia reconciliation
- completed-season archive, verification, deletion, and restore
- legacy Sheets-to-Convex migration

Use the [command index](../reference/commands.md) to choose a command, then read
[`scripts/README.md`](../../scripts/README.md) and the command's `--help` output
for current flags and scoped examples.

### Standard write workflow

For commands that implement dry-run behavior:

1. Confirm the working directory and data target.
2. Run the narrowest possible season, week, team, matchup, player, or date
   scope without `--apply`.
3. Review counts, warnings, unmatched identities, proposed deletes, and the
   generated report artifact.
4. Resolve ambiguity or drift before writing.
5. Repeat the same scope with `--apply` only after authorization.
6. Repeat the dry run or a parity check to prove idempotency.

On Windows PowerShell, use `npm.cmd run <command> -- --flags` and verify the
command's help/argument summary before applying; the current `npm.ps1` shim can
consume forwarded flag names.

Do not generalize this pattern to every command without checking its entry
point. The migration command is a destructive exception.

## Destructive Sheets-to-Convex migration

> **Warning:** `npm run convex:migrate` has no dry-run and no `--apply` gate.
> It clears every mapped target Convex table before importing Sheets data.

The migration:

1. forces the source backend to Sheets
2. resolves its target from `NEXT_PUBLIC_CONVEX_URL`
3. authenticates protected mutations with `CONVEX_SERVER_SECRET`
4. clears mapped Convex tables in reverse dependency order
5. imports models in dependency order and rewrites known relationships
6. writes `reports/convex-migration-latest.json`

Never run it merely to test connectivity. Require explicit authorization,
verify the endpoint independently, create a recoverable target backup, and
ensure no concurrent writer is active.

## Season aggregation

`stats:aggregate-season` rebuilds derived rows from `PlayerDayStatLine` and can
refresh:

- player day, week, split, total, and career aggregates
- team day, week, and season aggregates
- NHL season totals from Hockey Reference
- standings and matchup score/rank fields
- entering-week power snapshots

Applied runs remove stale derived rows by default unless `--preserve-stale` is
selected. Archive preflight regenerates these same aggregates and requires them
to match live rows before a completed season can be staged.

## External-source workflows

### Yahoo

Yahoo workflows support cookie or header inputs and browser fallback. The
daily matchup reconciliation path targets Convex directly, reports proposed
creates, updates, deletes, and investigation cases, and is dry-run by default.
The weekly validator compares player and matchup totals and can repair only
the supported fields it reports.

Yahoo can reject direct requests or require an authenticated challenge. Use
the existing authenticated browser profile or the managed browser worker; do
not add credentials to source or reports.

### NHL API

The Python helper provides player identity history and daily NHL boxscores.
The daily sync updates existing `PlayerDayStatLine` records and does not create
missing rows. Optional aggregation is a downstream phase, not a substitute for
missing source records.

### Hockey Reference

The season-total backfill matches external rows to GSHL players and writes
`PlayerNHLStatLine`. Season aggregation may invoke the same authoritative
refresh unless explicitly skipped.

### PuckPedia and salary history

The player-bio sync reconciles current contracted-player data, authoritative
bio and contract fields, salary seasons, position eligibility, ownership, and
lineup placement. Identity and ownership conflicts abort before writes.
An applied run deliberately clears stale managed bio/team/contract fields and
can deactivate players that satisfy the guarded current/previous-season
inactivity test. Review those audit decisions, not only inserted/updated counts.

The separate salary-history importer accepts the checked local JSON input,
resolves a player by stable identifiers or a unique normalized name, and
refuses all writes if any row is unmatched or ambiguous.

## Ranking and power runtime

The hand-edited Apps Script-compatible runtime lives under
`scripts/src/runtime/apps-script/`. Local scripts load it for rebuild and
parity work. The deployed copies under `apps-script/` are synchronized output.

The synchronized set contains `PowerRankingsAlgo.js` plus `config.js`,
`player-pure.js`, `team-pure.js`, and `index.js` under `RankingEngine/`.

After changing a source runtime file:

```bash
npm run ranking-engine:sync
npm run ranking-engine:check
```

Run the relevant rating or power tests and parity command as well. See
[Ranking engine](../RANKING.md) for the scoring model.

## Reports and artifacts

Operator commands commonly write JSON reports under `scripts/reports/`.
Yahoo parser debugging can also write raw HTML. Treat reports as operational
artifacts: inspect them for secrets or personal data before sharing or
committing them.

Managed jobs store run events, artifacts, child runs, and external tasks in
Convex. A successful source-capture job means the capture completed; it does
not necessarily mean league tables were mutated.

## Related pages

- [Managed jobs](managed-jobs.md)
- [Apps Script](apps-script.md)
- [Player-day archive](player-day-archive.md)
- [Environment](../reference/environment.md)
- [Troubleshooting](troubleshooting.md)
