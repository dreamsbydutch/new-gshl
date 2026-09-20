# GSHL

GSHL is the web and operations platform for the Gem Stone Hockey League. It
combines a public league site, authenticated owner and commissioner tools,
Convex data, local hockey-data workflows, and a separate Google Apps Script
runtime for active-season Sheets operations.

## Start

Use Node 20 and npm 10 for the root application:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

`NEXT_PUBLIC_CONVEX_URL` is required for browser data. Google sign-in also
requires the Auth.js and Convex JWT settings declared in `src/env.js`. Keep real
values in local or hosted secret stores, never in Git.

The repository itself is the command index:

- root app and checks: `package.json`
- operator commands and flags: [`scripts/README.md`](scripts/README.md)
- Apps Script entry points and clasp: [`apps-script/README.md`](apps-script/README.md)
- production/runtime setup: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- ranking and power behavior: [docs/RANKING.md](docs/RANKING.md)
- agent working rules: [AGENTS.md](AGENTS.md)

## Architecture

```text
Browser
  -> Next.js route
  -> feature component
  -> feature hook
  -> main Convex hook
  -> Convex query or mutation

Operator machine
  -> scripts command
  -> pure domain reconciliation
  -> Convex, Sheets, browser, or source integration

Google Apps Script
  -> trigger/global entry point
  -> Yahoo ingest and aggregation
  -> Google Sheets
```

Convex is the live application database and API. Sheets adapters remain for
compatibility, migration, and the Apps Script runtime; there is no active tRPC
layer.

The [architecture checker](scripts/check-frontend-architecture.mjs) keeps route
composition free of React state/lifecycle hooks, browser query and navigation
hooks, direct data/cache integrations, and inline fetching. Routes may compose
UI, metadata, redirects, request adapters, and server auth guards. `route.ts`
handlers retain integration access; client error entries may use `useEffect` for
logging. The [route fixtures](tools/tests/frontend-architecture.test.mjs) document
these rules and exceptions. These are targeted static checks, not proof that all
business logic has left `src/app`; indirect calls and computed module access
still require review.

| Area             | Responsibility                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `src/app`        | Routes, layouts, metadata, loading, and API handlers                  |
| `src/components` | Feature UI and shared primitives                                      |
| `src/hooks`      | Feature view models and stable Convex/navigation access               |
| `src/lib`        | Pure utilities, shared types, auth, cache, and compatibility adapters |
| `convex`         | Schema, browser APIs, transactions, authorization, jobs, and crons    |
| `scripts`        | Imports, repairs, reconciliation, rebuilds, parity, and archives      |
| `apps-script`    | Active-season Sheets runtime                                          |

The primary data contract is `convex/schema.ts`. Browser access normally enters
through `convex/frontend.ts`; atomic workflows such as draft, UFA, and weekly
editions live in focused Convex modules. The official league rules are
`src/content/rulebook.ts` and render at `/rulebook`.

## Development expectations

Read [AGENTS.md](AGENTS.md) before changing the repository. In particular:

- preserve unrelated work in a dirty tree;
- enforce sensitive authorization inside Convex handlers;
- edit authoritative ranking files, then synchronize generated copies;
- treat production writes and deployments as separately authorized operations;
  and
- lint changed files and run focused tests instead of routine repository-wide
  gates.

Decision and investigation artifacts are kept separate from the project guide:

- [GSHL relaunch proposal](docs/proposals/gshl-relaunch-owner-proposal.md)
- [Relaunch salary analysis](docs/proposals/gshl-relaunch-salary-analysis.md)
- [Salary-cap upgrade report](docs/product/salary-cap-upgrade-report.md)
- [Draft reliability investigation](docs/operations/draft-reliability.md)

Proposals are discussion material, not implemented behavior or active rules.
