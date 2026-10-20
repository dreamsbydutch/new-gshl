# Career stat reconciliation

Completed October 20, 2026 on production Convex `polished-tern-709`.
This repair covers GSHL career splits and career totals across all 16 stored
seasons. It follows the uniform rating rollout and repairs native statistics;
it does not recalibrate the rating model.

## Findings and correction

The audit found 681 existing career rows with incorrect GP or GS: 306 career
splits and 375 career totals. The four previously flagged rows were Dylan
Holloway's career split, Ryan Strome's career split, and Filip Zadina's career
split and total. Their opening-week DNP records had incorrectly become career
appearances; the corrected GP and GS are zero.

The broader comparison also found stale counting stats, goalie workload and
rates, category availability, and metadata. The old career calculation applied
the current season's category mask to historical player weeks. Historical
categories could therefore disappear from career totals. There were also 288
missing career splits and 14 missing career totals, all for 2026–27.

The replacement calculator combines season splits into career splits and season
totals into career totals, preserving the distinction for traded players. Fresh
current-season rows replace that season's stored population. Historical known
zeros remain zeros; categories never recorded remain blank. Goalie rates use
pooled goals allowed, minutes, saves and shots. Verified official accounting
exceptions remain intact. Player days and season source statistics were not
changed by this repair.

## Production result

| Table         | Existing rows updated | Rows added | Final rows |
| ------------- | --------------------: | ---------: | ---------: |
| Career splits |                 5,009 |        288 |     11,180 |
| Career totals |                 1,310 |         14 |      1,865 |
| Total         |                 6,319 |        302 |     13,045 |

No rows were deleted. Patches preserved existing IDs, creation times, unrelated
fields, and all four published rating fields on the 12,743 existing rows.
New rows received the corresponding season-composed contribution rating,
average rating, appearance count and model version.

A fresh production readback verified every career row against its season
sources. It found zero remaining native-stat changes, missing keys or duplicate
career keys. All 32 season source files were byte-identical before and after.
Full preimage comparison verified existing unmanaged fields and ratings.

## Evidence and validation

Local evidence lives in `.local-data/career-native-repair-20261020/`:

- `preview/plan.json`: reviewed complete plan, SHA-256
  `f5acb2aa2265e931a226b6e4d4065331498309842757a3d3f4e35f6ea760ba21`.
- `independent-preview-audit.json`: separate Python Decimal audit of 211,731
  additive values, category availability, pooled rates, metadata and ratings.
- `apply/proof.json`: 6,319 updates, 302 inserts and zero deletions.
- `verify/proof.json`: all 13,045 rows verified, zero residual changes, existing
  ratings and unmanaged fields preserved, season sources unchanged.
- `before/`, `preflight/`, `after/`: complete snapshots and hash manifests.

An independent byte-verified backup is outside OneDrive at
`C:/Users/choug/gshl-backups/career-native-repair-20261020/`.
Its reviewed pre-write manifest SHA-256 is
`42a223698743f1fa3b0f3628d5a3df7068dc5a70a67b3711fe886f1b2e091db8`.
The apply checked the complete preflight snapshot against the reviewed source
before serial transactional batches. The whole repair was not one transaction;
the complete final readback establishes the resulting state.

The ongoing operator calculator was corrected alongside the data. Eighteen
focused career and season aggregation tests passed, including historical
category changes, bench GP versus GS, traded players, current-season replacement,
pooled goalie rates and immutable inputs. Scoped TypeScript, formatting and
focused diff checks passed. Operator files are ignored by ESLint. No full
application build or backend deployment was needed for this operator-only fix;
the ranking runtime contract did not change.
