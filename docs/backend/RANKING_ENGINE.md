# Ranking Engine

The Apps Script ranking engine powers current-season rating refreshes only.

## Used By

- `RatingUpdater.updateAllPlayerStatRatingsForSeason(seasonId, options)`
- `PlayerOverallRatingUpdater.updateOverallRatingsForSeason(seasonId, options)`
- daily Yahoo ingest for current-day `Rating` calculation

## Current Scope

- current-season day, week, split, total, and `PlayerNHL` ratings
- current-season matchup-category aware ranking logic
- current-season overall talent ratings

Historical Apps Script rebuild entrypoints have been removed. If old seasons
need to be recomputed, do that outside Apps Script.
