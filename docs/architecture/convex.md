# Convex backend

[Wiki home](../README.md) · [Architecture overview](./overview.md) · [Data model](./data-model.md) · [Authentication](./authentication.md)

## Directory boundary

`convex/` is the deployed backend. It contains the schema, public functions, shared-secret functions, internal orchestration, cron registration, and generated bindings.

| Path                                                        | Responsibility                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`schema.ts`](../../convex/schema.ts)                       | Tables, validators, and indexes                                                        |
| [`frontend.ts`](../../convex/frontend.ts)                   | Main browser-facing league query and mutation facade                                   |
| [`draft.ts`](../../convex/draft.ts)                         | Transactional live draft state, submission, and undo                                   |
| [`tradeBlock.ts`](../../convex/tradeBlock.ts)               | Authenticated trade market projection and owner-controlled listings                    |
| [`schedule.ts`](../../convex/schedule.ts)                   | Page-shaped weekly and owner-team schedule projections                                 |
| [`matchup.ts`](../../convex/matchup.ts)                     | Matchup details with referenced teams and player statistics                            |
| [`standings.ts`](../../convex/standings.ts)                 | Lazy public team snapshots for expanded standings rows                                 |
| [`teamHistory.ts`](../../convex/teamHistory.ts)             | Owner-scoped historical matchup and public relation projection                         |
| [`conferenceContest.ts`](../../convex/conferenceContest.ts) | Derived cross-season conference-contest view                                           |
| [`ufa.ts`](../../convex/ufa.ts)                             | UFA offers, odds, cap checks, scheduling, and resolution                               |
| [`weeklyEditions.ts`](../../convex/weeklyEditions.ts)       | Publication facts, OpenAI writing, templates, editing, revisions, and scheduled issues |
| [`data.ts`](../../convex/data.ts)                           | High-privilege generic migration/read/write adapter                                    |
| [`maintenanceScope.ts`](../../convex/maintenanceScope.ts)   | Bounded season/week aggregate reads and writes for scripts                             |
| [`jobs.ts`](../../convex/jobs.ts)                           | Shared-secret job and schedule administration                                          |
| [`jobRunner.ts`](../../convex/jobRunner.ts)                 | Internal job state machine and processors                                              |
| [`externalWorker.ts`](../../convex/externalWorker.ts)       | Shared-secret task leases for the local browser worker                                 |
| [`crons.ts`](../../convex/crons.ts)                         | Convex cron registration                                                               |
| [`lib/`](../../convex/lib/)                                 | Auth and timestamp primitives used by multiple functions                               |
| [`_generated/`](../../convex/_generated/)                   | Generated API, server, and data-model bindings; never hand-edit                        |

One-off internal migrations and compatibility readers live beside these modules: `reporterBackfill.ts`, `weeklyEditionBackfill.ts`, `timestampMigration.ts`, and `yahooBackfill.ts`.

## Browser API

Browser code imports `api` from [`convex/_generated/api`](../../convex/_generated/api.d.ts) only inside stable hooks under [`src/hooks/main/`](../../src/hooks/main/). Components do not import Convex.

### General league facade

[`frontend.ts`](../../convex/frontend.ts) exposes:

- Public lists for seasons, weeks, franchises, conferences, players, salaries, contracts, picks, results, events, awards, NHL teams, and stat tables.
- Privacy-aware owner and enriched team queries. Anonymous callers receive redacted owner email and owing values; active users receive private fields.
- Indexed pagination and batched lookups for high-volume player and draft screens.
- A full UFA catalog for League Office and a Home-only catalog that returns the
  server-ranked preview candidates plus players in unresolved offer groups.
  Both use one latest populated NHL-stat season; Home retains all viewer-owner
  contracts needed for cap checks while filtering player contracts and stats to
  its selected players. A separate capped Home mock-draft projection returns
  only card fields and NHL branding referenced by those projected players.
- League activity assembled from current rows, or from `seasonDataArchives.activitySnapshot` after a season is archived.
- Role-gated mutations for lineup changes, draft administration, user access, contract creation, and jobs.

