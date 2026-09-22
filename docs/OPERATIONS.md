# Operations

This page contains the non-obvious setup and production boundaries that are not
better expressed by code or package scripts. Command names and flags live in
[`scripts/README.md`](../scripts/README.md).

## Runtime configuration

Common local names are listed in `.env.example`; the complete Next.js contract
is `src/env.js`. Scripts also read command-specific settings directly from
`process.env`.

Configuration belongs to its runtime:

- Next.js: Auth.js, Google OAuth, Convex URL/JWT bridge, UploadThing, and any
  server-side Convex secret.
- Convex: server secret, auth issuer, browser-worker secret, web-push keys,
  Newsroom OpenAI key/model, and Yahoo OAuth credentials.
- Operator machine: exact Convex target, browser path,
  Yahoo browser/cookie inputs, and optional archive path.

Production operator scripts require an explicit production identity such as
`CONVEX_PROD_URL`, production deployment metadata, or a deploy key. They do not
silently treat `NEXT_PUBLIC_CONVEX_URL` as production.

Secret values never belong in source, Markdown, reports, command transcripts,
or screenshots. Rotation requires updating every runtime that shares the
credential; rotating Yahoo's client secret also requires reconnecting Yahoo.

## Player-day performance index

Player-day leaderboards require `playerDayPerformanceIndex` and a completed
`playerDayPerformanceCoverage` record for each season/source. Browsing never
builds the index or falls back to scanning source records. Normal operator
writes and archive mutations maintain the derived rows transactionally.

After the schema and functions are deployed, the authenticated operator mutation
`playerDayPerformanceIndex:prepare` accepts `seasonId`, `source`
(`playerDayStatLines` or `playerDayHighlights`), and the server secret supplied
from the operator environment. Omit `apply` for a read-only readiness check;
`apply: true` explicitly starts/resumes the additive, scheduled 100-row batches.
Check readiness again after completion. Repeating an already completed build is
a no-op. Prepare only the relevant source: live rows for live seasons, highlights
for archived seasons. This one-time backfill reads existing rows and writes one
compact numeric projection per source row; it does not change source statistics.

Unfiltered leaderboards read at most 100 candidates per position group per
season and hydrate only the final 100 combined winners. Date-filtered searches
read at most 1,001 compact rows per season and refuse ranges exceeding 1,000;
shorten the range or remove the date filter. Other performance tables continue
to use their existing season-scoped queries.

## Deployment surfaces

The web app and Convex deploy independently.

- `npx convex codegen` regenerates local bindings without deploying.
- `npx convex dev` pushes and watches the configured development deployment.
- `npx convex deploy` deploys functions and schema to the selected target.
- A pushed `preview/*` branch triggers Vercel through the GitHub integration;
  use `gshl-preview-pr` for the complete handoff.

The repository does not encode production Vercel project settings, domains,
promotion, or rollback. Confirm targets and hosted environment values in their
own services. Deploying Convex activates code-defined crons, so review
`convex/crons.ts` and any apply-enabled managed schedule first.

## Data operations

Use `gshl-data-operations` for any live or potentially destructive command. The
standard sequence is exact target and scope, current `--help`, narrow dry run,
reviewed counts/samples/conflicts, authorized apply, then an idempotency or
parity rerun.

Most scripts default to production Convex selection even though writes normally
require `--apply`. On Windows, use `npm.cmd run <command> -- --flag` for
argument-bearing commands. Commands containing `node --use-system-ca` require a
Node runtime that supports that option; Node 20 does not.

High-risk exceptions:

- `data:clearTables` and `data:splitLegacyAwards` mutate immediately.
- archive source deletion and replacement/conflict flags require independent
  backups and explicit confirmation.
- `stats:aggregate-season --apply` removes stale derived rows unless told to
  preserve them.
- player-bio sync can clear managed fields and deactivate guarded stale players.

The completed-season player-day archive defaults to
`.local-data/gshl-history.sqlite`; deletion first creates a Convex snapshot.
`.local-data` and OneDrive synchronization are transport, not retention. Keep a
separately verified copy before deleting or replacing source data.

## Managed jobs

Browser, operator, schedule, and pipeline entry paths share
[`convex/lib/jobLifecycle.ts`](../convex/lib/jobLifecycle.ts); authorization
remains in each entry path. Active runs block identical scope keys only, not
overlapping season/week scopes. Both retry paths preserve cursor, progress,
arguments, apply mode, and pipeline provenance in a new run; child runs and
external tasks stay with the old run. Repeated cancellation is idempotent, and
late completion or external handoff cannot revive a terminal run.

Managed jobs store runs, events, artifacts, child runs, scope locks, and
external browser tasks. Several processors are still parity/scaffolding paths,
not proven replacements for their local commands. Keep production schedules
disabled until completed, historical, and active-season comparisons plus
repeated idempotent applies succeed.

The scheduler checks due rows every 15 minutes. Intervals below 15 minutes do
not run more frequently, and a blocked run still advances its next-run time.
The active-season pipeline runs NHL sync, aggregation, player/team ratings,
power, standings, awards, and weekly-edition generation as child jobs. Inspect
children and artifacts instead of relying only on the parent summary.

External jobs may pause in `waiting_external`. The worker in `scripts/` leases
allowlisted tasks using `CONVEX_URL`, `BROWSER_WORKER_SECRET`, and
`BROWSER_EXECUTABLE_PATH`; it captures bounded source data but does not write
league tables itself.

Separate code-defined crons reconcile due UFA groups every 15 minutes and scan
weekly-edition milestones every six hours.

Commissioner contract creation and UFA finalization share
[`convex/lib/contractSigningTransaction.ts`](../convex/lib/contractSigningTransaction.ts)
inside the originating mutation. It validates all covered teams and signing
picks before writing the contract, player assignment, pick reservations, and
first covered lineup. Authorization, contract terms, and UFA winner and offer
finalization remain in their owning handlers; no separate transaction is added.

## Yahoo OAuth

The Convex Yahoo connection currently supports authorization, encrypted token
storage/refresh, and read-only hockey-league discovery. It does not import
league data and is separate from existing scraper workflows.

1. Set `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` in the intended Convex
   deployment. `YAHOO_APP_ID` is optional metadata.
2. Deploy the schema/functions, then run internal action
   `yahoo:connectionStatus` and register its `callbackUrl` exactly in Yahoo. It
   uses `https://<deployment>.convex.site/yahoo/callback`.
3. Run `yahoo:beginConnection`, open its private one-use URL within ten minutes
   in the same browser, and approve Fantasy Sports read access.
4. Run `yahoo:checkConnection`, then repeat with `forceRefresh: true`. Confirm
   the expected hockey league and token renewal before building an importer.

Tokens in `yahooConnections` use AES-256-GCM with a key derived from the client
secret. Public responses omit tokens and provider errors. Development and
production have independent connections. Run internal mutation
`yahooConnectionStore:disconnect` to remove stored state; revoke the grant in
Yahoo separately when required.

## Verification and diagnosis

Use the change-sized policy in `AGENTS.md`: changed-file lint, nearest tests,
and broader gates only for affected contracts. Package-wide command existence
does not make the command necessary.

When diagnosing runtime failures, identify the boundary first: browser,
Next.js, Convex, operator command, external source, or worker. Then
confirm the exact target and configuration names without printing values.
Inspect the smallest relevant run/event/artifact or direct test. Distinguish
source capture from league-table mutation and upload completion from deployed
behavior.
