# Convex backend

[Wiki home](../README.md) · [Architecture overview](./overview.md) · [Data model](./data-model.md) · [Authentication](./authentication.md)

## Directory boundary

`convex/` is the deployed backend. It contains the schema, public functions, shared-secret functions, internal orchestration, cron registration, and generated bindings.

| Path                                                      | Responsibility                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`schema.ts`](../../convex/schema.ts)                     | Tables, validators, and indexes                                        |
| [`frontend.ts`](../../convex/frontend.ts)                 | Main browser-facing league query and mutation facade                   |
| [`draft.ts`](../../convex/draft.ts)                       | Transactional live draft state, submission, and undo                   |
| [`ufa.ts`](../../convex/ufa.ts)                           | UFA offers, odds, cap checks, scheduling, and resolution               |
| [`weeklyEditions.ts`](../../convex/weeklyEditions.ts)     | Publication facts, templates, editing, revisions, and scheduled issues |
| [`data.ts`](../../convex/data.ts)                         | High-privilege generic migration/read/write adapter                    |
| [`maintenanceScope.ts`](../../convex/maintenanceScope.ts) | Bounded season/week aggregate reads and writes for scripts             |
| [`jobs.ts`](../../convex/jobs.ts)                         | Shared-secret job and schedule administration                          |
| [`jobRunner.ts`](../../convex/jobRunner.ts)               | Internal job state machine and processors                              |
| [`externalWorker.ts`](../../convex/externalWorker.ts)     | Shared-secret task leases for the local browser worker                 |
| [`crons.ts`](../../convex/crons.ts)                       | Convex cron registration                                               |
| [`lib/`](../../convex/lib/)                               | Auth and timestamp primitives used by multiple functions               |
| [`_generated/`](../../convex/_generated/)                 | Generated API, server, and data-model bindings; never hand-edit        |

One-off internal migrations and compatibility readers live beside these modules: `reporterBackfill.ts`, `weeklyEditionBackfill.ts`, `timestampMigration.ts`, and `yahooBackfill.ts`.

## Browser API

Browser code imports `api` from [`convex/_generated/api`](../../convex/_generated/api.d.ts) only inside stable hooks under [`src/hooks/main/`](../../src/hooks/main/). Components do not import Convex.

### General league facade

[`frontend.ts`](../../convex/frontend.ts) exposes:

- Public lists for seasons, weeks, franchises, conferences, players, salaries, contracts, picks, results, events, awards, NHL teams, and stat tables.
- Privacy-aware owner and enriched team queries. Anonymous callers receive redacted owner email and owing values; active users receive private fields.
- Indexed pagination and batched lookups for high-volume player and draft screens.
- A UFA catalog that reads active players and one latest populated NHL-stat
  season, plus a capped mock-draft preview for Home. These projections replace
  browser fan-out across full historical collections while the full feature
  routes retain their complete views.
- League activity assembled from current rows, or from `seasonDataArchives.activitySnapshot` after a season is archived.
- Role-gated mutations for lineup changes, draft administration, user access, contract creation, and jobs.

Generic list helpers use the first applicable index and then filter or sort remaining criteria in memory. A filtered query is not automatically cheap. Scope large datasets by indexed fields and prefer purpose-built paginated or fixed-size preview queries. League activity restricts contract candidates to the selected season before normalizing legacy date values and selecting the newest rows.

### Domain APIs

- `draft:state` requires an active user. `submitPick` requires the on-clock owner or commissioner; an expired clock is commissioner-only. `undoPick` is commissioner-only and limited to the latest safely reversible pick.
- `ufa:publicState` is anonymous but masks owner identity and returns unresolved groups with their offers so pending cap reservations survive resolution retries. Odds are shown for open groups only, with formula-wide inputs shared across groups and selective inputs scoped by bidder-owner and season indexes. `submitOffer` requires an owner/commissioner identity unless the trusted server-secret path is used. Resolution functions are internal.
- Weekly edition read endpoints return only published, active content. Newsroom, prompt, editing, visibility, homepage selection, section activation, and revision restoration are commissioner-only.

Authorization is a handler responsibility. Do not infer permission from whether a function appears in generated `api`.

## Server-secret operator API

These modules declare public Convex functions because Next.js or standalone scripts must call them, but every handler compares an argument against the Convex deployment’s `CONVEX_SERVER_SECRET`:

- `authUsers.ts`: Auth.js account upsert and lookup; trusted access administration.
- `data.ts`: arbitrary table reads, snapshots, insert/update/upsert, clear, and legacy award migrations.
- `jobs.ts`: job inspection, cancellation/retry, and schedule management.
- `maintenanceScope.ts`: allowlisted, paginated aggregate maintenance.
- `playerDayArchive.ts`: completed-season archive state transitions and verified source deletion.
- `timestampMigration.ts`: timestamp plan and bounded migration batches.
- `yahooBackfill.ts`: bounded player-day reads for Yahoo repair tooling.
- Selected UFA functions: trusted offer/state/reconciliation paths.

