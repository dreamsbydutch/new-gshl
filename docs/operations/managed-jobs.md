# Managed jobs

[Wiki home](../README.md)

Convex managed jobs provide durable run state for commissioner-started and
scheduled work. Commissioners start and monitor manual runs in League Office →
Jobs. Runs default to dry-run; selecting **Apply changes** is explicit.

## Current maturity warning

> A name in the managed-job catalog does not imply parity with the similarly
> named local script.

The current implementation is transitional:

- `awards-backfill` and `weekly-edition-generation` have dedicated Convex
  processors.
- `lineup-recalculation` currently updates bounded `MS` and `BS` flags, not the
  complete local lineup optimization pipeline.
- The generic native processors for season aggregation, player ratings, team
  ratings, power, and standings currently perform indexed bounded scans and
  report progress. They intentionally do not mutate calculation output until
  parity is approved.
- External jobs perform direct source capture or request a browser-worker
  capture. The worker never writes league tables.
- `active-season-refresh` orchestrates child runs, so its result inherits the
  maturity and limitations of each stage.

Keep production schedules disabled until the relevant managed processor has
passed completed-season, historical-season, and active-season comparisons,
followed by repeated idempotent apply checks.

## Catalog

The accepted canonical names are:

- `season-stat-aggregation`
- `player-rating-rebuild`
- `team-rating-rebuild`
- `power-rating-rebuild`
- `standings-backfill`
- `awards-backfill`
- `lineup-recalculation`
- `nhl-player-id-backfill`
- `nhl-daily-stat-sync`
- `hockey-reference-backfill`
- `yahoo-player-id-backfill`
- `yahoo-matchup-player-day-backfill`
- `yahoo-weekly-validation`
- `puckpedia-player-bio-sync`
- `weekly-edition-generation`
- `active-season-refresh`

Legacy local-script names are accepted as aliases for corresponding catalog
entries. New code and schedules should use canonical names.

## Run lifecycle

Statuses are:

- `queued`
- `running`
- `waiting_external`
- `succeeded`
- `failed`
- `cancelling`
- `cancelled`

Starting a run records its job name, arguments, apply mode, request origin,
attempt, scope lock, timestamps, and progress counters. The runner appends
events and schedules additional zero-delay batches until work completes.

There are two distinct public entry surfaces.

The server-secret API in `convex/jobs.ts` supports:

- catalog lookup
- start
- list
- inspect, including events, artifacts, tasks, and child runs
- cancel
- retry of failed or cancelled runs
- create, update, enable, disable, and list schedules

Every operation on that surface requires `CONVEX_SERVER_SECRET` to match the
Convex deployment value.

The commissioner-facing League Office uses `convex/frontend.ts`. It can list
recent run summaries, start a run, cancel it, and retry a failed or cancelled
run. It does not expose events, artifacts, external tasks, child runs, or
schedule management. Its start path currently does not reject an already
active matching lock, and its retry creates a fresh run without preserving the
old cursor, progress, parent run, or pipeline stage. Treat those as current UI
limits, not behavior guaranteed by the server-secret API.

## Scope locks and batching

The lock key combines the canonical job name with `seasonId`, `weekId`,
`matchupId`, and `date`. Missing dimensions are represented as an all-scope
selection. The `convex/jobs.ts` start path rejects a second active run with the
same lock; the League Office start path currently does not, so a commissioner
must check the visible recent runs before starting overlapping work.

Native processing uses batches of 100. Cancellation is immediate for queued or
waiting-external work; a running batch moves to cancelling and stops at its
next cooperative check.

Retry through `convex/jobs.ts` preserves the previous arguments, apply mode,
cursor, progress, parent pipeline relationship, and lock while incrementing the
attempt. League Office retry preserves the job, arguments, apply mode, lock,
and attempt count only.

## Schedules

Schedules store:

- name
- job name and arguments
- apply mode
- enabled state
- interval in minutes
- next run time

Convex checks due schedules every five minutes. A due run can therefore start
up to one polling window late, and an interval shorter than five minutes cannot
execute more frequently than the dispatcher. A schedule advances its next run
time even when a conflicting active lock prevents a new run, so inspect run and
event history when a scheduled execution appears absent.

Schedule creation defaults to disabled and dry-run unless those states are
explicitly enabled. Treat an apply-enabled schedule as production automation
and require the same review as any recurring writer.

## Active-season refresh

The pipeline stages, in order, are:

1. `nhl-daily-stat-sync`
2. `season-stat-aggregation`
3. `player-rating-rebuild`
4. `team-rating-rebuild`
5. `power-rating-rebuild`
6. `standings-backfill`
7. `awards-backfill`
8. `weekly-edition-generation`

Each stage is a child run with inherited scope and apply mode. A failed or
cancelled child fails or cancels the parent. Inspect the child list rather than
assuming the parent summary contains every stage detail.

## External jobs and browser worker

External jobs are:

- `nhl-player-id-backfill`
- `nhl-daily-stat-sync`
- `hockey-reference-backfill`
- `yahoo-player-id-backfill`
- `yahoo-matchup-player-day-backfill`
- `yahoo-weekly-validation`
- `puckpedia-player-bio-sync`

When job arguments contain a URL, the runner first attempts direct HTTP with
retries. A successful response is stored as a source-snapshot artifact. If
direct capture fails or no URL is supplied, the run creates an external task
and enters `waiting_external`.

Start the worker from `scripts/`:

```bash
npm run worker:browser
```

The worker requires `CONVEX_URL` or `NEXT_PUBLIC_CONVEX_URL`,
`BROWSER_WORKER_SECRET`, and `BROWSER_EXECUTABLE_PATH`. It may use
`BROWSER_WORKER_ID` and `YAHOO_BROWSER_PROFILE_PATH`.

Workers lease a task, renew the lease with heartbeats, and complete it with no
more than 100 bounded result chunks. Expired leases can be reclaimed. Worker
failures are truncated before storage and wake the parent runner.

## Other Convex schedules

Separate from managed jobs, Convex currently:

- recovers overdue or interrupted UFA offer groups every 15 minutes; ordinary
  groups are scheduled for resolution at their exact deadline
- scans due GSHL Weekly milestone editions every six hours

These are code-defined crons in `convex/crons.ts`, not rows in the managed
`jobSchedules` table.

## Operator checklist

1. Confirm the catalog processor is feature-complete for the intended action.
2. Use the narrowest available scope.
3. In League Office, check recent runs for an overlapping active lock before
   starting a dry run, then inspect the available summary and counts.
4. When deeper evidence is required, use separately authorized trusted tooling
   against `convex/jobs.ts` to inspect events, child runs, artifacts, and tasks.
5. Compare output with the corresponding local command where parity matters.
6. Apply only after review and authorization.
7. Repeat the dry run to verify idempotency.
8. Manage or enable schedules only through the trusted server-secret surface,
   and only after repeated parity and apply checks.

## Related pages

- [Data pipelines](data-pipelines.md)
- [Environment](../reference/environment.md)
- [Troubleshooting](troubleshooting.md)
- [Verification](verification.md)
