---
name: gshl-data-operations
description: >-
  Plan, change, or run GSHL operator data workflows. Use for scripts/, backfill,
  migration, repair, data sync/import, reconciliation, aggregation,
  standings/lineup rebuild or backfill, awards rebuild, player bios, Yahoo,
  NHL, Hockey Reference, PuckPedia, production Convex, dry run, --apply,
  archive, restore, archive/data snapshot, source deletion, SQLite, or salary
  history. Do not use for frontend pages, tabs, or display-only work that
  consumes existing data.
metadata:
  short-description: Operate GSHL data commands with target and write safety
---

# GSHL data operations

Read [AGENTS.md](../../../AGENTS.md), the
[data-pipeline guide](../../../docs/operations/data-pipelines.md),
[command reference](../../../docs/reference/commands.md), and the relevant
section of [`scripts/README.md`](../../../scripts/README.md).

## Trace the command

Follow `scripts/src/commands` to its `domains` implementation and then its
`integrations` boundary. Keep parsing, matching, reconciliation, and planning
pure where practical. Keep Convex, Sheets, browser, filesystem, and external
network access in integrations or command orchestration.

## Mutation protocol

The scripts package defaults its Convex target to production. Before any run:

1. Resolve and state the exact target, season/week/date scope, source, and
   intended writes.
2. Run `--help` if flags are not already verified from code. On Windows
   PowerShell, use `npm.cmd run <command> -- --help`; the current `npm.ps1`
   wrapper can consume forwarded flag names. If the package entry contains
   `--use-system-ca`, first verify that the `node` runtime seen by the package
   exposes that flag; Node 20 does not.
3. Run the dry-run form and inspect counts, unmatched/ambiguous identities,
   samples, and deletion/replacement plans.
4. Apply only with user authorization, an explicit target, and the narrowest
   scope.
5. Rerun dry-run or parity checks to demonstrate idempotency and inspect saved
   reports/artifacts.

Do not treat a code-edit request as permission to write production data.

`npm run convex:migrate` is the destructive exception: it has no dry-run or
`--apply` gate, ignores the package's normal target selector, reads its exact
target only from `NEXT_PUBLIC_CONVEX_URL`, and clears all mapped tables before
its first Sheets read. Never run it without explicit URL/target confirmation
and a verified backup.
Likewise, do not delete archive sources or use `--replace-existing-archive` or
`--replace-conflicts` without the confirmations and backups in the
[archive guide](../../../docs/operations/player-day-archive.md).

Two broad apply behaviors require explicit review: `stats:aggregate-season
--apply` deletes stale derived rows unless `--preserve-stale` is passed, and
`player-bios:sync --apply` intentionally clears stale managed fields and can
deactivate players that meet its guarded inactivity rules.

Preserve throttling, retry, host allowlists, dry-run defaults, and secret
redaction. Never print cookies, headers, credentials, server secrets, or raw
authenticated pages.

## Verify changes

Run `npm --prefix scripts run typecheck` plus the smallest relevant packaged or
direct `tsx --test` suite. For ranking or power behavior, also use the
`gshl-ranking` workflow and runtime parity check.
