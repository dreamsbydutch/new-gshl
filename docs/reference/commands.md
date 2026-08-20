# Command reference

[Wiki home](../README.md)

This page is the package-level command index. Run each command from the stated
working directory. For operator command flags and scoped examples, use
[`scripts/README.md`](../../scripts/README.md); this reference intentionally
does not duplicate that changing CLI surface.

The repository declares npm 10.1.0; verify the resolved version. On Windows
PowerShell, use `npm.cmd run <script> -- --flag` for commands with forwarded
arguments. The current `npm.ps1` shim can consume names such as `--help` and
`--season-id`, so validate the command's help output before any apply run.

Node 20 is the root/CI baseline. Operator entries that include
`--use-system-ca` require a Node runtime that supports that flag; verify it in
the same shell before running the command. See
[Local development](../getting-started/local-development.md).

## Root application commands

Run these from the repository root.

| Command                        | Actual purpose and scope                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`                  | Install root application dependencies.                                                                                                                                    |
| `npm run dev`                  | Start `next dev --turbopack`.                                                                                                                                             |
| `npm run build`                | Run a production Next.js build.                                                                                                                                           |
| `npm run build:profile`        | Build Next.js and write `.next/performance/build-profile.json` with duration and asset-size data.                                                                         |
| `npm run start`                | Start an existing production build.                                                                                                                                       |
| `npm run preview`              | Build, then start the production server.                                                                                                                                  |
| `npm run check`                | Run the frontend architecture checker, ESLint over `src` and top-level `convex/*.ts`, then the root TypeScript check. It does not run tests, formatting, or ranking sync. |
| `npm run check:architecture`   | Enforce the repository's frontend folder, naming, type-placement, and import-boundary rules.                                                                              |
| `npm run lint`                 | Run cached ESLint over `src` and top-level `convex/*.ts`.                                                                                                                 |
| `npm run lint:fix`             | Apply ESLint fixes in the same scope.                                                                                                                                     |
| `npm run typecheck`            | Run `tsc --noEmit` for the root project; `scripts/` is excluded.                                                                                                          |
| `npm run format:check`         | Check Prettier for `ts`, `tsx`, `js`, `jsx`, and `mdx`. Ordinary Markdown, JSON, YAML, and CSS are outside the script glob.                                               |
| `npm run format:write`         | Write Prettier changes in that same narrow scope.                                                                                                                         |
| `npm run test:conference`      | Run the conference-contest utility test.                                                                                                                                  |
| `npm run test:owners`          | Run the owner-rankings utility test.                                                                                                                                      |
| `npm run test:performance`     | Run the pagination helper test; the script name is legacy.                                                                                                                |
| `npm run ranking-engine:check` | Hash-check the five synchronized Apps Script runtime file pairs.                                                                                                          |
| `npm run ranking-engine:sync`  | Copy the five source runtime files to `apps-script/`, then verify hashes.                                                                                                 |

The sync set contains `PowerRankingsAlgo.js` and the four files in
`RankingEngine/`.

## Convex lifecycle commands

These are direct Convex CLI commands rather than package scripts.

| Command                                           | Purpose                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npx convex codegen`                              | Regenerate local `convex/_generated/` bindings without modifying a deployment.                          |
| `npx convex dev`                                  | Push to the configured development deployment, regenerate bindings, and watch for changes.              |
| `npx convex deploy`                               | Deploy the current Convex functions and schema.                                                         |
| `npx convex env set CONVEX_SERVER_SECRET <value>` | Set the matching server secret in a Convex deployment. Never record the value in documentation or logs. |

`convex.json` contains only the Convex schema reference. It does not encode a
known production deployment name.

## Operator scripts

Run these from `scripts/`.

### Player identity, biography, and salary

| Command                                  | Purpose                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run player-bios:sync`               | Reconcile PuckPedia player identity, biography, contract and salary data; Yahoo position eligibility; current ownership; and optimized lineup positions. |
| `npm run nhl-salaries:import`            | Validate and import `salaryHistory.json`; identity ambiguity or missing identity aborts all writes.                                                      |
| `npm run player-bios:backfill-nhl-ids`   | Backfill NHL API IDs using the Python NHL helper.                                                                                                        |
| `npm run player-bios:backfill-yahoo-ids` | Backfill historical Yahoo player IDs.                                                                                                                    |

### League calculations

| Command                        | Purpose                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `npm run awards:backfill`      | Rebuild player and team awards.                                                                  |
| `npm run standings:backfill`   | Rebuild matchup scores, rank snapshots, and season standings.                                    |
| `npm run lineup:update-all`    | Recalculate player-day lineup fields.                                                            |
| `npm run ratings:backfill`     | Recompute player ratings for one season.                                                         |
| `npm run ratings:rebuild-all`  | Recompute player ratings across multiple seasons.                                                |
| `npm run ratings:rebuild-team` | Rebuild team day, week, and season ratings; unscoped runs also refresh season-wide power output. |
| `npm run ratings:parity`       | Compare local player-rating output with Apps Script.                                             |
| `npm run power:rebuild`        | Recompute entering-week power snapshots and matchup ranking fields.                              |
| `npm run power:parity`         | Compare local power output with Apps Script.                                                     |

### Statistics and external-source repair

| Command                                     | Purpose                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run stats:aggregate-season`            | Rebuild player and team aggregates, NHL totals, standings, matchup fields, and power output from player-day rows. |
| `npm run stats:backfill-hockey-reference`   | Reconcile Hockey Reference season totals into player NHL stat rows.                                               |
| `npm run stats:backfill-yahoo-matchup-days` | Reconcile Yahoo daily matchup data with Convex player-day rows.                                                   |
| `npm run stats:backfill-yahoo-rosters`      | Legacy alias for `stats:backfill-yahoo-matchup-days`.                                                             |
| `npm run stats:debug-yahoo-matchup-table`   | Save raw Yahoo matchup HTML and a parser diagnostic report.                                                       |
| `npm run stats:sync-nhl-daily`              | Refresh existing player-day rows from NHL boxscores.                                                              |
| `npm run yahoo:check-weekly-player-days`    | Compare Yahoo weekly results and optionally repair supported player-day and team-week fields.                     |
| `npm run yahoo:check-weekly-matchups`       | Legacy alias for `yahoo:check-weekly-player-days`.                                                                |

### Archive and migration

| Command                                   | Purpose                                                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run stats:archive-player-days`       | Dry-run or create a verified completed-season SQLite archive. Source deletion is a separate confirmed mode.                         |
| `npm run stats:verify-player-day-archive` | Verify local archive rows, portable backup, checksum, and remote manifest.                                                          |
| `npm run stats:restore-player-days`       | Dry-run or restore player-day rows from the archive.                                                                                |
| `npm run convex:migrate`                  | Use `NEXT_PUBLIC_CONVEX_URL`, clear every mapped target table, then repopulate it from Sheets. No dry-run or `--apply` gate exists. |

> **Destructive exception:** `npm run convex:migrate` begins by clearing mapped
> Convex tables before its first Sheets read. It bypasses the usual scripts
> target selector and uses only `NEXT_PUBLIC_CONVEX_URL`. Never run it without
> explicit authorization, exact URL/target verification, and a recoverable backup.

See [Player-day archive](../operations/player-day-archive.md) before using any
archive deletion, replacement, conflict replacement, or restore mode.

### Worker, synchronization, and checks

| Command                        | Purpose                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run worker:browser`       | Lease managed external-source tasks and return bounded browser captures to Convex. |
| `npm run ranking-engine:check` | Check the same five shared runtime pairs as the root command.                      |
| `npm run ranking-engine:sync`  | Synchronize and verify those runtime pairs.                                        |
| `npm run test:power`           | Run power and season-aggregation tests.                                            |
| `npm run test:player-bios`     | Run the player maintenance and Yahoo ID test group.                                |
| `npm run test:archive`         | Run archive-domain and SQLite archive tests.                                       |
| `npm run typecheck`            | Type-check the scripts package with its own `tsconfig.json`.                       |

Most write-capable scripts are dry-run by default and require `--apply`; this is
not universal. Always check the current command help and
[`scripts/README.md`](../../scripts/README.md).

## Python prerequisite

From the repository root:

```bash
python -m pip install -r scripts/python/requirements.txt
```

## Apps Script commands

Run these from `apps-script/`.

| Command          | Purpose                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `npm install`    | Install the local `clasp` development dependency.                                        |
| `npm run login`  | Authenticate `clasp`.                                                                    |
| `npm run create` | Create a standalone project titled “GSHL Cron Jobs.”                                     |
| `npm run push`   | Push the local Apps Script project.                                                      |
| `npm run deploy` | Push the project and print a success message; it does not create a versioned deployment. |
| `npm run open`   | Open the connected Apps Script project.                                                  |
| `npm run logs`   | Read Apps Script logs.                                                                   |

Read [Apps Script operations](../operations/apps-script.md) before deploying.

## Related pages

- [Local development](../getting-started/local-development.md)
- [Verification](../operations/verification.md)
- [Data pipelines](../operations/data-pipelines.md)
- [Deployment](../operations/deployment.md)
