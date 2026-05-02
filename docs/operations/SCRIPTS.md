# Scripts

This repo keeps user-facing data writes in Apps Script. The Next.js app reads
from Sheets and the local TypeScript scripts are maintenance utilities only.

## NPM Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run format:check
npm run format:write
npm run lineup:update-all
npm run team:update-all
npm run test:lineup-count
npm run test:team-sizes
```

## Player Ratings

Player ratings are calculated in Apps Script by
`apps-script/features/RankingEngine/index.js`.

The main aggregation entry points refresh player ratings automatically:

```javascript
aggregateCurrentSeason();
aggregatePastSeason("10", "weeks");
```

- `aggregateCurrentSeason()` and `aggregatePastSeason(seasonId, "days")`
  rerate `PlayerWeek`, `PlayerSplit`, `PlayerTotal`, and `PlayerNHL`.
- `aggregatePastSeason(seasonId, "weeks")` rerates `PlayerWeek`,
  `PlayerSplit`, `PlayerTotal`, and `PlayerNHL`.

`PlayerDay` ratings are skipped in the main season aggregation pipeline so the
job stays under the Apps Script execution limit.

Manual rating backfills also run in Apps Script:

```javascript
RatingUpdater.updateAllPlayerStatRatingsForSeason("12", { dryRun: true });
RatingUpdater.updateAllPlayerStatRatingsForSeason("12", { dryRun: false });
RatingUpdater.updatePlayerNhlRatingsForSeason("12", { dryRun: true });
updatePlayerDayRatingsForSeason("12", { dryRun: true });
updatePlayerDayRatingsForWeeks("12", ["20", "21"], { dryRun: true });
```

`PlayerNHL` writes `seasonRating`; `overallRating` is not changed by the
rating engine.

## Data Scripts

`lineup:update-all` rebuilds optimized lineups for stored team-day records.

`team:update-all` rebuilds team stat aggregates from player stat lines.

The test scripts are targeted diagnostics for lineup counts and team/date roster
sizes.

## After Execution

1. Verify results in Google Sheets.
2. Review the execution log for errors.
3. Commit code or documentation changes when behavior changes.