Use the narrowest explicit function available. `data.ts` is a migration primitive with broad authority, including table clearing; it must never be called from browser code.

`data:clearTables` and `data:splitLegacyAwards` execute immediately after
server-secret validation. They have no dry-run or `apply` argument. Any direct
invocation requires explicit destructive-operation authorization, exact target
verification, and a recoverable backup.

The Next.js adapter is [`src/lib/data/convex-store.ts`](../../src/lib/data/convex-store.ts). The richer script adapter is [`scripts/src/integrations/data/convex-store.ts`](../../scripts/src/integrations/data/convex-store.ts). Both redact the server secret from diagnostic summaries.

## Internal functions and crons

Functions declared with `internalQuery`, `internalMutation`, or `internalAction` are callable only by other Convex functions and the scheduler.

Current cron cadence from [`crons.ts`](../../convex/crons.ts):

| Cadence         | Internal function                  | Purpose                                                                  |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Every minute    | `jobRunner:tickSchedules`          | Queue due enabled job schedules when no conflicting scoped run is active |
| Every minute    | `ufa:reconcileDueGroups`           | Requeue due or interrupted UFA resolutions                               |
| Every six hours | `weeklyEditions:scanDueMilestones` | Generate due milestone publications idempotently                         |

Internal backfills should be treated as migrations, not reusable application APIs. Keep them narrowly named and remove or archive them after their rollout is complete.

## Managed jobs

Canonical names, legacy aliases, status values, scope locks, and the active-refresh stage order live in [`jobCatalog.ts`](../../convex/jobCatalog.ts).

`jobRuns` is the durable state machine:

```text
queued → running → succeeded
                 ↘ failed
                 ↘ cancelling → cancelled
       ↘ waiting_external → running
```

- Runs are dry-run unless `apply` is true.
- `jobs:start` rejects another active run with the same lock scope. The current League Office `frontend:startJob` path does not perform that conflict check, so operators must avoid duplicate overlapping UI runs.
- Events are capped at the newest 250 per run.
- Schedules consider at most 20 due entries per tick and advance their next time whether queued or skipped for a conflict.
- The active-season refresh pipeline runs its stages serially by creating child runs.

Managed jobs are still a parity bridge:

- Awards, weekly-edition generation, and lineup flag recalculation contain substantive native processors.
- Several other “native” processors currently perform bounded scans and report unchanged rows instead of reproducing the legacy calculation command.
- External jobs may fetch and store a direct HTTP artifact or lease a browser capture, then report the capture result. They do not parse that capture into league-table writes.
- Continue using the documented `scripts/` command for a real rebuild or source reconciliation until that managed job has passed dry-run parity and repeated idempotent apply checks.
- Publication jobs count per-edition exceptions as `skipped`; inspect counts instead of assuming a succeeded run covered every issue.

The browser worker is [`scripts/src/workers/convex-browser-worker.ts`](../../scripts/src/workers/convex-browser-worker.ts). It allowlists Yahoo, PuckPedia, and Hockey Reference hosts, owns tasks through renewable leases, and returns HTML chunks. It never writes league tables.

## Generated code

`convex/_generated/` contains:

- `api.d.ts` and `api.js`: public/internal function references.
- `dataModel.d.ts`: `Doc`, `Id`, table names, and the schema-derived data model.
- `server.d.ts` and `server.js`: typed function constructors and contexts.

Rules:

1. Never edit generated files.
2. Run `npx convex codegen` after adding or renaming a Convex module, function,
   table, or index. It updates local bindings without modifying a deployment.
3. Review generated changes together with the source change.
4. Deploy functions/schema before running a script that depends on a newly added maintenance endpoint.

String-based `makeFunctionReference` calls can compile even when generated API declarations are stale. That is not evidence the target deployment contains the function.

`npx convex dev` also regenerates bindings, but it pushes code to the configured
development deployment and watches for changes. Do not use it as a read-only
code-generation command.

## Legacy adapters

[`src/lib/data/model-map.ts`](../../src/lib/data/model-map.ts) and [`scripts/src/integrations/data/model-map.ts`](../../scripts/src/integrations/data/model-map.ts) translate legacy model names such as `PlayerDayStatLine` to Convex tables such as `playerDayStatLines`.

- These maps are compatibility surfaces, not the schema definition.
- The application map and script map intentionally serve different callers and are not automatically identical.
- New browser features should use generated Convex functions, not extend a Sheets-shaped abstraction by default.
- Google Sheets clients remain useful for migration and parity, but direct writes throw when `GSHL_DATA_BACKEND=convex`.

## Verification

Useful targeted checks from the repository root:

```powershell
npm run check
npx tsx --test convex/awardCalculations.test.ts convex/jobCatalog.test.ts convex/lib/timestamps.test.ts
```

The root lint glob covers `convex/*.ts` but not nested `convex/lib/*.ts`; TypeScript still checks the nested files. Script-specific type and test commands are documented in [`scripts/README.md`](../../scripts/README.md).