Generic list helpers choose the longest compound-index prefix fully constrained by the request. They apply a row limit before collection only when every filter is covered by that index, project public rows without Convex metadata, and resolve team relations by referenced IDs. High-traffic views still use purpose-built queries with exact response contracts, explicit compound indexes, and bounded reads. League activity restricts contract candidates to the selected season before normalizing legacy date values and selecting the newest rows.

The generic planner stops before mixed numeric/string or legacy timestamp
fields because its compatibility equality is broader than Convex's type-exact
index equality. It still uses any safe leading prefix, then applies the
compatibility filter before honoring a row limit.

### Domain APIs

- `draft:status` and `draft:state` require an active user. The status query returns only the shared clock status for compact Home rendering; the state query retains the joined board. `submitPick` requires the on-clock owner or commissioner; an expired clock is commissioner-only. `undoPick` is commissioner-only and limited to the latest safely reversible pick.
- `tradeBlock:market` requires an active user and returns compact valid listings plus the linked owner's eligible roster candidates. `save` derives the owner from the authenticated account and rechecks player ownership and an active playing contract; `remove` applies the owner-access guard.
- `schedule:weeklySchedule` returns one selected week with its season, matchups, referenced teams, and only the player and team statistics rendered by the schedule. `schedule:teamSchedule` resolves one owner-season team and its indexed matchups; expanded rows lazily request the exact two team-week statistic fragments.
- `matchup:details` replaces browser fan-out with one matchup-shaped payload containing the selected matchup, its two teams, public owner labels, week, season categories, and exact player and team statistics.
- `standings:teamDetail` is public and returns one compact season/team snapshot only after its standings row expands. It projects the rendered matchup window, category ranks, and top three players without exposing private owner fields.
- `teamHistory:byOwner` returns one owner's indexed franchise history plus only the opponent teams, public identities, weeks, and seasons referenced by those matchups. Owner contact and financial fields, source metadata, and unused calendar/team fields are excluded.
- `conferenceContest:view` derives rendered cross-season ratings, head-to-head results, finalist and champion counts, awards, and coach and GM counts on the server. The browser receives count and branding maps instead of the historical source collections used to compute them.
- `frontend:ownerRankings` returns an exact public ranking projection, but its
  career calculation still reads the complete historical inputs. Reducing its
  backend reads and reactive dependency set requires a maintained aggregate or
  snapshot; the current change reduces its browser payload only.
- `ufa:publicState` is anonymous but masks owner identity and returns unresolved groups with their offers so pending cap reservations survive resolution retries. Odds are shown for open groups only, with formula-wide inputs shared across groups and selective inputs scoped by bidder-owner and season indexes. `submitOffer` requires an owner/commissioner identity unless the trusted server-secret path is used. Resolution functions are internal.
- Weekly edition reader endpoints return only published, active content. Archive, Home, Newsroom, and revision lists use compact projections; full edition content is fetched by ID only for an opened reader or a commissioner-selected Newsroom issue. Published archive reads are bounded by status/season publication indexes, and Newsroom and revision lists are capped at 100 rows. Newsroom, prompt, OpenAI generation, editing, visibility, homepage selection, section activation, and revision restoration are commissioner-only. AI generation reads its API key only from the Convex deployment, uses the Responses API without server-side response storage, retries one invalid draft, and atomically saves only content that passes the existing fact-packet validator. A concurrent Newsroom edit aborts the save rather than being overwritten.

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

| Cadence          | Internal function                  | Purpose                                                                                   |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Every 5 minutes  | `jobRunner:tickSchedules`          | Queue due enabled job schedules when no conflicting scoped run is active                  |
| Every 15 minutes | `ufa:reconcileDueGroups`           | Recover overdue or interrupted UFA resolutions; ordinary groups are scheduled at deadline |
| Every six hours  | `weeklyEditions:scanDueMilestones` | Generate due milestone publications idempotently                                          |

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
