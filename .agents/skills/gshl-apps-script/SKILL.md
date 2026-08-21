---
name: gshl-apps-script
description: >-
  Change or operate the GSHL Google Apps Script runtime. Use when a task
  mentions apps-script/, Google Apps Script, GAS, clasp, Script Properties,
  Apps Script or time-driven trigger, Yahoo scraper, Google Sheets writer,
  active-season aggregation, finalize trigger, RankingEngine deployed copy,
  PowerRankingsAlgo, clasp push, clasp or Apps Script execution logs, or Apps
  Script deployment. Do not use for Convex-only operations.
metadata:
  short-description: Maintain the GSHL Apps Script runtime, triggers, and deployments
---

# GSHL Apps Script runtime

Read [AGENTS.md](../../../AGENTS.md), the
[Apps Script operations guide](../../../docs/operations/apps-script.md), and
[`apps-script/README.md`](../../../apps-script/README.md).

Treat this as a separate runtime with Google Sheets state and global trigger
entry points. Do not import Next.js, React, Convex client code, or Node-only
modules. Preserve V8-compatible Apps Script globals and the active-season
resolution rules.

Before changing a trigger path, trace its complete flow from the public global
through `AggregationJobs.js`, `features/`, `Core/`, and configuration. Preserve
dry-run and verbose Script Properties, trigger deduplication, and the delayed
finalize behavior.

Do not assume `DRY_RUN_MODE` makes an entry point side-effect-free. Its checked-in
default is false; `aggregateCurrentSeason()` replaces its follow-up trigger even
when sheet writes are dry-run, and power setup can add missing columns before
its dry-run branch. Confirm the clasp project, configuration, Script Properties,
and complete call path before running an entry point.

Ranking and power files under `apps-script/` are synchronized outputs. Edit the
authoritative files under `scripts/src/runtime/apps-script/` and follow the
`gshl-ranking` workflow; do not patch the deployed copy alone.

`npm run deploy` in this package is an alias for `clasp push`. It changes the
remote project but does not create a versioned Apps Script deployment. Remote
pushes, trigger changes, and Script Property changes require the user's
authorization and target confirmation. A push does not install or update
project triggers; trigger ownership and schedules are separate remote state to
inspect explicitly.

The Apps Script package has no test or type-check script. Run the relevant root
and scripts-package pure/parity tests, then `npm run ranking-engine:check` when
synchronized files are involved. For an authorized remote verification, run
`npm --prefix apps-script run logs` from the root or `npm run logs` from
`apps-script/`.
