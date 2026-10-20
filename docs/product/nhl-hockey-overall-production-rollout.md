# Reviewed NHL hockey overall production rollout

Updated: 2026-10-19. **All 14 nonfuture seasons are verified published.**
The rollout is additive under `nhl-hockey-overall-reviewed-v1` in
`nhlSeasonValues`. The two future seasons remain pending without fabricated data.
The final independent production audit passed for all 13,915 records.
The independent artifact backup is complete and verified outside OneDrive.

The calculation follows the [sealed production policy](nhl-hockey-overall-production-policy.md):
GB whole-game crossfit shot values, fixed impact ridge lambda 4, and annual
same-position replacement references. The [rating description](nhl-overall-rating.md)
explains the contribution score and separate ability estimate. The
[retrospective confirmation protocol](nhl-2025-retrospective-confirmation-protocol.md)
records the scientific confirmation and prior-exposure caveat. The experimental
goalie reference blend is not the production method.

## Published seasons

| NHL season | Snapshot         | Stored records | Rollout journal status |
| ---------- | ---------------- | -------------: | ---------------------- |
| 2013–14    | Completed season |            983 | unchanged              |
| 2014–15    | Completed season |            974 | unchanged              |
| 2015–16    | Completed season |            990 | published              |
| 2016–17    | Completed season |            983 | published              |
| 2017–18    | Completed season |            985 | published              |
| 2018–19    | Completed season |            999 | published              |
| 2019–20    | Completed season |            970 | published              |
| 2020–21    | Completed season |          1,011 | published              |
| 2021–22    | Completed season |          1,123 | published              |
| 2022–23    | Completed season |          1,058 | published              |
| 2023–24    | Completed season |          1,022 | unchanged              |
| 2024–25    | Completed season |          1,023 | unchanged              |
| 2025–26    | Completed season |          1,038 | unchanged              |
| 2026–27    | Season to date   |            756 | unchanged              |
| **Total**  |                  |     **13,915** |                        |

**10,029 records qualify for an overall rank**; the remaining 3,886 are retained
without a qualified overall rank.

The current-season canonical source was fetched at **2026-10-19 13:40:41.788
UTC**. Its records describe that completed-game snapshot; they do not imply
season completion. Stored records include provisional and withheld values where
sample, coverage or reference support is insufficient. A stored record does not
automatically carry a qualified overall rank.

The pinned database inventory contains **14 nonfuture targets**: 13 completed
seasons and one current season. All 14 have completed publication and their
per-season unchanged verification. The two future seasons, 2027–28 and 2028–29, remain explicit
future pending entries, with no source collection or fabricated ratings.

## Verified preservation

The initial six-season batch received an independent read-back across all 16
database seasons: all **26,318 pre-existing v1/v3 records were unchanged**,
including stored fields and finalized legacy records. That proof covers the
initial **5,796** new records. Its repeated publisher dry-run reported zero
inserts, zero updates and 5,796 unchanged records.

The rollout journal at **2026-10-19 17:02:34.827 UTC** records all 14 nonfuture
seasons complete. Each received its own zero-insert, zero-update, fully unchanged
verification. The **13,915 records** are bound by the
[per-season completion evidence](../../.local-data/nhl-rating/production-readiness-20261019/rollout-fourteen-doc-evidence.json).
The [final native replay and rank proof](../../.local-data/nhl-rating/production-20261019/final-publication-evidence/proof.json)
passed for every season, including global competition ranks and exact published
metadata and contribution values.

A subsequent [independent ten-season read-back](../../.local-data/nhl-rating/production-20261019/production-ten-independent-proof.json)
checked all 16 database seasons at **2026-10-19 16:02:55.082 UTC**. All **26,318
legacy rows remained exactly unchanged**, and all **9,724 reviewed rows matched
their expected metadata and results**. Canonical NHL player identities were
verified for every reviewed row; the eight unlinked NHL identities still had no
matching player in the canonical index. The original 16-season inventory was
unchanged. This intermediate proof is retained alongside the completed final
verification below.

