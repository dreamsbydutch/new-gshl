# GSHL Apps Script - Project Goals & Vision

## 🎯 Primary Mission

**The Apps Script project is the sole data manipulation and persistence layer for GSHL.**

### What This Means

This project is responsible for ALL data operations:

1. Fetching roster data from Yahoo Fantasy Hockey
2. Calculating ratings, lineups, and all derived metrics
3. Aggregating statistics at all levels (player, team, season)
4. Writing EVERYTHING to the Google Sheets network
5. Maintaining data integrity across the entire schema

### What This Is NOT

❌ This is NOT just a cron scheduler  
❌ This is NOT a thin wrapper around API calls  
❌ This is NOT a display layer  
❌ This is NOT a proxy to Next.js

## 🏗️ Architecture Vision

```
┌─────────────┐
│  Yahoo API  │ ← External data source
└──────┬──────┘
       │
       ↓
┌──────────────────────────────────────────┐
│     APPS SCRIPT (This Project)           │
│  - Fetch from Yahoo                      │
│  - Calculate ratings & lineups           │
│  - Aggregate all statistics              │
│  - Write to Google Sheets                │
│                                          │
│  THE DATA ENGINE                         │
└──────────────┬───────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│     GOOGLE SHEETS                        │
│  - Single source of truth                │
│  - Complete data model                   │
│  - Read by Next.js                       │
│                                          │
│  THE DATABASE                            │
└──────────────┬───────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│     NEXT.JS APPLICATION                  │
│  - Read ONLY from Google Sheets          │
│  - Display data to users                 │
│  - NEVER writes to Sheets                │
│                                          │
│  THE DISPLAY LAYER                       │
└──────────────────────────────────────────┘
```

## 📊 Complete Data Pipeline

### Phase 1: Yahoo Roster Scraping

**Goal**: Get raw roster data into Google Sheets

**Process**:

1. Fetch roster data from Yahoo Fantasy Hockey API
2. Parse and normalize the data
3. Write to Google Sheets → `PlayerDay` table

**Frequency**:

- Every 15 minutes during peak game time (7 PM - 2 AM ET)
- Every hour during pre-game (1 PM - 7 PM ET)
- Twice daily at 4 AM and 8 AM ET

### Phase 2: Lineup & Rating Calculation

**Goal**: Enrich player data with lineup decisions and ratings

**Process**:

1. Read `PlayerDay` from Google Sheets
2. Calculate optimal lineups for each team/day
3. Calculate MS (Missed Starts), BS (Bench Starts), ADD (Added Value)
4. Compute player ratings based on performance
5. Write enriched data back to Google Sheets → `PlayerDay` (updated)

**Frequency**: After each Yahoo scrape completes

**Writes to Sheets**:

