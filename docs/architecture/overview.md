# System architecture

[Wiki home](../README.md) · [Convex](./convex.md) · [Data model](./data-model.md) · [Authentication](./authentication.md)

## Purpose

GSHL is a Next.js application backed by Convex. The browser reads and mutates league data through typed Convex functions, Auth.js supplies Google identity, and the separate `scripts/` package handles migrations, backfills, reconciliation, and source-specific maintenance. Google Sheets and Apps Script remain compatibility and parity systems; they are not the live browser database.

There is no active tRPC backend. `src/trpc/` is empty, and `src/server/` contains only the UploadThing router.

## Runtime topology

```text
Browser
  ├─ Next.js App Router pages and layouts
  ├─ Auth.js session provider
  └─ Convex React client
       └─ browser API: convex/frontend.ts and domain modules

Next.js server
  ├─ Google OAuth/Auth.js callbacks
  ├─ Convex JWT and JWKS endpoints
  ├─ shared-secret Auth.js → Convex user store
  └─ commissioner-only UploadThing route

Convex
  ├─ schema and indexed document storage
  ├─ public/browser-callable queries and mutations
  ├─ shared-secret operator functions
  ├─ internal actions, mutations, and scheduled functions
  └─ cron dispatch for jobs, UFA resolution, and publications

Operator machine
  └─ scripts/
       ├─ NHL, Yahoo, PuckPedia, Hockey Reference, Sheets, Apps Script
       ├─ production/development Convex maintenance client
       └─ local completed-season archive and backups
```

Primary entry points:

- Root UI composition: [`src/app/layout.tsx`](../../src/app/layout.tsx)
- Browser Convex provider: [`src/components/auth/ConvexClientProvider.tsx`](../../src/components/auth/ConvexClientProvider.tsx)
- Stable remote-data hooks: [`src/hooks/main/`](../../src/hooks/main/)
- Browser-facing Convex facade: [`convex/frontend.ts`](../../convex/frontend.ts)
- Schema: [`convex/schema.ts`](../../convex/schema.ts)
- Server-side Convex adapter: [`src/lib/data/convex-store.ts`](../../src/lib/data/convex-store.ts)
- Operator tooling: [`scripts/README.md`](../../scripts/README.md)

## Backend surfaces

| Surface                    | Intended caller                          | Trust boundary                                                                      | Examples                                                            |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Browser API                | Convex React hooks                       | Anonymous or Convex JWT identity; every protected handler must enforce its own rule | `frontend`, `draft`, `ufa`, `weeklyEditions`                        |
| Server-secret operator API | Next.js server and trusted scripts       | Exact `CONVEX_SERVER_SECRET` match inside every handler                             | `data`, `authUsers`, `jobs`, `maintenanceScope`, `playerDayArchive` |
| Worker API                 | Local outbound browser worker            | `BROWSER_WORKER_SECRET` plus lease ownership                                        | `externalWorker`                                                    |
| Internal Convex API        | Convex functions, scheduler, and crons   | Declared with `internal*`; not callable by normal clients                           | `jobRunner`, UFA resolution, publication generation, backfills      |
| Generated API              | Type/code generation only                | Derived from local Convex modules and schema; regenerate explicitly                 | `convex/_generated/`                                                |
| Legacy adapters            | Migration, parity, and transitional jobs | Server/operator credentials; never import into browser components                   | `src/lib/sheets/`, `scripts/src/integrations/`                      |

“Public” in Convex means callable outside another Convex function. It does **not** mean anonymous. For example, `draft:state` is public at the deployment boundary but calls `requireActiveUser`; commissioner mutations are public functions guarded inside their handlers.

## Data flow

### Browser reads and writes

1. `AuthProvider` supplies the Auth.js session.
2. `ConvexProviderWithAuth` asks [`useConvexAuth`](../../src/hooks/main/useAuthSession.ts) for a short-lived Convex access token.
3. Hooks under `src/hooks/main/` call generated references from `convex/_generated/api`.
4. Convex queries return storage rows with an `id` alias for `_id` and normalize public date representations.
5. Feature hooks shape view models; components render them and do not import Convex directly.

### Server and operator writes

1. A trusted server or script chooses a bounded operation and target deployment.
2. The adapter adds `CONVEX_SERVER_SECRET` and calls a shared-secret Convex function.
3. The function validates its table/scope where supported, normalizes IDs and timestamps, and commits atomically.
4. Operator commands are normally dry-run first; `--apply` enables writes.

The generic functions in [`convex/data.ts`](../../convex/data.ts) are intentionally powerful migration primitives. User-facing behavior belongs in explicit, role-gated domain mutations instead.

## Domain ownership

- League identity and season structure: schema plus `frontend` queries.
- Authentication and access: root `auth.ts`, `src/lib/auth/`, `convex/authUsers.ts`, and `convex/lib/auth.ts`.
- Live draft transaction and clock: [`convex/draft.ts`](../../convex/draft.ts).
- Summer free agency and resolution: [`convex/ufa.ts`](../../convex/ufa.ts).
- Weekly publications and revisions: [`convex/weeklyEditions.ts`](../../convex/weeklyEditions.ts).
- Managed job state and scheduling: `convex/jobs.ts`, `convex/jobRunner.ts`, and `convex/crons.ts`.
- Historical repair and external-source reconciliation: `scripts/src/domains/` and `scripts/src/commands/`.
- Pure rules shared by browser, scripts, and Convex: `src/lib/utils/` and type-only contracts in `src/lib/types/`.

## Architectural invariants

- Convex is the live source of truth. Do not introduce a second live persistence path.
- Browser code uses generated Convex references through hooks, never server-secret adapters.
- Every browser-callable mutation enforces authorization in Convex, even when the UI already hides the control.
- `owners` are people, `franchises` are enduring brands, and `teams` are season-specific instances.
- Convex `_id` is canonical. `legacyId` exists for imports and compatibility only.
- `players.ownerId` is the stable roster relationship. `players.gshlTeamId` is a current-season assignment, not historical ownership.
- UTC epoch milliseconds are the storage representation for instants and date-only domain fields. Daily stat `date` values are explicit `YYYY-MM-DD` keys.
- `playerDayStatLines` is the raw stat source; week, split, total, career, and team tables are derived.
- Code imported by `convex/` from `src/lib/` must stay pure and Convex-runtime compatible.
- Never edit `convex/_generated/` manually.
- Avoid unscoped reads of large stat tables; use indexed season/week/team/player queries and cursor pagination.

## Related pages

- [Convex functions, jobs, crons, and generated boundaries](./convex.md)
- [Tables, relationships, identifiers, timestamps, and data lifecycle](./data-model.md)
- [Google OAuth, Auth.js, Convex JWTs, roles, and service secrets](./authentication.md)
