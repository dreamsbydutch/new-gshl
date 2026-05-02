# NPM Scripts Reference

Complete reference for all available npm commands in the GSHL project.

---

## Table of Contents

- [Development Commands](#development-commands)
- [Code Quality Commands](#code-quality-commands)
- [Ranking Commands](#ranking-commands)
- [Lineup Optimizer Commands](#lineup-optimizer-commands)
- [Test/Debug Commands](#testdebug-commands)
- [Custom Script Execution](#custom-script-execution)
- [Package Management](#package-management)

---

## Development Commands

### npm run dev

Start Next.js development server with Turbopack (fast refresh).

**Usage**: `npm run dev`

**Port**: http://localhost:3000

**Features**:

- Hot module replacement
- Fast refresh
- TypeScript error reporting
- Tailwind JIT compilation

---

### npm run build

Build the application for production.

**Usage**: `npm run build`

**Output**: `.next/` directory

**Process**:

1. TypeScript compilation
2. Route optimization
3. Code splitting
4. Image optimization
5. CSS minimization

---

### npm start

Run the production build locally.

**Usage**: `npm start`

**Requires**: Must run `npm run build` first

**Port**: http://localhost:3000

---

### npm run preview

Build and start in one command (for testing production builds).

**Usage**: `npm run preview`

**Equivalent to**:

```bash
npm run build && npm start
```

---

## Code Quality Commands

### npm run lint

Run ESLint on all TypeScript/JavaScript files.

**Usage**: `npm run lint`

**Checks**:

- Code style violations
- Potential bugs
- React hooks rules
- TypeScript best practices

---

### npm run lint:fix

Auto-fix linting issues where possible.

**Usage**: `npm run lint:fix`

---

### npm run typecheck

Run TypeScript compiler in check mode (no output).

**Usage**: `npm run typecheck`

**Checks**:

- Type errors
- Missing imports
- Invalid prop types
- Type mismatches

---

### npm run check

Run both linting and type checking.

**Usage**: `npm run check`

**Recommended**: Run before committing code

**Equivalent to**:

```bash
npm run lint && npm run typecheck
```

---

### npm run format:check

Check if files are formatted with Prettier.

**Usage**: `npm run format:check`

**Checks**:

- `*.ts`
- `*.tsx`
- `*.js`
- `*.jsx`
- `*.mdx`

---

### npm run format:write

Auto-format all files with Prettier.

**Usage**: `npm run format:write`

**Modifies**: Files in place

---

## Rating Commands

Player ratings are calculated in Apps Script, not through npm scripts. The main
aggregation functions refresh aggregate player ratings automatically:

```javascript
aggregateCurrentSeason();
aggregatePastSeason("10", "weeks");
```

For manual backfills, run Apps Script directly:

```javascript
RatingUpdater.updateAllPlayerStatRatingsForSeason("12", { dryRun: true });
RatingUpdater.updateAllPlayerStatRatingsForSeason("12", { dryRun: false });
```

**See**: [Rating Engine Documentation](../backend/RANKING_ENGINE.md)

---

## Lineup Optimizer Commands

### npm run lineup:update-all

Optimize lineups for all team-days, calculating fullPos, bestPos, GS, MS, BS, and ADD.

**Usage**: `npm run lineup:update-all`

**Runtime**:

- ~25 seconds (Season 6: ~2,544 team-days)
- ~16 seconds (Season 7: ~1,654 team-days)

**Average**: ~10ms per lineup (hybrid greedy + exhaustive algorithm)

**Process**:

1. Fetch all PlayerDay records from Google Sheets
2. Group by team-week combinations
3. For each team-day:
   - **fullPos**: Played daily-lineup players guaranteed, then filled by played bench players and remaining roster players
   - **bestPos**: Theoretical best lineup by PlayerDay Rating across the team-day roster
   - **GS**: GP=1 and dailyPos is a starting lineup position
   - **MS**: dailyPos is not starting, fullPos is starting
   - **BS**: dailyPos is starting, bestPos is BN
   - **ADD**: Track new roster additions versus the previous day, unless the previous day has no PlayerDay rows
4. Batch update Google Sheets (fullPos, bestPos, GS, MS, BS, ADD columns)

**Algorithm**: Hybrid approach

- **95% of lineups**: Greedy algorithm (1-5ms) - simple cases
- **5% of lineups**: Exhaustive search (50-500ms) - complex position conflicts
- **Validation**: Checks if greedy = optimal, falls back to exhaustive if needed

**Node Flags**:

- `--expose-gc`: Enable manual garbage collection
- `--max-old-space-size=4096`: Increase heap to 4GB

**Rate Limiting**:

- 500ms delay between batches (avoids quota errors)
- Exponential backoff retry (10s, 20s, 40s, 80s, 160s)

**Configuration**:

- Edit script to filter by specific season if needed
- Default: processes all seasons

**See**: [Lineup Optimizer Documentation](../backend/LINEUP_OPTIMIZER.md)

---

## Team Stats Commands

### npm run team:update-all

Aggregate PlayerDay records through the complete team stats hierarchy.

**Usage**:

```bash
npm run team:update-all                # Update all seasons
npm run team:update-all -- --season=7  # Specific season only
npm run team:update-all -- --week=7-01 # Specific week only
npm run team:update-all -- --dry-run   # Preview without changes
```

**Command Line Options**:

- `--season=<id>`: Filter to specific season (e.g., `--season=7`)
- `--week=<id>`: Filter to specific week (e.g., `--week=7-01`)
- `--dry-run`: Preview changes without writing to Google Sheets

**Aggregation Flow**:

1. **PlayerDay → TeamDay** (by date)

   - Sum player stats for each team-date
   - Calculate team totals: G, A, P, SOG, HIT, BLK, etc.

2. **TeamDay → TeamWeek** (by week)

   - Aggregate daily stats into weekly summaries
   - Update Matchup scores

3. **TeamWeek → TeamSeason** (by season + type)
   - Split into Regular Season, Playoffs, Losers Tournament
   - Calculate rankings, standings, streaks

**Runtime**: ~0.8s per week, ~18-25s for full season

**Output**: TeamDayStatLine, TeamWeekStatLine, TeamSeasonStatLine, Matchup updates

**See**: [Team Stats Aggregation](SCRIPTS.md#team-stats-aggregation)

---

## Test/Debug Commands

### npm run test:lineup-count

Test script to count and analyze lineup configurations.

**Usage**: `npm run test:lineup-count`

**Purpose**: Debug/verify lineup optimization data

**Runtime**: ~1 minute

---

### npm run test:team-sizes

Test script to analyze team roster sizes by date.

**Usage**: `npm run test:team-sizes`

**Purpose**: Debug/verify roster size patterns

**Runtime**: ~1 minute

---

## Custom Script Execution

### Running Individual Scripts

```bash
# With tsx (TypeScript)
npx tsx src/scripts/my-script.ts

# With node (requires build)
node dist/scripts/my-script.js
```

### With Environment Variables

```bash
# Load from .env.local
dotenv -e .env.local -- npm run my-script
```

### Background Execution

```bash
# Run in background with nohup
nohup npm run lineup:update-all > lineup.log 2>&1 &

# View progress
tail -f lineup.log
```

---

## Package Management

### npm install

Install all dependencies from `package.json`.

**Usage**: `npm install`

---

### npm install [package]

Install a new package.

**Usage**:

```bash
# Production dependency
npm install lodash

# Dev dependency
npm install -D @types/lodash
```

---

### npm update

Update dependencies to latest versions (within semver range).

**Usage**: `npm update`

---

### npm outdated

Check for outdated packages.

**Usage**: `npm outdated`

---

## Utility Commands

### npm run clean

Clean build artifacts and caches.

**Usage**: `npm run clean`

**Removes**:

- `.next/` directory
- `node_modules/.cache/`
- TypeScript build info

---

### npm run reset

Reset project to clean state (delete node_modules and reinstall).

**Usage**: `npm run reset`

**Process**:

```bash
rm -rf node_modules package-lock.json
npm install
```

---

## Script Definitions

All scripts are defined in `package.json`:

```json
{
  "scripts": {
    "build": "next build",
    "check": "next lint && tsc --noEmit",
    "dev": "next dev --turbo",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,mdx}\" --cache",
    "format:write": "prettier --write \"**/*.{ts,tsx,js,jsx,mdx}\" --cache",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "preview": "next build && next start",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lineup:update-all": "node --expose-gc --max-old-space-size=4096 ./node_modules/tsx/dist/cli.mjs src/scripts/update-all-lineups.ts"
  }
}
```

---

## Recommended Workflow

### Daily Development

```bash
# Start dev server
npm run dev

# In another terminal: watch types
npm run typecheck -- --watch
```

### Before Committing

```bash
# Check code quality
npm run check

# Auto-fix issues
npm run lint:fix
npm run format:write
```

### Before Deploying

```bash
# Test production build
npm run preview

# Verify build succeeds
npm run build
```

### Data Maintenance

```bash
# As needed: Optimize lineups
npm run lineup:update-all

# Weekly: Aggregate stats
npm run stats:aggregate-all
```

Player ratings are refreshed in Apps Script during aggregation.

---

## Next Steps

To dive deeper:

- **[Development Setup](./DEVELOPMENT.md)** - Local environment
- **[Scripts & Utilities](./SCRIPTS.md)** - Script implementation details
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment

---

_For script definitions, see `package.json`_
