# Team Stats Per-Week Processing

## What the Script Does for Each Week

For **every week** in your season, the script performs these steps **in order**:

### Step 1: PlayerDays → TeamDays

```
PlayerDays (individual player stats)
    ↓ Group by: gshlTeamId + date
TeamDays (team totals per date)
```

**Example**: Week 7-01 has 7 game days × 12 teams = 84 TeamDay records created

### Step 2: TeamDays → TeamWeeks

```
TeamDays (daily team stats)
    ↓ Group by: gshlTeamId + weekId
TeamWeeks (weekly team summaries)
```

**Example**: Week 7-01 creates 12 TeamWeek records (one per team)

### Step 3: Update Matchup Scores (Automatic)

```
TeamWeeks (team performance)
    ↓ Calculate scores for each matchup
Matchups (updated with scores & winners)
```

**Example**: Week 7-01 updates 6 Matchup records with scores like:

- Team A: 243 pts vs Team B: 187 pts → Team A wins

---

## Performance Improvements

### Before (SLOW):

- Created new tRPC caller for each week
- **~3-5 seconds per week**

### After (FAST):

- Creates tRPC caller once, reuses for all weeks
- **~0.5-1 second per week**

### Full Season:

- 23 weeks × 0.5s = **~12 seconds total**

---

## Command Usage

```bash
# Process all weeks in all seasons
npm run team:update-all

# Process only Season 7
npm run team:update-all -- --season=7

# Process only Week 7-01
npm run team:update-all -- --week=7-01

# Preview without saving to Google Sheets
npm run team:update-all -- --week=7-01 --dry-run
```

---

## Example Output

```bash
⚙️  Initializing tRPC caller...
   ✓ Ready

[1/23] Processing Week 7-01 (REGULAR_SEASON)
   📊 Aggregating PlayerDays → TeamDays...
      ✓ TeamDays: 84 created, 0 updated (1,234 player-days)
   📊 Aggregating TeamDays → TeamWeeks...
      ✓ TeamWeeks: 12 created, 0 updated
      ✓ Matchups: 6 updated
      ⏱️  Week processed in 0.8s

[2/23] Processing Week 7-02 (REGULAR_SEASON)
   📊 Aggregating PlayerDays → TeamDays...
      ✓ TeamDays: 84 created, 0 updated (1,189 player-days)
   📊 Aggregating TeamDays → TeamWeeks...
      ✓ TeamWeeks: 12 created, 0 updated
      ✓ Matchups: 6 updated
      ⏱️  Week processed in 0.7s

...

📊 Aggregating TeamWeeks → TeamSeasons...
   [1/1] Season 7
      ✓ TeamSeasons: 24 created, 0 updated
      Summary: 24 team seasons (RS: 12, PO: 12)

✅ Team Stats Update Complete!

Summary:
  Weeks processed: 23
  TeamDays: 1,932 created, 0 updated
  TeamWeeks: 276 created, 0 updated
  TeamSeasons: 24 created, 0 updated
  Matchups updated: 138
  Total time: 12.3s
```

---

## What Gets Updated Per Week

| Sheet                | Records                | Example                     |
| -------------------- | ---------------------- | --------------------------- |
| **TeamDayStatLine**  | 84 (12 teams × 7 days) | Team A on Jan 15: 12G, 18A  |
| **TeamWeekStatLine** | 12 (one per team)      | Team A Week 7-01: 84G, 126A |
| **Matchup**          | 6 (one per matchup)    | Team A 243 - Team B 187     |

---

## The Flow is Exactly What You Asked For

✅ **For each week**:

1. ✅ Take the PlayerDays → Calculate TeamDays
2. ✅ Take those TeamDays → Calculate TeamWeeks
3. ✅ Use those TeamWeeks → Update the Matchups

**All in one command**: `npm run team:update-all`