The [final independent production read-back](../../.local-data/nhl-rating/production-20261019/production-final-independent-proof.json)
completed at **2026-10-19 17:06:45.217 UTC**. Across all 16 original database
seasons, all **26,318 legacy records remained exactly unchanged** and all
**13,915 new records matched every expected value and metadata field**. Their
10,029 qualified ranks matched the final native plan. Canonical identity checks
covered all 13,915 rows; the eight unlinked NHL identities still had no matching
player in the canonical index. Both future seasons contained zero new ratings,
and the original season inventory was unchanged. The proof binds the exact
[final combined publication plan](../../.local-data/nhl-rating/production-20261019/final-publication-evidence/plan.json)
bytes used for verification. Existing GSHL category ratings and salary research
remain separate.

Before publication, the original records were exported to an independent
`gshl-backups/nhl-overall-before-20261019` directory under the operator's user
profile, outside the repository and OneDrive. The backup manifest records each
season's path, row count and verified SHA256. The working `.local-data` copies
are operational evidence, not the independent backup.

Backend deployment used an isolated, reviewed overlay. It replaced only the
two reviewed rating modules and added five dependency chunks; **141 existing
modules remained byte-for-byte hash-identical**. The schema added only optional
`nhlSeasonValues.hockeyOverall`. Production cron, frontend, authentication and
Node code were retained. Independent post-deployment hash verification passed,
and the repeated deployment dry-run reported no changes.

## Source reconciliation

Source failures remain withheld until the original source gates pass. Repairs
retain the downloaded inputs and failed attempts; they change neither the
rating math nor the 98% coverage requirement.

For game **2015020071**, two shots shared the same player and clock. The official
play report, event order, on-ice players and shot-count progression identified
**261 as an ordinary shot and 263 as the penalty shot**. An additive cached
penalty-shot supplement identifies only event 263. The original sources and
ambiguous-match failure remain preserved in the
[2015 repair proof](../../.local-data/nhl-rating/production-readiness-20261019/2015-penalty-shot-repair.json).

The 2019–20 source preparation reached **97.1531%** verified process exposure
after its initial alternate-report repairs and was withheld. Review of all 232
warned games produced a separately reviewed correction for **23 games and 70
players**. The corrected inputs use verified roster identities, explicit HTML
clocks, independent period and overall official TOI and strength totals, unique
API-open suffixes ending at the actual period end, and uniquely determined
full-period goalie exposure. Continuous goalie rows crossing a period boundary
form a separate proof class; an API prefix is not claimed where it is absent.
All 778 relevant goalie event witnesses were checked for coverage and
contradictions.

The fork preserves **all 5,765 original cache files unchanged**. It contains
5,742 byte-identical copies and 23 corrected derived shift files; the 23 original
derived files are retained separately with their hashes. The
[reviewed input ledger](../../.local-data/nhl-rating/production-readiness-20261019/2019-correction-input-ledger.json)
and [independent fork read-back proof](../../.local-data/nhl-rating/production-readiness-20261019/2019-root-fork-readback-proof.json)
bind the original sources, corrected intervals and unchanged calculation code.
Eighteen auxiliary shift-count comparisons remain warnings: their explicit row
counts exceed the reported counters by one, consistently alongside a malformed
boundary row. These counts are not presented as passing reconciliation and do
not determine rating values.

Fresh preparation and the full frozen season builder subsequently accepted the
corrected sources at **98.051742%** process coverage. All **93,094 shot rows**
passed native inference verification, and both fixed-lambda-4 full-season fits
converged. The accepted checkpoint contains **970 records, including 735 ranked
players**, as bound by the
[checkpoint and five-phase integrity proof](../../.local-data/nhl-rating/production-readiness-20261019/2019-corrected-checkpoint-copy-proof.json).
The rollout journal now confirms publication and a fully unchanged per-season
read-back for those 970 records.

The initial 2020–21 preparation also failed process coverage. All **215 original
repair targets** were completed before fresh preparation; seven alternate
reports failed strict source validation and remain explicit in the
[completed repair manifest](../../.local-data/nhl-rating/production-20261019/2020-original-repair-completed.json).
A [fresh source audit](../../.local-data/nhl-rating/production-20261019/build/runs/1792429053329-40464/20202021/source-initial/source-manifest.json)
then passed all four original gates using the same cache, without a source fork
or relaxed thresholds. The final frozen calculation produced 1,011 records, and the rollout journal
confirms publication and a fully unchanged verification for this season.

