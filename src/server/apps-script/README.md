# GSHL Apps Script - Clean File Structure

This folder has been cleaned and organized for maximum efficiency and maintainability.

## File Organization

### `/calculations/` - Core Rating System

- **`rating-orchestrator.gs`** - Main entry point for all rating operations
  - `updateTeamRatings()` - Master function for any rating update
  - `calculateSingleTeamRating()` - Individual team rating calculations
  - `generateRatingReport()` - Analytics and reporting functions
- **`hockey-stats.gs`** - Core rating calculation functions

  - `calculateTeamDayRating()` - Daily performance ratings
  - `calculateTeamWeekRating()` - Weekly performance with normalization
  - `calculateTeamSeasonRating()` - Season performance with normalization
  - `calculateTeamYTDRating()` - Year-to-date projection ratings
  - `calculateTeamPowerRating()` - Current form and power ratings

- **`team-rating-updater.gs`** - Batch update operations

  - Functions to update all teams across different timeframes
  - Spreadsheet integration and ranking calculations

- **`player-percentile-ratings.gs`** - Weekly player performance rating system

  - `generatePlayerRatingScales()` - Generate hard-coded percentile scales
  - `testPlayerData()` - Verify data availability
  - `demonstratePlayerRatings()` - Show example rating calculations
  - Position-specific percentile scales for stable weekly player ratings

- **`player-nhl-ratings.gs`** - Universal NHL stats rating system
  - `generatePlayerNHLRatingScales()` - Generate universal NHL percentile scales (all seasons)
  - `testPlayerNHLData()` - Verify NHL stats data availability across all seasons
  - `demonstratePlayerNHLRatings()` - Show example universal NHL rating calculations
  - `compareWeeklyVsUniversalRatings()` - Compare weekly performance vs universal NHL talent
  - Universal percentile scales using ALL historical NHL data for cross-season comparisons

### `/utils/` - Utility Functions

- **`rating-utils.gs`** - Rating-specific utilities

  - Statistical functions (z-score conversion, variance calculation)
  - Normalization utilities (days factors, season projections)
  - Engagement adjustments and efficiency calculations

- **`utils.gs`** - General Google Sheets utilities

  - Type conversion functions
  - Spreadsheet operation helpers
  - Data validation utilities

- **`data-hooks.gs`** - Database fetching utilities
  - Comprehensive hooks for all database tables
  - Type-safe data conversion and filtering
  - Enhanced objects with related data joins

### `/core/` - Configuration and Setup

- **`config.gs`** - Global configuration settings
- **`main.gs`** - Main application entry points
- **`rating-baselines.gs`** - Statistical baselines for rating calculations

### `/aggregation/` - Data Processing

- Team and player data aggregation functions
- Weekly/seasonal summary calculations

## Key Features of This Clean Structure

✅ **No Code Duplication** - All functionality consolidated  
✅ **Clear Separation of Concerns** - Each file has a specific purpose  
✅ **Easy to Maintain** - Centralized utilities and consistent patterns  
✅ **Efficient Performance** - Optimized batch operations and caching  
✅ **Comprehensive API** - Single entry point for all operations

## Quick Start

```javascript
// Update all ratings for current week
updateTeamRatings(12, "all");

// Update specific rating type
updateTeamRatings(12, "ytd");

// Calculate individual team rating
const rating = calculateSingleTeamRating(teamData, "weekly");

// Generate analytics report
const report = generateRatingReport(12);

// === Player Rating Examples ===

// Generate weekly player rating scales (run once)
generatePlayerRatingScales();

// Generate NHL season rating scales (run once)
generatePlayerNHLRatingScales();

// Test player data availability
testPlayerData();
testPlayerNHLData();

// See example player ratings
demonstratePlayerRatings();
demonstratePlayerNHLRatings();

// Compare weekly vs universal performance
compareWeeklyVsUniversalRatings(playerId, weekId);

// === Data Fetching Examples ===

// Get all weeks for a season
const weeks = getWeeksBySeasonId(5);

// Get team by ID with full details (franchise, owner, conference)
const team = getTeamWithDetails(12);

// Get all players on a specific team
const players = getPlayersByTeamId(12);

// Get current active season
const currentSeason = getCurrentSeason();

// Get matchups for a specific week
const matchups = getMatchupsByWeekId(15);

// Get team stats for a week
const teamStats = getTeamWeekStatsBySeason(5, 12);

// Get player stats for a week
const playerStats = getPlayerWeekStatsByWeek(15, 123);
```

## File Dependencies

```
rating-orchestrator.gs
├── hockey-stats.gs
├── team-rating-updater.gs
└── rating-utils.gs

hockey-stats.gs
├── rating-utils.gs
└── rating-baselines.gs

team-rating-updater.gs
├── hockey-stats.gs
├── rating-utils.gs
└── utils.gs

data-hooks.gs
├── utils.gs (type conversion)
└── config.gs (schemas & workbook mapping)
```

## Available Data Hooks

### General Data (GENERAL workbook)

- `getSeasons()` / `getSeasonById(id)` / `getCurrentSeason()`
- `getWeeksBySeasonId(seasonId)` / `getWeekById(id)` / `getCurrentWeek()`
- `getTeamsBySeasonId(seasonId)` / `getTeamById(id)` / `getTeamWithDetails(id)`
- `getFranchises()` / `getFranchiseById(id)`
- `getOwners()` / `getOwnerById(id)`
- `getPlayers()` / `getPlayerById(id)` / `getPlayersByTeamId(teamId)`
- `getContracts()` / `getContractsByPlayerId(playerId)` / `getActiveContractsBySeason(seasonId)`
- `getMatchupsByWeekId(weekId)` / `getMatchupsBySeasonId(seasonId)` / `getMatchupsByTeamId(teamId)`
- `getConferences()` / `getConferenceById(id)`

### Team Stats (TEAMSTATS workbook)

- `getTeamDayStatsByWeek(weekId, teamId?)`
- `getTeamWeekStatsBySeason(seasonId, teamId?)`
- `getTeamSeasonStats(seasonId, teamId?)`

### Player Stats (PLAYERSTATS workbook)

- `getPlayerWeekStatsByWeek(weekId, playerId?)`
- `getPlayerNHLStatsBySeason(seasonId, playerId?)`
- `getPlayerSplitStats(seasonId, teamId?, playerId?)`

### Player Days (PLAYERDAYS workbook)

- `getPlayerDayStatsByWeek(weekId, playerId?)`
- `getPlayerDayStatsByTeamWeek(weekId, teamId)`

This structure provides a clean, efficient, and maintainable rating system with no excess code or duplication.
