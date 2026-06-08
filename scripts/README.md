# GSHL Scripts

Standalone Node/TypeScript data tooling for historical backfills, repair jobs,
bulk sheet maintenance, and parity checks.

This package is intentionally separate from the Next.js app and from
`apps-script/`.

- `scripts/` is the canonical implementation for retrospective workflows.
- `apps-script/` remains focused on current-season operational updates.
- Overlapping formulas and serialization behavior should be kept aligned across
  both runtimes.

## Ranking Engine Source Of Truth

The shared ranking engine also computes team-season award-style outputs on
`TeamSeasonStatLine`:

- `hartRating` / `hartRk`
- `norrisRating` / `norrisRk`
- `vezinaRating` / `vezinaRk`
- `calderRating` / `calderRk`
- `jackAdamsRating` / `jackAdamsRk`
- `GMOYRating` / `GMOYRk`

Those values are derived from regular-season team, player, draft, and standings
data during team-season ranking.

The ranking engine source of truth lives here:

- `scripts/src/runtime/apps-script/features/RankingEngine/config.js`
- `scripts/src/runtime/apps-script/features/RankingEngine/player-pure.js`
- `scripts/src/runtime/apps-script/features/RankingEngine/team-pure.js`
- `scripts/src/runtime/apps-script/features/RankingEngine/index.js`

The Apps Script runtime copy is:

- `apps-script/features/RankingEngine/config.js`
- `apps-script/features/RankingEngine/player-pure.js`
- `apps-script/features/RankingEngine/team-pure.js`
- `apps-script/features/RankingEngine/index.js`

After editing the `scripts` source files, sync the Apps Script copy.

From the repo root:

```bash
npm run ranking-engine:sync
```

From inside `scripts/`:

```bash
npm run ranking-engine:sync
```

To verify parity without copying:

```bash
npm run ranking-engine:check
```

The sync command copies the four runtime files into `apps-script/` and then
verifies their SHA-256 hashes match. CI also runs the check automatically on
ranking-engine changes.

## Awards Backfill

The awards updater rebuilds the `Awards` table in the GENERAL workbook from
season-level team stats, standings ranks, award ratings, and playoff final
matchups.

From inside `scripts/`:

```bash
npm run awards:backfill
npm run awards:backfill -- --season-id 11
npm run awards:backfill -- --season-ids 09,10,11 --apply
```

It runs as a dry-run unless `--apply` is passed. Rows are upserted by
`seasonId + award`, and ids/createdAt/updatedAt are handled by the shared
minimal sheets writer.

Award keys written to the sheet:

- `rocket`: most regular-season `G`
- `artRoss`: most regular-season `P`
- `selke`: most regular-season `HIT + BLK`
- `hart`, `vezina`, `norris`, `calder`, `gmoy`, `jackAdams`: corresponding
  rating/rank fields on `TeamSeasonStatLine`
- `ladyByng`: most `playersUsed`
- `gshlCup`: winner of the completed playoff final matchup
- `brophy`: worst regular-season `overallRk`
- `president`: best regular-season `overallRk`
- `sunview`, `hickory`: best regular-season `conferenceRk` in each conference
