# Yahoo Scraper Module

`apps-script/features/YahooScraper.js`

## Purpose

Handles current-day Yahoo roster ingestion for the active season.

## Supported Public API

- `YahooScraper.updatePlayerDays()`

## Runtime Responsibilities

- resolve the active scrape date
- resolve the active season and week
- fetch Yahoo roster pages for active teams
- build and score `PlayerDayStatLine` rows
- build `TeamDayStatLine` rows
- apply lineup optimization and LT handling for the current season

## Removed Scope

The following are no longer part of the supported Apps Script surface:

- week-id or week-num matchup table repair flows
- manual historical lineup repair
- exported Yahoo HTML/table parsing helpers
- deprecated historical scrape paths
