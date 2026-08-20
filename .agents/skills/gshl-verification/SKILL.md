---
name: gshl-verification
description: >-
  Select and run the real GSHL quality gates. Use when a task asks to test,
  verify, validate, check, lint, typecheck, format, review CI, confirm an agent
  change, diagnose a failing check, or choose the smallest relevant test scope
  for src/, convex/, scripts/, docs, or synchronized ranking files.
metadata:
  short-description: Verify GSHL changes with accurate command scopes
---

# GSHL verification

Read the [verification guide](../../../docs/operations/verification.md) and use
the smallest checks that exercise the changed behavior.

Do not assume `npm run check` is a complete suite. It runs frontend architecture,
root lint, and root TypeScript only. It does not run tests, scripts-package
type-checking, Markdown formatting, builds, or ranking synchronization.

Route checks by area:

- Frontend structure: `npm run check:architecture`.
- Root/Convex types and lint: `npm run typecheck` and `npm run lint`.
- Nested Convex libraries: direct ESLint such as
  `npx eslint convex/lib/timestamps.ts`; root lint excludes `convex/lib/**`.
- Pure root/Convex logic: `npx tsx --test <target.test.ts>`.
- Operator package: `npm --prefix scripts run typecheck` plus the relevant
  `test:power`, `test:player-bios`, `test:archive`, or direct test files.
- Ranking/power synchronized runtime: `npm run ranking-engine:check` after
  targeted tests and any required sync.
- Production bundle behavior: `npm run build`; use `build:profile` only when
  bundle/route performance is relevant.
- Markdown: an explicit Prettier check over the changed `.md` paths plus a
  relative-link check; the package formatter omits Markdown.

Always inspect `git diff --check` and the focused diff. Distinguish a failure
introduced by the change from a pre-existing failure, and report checks not run.
The only checked-in CI workflow currently verifies ranking-runtime sync, so CI
is not a substitute for local verification.
