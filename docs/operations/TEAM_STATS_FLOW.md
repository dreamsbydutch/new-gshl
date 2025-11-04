# Team Stats Aggregation Flow

Complete guide to aggregating PlayerDay records through the team stats hierarchy.

---

## Overview

The GSHL team stats system aggregates individual player performance data through multiple hierarchical levels to create comprehensive team statistics and standings.

```
PlayerDay (Yahoo scraper)
    ↓
TeamDay (by date)
    ↓
TeamWeek (by week)
    ↓
TeamSeason (by season + type)
    ↓
Matchup scores & standings
```

---

## Data Flow

### 1. PlayerDay → TeamDay

**Purpose**: Aggregate individual player stats into daily team totals

**Grouping**: `gshlTeamId` + `date`

**Stats Aggregated**:

- **Counting stats**: G, A, P, SOG, HIT, BLK, PIM, PPP
- **Games**: GP, GS (games started by goalies)
- **Goalie stats**: W, GA, SV, SA, SO
- **Time**: TOI (total ice time)
- **Roster**: IR, IR+, MG (missing games)
- **Lineup**: ADD (new additions), MS (missed starts), BS (bad starts)
- **Performance**: Rating (average player ratings)

**Endpoint**: `teamStats.daily.aggregateAndCreateFromPlayerDays`

**Example**:

```typescript
// Aggregate all player-days for Week 7-01
const result = await caller.teamStats.daily.aggregateAndCreateFromPlayerDays({
  weekId: "7-01",
  dryRun: false,
});

// Result:
// {
//   count: 84,
//   created: 84,
//   updated: 0,
//   summary: {
//     input: { totalPlayerDays: 1,234, uniqueTeams: 12, uniqueDates: 7 },
//     output: { totalTeamDays: 84, averagePlayersPerTeamDay: "14.69" }
//   }
// }
```

---

### 2. TeamDay → TeamWeek

**Purpose**: Aggregate daily team performance into weekly summaries

**Grouping**: `gshlTeamId` + `weekId`

**Stats Aggregated**:

- **Sum all TeamDay stats**: G, A, P, SOG, HIT, BLK, etc.
- **Calculated stats**: GAA (goals against average), SVP (save percentage)
- **Days played**: Track number of game days in the week

**Side Effects**:

- **Updates Matchup scores**: Calculates team scores for each matchup based on weekly stats
- **Determines winners**: Sets `homeWin`, `awayWin`, `tie` flags
- **Records scores**: Updates `homeScore`, `awayScore` fields

**Endpoint**: `teamStats.weekly.aggregateAndCreateFromDays`

**Example**:

```typescript
// Aggregate team-days for Week 7-01
const result = await caller.teamStats.weekly.aggregateAndCreateFromDays({
  weekId: "7-01",
  dryRun: false,
});

// Result:
// {
//   count: 12,
//   created: 12,
//   updated: 0,
//   summary: {
//     input: { totalTeamDays: 84, uniqueTeams: 12, uniqueWeeks: 1 },
//     output: { totalTeamWeeks: 12, averageDaysPerWeek: "7.00" }
//   },
//   matchups: {
//     updated: 6,
//     errors: []
//   }
// }
```

---

### 3. TeamWeek → TeamSeason

**Purpose**: Aggregate weekly team performance into seasonal summaries

**Grouping**: `gshlTeamId` + `seasonId` + `seasonType`

**Season Types**:

- **REGULAR_SEASON**: Regular season weeks (RS, CC, NC)
- **PLAYOFFS**: Playoff weeks (PO, CC, NC for playoff context)
- **LOSERS_TOURNAMENT**: Losers tournament weeks (LT)

**Stats Aggregated**:

- **Sum all TeamWeek stats**: G, A, P, SOG, HIT, BLK, etc.
- **Calculated stats**: GAA, SVP
- **Record**: W, L, Tie (from Matchup results)
- **Home/Away splits**: HW, HL (home wins/losses)
- **Conference/Playoff**: CCW, CCL, POW, POL, etc.
- **Streak**: Current win/loss streak (e.g., "3W", "2L")
- **Roster**: playersUsed (unique players who played)

**Rankings Calculated**:

- **overallRk**: Overall league ranking
- **conferenceRk**: Conference ranking
- **wildcardRk**: Wildcard ranking (for non-division leaders)
- **losersTournRk**: Losers tournament ranking

**Endpoint**: `teamStats.season.aggregateAndCreateFromWeeks`

**Example**:

```typescript
// Aggregate all team-weeks for Season 7
const result = await caller.teamStats.season.aggregateAndCreateFromWeeks({
  seasonId: "7",
  dryRun: false,
});

// Result:
// {
//   count: 24,
//   created: 24,
//   updated: 0,
//   summary: {
//     input: { totalTeamWeeks: 276, uniqueTeams: 12, totalMatchups: 138 },
//     output: { totalTeamSeasons: 24, regularSeasons: 12, playoffs: 12 }
//   }
// }
```

---

## Running the Complete Flow

### Option 1: Use the Script (Recommended)

**Update all team stats**:

```bash
npm run team:update-all
```

**Update specific season**:

```bash
npm run team:update-all -- --season=7
```

**Update specific week**:

```bash
npm run team:update-all -- --week=7-01
```

**Preview without changes**:

```bash
npm run team:update-all -- --dry-run
```

### Option 2: Use the tRPC Endpoint

**Rebuild stats for a specific date**:

```typescript
import { api } from "@/trpc/server";

const result = await api.statAggregation.rebuildStatsForDate({
  date: new Date("2025-01-15"),
});

// This triggers the complete flow for that date's week
```