- Lineup positions (who starts, who's benched)
- MS, BS, ADD metrics
- Player ratings

### Phase 3: Player Aggregations

**Goal**: Roll up player statistics to week, split, and season levels

**Process**:

1. Read `PlayerDay` from Google Sheets
2. Aggregate to weekly level → `PlayerWeek`
3. Aggregate to split periods → `PlayerSplit`
4. Aggregate to season totals → `PlayerTotal`
5. Apply ratings to all aggregation levels
6. Write all aggregations to Google Sheets

**Frequency**: After lineup calculations complete

**Writes to Sheets**:

- `PlayerWeek`: Weekly player aggregations
- `PlayerSplit`: Split period aggregations
- `PlayerTotal`: Season totals
- Ratings for all levels

### Phase 4: Team Aggregations

**Goal**: Calculate team statistics, matchups, and standings

**Process**:

1. Read `PlayerDay` and `PlayerWeek` from Google Sheets
2. Aggregate to team daily stats → `TeamDay`
3. Aggregate to team weekly stats → `TeamWeek`
4. Calculate head-to-head matchup results → `Matchup`
5. Calculate season totals → `TeamSeason`
6. Update league standings → `Standings`
7. Write all team data to Google Sheets

**Frequency**: After player aggregations complete

**Writes to Sheets**:

- `TeamDay`: Daily team statistics
- `TeamWeek`: Weekly team statistics
- `Matchup`: Head-to-head matchup results
- `TeamSeason`: Season totals
- `Standings`: Current league standings

### Phase 5: Data Validation

**Goal**: Ensure data integrity across the entire schema

**Process**:

1. Read all tables from Google Sheets
2. Check for missing records
3. Check for data inconsistencies
4. Run corrections and backfills
5. Write corrections and logs to Google Sheets

**Frequency**: Daily at 3 AM and 6 AM ET

**Writes to Sheets**:

- Corrected data
- `ProcessingLog`: Pipeline execution logs
- `DataQuality`: Data integrity check results

## 📋 Google Sheets Schema

Apps Script maintains these sheets:

### Player Tables

- **PlayerDay**: Daily roster and performance (raw + enriched)
- **PlayerWeek**: Weekly aggregations
- **PlayerSplit**: Split period aggregations
- **PlayerTotal**: Season totals

### Team Tables

- **TeamDay**: Daily team statistics
- **TeamWeek**: Weekly team statistics
- **TeamSeason**: Season totals

### Matchup Tables

- **Matchup**: Head-to-head weekly results
- **Standings**: Current league standings

### Metadata Tables

- **ProcessingLog**: Data pipeline execution history
- **DataQuality**: Data integrity check results

## 🎯 Success Criteria

This project is successful when:

✅ **All data manipulation happens here** (not in Next.js)  
✅ **All writes go to Google Sheets** (single source of truth)  
✅ **Next.js is purely read-only** (no data writes)  
✅ **Complete data pipeline** (Yahoo → Calculations → Sheets)  
✅ **Automated and reliable** (time-based triggers)  
✅ **Data integrity maintained** (validation and backfills)  
✅ **Well documented** (architecture is clear)

## 🚫 Anti-Goals

This project should NEVER:

❌ Serve web pages to users  
❌ Handle user authentication  
❌ Display data (that's Next.js)  
❌ Depend on Next.js codebase  
❌ Allow Next.js to write to Sheets  
❌ Mix data and display logic

## 💡 Guiding Principles

### 1. Single Responsibility

Apps Script does ONE thing: **Manipulate data and write to Sheets**

### 2. Separation of Concerns

- **Data** (Apps Script) vs **Display** (Next.js)
- Never mix these concerns

### 3. Single Source of Truth

- Google Sheets is the database
- Apps Script is the only writer
- Next.js only reads

### 4. Unidirectional Flow

```
Yahoo → Apps Script → Google Sheets → Next.js → User
```

Data flows in ONE direction, never backwards

### 5. Complete Decoupling

- Zero dependencies on Next.js
- Can deploy independently
- Communicate only through Sheets

## 🔮 Future Vision

As GSHL evolves, this architecture enables:

### Additional Data Sources

- Add new scrapers (trades, transactions, news)
- Write to new Sheets tables
- Next.js automatically displays new data

### Advanced Analytics

- Implement complex calculations in Apps Script
- Write results to Sheets
- Display in Next.js without code changes

### Multiple Frontends

- Mobile app reads from same Sheets
- Public API reads from same Sheets
- Dashboard reads from same Sheets
- Apps Script stays unchanged

### Data Science Integration

- Export Sheets data to BigQuery
- Run ML models on historical data
- Write predictions back to Sheets
- Display in Next.js

## 📝 Golden Rules

When developing, ask yourself:

**"Does this manipulate or calculate data?"**
→ YES: Implement in Apps Script

**"Does this display data to users?"**
→ YES: Implement in Next.js

**"Does this need to write to Sheets?"**
→ YES: Must be in Apps Script

**"Does this read from Sheets?"**
→ Could be Apps Script OR Next.js

**"Am I confused about where this goes?"**
→ If it touches data, it's Apps Script

## 🎓 Remember

> **Apps Script is not a cron scheduler.**  
> **Apps Script is the entire data processing engine.**  
> **It owns all data manipulation for GSHL.**  
> **Next.js is just the view layer.**

---

**This vision must NEVER be compromised.**

If you find yourself writing data manipulation code in Next.js, STOP.  
If you find yourself writing display code in Apps Script, STOP.  
Keep the layers separate. Keep the mission clear.

**Apps Script = Data Engine**  
**Google Sheets = Database**  
**Next.js = Display Layer**

Forever and always.
