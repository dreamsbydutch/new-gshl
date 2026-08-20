# Verification

[Wiki home](../README.md)

Verification is change-specific. No single current command covers architecture,
lint, types, tests, formatting, generated-file parity, every runtime, and
documentation.

## Current CI scope

The only GitHub Actions workflow is the ranking-engine sync check. It runs on
relevant pull requests, relevant pushes to `main`, and manual dispatch using
Node 20.

Its path filters currently omit the source and Apps Script copies of
`PowerRankingsAlgo.js`. Power-only changes therefore require an explicit local
check even when CI does not start.

Its only repository command is:

```bash
npm run ranking-engine:check
```

CI does not currently run installation, build, architecture checks, ESLint,
TypeScript, tests, Markdown checks, Convex deployment, web deployment, or clasp
push. Local verification is therefore required.

## Root quality commands

### Combined local gate

```bash
npm run check
```

Actual scope:

1. `npm run check:architecture`
2. ESLint over `src` and top-level `convex/*.ts`
3. `tsc --noEmit` for the root TypeScript project

It excludes `scripts/`, does not lint nested `convex/lib/`, and runs no tests or
format checks.

### Individual checks

```bash
npm run check:architecture
npm run lint
npm run typecheck
npm run format:check
```

`format:check` covers only `ts`, `tsx`, `js`, `jsx`, and `mdx`. It does not
cover `.md`, JSON, YAML, or CSS.

### Exposed root tests

```bash
npm run test:conference
npm run test:owners
npm run test:performance
```

Many additional `*.test.ts` files exist without package aliases. Run a focused
root or Convex test directly when it owns the changed logic:

```bash
npx tsx --test <path-to-test.ts>
```

Do not describe the three package scripts as the full test suite.

## Scripts-package checks

Run from `scripts/`:

```bash
npm run typecheck
npm run test:power
npm run test:player-bios
npm run test:archive
```

The grouped tests cover only their named domains. A focused scripts test can be
run with the root-installed TSX CLI:

```bash
node ../node_modules/tsx/dist/cli.mjs --test <path-to-test.ts>
```

For a command change, also run its dry-run help and the narrowest safe dry-run.
Never invoke a production apply merely as verification.

On Windows PowerShell, forward CLI flags through `npm.cmd`, not the current
`npm.ps1` shim, and confirm the command-specific help is displayed before any
apply verification.

## Ranking-runtime verification

When `PowerRankingsAlgo.js`, a `RankingEngine` file, its loader, or a dependent
rating/power workflow changes:

```bash
npm run ranking-engine:sync
npm run ranking-engine:check
```

Then run the relevant scripts tests and parity command. Sync checking proves
file identity only; it does not prove numerical correctness.

## Documentation verification

The package formatter does not include ordinary Markdown. Check wiki formatting
directly from the root:

```bash
npx prettier --check "docs/**/*.md"
```

Also verify:

- each page links back to `docs/README.md`
- relative links resolve with the correct directory depth
- command working directories are explicit
- referenced files and package scripts exist
- environment documentation contains names, not values
- unknown deployment facts remain labeled unknown
- safety warnings match current command behavior

Do not mass-format unrelated existing Markdown while updating one page.

## Change-to-check matrix

| Change                                   | Minimum targeted verification                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Route, component, hook, type, or utility | `npm run check`; run the nearest `tsx --test` file; add build when server/client boundaries or routing changed.                   |
| Frontend folder or import structure      | `npm run check:architecture` and `npm run lint`.                                                                                  |
| Convex schema or top-level function      | `npm run check`, relevant Convex test, `npx convex codegen`, and deployment review.                                               |
| Nested Convex library                    | Root typecheck, direct ESLint for the changed file if appropriate, and its focused test; root lint does not include nested files. |
| Scripts domain or command                | From `scripts/`: `npm run typecheck`, relevant group or focused test, and a safe scoped dry run.                                  |
| Salary-history logic                     | `npm run test:player-bios`, scripts typecheck, and a non-apply import validation.                                                 |
| Archive or SQLite logic                  | `npm run test:archive`, scripts typecheck, archive dry-run, and standalone verification against noncritical data.                 |
| Ranking or power runtime                 | Sync, check, `test:power`, and relevant parity command.                                                                           |
| Apps Script trigger or feature           | Relevant local parity/tests, ranking check if shared files changed, clasp target review, then post-push logs/manual validation.   |
| Environment schema                       | Root typecheck/build plus feature-specific startup; update the environment reference without values.                              |
| Markdown only                            | Direct Prettier check and manual local-link/command verification.                                                                 |

Increase verification when a change crosses boundaries or can mutate production
data.

## Data-operation verification

For a write-capable operator workflow:

1. confirm explicit target
2. run the narrowest dry run
3. save and review counts and warnings
4. resolve unmatched identities, conflicts, stale rows, or aggregate drift
5. apply only with authorization
6. rerun dry-run or parity checks to prove idempotency
7. verify backups before any delete or replacement operation

`npm run convex:migrate` is not suitable for this pattern because it has no dry
run. Verification for that command must happen before execution using a
disposable target or separately authorized, backed-up target.

## Reporting results

Report:

- exact commands run and their working directories
- passed and failed scopes
- targeted tests selected
- checks not run and why
- pre-existing failures separately from new failures
- dry-run or apply mode for operational commands
- generated or synchronized files
- any unknown deployment handoff

Do not say “all checks passed” when only `npm run check` or CI completed.

## Related pages

- [Local development](../getting-started/local-development.md)
- [Command reference](../reference/commands.md)
- [Deployment](deployment.md)
- [Troubleshooting](troubleshooting.md)
