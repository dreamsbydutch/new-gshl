---
name: gshl-ranking
description: >-
  Investigate or change GSHL rating and power calculations. Use for player,
  goalie, team, award, or power algorithms; tuning profiles; entering-week
  snapshots; parity; or runtime synchronization. Exclude UI-only display of an
  already-computed rank.
metadata:
  short-description: Edit the authoritative rating and power runtimes
---

# GSHL ranking and power

The outcome is an explained algorithm change or diagnosis whose affected
cohorts, expected score movement, temporal behavior, and runtime parity are
demonstrated.

Read the relevant algorithm and operational sections of the
[ranking reference](../../../docs/RANKING.md). Trace the caller into the
authoritative runtime under `scripts/src/runtime/apps-script/`; matching files
under `apps-script/` are synchronized deployment copies, never independent
edit targets.

## Diagnose before tuning

Identify the calculation path, comparison pool, position/sheet/season branches,
small-sample behavior, rounding or score scale, and the first week affected.
For power, preserve the entering-week invariant: Week N results can influence
Week N+1 power but cannot rewrite Week N's entering snapshot.

Before changing a constant or formula, state a falsifiable hypothesis: the
cohort that is wrong, why the current calculation causes it, and the expected
direction and approximate scale of movement. Do not retune unrelated profiles
to make a fixture pass.

Keep tunable constants in structured config, pure rating math in its player or
team module, and sheet/context orchestration at the runtime boundary.

## Prove the behavior

Add a focused fixture that is red for the reported behavior and representative
of each affected branch. Run the relevant rating or power tests and parity
command using the season required by the task. Before a parity command, invoke
`gshl-data-operations` for target, runtime, and flag preflight.

After an intentional behavior change, run `npm run ranking-engine:sync`, inspect
every synchronized diff, and then run `npm run ranking-engine:check`. A sync
check proves byte parity only; the focused fixtures and parity result must prove
the numerical behavior.

Any backfill or production recomputation is a separate data operation and needs
fresh authorization. Do not perform it as an implied part of an algorithm edit.

## Completion gate

The work is complete when the hypothesis is supported or rejected with evidence,
every affected branch has representative coverage, expected score/rank movement
is reported, entering-week behavior is preserved, and authoritative/deployed
copies match. Report the exact parity scope and any cohort or historical season
that was not exercised.
