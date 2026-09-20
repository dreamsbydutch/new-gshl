# GSHL agent guide

GSHL is a Next.js application backed by Convex, with a separate TypeScript
operator package and a Google Apps Script runtime. Preserve user changes and
keep work inside the existing architecture unless the user approves a redesign.

## Find the source of truth

```text
Browser: src/app -> components -> feature hooks -> main hooks -> Convex
Operator: scripts/src/commands -> domains -> integrations
Sheets: apps-script entry point -> features -> Core -> Google Sheets
```

- `convex/schema.ts` defines stored data. Convex `_id` is canonical;
  `legacyId` is import compatibility.
- `convex/frontend.ts` is the main browser facade. Focused transactions live in
  modules such as `draft.ts`, `ufa.ts`, and `weeklyEditions.ts`.
- `src/lib/types` is type-only. Deterministic logic belongs in
  `src/lib/utils`; code imported by Convex must be runtime-pure.
- `scripts/README.md` owns operator command flags and examples.
- `apps-script/README.md` owns the Apps Script entry points and clasp commands.
- `src/content/rulebook.ts` is the official league rulebook.

Search from an active entry point before adding a file or trusting a similarly
named legacy implementation. Package manifests and command `--help` output are
the command reference; do not reproduce them in documentation.

## Change code in its owning layer

- Keep routes thin. Components render and handle interaction; feature hooks
  compose view models; main hooks own Convex and navigation access; utilities
  stay framework-free.
- Components do not import Convex, server/cache modules, or `next/navigation`
  directly. Hooks do not import components. Shared types have no runtime
  exports.
- Prefer Server Components until browser state or APIs require a client
  boundary. Reuse existing primitives, loading states, Tailwind tokens, and
  feature folders.
- Preserve accessibility, mobile layout, loading/error/empty states, and
  immutable inputs. Clone before sorting query results or props.
- Every sensitive Convex function enforces authorization on the server. UI
  visibility is presentation, not security.
- Scope large reads with indexes and bounded season/week/team/player/date
  inputs. Store instants as UTC epoch milliseconds and day-stat dates as
  `YYYY-MM-DD` keys through `convex/lib/timestamps.ts`.
- Owners are people, franchises are enduring identities, and teams are
  season-specific instances.

Generated and synchronized files:

- Regenerate `convex/_generated/` with `npx convex codegen`; never edit it.
- Edit ranking/power sources in `scripts/src/runtime/apps-script/`, then run
  `npm run ranking-engine:sync`. Matching `apps-script/` files are output.
- Let npm update lockfiles when a manifest changes.

## Work safely

Before editing, run `git status --short`, identify pre-existing changes, and
read the active entry point plus its direct dependencies. Preserve unrelated
work even when it overlaps the same file.

Secrets never enter Git, logs, screenshots, reports, or documentation. Keep
credentials, cookies, tokens, service-account material, and environment values
out of artifacts.

A code-edit request authorizes code edits, not remote writes. Convex deployment,
clasp push, production data changes, trigger/property changes, and GitHub/Vercel
publication require the corresponding user intent. Use the relevant skill for
operator, Apps Script, ranking, or preview-PR work.

Never run `convex:migrate`, table clearing, archive source deletion, destructive
replacement, or conflict replacement without explicit authorization, the exact
target, and a verified independent backup. Local `.local-data/` and OneDrive
sync are not backups by themselves.

## Verify the change, not the repository

Use a change-sized verification budget:

1. Lint only lintable files changed for the current task.
2. Run the nearest tests that exercise the changed behavior.
3. Add type-checking, architecture checks, builds, grouped suites, or parity
   commands only for a boundary or contract the diff actually affects.

Prefer direct commands such as `npx eslint <files>` and
`npx tsx --test <test-file>`. Run `npm run check:architecture` for frontend
folder/import-boundary changes and `npm run ranking-engine:check` for ranking or
power runtime changes. Inspect `git diff --check` and the focused diff. Report
exactly what ran, what did not run, and pre-existing failures.

## Repository skills

- `gshl-data-operations`: operator scripts, data repair/import, archives, and
  any production-backed data command.
- `gshl-apps-script`: Apps Script code, triggers, properties, logs, and clasp.
- `gshl-ranking`: rating/power algorithms, synchronized runtimes, and parity.
- `gshl-preview-pr`: explicitly requested preview branch, Vercel deployment,
  and pull-request publication.

Start with [README.md](README.md). Read [docs/OPERATIONS.md](docs/OPERATIONS.md)
only for runtime setup or production operations and
[docs/RANKING.md](docs/RANKING.md) only for ranking/power behavior.
