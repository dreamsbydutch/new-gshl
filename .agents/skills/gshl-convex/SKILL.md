---
name: gshl-convex
description: >-
  Implement or review GSHL Convex backend work. Use when a task mentions
  convex/, schema, table, field, index, query, mutation, action, transaction,
  generated API, auth guard, role, privacy, cron, managed job, external task,
  server secret, migration endpoint, pagination, or browser Convex data access.
  Do not use for pure frontend styling or an Apps Script-only change.
metadata:
  short-description: Change GSHL Convex schema, APIs, auth, or jobs safely
---

# GSHL Convex backend

Read [AGENTS.md](../../../AGENTS.md), then the
[Convex backend guide](../../../docs/architecture/convex.md),
[data model](../../../docs/architecture/data-model.md), and
[authentication guide](../../../docs/architecture/authentication.md) relevant
to the task.

## Choose the correct surface

- Browser-facing projections and ordinary league reads: `convex/frontend.ts`.
- Atomic domain behavior: a focused module such as `draft.ts`, `ufa.ts`, or
  `weeklyEditions.ts`.
- Broad server-secret migration/operator access: `convex/data.ts`; never expose
  it to browser code.
- Scoped maintenance: an existing maintenance module rather than a new generic
  table escape hatch.
- Scheduled/internal orchestration: `jobRunner.ts`, `crons.ts`, or the owning
  domain's internal function.

For managed-job work, read the
[managed-jobs guide](../../../docs/operations/managed-jobs.md). Most current
processors are parity-stage scans or source-capture scaffolds, not replacements
for the local calculation/reconciliation command. Keep production schedules
disabled until dry-run parity and repeated idempotent apply checks pass.

The external browser worker targets `CONVEX_URL` with
`NEXT_PUBLIC_CONVEX_URL` as a fallback and authenticates with the separate
`BROWSER_WORKER_SECRET`, not `GSHL_CONVEX_TARGET` or `CONVEX_SERVER_SECRET`.
It returns bounded captures and does not write league tables.

`data:clearTables` and `data:splitLegacyAwards` are immediate destructive
server-secret mutations with no dry-run or `apply` gate. Any proposed call must
also use the `gshl-data-operations` authorization, exact-target, and backup
protocol.

## Protect invariants

- Treat `_id` as canonical and `legacyId` as import compatibility.
- Preserve owner/person, franchise/identity, and team/season-instance semantics.
- Add indexes for bounded production reads and scope large stat queries before
  collecting. Generic adapters may filter in memory.
- Normalize timestamps through `convex/lib/timestamps.ts`; day-stat dates remain
  calendar keys.
- Recheck authorization in every sensitive server function. UI visibility is
  not authorization. Avoid returning private owner fields anonymously.
- Keep any `src/lib` dependency imported by Convex pure and runtime-compatible.
- Never edit `convex/_generated` directly or spread existing `@ts-nocheck` and
  broad assertions into new code without a demonstrated compatibility need.

After a schema or exported-function change, regenerate local bindings with
`npx convex codegen`; it does not modify a deployment. `npx convex dev` pushes
to the configured development deployment and watches for changes, so use it
only when that external mutation is intended. Do not deploy or mutate production
merely because code changes were requested.

## Verify

Run focused pure tests, root type-check/lint, and any affected operator-package
tests. Root lint excludes `convex/lib/**`; lint a changed nested file directly,
for example `npx eslint convex/lib/timestamps.ts`. Note that direct Convex
runtime integration coverage is currently absent; manually inspect auth,
privacy, index, and transaction paths in the diff.
