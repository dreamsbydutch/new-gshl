---
name: gshl-data-operations
description: >-
  Change, review, or execute GSHL operator workflows. Use for scripts-package
  commands, imports, reconciliation, rebuilds, backfills, archives, restores,
  external hockey sources, or any scoped production-data operation. Exclude
  display-only work over existing data.
metadata:
  short-description: Operate GSHL data commands with target and write safety
---

# GSHL data operations

The outcome is either a reviewed code change or an auditable run. A run is
auditable only when its target, scope, read/write plan, authorization, and
postcondition are all explicit.

## Build the execution model

Read the relevant portions of the
[pipeline guide](../../../docs/operations/data-pipelines.md),
[command reference](../../../docs/reference/commands.md), and
[`scripts/README.md`](../../../scripts/README.md). Trace the command entry point
through its domain planner to every integration. Before changing or running it,
account for:

- how the target is resolved, including defaults and environment fallbacks;
- sources read and systems written;
- scope keys such as season, week, date, team, or player;
- dry-run/apply defaults, destructive branches, and saved artifacts; and
- retry, throttle, identity-match, and conflict behavior.

Keep parsing and reconciliation pure; keep Convex, Sheets, browser, filesystem,
and network effects at integration or orchestration boundaries.

## Choose the branch

**Code or review only:** edit and test locally. A request to change code does
not authorize a remote run. Exercise `--help` or a local fixture when useful;
do not turn verification into a production dry run.

**Read or dry run:** state the exact resolved target and scope before execution.
Confirm the command's current `--help` and source rather than relying on a
remembered flag. On PowerShell, use `npm.cmd` for forwarded flags. If the
package script contains `--use-system-ca`, verify the same shell's Node runtime
supports it before invoking the command.

**Apply or destructive run:** require explicit user authorization for this run,
the resolved target, and the narrowest scope. First run the exact dry-run form
and inspect totals, samples, unmatched identities, conflicts, and every planned
delete/replacement. Require a verified, separately retained backup before a
delete, source removal, table clear, or replacement. Apply once, then rerun the
dry run or parity check and inspect artifacts to demonstrate the postcondition
and idempotency.

Stop before apply when the target is inferred, help and code disagree, dry-run
output is unresolved, the backup is unverified, or the authorized scope does
not cover the proposed writes.

## Exceptional commands

`convex:migrate` has no dry-run gate, ignores the normal target selector, takes
its target from `NEXT_PUBLIC_CONVEX_URL`, and clears mapped tables before its
first Sheets read. It requires explicit confirmation of that resolved URL and
a verified backup; ordinary apply authorization is insufficient.

For archive deletion or replacement, read the
[archive guide](../../../docs/operations/player-day-archive.md) and satisfy its
snapshot and conflict gates. For ranking or power computation, also invoke
`gshl-ranking` before changing algorithms or synchronizing runtimes.

Preserve source throttles, retry limits, host allowlists, dry-run defaults, and
secret redaction. Keep cookies, credentials, headers, authenticated page
content, and server secrets out of output and artifacts.

## Completion gate

A code change is complete when its execution model is still accurate, effects
remain isolated, focused tests cover planning/reconciliation, and the scripts
package type-check plus checks selected from the
[verification guide](../../../docs/operations/verification.md) pass. A run is
complete only when the post-run check demonstrates the requested state and the
report records target, scope, mode, counts, warnings, and artifact locations
without secrets.
