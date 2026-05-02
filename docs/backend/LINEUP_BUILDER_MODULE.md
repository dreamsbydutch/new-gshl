# Lineup Builder Module

`apps-script/features/LineupBuilder.js`

## Purpose

Provides the runtime lineup optimizer used during current-day Yahoo ingestion.
It assigns:

- `bestPos`
- `fullPos`
- `GS`
- `MS`
- `BS`
- `ADD`

## Supported Public API

- `LineupBuilder.optimizeLineup(players)`
- `LineupBuilder.findBestLineup(players, skipValidation, slots)`
- `LineupBuilder.getLineupStats(players)`

## Notes

- This module is no longer a maintenance surface for recomputing historical
  PlayerDay rows in-place.
- Apps Script uses it only as part of current-day ingest and current-season
  processing.
