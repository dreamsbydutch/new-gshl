# GSHL agent guide

This is the operational source of truth for coding agents in this repository.
Keep it short; use the [wiki](docs/README.md) for explanations. Preserve user
changes, and do not introduce a new architecture without explicit approval.

## What this repository is

GSHL is the web and operations platform for the Gem Stone Hockey League. The
Next.js application serves public league history and authenticated owner and
commissioner workflows. Convex is the live application database and API.
Local TypeScript commands reconcile external hockey data and perform rebuilds;
Google Apps Script remains a separate active-season Google Sheets runtime.

Current browser data flow:

```text
src/app route
  -> src/components feature UI
  -> src/hooks/features view model
  -> src/hooks/main Convex hook
  -> convex frontend/domain function
  -> convex/schema.ts
```

There is no active tRPC layer. `src/trpc/` is empty. Google Sheets adapters are
compatibility and operator infrastructure, not the browser's live data path.

## Commands

The root app and CI use Node 20 and npm. Run these from the repository root
unless noted. Operator-package scripts that embed `node --use-system-ca` need a
runtime whose `node --help` exposes that flag; Node 20 cannot launch them.
Verify the runtime seen by the package script before running one.

The repository declares npm 10.1.0. Verify the resolved version. In Windows
PowerShell, use `npm.cmd run <script> -- --flag` for argument-bearing operator
commands; the current `npm.ps1` shim can consume forwarded flag names. Confirm
with the command's `--help` output before any apply run. User-installed
`node`/`npm` shims can also shadow the system runtime; if a command contains
`--use-system-ca`, verify the same shell can parse that Node flag first.

| Command                         | Purpose                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `npm install`                   | Install web-app dependencies.                                                  |
| `npm run dev`                   | Start Next.js with Turbopack.                                                  |
| `npm run check:architecture`    | Enforce frontend folders, naming, type placement, and import boundaries.       |
| `npm run lint`                  | Lint `src/` and top-level `convex/*.ts`.                                       |
| `npm run typecheck`             | Type-check the app and Convex; excludes `scripts/`.                            |
| `npm run check`                 | Architecture check, lint, then root type-check. Does not run tests.            |
| `npx tsx --test <file.test.ts>` | Run the smallest relevant root/Convex test file.                               |
| `npm run test:conference`       | Test conference-contest transforms.                                            |
| `npm run test:owners`           | Test owner-ranking transforms.                                                 |
| `npm run test:performance`      | Test pagination despite the legacy script name.                                |
| `npm run build`                 | Production Next.js build.                                                      |
| `npm run build:profile`         | Build and write `.next/performance/build-profile.json`.                        |
| `npm run ranking-engine:check`  | Verify the local runtime and Apps Script copy have matching hashes.            |
| `npm run ranking-engine:sync`   | Copy the authoritative ranking/power runtime into Apps Script, then verify it. |

The ordinary formatter excludes Markdown. For docs, use
`npx prettier --check "**/*.md"` or `npx prettier --write "**/*.md"` with a
narrower path when possible.

The operator package is independent:

```powershell
npm --prefix scripts install
npm --prefix scripts run typecheck
npm --prefix scripts run test:power
npm --prefix scripts run test:player-bios
npm --prefix scripts run test:archive
```

See [the command reference](docs/reference/commands.md) and
[`scripts/README.md`](scripts/README.md) before running a backfill, sync,
migration, archive, restore, or browser worker. Most commands are dry-run by
default, but the scripts package defaults its Convex target to production.
Always pass or verify the target before execution. `convex:migrate` is a
destructive exception: it ignores the normal target selector, uses
`NEXT_PUBLIC_CONVEX_URL`, clears mapped target tables before its first Sheets
read, and has no dry-run.

Apps Script commands run from `apps-script/`: `npm run login`, `push`, `open`,
`logs`, and `deploy`. Here, `deploy` means `clasp push`; it does not create a
versioned deployment.

Apps Script `DRY_RUN_MODE` defaults to false and does not suppress every remote
side effect: combined aggregation still manages its follow-up trigger, and
power setup may add missing columns before its dry-run branch. Inspect the
complete entry point and target properties before executing it.