The portable dependency manifest explicitly retains both the effective corrected
cache and all correction evidence, as well as the original collection cache and
failed 2019 attempts. Its
[final fourteen-season snapshot](../../.local-data/nhl-rating/production-readiness-20261019/portable-dependencies-final-fourteen.json)
records all 14 actual ready checkpoints and both future pending entries. The
native and production verification proofs and independent artifact backup all
pass.

The dependency ledger separately discloses five unavailable historical producer
code bindings. Current scoring runtimes, fitted models, verified predictions and
original statistical inputs remain bound to their own hashes; current producer
files are not labeled as the missing historical bytes. The historical policy
snapshot was recovered exactly.

## Independent artifact backup

The completed archive is
`C:/Users/choug/gshl-backups/nhl-overall-after-20261019`, outside the repository
and OneDrive. Its [verification record](C:/Users/choug/gshl-backups/nhl-overall-after-20261019/verified.json)
confirms **77,736 files and 2,626,290,948 bytes** were copied and verified at
**2026-10-19 17:17:57.150 UTC**. Every source and destination file received final
hash read-back checks, including confirmation that the source bytes remained
unchanged during copying. The [backup manifest](C:/Users/choug/gshl-backups/nhl-overall-after-20261019/backup-manifest.json)
hash also matches the independently rechecked reviewed dry-plan:
`d821297dd8e811f8880339d606cf1556311be4821c3142c010f1d3e033d53fca`.

The archive retains fitted models, predictions, original statistical inputs,
public source caches, repair evidence, exact current scoring runtimes, production
rating source snapshots and operator code. Five historical producer-code bindings
remain explicitly unavailable; current files are not substituted under those
old hashes. The current runtime, saved-model and source-input bindings remain
exact.

This is a portable NHL math/operator archive on the repository and npm dependency
base, with a bounded 30-file literal source dependency closure. It is not a full
application, backend or `node_modules` restore. Immutable artifact bytes retain
their original absolute paths; the manifest maps each original path to its
backup location for relocation to another computer. The separate before-rollout
legacy-record archive remains preserved independently.

## Scoped verification

Verification passed **86 targeted checks**: 71 focused production and shared
ranking tests, plus 15 backup proof and dependency guard tests. The 71 comprise 35 backend,
publication, deployment and compatibility tests; five rollout tests; and all 31
ranking-engine parity tests. The ranking check was repeated at 15:53 UTC on
2026-10-19. ESLint passed for the three changed backend files; operator files
were verified with scoped strict TypeScript and Prettier because the repository
ESLint configuration ignores them. No frontend build was required because this
rollout changes no frontend code.

## Local evidence and continuation

These operator artifacts are retained locally and are not committed source data:

- [Independent initial-batch parity proof](../../.local-data/nhl-rating/production-20261019/production-initial-six-independent-proof.json).
- [Initial-batch idempotency proof](../../.local-data/nhl-rating/production-20261019/publish-initial-six-verify/summary.json).
- [Post-deployment module hash proof](../../.local-data/nhl-rating/production-readiness-20261019/backend-overlay-post-apply-proof.json).
- [Before-rollout legacy backup manifest](../../.local-data/nhl-rating/production-readiness-20261019/backup-manifest.json).
- [Legacy salary-reader regression proof](../../.local-data/nhl-rating/production-readiness-20261019/salary-reader-regression-proof.json).

The finite, resumable rollout consumes existing ready checkpoints through the
frozen builder and publisher. Each season receives its own dry-run, additive
apply if inserts are needed, and a fully unchanged verification. It does not
fit models, collect sources or deploy backend code. Partial batches remain
available for exact resume, and failures do not hide other ready seasons.
Missing, failed and future seasons remain visible in the rollout journal.
The command reference is its `--help`, linked from [scripts/README.md](../../scripts/README.md).

This is retrospective observed contribution with measured source and reference
limits. Current-season estimates can be provisional; unsupported values remain
withheld. Playoffs are outside the sealed policy. The current-season snapshot and future pending entries retain those limitations.
