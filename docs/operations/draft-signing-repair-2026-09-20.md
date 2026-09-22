# Draft signing-pick repair — September 20, 2026

Applied to the league's production Convex deployment after a reviewed dry run.
The repair filled 210 existing draft slots. No draft rows were inserted or
deleted, and no contracts or roster records were changed.

| Season | Signing picks filled | Result |
| --- | ---: | --- |
| 2013–14 | 0 | No stored draft or opening contracts |
| 2014–15 | 0 | No stored draft or opening contracts |
| 2015–16 | 0 | No stored draft or opening contracts |
| 2016–17 | 0 | No stored draft or opening contracts |
| 2017–18 | 0 | No stored draft or opening contracts |
| 2018–19 | 0 | No opening contracts in the stored history |
| 2019–20 | 0 | No opening contracts in the stored history |
| 2020–21 | 0 | No opening contracts in the stored history |
| 2021–22 | 48 | All 48 eligible players accounted for |
| 2022–23 | 49 | All 49 eligible players accounted for |
| 2023–24 | 62 | All 62 eligible players accounted for |
| 2024–25 | 50 | 50 repaired; one contracted player already present as an ordinary selection |
| 2025–26 | 0 | Existing 52 signings already account for eligible players |
| 2026–27 | 0 | Existing 47 signings already account for eligible players |
| 2027–28 | 1 | Added Jakub Dobes to an existing empty slot; all 17 eligible players accounted for |
| 2028–29 | 0 | Pending: six contract players, but no season teams or draft order configured |

## Reconciliation decisions

- Contract start, signing, and expiry dates establish opening-season coverage.
  A buyout's later cap-charge end date does not extend playing coverage.
- Opening-day roster records resolve duplicate ownership for Sebastian Aho in
  2021–22 and 2022–23. They also identify the 2022–23 teams carrying Artemi
  Panarin, Mathew Barzal, and Mikhail Sergachev after the recorded contract
  owner's departure. Contract records themselves were preserved.
- A later buyout does not remove a player from an earlier draft class. Buyout
  records contradicted by their owner's opening roster were excluded, including
  stale Ilya Samsonov coverage and later stale coverage for other bought-out
  players. The JSON audits list each exclusion by season.
- The 2022–23 signing placeholders had no owning team and were marked traded.
  Their recorded original teams identified the existing slots to fill. All
  repaired rows now have matching owning/original teams, `isSigning: true`, and
  `isTraded: false`.
- Existing empty slots were consumed from the latest round upward, including
  earlier unused slots when later acquired ordinary selections existed. This
  avoided unnecessary draft extensions. The operator supports inferred
  extensions when the final complete rounds establish the snake direction.
- Filled selections were preserved. In particular, Tom Wilson's existing
  ordinary selection in 2024–25 was not duplicated or relabeled.
- The six pending 2028–29 players are Juraj Slafkovsky, Seth Jarvis, Dylan
  Guenther, Logan Cooley, Lane Hutson, and Matthew Schaefer. Their placement needs
  that season's teams and draft order; an entire draft was not invented.

## Verification

Independent read-back confirmed 2,280 total draft rows, exactly 210 repaired
rows, 2,070 untouched rows, no new duplicate player selections, and unchanged
contracts. Every repaired row has both required flags and its original legacy
import ID. The compatibility update API initially cleared legacy IDs; all 210
were restored from the before-images before this verification. The operator
now preserves that metadata explicitly and checks every existing pick after
applying.

A fresh production dry run reported zero further changes and zero unresolved
repair issues for configured drafts. Eleven focused planner tests and the
scripts package type-check passed. `git diff --check` passed. ESLint excludes
the operator package; no frontend build or ranking recomputation was run.

Local review artifacts are in `.local-data/draft-signings/`: the reviewed plan,
before-images, applied-write journal, legacy-ID restoration list, final dry run,
and independent verification. They are local audit material, not independent
archival backups. The reusable operator is
`scripts/src/commands/draft/repair-signing-picks.ts`; its `--help` is the option
reference.
