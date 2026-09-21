---
name: gshl-data-operations
description: >-
  Change or run GSHL operator workflows under scripts/, including imports,
  backfills, repairs, reconciliation, archives, external hockey sources, or
  production Convex data. Use whenever a command may read or write live data.
metadata:
  short-description: Operate GSHL data commands safely
---

# GSHL data operations

Read the relevant command section in [`scripts/README.md`](../../../scripts/README.md).
Trace its entry point from `scripts/src/commands` through `domains` to
`integrations`; complete the trace when inputs, target selection, writes, and
dry-run behavior are accounted for.

## Run protocol

For a write-capable command:

1. Resolve and state the exact environment, deployment, season/week/date scope,
   source, and proposed writes.
2. Verify the command's current `--help`. In Windows PowerShell use
   `npm.cmd run <command> -- --help`. If the package script includes
   `--use-system-ca`, confirm the selected Node runtime supports that flag.
3. Run the narrowest dry run. Review counts, samples, unmatched identities,
   conflicts, deletions, and replacement plans.
4. Apply only when the user authorized the write and the target matches step 1.
5. Repeat the dry run or parity check until the result proves idempotency or the
   intended remaining delta.

Keep parsing and reconciliation pure; keep Convex, browser, filesystem,
and network access at integration boundaries. Preserve throttling, retries,
allowlists, dry-run defaults, and secret redaction.

## Hard stops

- Archive source deletion, `--replace-existing-archive`, and
  `--replace-conflicts` require explicit authorization and a verified backup.
- `stats:aggregate-season --apply` can delete stale derived rows unless
  `--preserve-stale` is set.
- `player-bios:sync --apply` can clear managed fields and deactivate eligible
  stale players.
- `CONVEX_SERVER_SECRET`, cookies, OAuth material, headers, and authenticated
  page contents never belong in output or artifacts.

Verify with the direct tests that own the changed behavior. Add the scripts
type-check or a grouped suite only when shared types or behavior changed.
