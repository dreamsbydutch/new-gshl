# Operations

This page contains the non-obvious setup and production boundaries that are not
better expressed by code or package scripts. Command names and flags live in
[`scripts/README.md`](../scripts/README.md) and
[`apps-script/README.md`](../apps-script/README.md).

## Runtime configuration

Common local names are listed in `.env.example`; the complete Next.js contract
is `src/env.js`. Scripts also read command-specific settings directly from
`process.env`. Apps Script uses `apps-script/Config/Config.js` and Script
Properties.

Configuration belongs to its runtime:

- Next.js: Auth.js, Google OAuth, Convex URL/JWT bridge, UploadThing, and any
  server-side Convex secret.
- Convex: server secret, auth issuer, browser-worker secret, web-push keys,
  Newsroom OpenAI key/model, and Yahoo OAuth credentials.
- Operator machine: exact Convex target, service-account input, browser path,
  Yahoo browser/cookie inputs, and optional archive path.
- Apps Script: spreadsheet/league constants plus `VERBOSE_LOGGING` and
  `DRY_RUN_MODE` Script Properties.

Production operator scripts require an explicit production identity such as
`CONVEX_PROD_URL`, production deployment metadata, or a deploy key. They do not
silently treat `NEXT_PUBLIC_CONVEX_URL` as production. The destructive
`convex:migrate` command is the exception: it uses only
`NEXT_PUBLIC_CONVEX_URL`, so verify that exact value independently.

Secret values never belong in source, Markdown, reports, command transcripts,
or screenshots. Rotation requires updating every runtime that shares the
credential; rotating Yahoo's client secret also requires reconnecting Yahoo.

## Deployment surfaces

The web app, Convex, and Apps Script deploy independently.

- `npx convex codegen` regenerates local bindings without deploying.
- `npx convex dev` pushes and watches the configured development deployment.
- `npx convex deploy` deploys functions and schema to the selected target.
- A pushed `preview/*` branch triggers Vercel through the GitHub integration;
  use `gshl-preview-pr` for the complete handoff.
- `npm run deploy` in `apps-script/` is only `clasp push`. It creates no
  versioned deployment and installs no triggers.

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

- `convex:migrate` clears mapped target tables before its first Sheets read and
  has no dry run.
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

## Apps Script

Apps Script remains the active-season Sheets runtime. `DRY_RUN_MODE` defaults to
false and does not suppress every side effect: combined aggregation still
manages its follow-up trigger, and power setup may add columns before its
dry-run branch. Confirm the clasp project, configuration, Script Properties,
and complete entry-point flow before execution.

Ranking and power files under `apps-script/` are synchronized output from
`scripts/src/runtime/apps-script/`. Sync and check locally before an authorized
push, then inspect execution logs and the intended trigger behavior.

## Verification and diagnosis

Use the change-sized policy in `AGENTS.md`: changed-file lint, nearest tests,
and broader gates only for affected contracts. Package-wide command existence
does not make the command necessary.

When diagnosing runtime failures, identify the boundary first: browser,
Next.js, Convex, operator command, external source, worker, or Apps Script. Then
confirm the exact target and configuration names without printing values.
Inspect the smallest relevant run/event/artifact or direct test. Distinguish
source capture from league-table mutation and upload completion from deployed
behavior.