## Repository map

```text
src/
  app/              Next.js route, layout, loading, and API files only
  components/       Feature UI; ui/ primitives; skeletons/ loading states
  hooks/
    main/            Stable Convex/domain query and mutation hooks
    features/        Feature orchestration and view models
  lib/
    auth/            Server auth helpers and Convex token bridge
    cache/           Persisted navigation state
    config/          Shared app configuration
    data/            Server-side Convex adapter and model mapping
    sheets/          Legacy/compatibility Sheets adapter
    types/           Frontend types only
    utils/           Pure core, domain, and feature transforms
  server/            Server-only integrations; currently UploadThing
  styles/            Global Tailwind styles
  content/           Static application content, including the rulebook
convex/              Schema, browser APIs, domain transactions, jobs, crons
scripts/             Separate operator package for data reconciliation/rebuilds
apps-script/         Google Apps Script active-season Sheets runtime
tools/               Root build profiling and runtime synchronization
docs/                Human and agent wiki
.agents/skills/      Repository-local workflow skills
```

Generated and synchronized boundaries:

- Never edit `convex/_generated/` manually. Run `npx convex codegen` after local
  schema or function-surface changes. `npx convex dev` also pushes to the
  configured development deployment; use it only when that mutation is intended.
- Edit ranking and power sources under
  `scripts/src/runtime/apps-script/`. Treat matching files under `apps-script/`
  as synchronized output; run `npm run ranking-engine:sync` and then `check`.
- Do not edit lockfiles by hand. Let the package manager update the lockfile for
  the package whose manifest changed.

## Frontend boundaries

Dependencies flow downward:

```text
app -> components -> feature hooks -> main hooks -> Convex
                  \-> pure utilities -> types
```

- Keep `src/app` thin. Substantial route UI belongs in the narrowest existing
  `src/components/<feature>` folder.
- Prefer Server Components for route composition. Add `"use client"` at the
  lowest boundary that needs state, effects, browser APIs, or Convex hooks.
- Components render and handle interaction. They must not import Convex,
  server/cache modules, or `next/navigation` directly. Use main/feature hooks.
  The two authentication provider components are explicit integration
  exceptions enforced by the architecture checker.
- Main hooks own stable remote/domain access. Feature hooks combine main hooks
  and pure transforms. Hooks never import components and return named objects.
- Put deterministic logic in `src/lib/utils/{core,domain,features}`. Utilities
  remain framework-free. Put shared types in `src/lib/types`; it has no runtime
  exports or dependencies on hooks, components, or utilities.
- Component filenames are PascalCase with named exports. Route files are the
  default-export exception. Hook filenames begin with `use`.
- Use existing `@gshl-*` aliases across layers and short relative imports inside
  a feature subtree. Some aliases are stale; confirm the target exists before
  using one.
- Reuse existing UI primitives and skeletons. Use Tailwind only. Preserve
  accessibility, mobile behavior, overflow handling, and loading states.
- Never mutate props, Convex results, or hook output. Clone before sorting.
- Navigation state is persisted in `src/lib/cache/store.ts`; access it through
  hooks rather than importing the store into components.

## Convex and domain boundaries

- `convex/schema.ts` is the data contract. Convex `_id` is canonical; adapters
  expose it as `id`, while imported identifiers remain `legacyId`.
- `convex/frontend.ts` is the main browser facade. Keep domain transactions in
  their focused modules such as `draft.ts`, `ufa.ts`, and `weeklyEditions.ts`.
- Treat client-side role checks as presentation only. Every sensitive query,
  mutation, upload, and job action must enforce authorization on the server.
- `CONVEX_SERVER_SECRET` authorizes broad operator functions in `convex/data.ts`.
  Never expose it to client code, output, artifacts, or logs.
- `data:clearTables` and `data:splitLegacyAwards` mutate immediately with no
  dry-run/apply gate. Require explicit authorization, exact target, and backup.
- Keep large stat reads bounded and indexed by season, week, team, player, or
  date. Generic adapters may filter and sort in memory after selecting one
  index.
