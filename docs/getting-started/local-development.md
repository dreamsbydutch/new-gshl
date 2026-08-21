# Local development

[Wiki home](../README.md)

This repository contains three runtimes with separate dependency and command
boundaries:

- the Next.js application and Convex backend at the repository root
- operator-run TypeScript tooling in `scripts/`
- the Google Apps Script project in `apps-script/`

Install and run commands from the directory named in this guide. A command run
from the wrong package can resolve the wrong lockfile, environment file, or
TypeScript configuration.

## Prerequisites

- Use Node.js 20 for the root application and CI.
- Several `scripts/package.json` commands invoke `node --use-system-ca`. Node 20
  cannot launch those entries. Before using one, select a Node runtime whose
  `node --help` lists `--use-system-ca`; on Windows, also verify the `node`
  resolved by `cmd.exe`, because npm scripts run through that shell.
- The root package declares npm 10.1.0.
- Install Python only when using the NHL helper commands.
- Install and authenticate `clasp` only when working on Apps Script deployment.

Never open or print `.env.local`, credentials files, Yahoo cookie files, or
other secret-bearing files during routine repository discovery. Use
`.env.example` and [Environment](../reference/environment.md) to learn the
supported variable names.

Verify `npm --version` instead of assuming the declaration is enforced. On
Windows PowerShell, use `npm.cmd run <script> -- --flag` when forwarding command
arguments. The local `npm.ps1` shim can consume option names; confirm parsing
with the command's `--help` output before any apply run.

For an operator command whose manifest entry contains `--use-system-ca`, verify
both launchers before running it:

```powershell
npm.cmd --version
cmd.exe /d /c node --version
cmd.exe /d /c "node --help | findstr -- --use-system-ca"
```

If the final command finds nothing, fix the active Node/PATH configuration.
Do not remove the certificate flag ad hoc or continue to an apply command.

## Install dependencies

From the repository root:

```bash
npm install
```

The scripts package has its own manifest and lockfile:

```bash
cd scripts
npm install
cd ..
```

Apps Script is another package:

```bash
cd apps-script
npm install
cd ..
```

NHL helper commands require the pinned Python package:

```bash
python -m pip install -r scripts/python/requirements.txt
```

## Configure the environment

Copy `.env.example` to `.env.local`, then provide only the values needed for
the runtime or workflow being used. Do not commit `.env.local`.

The browser app requires a Convex client URL when its provider is rendered.
Authentication, server-side Convex calls, UploadThing, Sheets compatibility,
and operator jobs each have additional conditional requirements. See
[Environment](../reference/environment.md) instead of guessing variable names.

## Run the app

Regenerate local Convex bindings without changing a deployment:

```bash
npx convex codegen
```

When backend functions must also be pushed to and watched on the configured
development deployment, verify that target and then run:

```bash
npx convex dev
```

In another terminal, start Next.js:

```bash
npm run dev
```

The development command uses the Next.js Turbopack server. For a production
build check:

```bash
npm run build
```

To build and immediately run the production server locally:

```bash
npm run preview
```

## Work in the correct runtime

- Frontend routes, components, hooks, utilities, types, and server adapters live
  under `src/`. Follow `AGENTS.md` for mandatory layer boundaries.
- Convex schema, queries, mutations, actions, jobs, and crons live in `convex/`.
  Do not hand-edit `convex/_generated/`.
- Historical repair, migration, synchronization, parity, and archive commands
  live in `scripts/`. Run them from that directory.
- Active-season Google Sheets automation lives in `apps-script/`.
- Ranking and power runtime source files are authored under
  `scripts/src/runtime/apps-script/`; their `apps-script/` counterparts are
  synchronized output.

Use `rg --files` to find files and `rg "term"` to trace symbols, command names,
model names, and environment-variable use. Prefer the aliases in the relevant
TypeScript configuration over deep cross-layer relative imports.

## Before making changes

1. Run `git status --short` and preserve existing work.
2. Read the route, component, hook, utility, type, Convex function, or command
   entry point involved.
3. Search for an existing implementation before adding a file.
4. Identify which package owns the change and which targeted checks cover it.
5. For any data-writing command, read its help and the scripts runbook before
   executing it.

## Verify a local change

The normal root quality gate is:

```bash
npm run check
```

That command checks frontend architecture, a specific ESLint scope, and the
root TypeScript project. It does not run tests, formatting, or the ranking sync
check. Select additional targeted checks from
[Verification](../operations/verification.md).

Do not assume CI will catch omitted local checks. Current CI verifies only
ranking-runtime synchronization.

## Next references

- [Command reference](../reference/commands.md)
- [Environment](../reference/environment.md)
- [Data pipelines](../operations/data-pipelines.md)
- [Deployment](../operations/deployment.md)
- [Troubleshooting](../operations/troubleshooting.md)
