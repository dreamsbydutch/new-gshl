---
name: gshl-apps-script
description: >-
  Change or operate apps-script/, including Google Sheets triggers, Script
  Properties, Yahoo ingestion, clasp push/logs, or synchronized ranking files.
metadata:
  short-description: Maintain the GSHL Apps Script runtime
---

# GSHL Apps Script

Read [`apps-script/README.md`](../../../apps-script/README.md). Treat this as a
separate V8 Apps Script runtime with Google Sheets state and public global entry
points; keep Next.js, React, Convex clients, and Node-only dependencies out.

Trace a trigger from its public global through `AggregationJobs.js`, `features`,
`Core`, and configuration before editing it. Preserve active-season resolution,
trigger deduplication, delayed finalization, and verbose/dry-run properties.

`DRY_RUN_MODE` defaults to false and is not a side-effect barrier:
`aggregateCurrentSeason()` still manages its follow-up trigger, and power setup
may add columns before the dry-run branch. Confirm the clasp project, Script
Properties, and full call path before executing an entry point.

`npm run deploy` means `clasp push`; it changes the remote project but creates
no versioned deployment and installs no triggers. A remote push, trigger change,
or property change requires user authorization and target confirmation.

Ranking/power files under `apps-script/` are synchronized output. Edit
`scripts/src/runtime/apps-script/` through `gshl-ranking`, then sync and inspect
every destination diff.

Use focused local/parity tests. For an authorized remote check, inspect clasp
logs after the push; do not infer success from upload completion.
