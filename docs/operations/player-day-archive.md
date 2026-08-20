# Player-day archive

[Wiki home](../README.md)

The completed-season archive moves the large, immutable
`PlayerDayStatLine` history into a verified local SQLite store while preserving
selected highlights and archive metadata in Convex. Archiving and deleting are
separate decisions.

> **Never begin with source deletion.** Dry-run, apply the archive, run the
> standalone verifier, and confirm backups before considering deletion.

## Storage layout

The default database is:

```text
.local-data/gshl-history.sqlite
```

The directory is gitignored and, in this workspace, resides under the
OneDrive-synchronized repository directory. `GSHL_ARCHIVE_DB_PATH` can override
the database location.

Sibling storage includes:

- `backups/` — checksum-named gzip JSON Lines portable backups
- `convex-snapshots/` — Convex ZIP exports created before source deletion

Keep the SQLite database, portable backups, and Convex snapshots together. A
synced directory is not a substitute for testing restore.

The SQLite database enables foreign keys, a busy timeout, and WAL journaling.
It stores season manifests, canonical player-day rows, and selected highlight
rows. Closing the archive checkpoints the WAL.

## Preconditions

An archive run requires:

- explicit `--target development|production`
- either one `--season-id` or `--all-completed`, but not both
- a season that is inactive and whose end date is in the past
- source player-day rows
- regenerated aggregates that match every live derived row
- no duplicate or stale derived aggregate rows

The season selector accepts a resolved document identity or a legacy identity.
Use the canonical season ID printed by the dry run for later confirmation.

Run all commands in this page from `scripts/`. Examples use `npm.cmd` for safe
argument forwarding in Windows PowerShell; use `npm` in a shell that forwards
the same arguments correctly.

Set the requested season ID before the first dry run. That run prints the
canonical Convex ID; replace this value with the printed ID and repeat the dry
run before any apply command. The quoted value below is a placeholder:

```powershell
$seasonId = "PASTE_CONVEX_SEASON_ID"
```

## 1. Dry-run the archive

```powershell
npm.cmd run stats:archive-player-days -- --target production --season-id $seasonId
```

The dry run:

1. validates season completion
2. reads and canonicalizes source player-day documents
3. computes a source checksum
4. regenerates season aggregates from those rows
5. compares regenerated and live aggregate projections
6. snapshots season activity metadata
7. deterministically selects rating and category highlights
8. prints counts and checksums without creating the archive

If aggregate parity fails, repair and verify the season aggregation before
continuing. Do not bypass the check.

To inspect every completed season without deleting source:

```powershell
npm.cmd run stats:archive-player-days -- --target production --all-completed
```

Apply one season at a time for easier review and recovery.

## 2. Create and register the archive

```powershell
npm.cmd run stats:archive-player-days -- --target production --season-id $seasonId --apply
```

An applied archive:

1. transactionally stores the manifest, canonical rows, and highlights in
   SQLite
2. rereads and verifies the local row count and checksum
3. creates or verifies a gzip JSON Lines portable backup
4. registers the archive manifest in Convex
5. upserts selected highlights and removes stale highlights for the checksum
6. finalizes both remote and local status as verified

Source `PlayerDayStatLine` rows remain in Convex unless deletion is requested
separately.

If a local manifest already has a different source checksum, the command
refuses replacement. `--replace-existing-archive` is an exceptional recovery
option and cannot be combined with source deletion in the same invocation.

## 3. Verify independently

```powershell
npm.cmd run stats:verify-player-day-archive -- --target production --season-id $seasonId
```

The verifier checks:

- SQLite row count and canonical checksum against the local manifest
- portable backup presence and checksum
- Convex manifest source checksum and row count against SQLite

Record the verified status, row count, and checksum in the operator log without
recording secrets.

## 4. Optionally delete Convex source rows

Source deletion is intentionally difficult to invoke:

```powershell
npm.cmd run stats:archive-player-days -- --target production --season-id $seasonId --apply --delete-source --confirm-season-id $seasonId
```

Deletion requires:

- one season, never `--all-completed`
- `--apply`
- `--delete-source`
- an exact `--confirm-season-id` match to the resolved canonical season ID
- source data that still matches the verified archive checksum
- a newly created, non-empty Convex ZIP export
- registered backup name and checksum

Rows are deleted in verified batches. Each remaining document must match its
archived canonical JSON. An interrupted deletion remains in a resumable
`deleting` state; rerunning the same fully confirmed command validates the
matching local archive and continues safely.

After deletion, run the standalone verifier again for checksum and row-count
parity. Separately inspect the remote manifest status and confirm that the
season's source player-day rows are absent; the standalone verifier does not
validate either condition.

## Restore

Restore is dry-run by default:

```powershell
npm.cmd run stats:restore-player-days -- --target development --season-id $seasonId
```

The dry run reports inserts, unchanged rows, and conflicts. It verifies the
local and portable backups before comparing canonical logical documents.

Apply only after reviewing that report:

```powershell
npm.cmd run stats:restore-player-days -- --target development --season-id $seasonId --apply --confirm-season-id $seasonId
```

Applied restore requires an exact confirmation. Existing non-identical rows
are conflicts and abort the restore unless `--replace-conflicts` is explicitly
selected. That flag overwrites conflicting logical rows and must be treated as
a destructive operation.

After upsert, restore rereads the entire season and compares the logical row
count and checksum with the archive before recording completion.

## Dangerous options

| Option                       | Risk and required handling                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--delete-source`            | Removes verified source rows from Convex. Requires archive apply, exact confirmation, and a pre-delete snapshot. |
| `--replace-existing-archive` | Replaces a local archive whose checksum differs. Review both archives and never combine it with deletion.        |
| `--replace-conflicts`        | Replaces non-identical target rows during restore. Review every reported conflict first.                         |
| `--all-completed --apply`    | Writes archives for many seasons. Prefer one season at a time; source deletion is not allowed in this mode.      |

## Failure handling

- **Aggregate drift:** run a scoped `stats:aggregate-season` dry run, review it,
  apply only if authorized, then restart archive preflight.
- **Different local checksum:** preserve the existing archive and investigate
  why source changed. Do not reflexively replace it.
- **Missing or corrupt portable backup:** stop; restore backup integrity before
  any deletion or restore.
- **Source changed after archival:** deletion aborts. Re-run the archive workflow
  from dry-run and compare checksums.
- **Interrupted deletion:** retain all local data and snapshots, then rerun the
  same confirmed command to use the resume path.
- **Restore conflicts:** inspect the dry-run rows and target ownership before
  considering conflict replacement.

## Required verification

For archive code changes, run from `scripts/`:

```bash
npm run test:archive
npm run typecheck
```

For an operational archive, code tests do not replace the season-specific dry
run, standalone verifier, backup inspection, and post-operation verification.

## Related pages

- [`scripts/README.md`](../../scripts/README.md)
- [Data pipelines](data-pipelines.md)
- [Environment](../reference/environment.md)
- [Troubleshooting](troubleshooting.md)
