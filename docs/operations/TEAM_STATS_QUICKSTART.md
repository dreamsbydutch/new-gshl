# Quick Start: Team Stats Aggregation

## TL;DR

To update all team stats from PlayerDay records:

```bash
npm run team:update-all
```

That's it! This will:

1. Aggregate PlayerDays → TeamDays (by date)
2. Aggregate TeamDays → TeamWeeks (by week)
3. Aggregate TeamWeeks → TeamSeasons (by season)
4. Update Matchup scores

---

## Common Workflows

### After Yahoo Scraper

```bash
# Complete post-scrape workflow
npm run lineup:update-all   # 1. Optimize lineups
npm run team:update-all     # 2. Aggregate team stats
```

Player ratings are refreshed by Apps Script aggregation.

### Update Specific Season

```bash
npm run team:update-all -- --season=7
```

### Update Specific Week

```bash
npm run team:update-all -- --week=7-15
```

### Preview Changes (Dry Run)

```bash
npm run team:update-all -- --dry-run
```

---

## What Gets Updated

| Sheet                  | Description              | Example Record                           |
| ---------------------- | ------------------------ | ---------------------------------------- |
| **TeamDayStatLine**    | Daily team totals        | Team A on 2025-01-15: 12 G, 18 A, 45 SOG |
| **TeamWeekStatLine**   | Weekly team summaries    | Team A in Week 7-01: 7 days, 84 G, 126 A |
| **TeamSeasonStatLine** | Season standings & stats | Team A Season 7 RS: 12-8-2, 2nd in conf  |
| **Matchup**            | Game scores updated      | Week 7-01: Team A 243 - Team B 187       |

---

## Data Flow Diagram

```
┌─────────────┐
│ PlayerDay   │  Raw player stats (from Yahoo scraper)
└──────┬──────┘
       │ Group by: gshlTeamId + date
       ↓
┌─────────────┐
│ TeamDay     │  Daily team totals (e.g., 12 teams × 7 days = 84 records/week)
└──────┬──────┘
       │ Group by: gshlTeamId + weekId
       ↓
┌─────────────┐
│ TeamWeek    │  Weekly summaries (12 records/week)
└──────┬──────┘  + Updates Matchup scores (6 matchups/week)
       │ Group by: gshlTeamId + seasonId + seasonType
       ↓
┌─────────────┐
│ TeamSeason  │  Season standings (24 records: 12 RS + 12 PO)
└─────────────┘  + Rankings, streaks, playoff seeding
```

---

## Example Output

```bash
🚀 Starting Team Stats Update Script

📅 Fetching weeks...
   ✓ Found 23 weeks to process

[1/23] Processing Week 7-01 (REGULAR_SEASON)
   📊 Aggregating PlayerDays → TeamDays...
      ✓ TeamDays: 84 created, 0 updated
   📊 Aggregating TeamDays → TeamWeeks...
      ✓ TeamWeeks: 12 created, 0 updated
      ✓ Matchups: 6 updated

[2/23] Processing Week 7-02 (REGULAR_SEASON)
   ...

📊 Aggregating TeamWeeks → TeamSeasons...
   [1/1] Season 7
      ✓ TeamSeasons: 24 created, 0 updated

✅ Team Stats Update Complete!

Summary:
  Weeks processed: 23
  TeamDays: 1,932 created, 0 updated
  TeamWeeks: 276 created, 0 updated
  TeamSeasons: 24 created, 0 updated
  Matchups updated: 138
  Total time: 21.3s
```

---

## Stats Calculated

### TeamDay (Daily)

- **Counting**: G, A, P, SOG, HIT, BLK, PIM, PPP
- **Goalie**: W, GA, SV, SA, SO, GS
- **Roster**: GP (games played), IR, IR+, MG
- **Lineup**: ADD, MS, BS
- **Performance**: Rating (avg)

### TeamWeek (Weekly)

- **All TeamDay stats** (summed)
- **Calculated**: GAA, SVP
- **Metadata**: days (number of game days)

### TeamSeason (Seasonal)

- **All TeamWeek stats** (summed)
- **Record**: W, L, Tie, HW, HL (home wins/losses)
- **Conference**: CCW, CCL, CCHW, CCHL (conference wins/losses/home)
- **Playoffs**: POW, POL, POHW, POHL (playoff wins/losses/home)
- **Streak**: Current win/loss streak ("3W", "2L", etc.)
- **Rankings**: overallRk, conferenceRk, wildcardRk, losersTournRk
- **Roster**: playersUsed (unique player count)

### Matchup Scores

- **homeScore**: Home team's weekly total (e.g., 243)
- **awayScore**: Away team's weekly total (e.g., 187)
- **homeWin**: Boolean (true if home team won)
- **awayWin**: Boolean (true if away team won)
- **tie**: Boolean (true if tied)
- **isComplete**: Set to true after scoring

---

## Performance

| Operation                  | Time    |
| -------------------------- | ------- |
| Single week (all 3 levels) | ~0.8s   |
| Full season (23 weeks)     | ~18-25s |
| Per team-day               | ~10ms   |

**Safe to run multiple times** - uses upsert logic (create if new, update if exists)

---

## File Locations

| File                                         | Purpose                |
| -------------------------------------------- | ---------------------- |
| `src/scripts/update-all-team-stats.ts`       | Main script            |
| `src/server/api/routers/teamStats.ts`        | tRPC endpoints         |
| `src/lib/utils/stats/stat-orchestrator.ts`   | Orchestration logic    |
| `src/lib/utils/stats/aggregation-configs.ts` | Aggregation configs    |
| `docs/operations/TEAM_STATS_FLOW.md`         | Detailed documentation |

---

## Troubleshooting

**"No week found"**: Check `Week` table in Sheets - ensure dates are correct

**"Quota exceeded"**: Wait a few minutes, the script has automatic retry logic

**"Matchup not found"**: Ensure `Matchup` records exist for the week

**TypeScript errors**: Run `npm run typecheck` to see full error details

---

## Related Commands

```bash
# Lineup optimization
npm run lineup:update-all     # Optimize all lineups

# Team stats (this guide)
npm run team:update-all       # Aggregate all team stats

# Testing
npm run test:lineup-count     # Test lineup data
npm run test:team-sizes       # Test roster sizes
```

---

## Full Documentation

See [TEAM_STATS_FLOW.md](TEAM_STATS_FLOW.md) for complete details on:

- Detailed data flow explanations
- API endpoint examples
- Google Sheets structure
- Troubleshooting guide
