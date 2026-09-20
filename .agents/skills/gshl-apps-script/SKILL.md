---
name: gshl-apps-script
description: >-
  Change, review, or operate the GSHL Google Apps Script runtime. Use for
  apps-script source, Sheets writers, global entry points, triggers, Script
  Properties, clasp, execution logs, or synchronized ranking copies. Exclude
  Convex-only operations.
metadata:
  short-description: Maintain the GSHL Apps Script runtime, triggers, and deployments
---

# GSHL Apps Script runtime

The outcome is a change or remote operation whose global entry point, Sheets
effects, trigger lifecycle, project target, and authoritative source are all
accounted for.

## Trace the runtime

Read the relevant sections of the
[operations guide](../../../docs/operations/apps-script.md) and
[`apps-script/README.md`](../../../apps-script/README.md). Trace the public
global through configuration, feature/core modules, every Sheet or network
effect, and any trigger it creates, replaces, or deletes. Before editing,
identify the Script Properties consumed, active-season resolution, retry path,
and delayed/finalize behavior.

Keep this runtime V8-compatible and independent from Next.js, React, Convex
client code, and Node-only modules.

## Choose the branch

**Local change or review:** edit the owning source and use local pure/parity
tests. Ranking and power files in `apps-script/` are synchronized outputs;
invoke `gshl-ranking` and edit their source under
`scripts/src/runtime/apps-script/`.

**Remote inspection:** confirm the clasp project and relevant Script Properties
without printing values. Logs are evidence about executions, not proof of
trigger ownership or schedule; inspect those separately when they matter.

**Remote mutation:** a push, entry-point run, Script Property edit, or trigger
change requires explicit user authorization and target confirmation. The
checked-in `DRY_RUN_MODE` default is false, and dry-run does not suppress every
side effect: combined aggregation still manages its follow-up trigger, while
power setup may add columns before branching. Inspect the complete entry point
before treating any invocation as safe.

`npm run deploy` is a `clasp push`, not a versioned deployment, and a push does
not provision triggers. Record source publication and trigger state as separate
postconditions.

## Completion gate

A local change is complete when all affected globals and trigger paths are
accounted for, synchronized sources remain in parity, and the relevant local
tests selected from the
[verification guide](../../../docs/operations/verification.md) pass. An
authorized remote operation is complete only when the clasp target is
reconfirmed and logs plus explicit trigger/Sheet inspection demonstrate the
requested postcondition.
