# Troubleshooting

[Wiki home](../README.md)

Start with the smallest read-only diagnostic that can distinguish configuration,
targeting, source-data, and code failures. Do not turn a diagnostic into an
apply run merely to obtain more output.

## First checks

1. Confirm the current working directory.
2. Run `git status --short` and preserve existing work.
3. Identify the owning runtime: root app, Convex, `scripts/`, or Apps Script.
4. Confirm required environment names are present without printing values.
5. Re-run the narrowest targeted check or dry run.
6. Read the complete error and the command's generated report or managed-job
   events.

If a scripts command prints npm's generic `npm run` help or treats a flag value
as a boolean, PowerShell likely routed through `npm.ps1` and consumed forwarded
arguments. Retry the read-only help form with
`npm.cmd run <command> -- --help`, then use `npm.cmd` for the scoped dry run.

## Next.js and environment failures

### Environment validation blocks build or dev

Compare the missing name with [Environment](../reference/environment.md) and
the enabled feature. Provide the configuration in `.env.local` or the hosting
secret store.

`SKIP_ENV_VALIDATION` exists for intentional constrained build contexts. It is
not a fix for a missing runtime requirement and should not be enabled in
production merely to pass a build.

### Convex client provider reports a missing URL

The browser provider requires `NEXT_PUBLIC_CONVEX_URL`. A server-only
`CONVEX_URL` does not populate browser configuration.

### Sign-in is unavailable

Check the Auth.js names, production Google OAuth callback, Convex server secret,
and Convex token issuer/key configuration. Keep values aligned across the web
host and Convex deployment without printing them.

### Next resolves the wrong workspace root

The Next configuration explicitly sets output tracing to the current app
because a parent lockfile previously caused workspace misdetection. Run commands
from the repository root and do not remove that setting as an unrelated cleanup.

## Convex and operator-script failures

### Production scripts refuse the endpoint

Production-backed scripts intentionally require an explicit production URL,
production deployment metadata, or a production deploy key. They refuse to
fall back to `NEXT_PUBLIC_CONVEX_URL` for production.

Confirm `GSHL_CONVEX_TARGET` and the production Convex configuration. Do not
weaken the guard or relabel a development endpoint.

This guard does not cover the destructive `convex:migrate` command, which uses
only `NEXT_PUBLIC_CONVEX_URL`. Verify that exact endpoint before any authorized
migration.

### Maintenance function is unavailable

When a command reports that aggregate maintenance functions are missing, deploy
the current Convex functions from the repository root:

```bash
npx convex deploy
```

Then repeat the original dry run. Do not bypass its preflight.

### Protected Convex request is unauthorized

Confirm `CONVEX_SERVER_SECRET` is present and matches the target deployment.
Never print either copy while comparing them.

### A managed run stays `waiting_external`

Inspect the run's external task and events. Start the browser worker from
`scripts/` if the task requires browser capture:

```bash
npm run worker:browser
```

Confirm the worker endpoint, worker secret, browser executable, and optional
Yahoo profile names are configured. An expired lease may be reclaimed by a
worker; do not manually mutate task state first.

### A managed calculation “succeeds” without data changes

Several native managed processors currently perform parity-stage scans and
intentionally do not mutate calculation output. Read
[Managed jobs](managed-jobs.md) and use the established local script when a
complete authorized rebuild is required.

### A scheduled run is missing

Check whether another active run owned the same scope lock. The scheduler still
advances `nextRunAt` after a conflict. Inspect job events and the existing run
rather than creating duplicate schedules.

## External-source failures

### Yahoo returns access denied, a login page, or a challenge

Use supported cookie/header inputs or an existing authenticated browser
profile. Consider browser fallback or the managed worker. Do not commit raw
HTML, cookies, headers, or profile data.

Use the debug command to isolate selector changes:

```bash
npm run stats:debug-yahoo-matchup-table
```

Read the current required flags in
[`scripts/README.md`](../../scripts/README.md). Inspect raw HTML before sharing
it because it may contain session or account material.

### NHL Python helper fails to import

From the repository root:

```bash
python -m pip install -r scripts/python/requirements.txt
```

Then use the command's Python binary and SSL options if the environment needs
an explicit interpreter or certificate behavior.

### A player identity is unmatched or ambiguous

Do not force a name-only match. Review stable NHL, Yahoo, legacy, and Convex
identifiers plus the reported candidates. Salary import and several player
maintenance flows deliberately abort all writes until identity is unambiguous.

## Ranking and power failures

### CI or local sync check reports drift

Confirm the intended source edit is under `scripts/src/runtime/apps-script/`,
then run from the root:

```bash
npm run ranking-engine:sync
npm run ranking-engine:check
```

Review all five resulting file pairs. Do not “fix” drift by hand-editing the
Apps Script destination.

### Local and Apps Script ratings differ

Run sync check first, then the appropriate focused tests and parity command.
Compare season, week, team, model, categories, and sample scope before changing
tuning constants.

## Archive failures

### Aggregate drift blocks archive

The archive correctly refuses to stage stale derived data. Run a scoped
`stats:aggregate-season` dry run, review and apply it only when authorized, then
repeat archive dry-run.

### Native SQLite module fails to load

The root app uses Node 20, but archive package entries also pass
`--use-system-ca`, which Node 20 cannot parse. Select a Node runtime that both
supports `better-sqlite3` and lists that flag in `node --help`, then reinstall
dependencies in `scripts/`. On Windows, check the `node` resolved by `cmd.exe`;
a user-installed `node.cmd` shim can shadow the system executable.

### Local checksum or portable backup fails

Stop all delete or restore work. Preserve the database and backup files, check
whether synchronization is incomplete, and recover a matching copy before
continuing.

### Deletion was interrupted

Do not edit archive state manually. Retain the local archive and snapshots,
then rerun the identical fully confirmed archive/delete command; its resume path
verifies remaining source rows.

### Restore reports conflicts

Keep the run dry. Compare each target row with archived canonical data.
`--replace-conflicts` overwrites data and requires separate explicit approval.

See [Player-day archive](player-day-archive.md) for the full runbook.

## Apps Script failures

Read project logs from `apps-script/`:

```bash
npm run logs
```

- Confirm the clasp project before pushing or changing configuration.
- Active-season resolution requires one date-range match or exactly one active
  fallback row.
- If scheduled finalize did not run, inspect project triggers and refresh logs.
- If shared rating files differ, fix the source and synchronize from the root.
- A successful clasp push does not prove trigger creation or successful runtime
  execution.

## Architecture, lint, and type failures

`npm run check` reports three distinct classes of issue in sequence:

1. repository architecture rules
2. ESLint for `src` and top-level Convex TypeScript files
3. root TypeScript compilation

Fix the reported layer or target rather than moving logic into an unapproved
folder. The scripts package has a separate `npm run typecheck` from `scripts/`.

## Escalation record

When handing off a failure, include:

- command and working directory
- target category, without endpoint or secret values
- dry-run/apply mode
- selected season/week/team/date scope
- exact error text with credentials redacted
- report or managed-run identifier
- checks already run
- whether source data or the working tree changed

## Related pages

- [Command reference](../reference/commands.md)
- [Environment](../reference/environment.md)
- [Verification](verification.md)
- [Data pipelines](data-pipelines.md)
