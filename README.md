# GSHL

GSHL is the web and operations platform for the Gem Stone Hockey League. It
combines a public league site, authenticated owner and commissioner tools,
realtime Convex data, repeatable hockey-data workflows, and a separate Google
Apps Script runtime for active-season Sheets operations.

## Start here

- [Wiki](docs/README.md) - product, architecture, data, operations, and reference
- [Agent guide](AGENTS.md) - commands, boundaries, workflow, and local skills
- [Operator command manual](scripts/README.md) - command flags and examples
- [Ranking engine](docs/RANKING.md) - scoring runtime and parity model
- [Official rulebook source](src/content/rulebook.ts) - content rendered at `/rulebook`

## Local development

Use Node 20 and npm for the root application. Some operator-package commands
have an additional Node runtime constraint; see the
[local-development guide](docs/getting-started/local-development.md).

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The browser requires a configured Convex URL. Google sign-in and authenticated
Convex access additionally require the Auth.js and JWT bridge settings described
in the [local-development guide](docs/getting-started/local-development.md).
Never commit `.env.local` or credentials.

Run the root quality gate with:

```powershell
npm run check
```

`npm run check` does not run tests, Markdown formatting, or ranking-runtime
parity. Choose the additional checks for your change from the
[verification guide](docs/operations/verification.md).

## Architecture at a glance

```text
Next.js route -> feature UI -> feature hook -> main Convex hook -> Convex API

Local command -> domain reconciliation -> Convex/Sheets integration

Google Apps Script -> active-season Yahoo ingest/aggregation -> Google Sheets
```

Convex is the live application data path. The Google Sheets adapters remain for
compatibility, migration, parity, and the Apps Script runtime; there is no
active tRPC implementation. See the [architecture overview](docs/architecture/overview.md)
for boundaries and source-of-truth rules.

## Packages

| Area              | Responsibility                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| `src/`            | Next.js application, components, hooks, pure utilities, and shared types             |
| `convex/`         | Schema, realtime APIs, authorization, domain transactions, jobs, and crons           |
| `scripts/`        | Independent TypeScript operator package for imports, repairs, rebuilds, and archives |
| `apps-script/`    | Google Apps Script active-season Sheets runtime                                      |
| `docs/`           | Human- and agent-oriented wiki                                                       |
| `.agents/skills/` | Repository-local workflow skills                                                     |

Git branch pushes are connected to Vercel outside the checked-in configuration;
`preview/*` branches receive preview deployments. Convex and Apps Script remain
separate deployment surfaces. See [deployment](docs/operations/deployment.md).

Before contributing, read [AGENTS.md](AGENTS.md). It applies to humans and
automation alike where it describes repository boundaries and safety rules.