- Preserve the owner/franchise/team distinction: owners are people, franchises
  are enduring identities, and teams are season-specific instances.
- Store timestamps as UTC epoch milliseconds. Day-stat `date` fields are
  `YYYY-MM-DD` calendar keys. Follow `convex/lib/timestamps.ts`; do not invent
  another date conversion path.
- Code imported by Convex from `src/lib` must be pure and compatible with the
  Convex runtime: no React, Next.js, DOM, or Node-only dependencies.

## Operator and data safety

- Never commit secrets under any circumstances, including temporarily or on a
  preview branch. Keep credentials, tokens, keys, cookies, service-account
  material, and real environment values out of Git; if exposure occurs, stop
  and rotate or revoke the secret immediately.
- Trace a command from `scripts/src/commands` into `domains` and then
  `integrations` before changing it. Keep parsing/reconciliation pure and data
  access at the integration boundary.
- For data-changing work: confirm environment and target, run dry-run, inspect
  counts/samples, apply the narrowest scope, then rerun to verify idempotency or
  parity. Never infer production-write permission from a code-edit request.
- Do not run `convex:migrate`, source deletion, destructive archive replacement,
  or conflict replacement without explicit authorization and a verified backup.
- Local completed-season archives live under gitignored `.local-data/`. They are
  not a backup until copied to a separately retained location.
- Managed Convex jobs are not yet equivalent to every local command. Use the
  local command as the authoritative repair/rebuild path until parity is proven.
- Preserve external-source throttling, retry, browser allowlists, and dry-run
  behavior. Never log cookies, service-account material, OAuth secrets, or page
  contents that may contain credentials.

## Working method

Before editing:

1. Run `git status --short` and preserve existing changes.
2. Read the active route or command entry point, then trace each layer to schema
   or integration. Search before creating a duplicate.
3. Read the relevant [wiki section](docs/README.md) and repository skill.
4. Confirm which files are authoritative, generated, synchronized, legacy, or
   currently unreferenced.

While editing:

- Keep changes scoped and follow the narrowest existing folder.
- Use `rg --files <area>` to map files and `rg -n "symbol|route|table" <area>`
  to trace callers. Route from active entry points; similarly named legacy
  components still exist.
- Use strict TypeScript, `import type`, immutable data, and existing primitives.
- Add focused `node:test` coverage for new non-trivial pure logic. Do not add a
  new test framework for one change.
- Update the wiki in the same change when behavior, commands, data, security,
  environment, or ownership boundaries change.

Before finishing:

1. Recheck layer and authorization boundaries.
2. Run the smallest relevant tests plus the affected package's type-check/lint.
3. Run `npm run check:architecture` for frontend changes and
   `npm run ranking-engine:check` for ranking/power runtime changes.
4. Inspect `git diff --check`, the focused diff, and Markdown links.
5. Report exactly what ran, what did not run, and any pre-existing failures.

CI currently checks only ranking-runtime synchronization, and its path filters
omit power-only source/copy changes. Local verification is not optional merely
because a workflow is absent.

## Local skills and documentation

Repository skills live in `.agents/skills/` and route specialized work:

- `gshl-frontend` for routes, components, hooks, UI, navigation, and Tailwind.
- `gshl-convex` for schema, functions, auth, jobs, crons, and generated APIs.
- `gshl-data-operations` for scripts, backfills, syncs, archives, and production
  data safety.
- `gshl-apps-script` for the Apps Script/Sheets runtime and clasp workflows.
- `gshl-ranking` for player/team ratings, power ratings, parity, and sync.
- `gshl-verification` for selecting the real quality gates and test scope.
- `gshl-preview-pr` for publishing a completed goal as isolated logical commits,
  a `preview/*` branch, a verified Vercel preview, and an informative GitHub PR.

Start at [docs/README.md](docs/README.md). The most useful maps are the
[architecture overview](docs/architecture/overview.md),
[route reference](docs/reference/routes.md),
[data model](docs/architecture/data-model.md), and
[command reference](docs/reference/commands.md).