### Option 3: Manual Step-by-Step

**1. Aggregate PlayerDays → TeamDays for a week**:

```typescript
const teamDaysResult =
  await api.teamStats.daily.aggregateAndCreateFromPlayerDays({
    weekId: "7-01",
  });
```

**2. Aggregate TeamDays → TeamWeeks for that week**:

```typescript
const teamWeeksResult = await api.teamStats.weekly.aggregateAndCreateFromDays({
  weekId: "7-01",
});
```

**3. Aggregate TeamWeeks → TeamSeasons for the season**:

```typescript
const teamSeasonsResult =
  await api.teamStats.season.aggregateAndCreateFromWeeks({
    seasonId: "7",
  });
```

---

## When to Run

### After Yahoo Scraper

When you scrape new roster data from Yahoo:

```bash
# 1. Scrape Yahoo data (creates PlayerDay records)
# 2. Calculate player ratings
npm run ranking:update-all

# 3. Optimize lineups
npm run lineup:update-all

# 4. Aggregate team stats
npm run team:update-all
```

### After Manual Data Changes

If you manually update PlayerDay records in Google Sheets:

```bash
# Re-aggregate affected weeks/seasons
npm run team:update-all -- --week=7-15
```

### Weekly Maintenance

For ongoing season maintenance:

```bash
# Complete weekly update
npm run ranking:update-all  # Update all player ratings
npm run lineup:update-all   # Optimize all lineups
npm run team:update-all     # Aggregate all team stats
```

---

## Data Dependencies

### Required Data

Before running team stats aggregation, ensure you have:

1. **PlayerDay records**: Raw player performance data

   - Source: Yahoo scraper or manual entry
   - Location: `PlayerDays_*` Google Sheets workbooks

2. **Week metadata**: Week definitions

   - Must have: `id`, `weekType`, `seasonId`, `startDate`, `endDate`
   - Location: `Week` Google Sheets tab

3. **Team metadata**: Team information

   - Must have: `id`, `confId` (conference)
   - Location: `Team` Google Sheets tab

4. **Matchup data**: Game matchups
   - Must have: `id`, `weekId`, `homeTeamId`, `awayTeamId`
   - Location: `Matchup` Google Sheets tab

### Google Sheets Structure

**TeamDayStatLine** columns:

```
id, seasonId, weekId, date, gshlTeamId, GP, GS, G, A, P, PM, PIM, PPP, SOG,
HIT, BLK, W, GA, SV, SA, SO, TOI, Rating, ADD, MS, BS, IR, IRplus, MG, ...
```

**TeamWeekStatLine** columns:

```
id, seasonId, weekId, gshlTeamId, days, GP, GS, G, A, P, PM, PIM, PPP, SOG,
HIT, BLK, W, GA, GAA, SV, SA, SVP, SO, TOI, Rating, ADD, MS, BS, IR, IRplus,
MG, ...
```

**TeamSeasonStatLine** columns:

```
id, seasonId, seasonType, gshlTeamId, days, GP, GS, G, A, P, PM, PIM, PPP,
SOG, HIT, BLK, W, GA, GAA, SV, SA, SVP, SO, TOI, Rating, ADD, MS, BS,
teamW, teamL, teamTie, teamHW, teamHL, teamCCW, teamCCL, teamPOW, teamPOL,
streak, overallRk, conferenceRk, wildcardRk, playersUsed, ...
```

---

## Performance

### Typical Runtimes

- **PlayerDay → TeamDay**: ~100ms per week (12 teams × 7 days)
- **TeamDay → TeamWeek**: ~50ms per week (12 teams)
- **TeamWeek → TeamSeason**: ~200ms per season (24 records: 12 RS + 12 PO)

**Full season update** (23 weeks):

- Total time: ~18-25 seconds
- Rate: ~0.8 seconds per week

### Rate Limiting

The script includes built-in rate limiting:

- **500ms delay** between weeks
- **Exponential backoff** on quota errors (10s, 20s, 40s, 80s, 160s)
- **Up to 5 retry attempts** per operation

### Memory Usage

Team stats aggregation is memory-efficient:

- No special Node flags needed
- Processes one week at a time
- Streams data from Google Sheets

---

## Troubleshooting

### "No week found for date"

**Problem**: The date you're trying to process doesn't match any week in the database.

**Solution**: Check `Week` table in Google Sheets to ensure the date falls within a week's `startDate` and `endDate`.

### "Matchup not found"

**Problem**: TeamWeek aggregation can't find the corresponding matchup.

**Solution**: Ensure `Matchup` records exist for the week with correct `homeTeamId` and `awayTeamId`.

### "Duplicate team-week records"

**Problem**: Multiple TeamWeek records for the same `gshlTeamId` + `weekId` combination.

**Solution**: The script uses upsert logic, so this shouldn't happen. If it does, manually delete duplicates in Google Sheets.

### Google Sheets quota exceeded

**Problem**: Too many API write requests in a short time.

**Solution**: The script has built-in rate limiting, but if you're running multiple scripts concurrently, wait a few minutes and retry.

---

## Related Documentation

- [NPM Scripts Reference](NPM_SCRIPTS.md) - Command line reference
- [Scripts & Utilities](SCRIPTS.md) - Detailed script documentation
- [Lineup Optimizer](../backend/LINEUP_OPTIMIZER.md) - Lineup optimization algorithm
- [Ranking Engine](../backend/RANKING_ENGINE.md) - Player rating system
- [Data Layer](../core-systems/DATA_LAYER.md) - Data structure reference
