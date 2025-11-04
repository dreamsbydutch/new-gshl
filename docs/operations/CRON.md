# Cron Job System# Yahoo Scraper Cron Jobs

## OverviewAutomated scheduling system for scraping Yahoo Fantasy Hockey rosters throughout the day.

The GSHL application uses automated cron jobs for background tasks like scraping Yahoo Fantasy data and aggregating statistics. The system is built with `node-cron` and includes a centralized manager for better control and monitoring.

## Overview

## ⚠️ Development Warning

The cron job system automatically runs the Yahoo scraper on an optimized schedule designed for NHL game times:

**If you see "missed execution" warnings in your console**, your machine went to sleep and cron jobs couldn't run. This is normal in development.

- **Peak Game Time (7PM-2AM ET)**: Every 15 minutes

**Solution:** Set `ENABLE_CRON=false` in your `.env` file to disable background jobs in development. Use manual API triggers instead.- **Pre-Game Period (1PM-7PM ET)**: Every hour

- **Morning Updates**: 4AM & 8AM ET

```bash

# .env (Development)## Files

ENABLE_CRON=false

ENABLE_YAHOO_SCRAPER_CRON=false- `yahoo-scraper-job.ts` - Cron job implementation using `node-cron`

ENABLE_STAT_AGGREGATION_CRON=false- `../../app/api/cron/yahoo-scraper/route.ts` - API endpoints for controlling cron jobs

```

## Usage

## Architecture

### Via UI (Recommended)

### File Structure

````Navigate to the Yahoo Scraper Control page and use the "Automated Scraping (Cron Jobs)" section:

src/server/cron/

├── index.ts              # Barrel exports1. **Start Cron Jobs** - Begins automated scraping on the defined schedule

├── manager.ts            # CronManager class2. **Stop Cron Jobs** - Stops all automated scraping

├── jobs.ts               # Job registrations3. **Refresh** - Check current status of cron jobs

└── tasks/

    ├── yahoo-scraper.ts  # Yahoo scraping logic### Via API

    └── stat-aggregation.ts # Stat rebuild logic

```**Get Status:**



## Registered Jobs```bash

GET /api/cron/yahoo-scraper

### Yahoo Scraper```

Scrapes Yahoo Fantasy Hockey roster data on an NHL-optimized schedule.

**Start Cron Jobs:**

| Job Name | Schedule | Cron Expression | Description |

|----------|----------|-----------------|-------------|```bash

| `yahoo-scraper-peak` | Every 15 min, 7PM-2AM ET | `*/15 19-23,0-2 * * *` | Peak game time |POST /api/cron/yahoo-scraper

| `yahoo-scraper-pregame` | Hourly, 1PM-7PM ET | `0 13-18 * * *` | Pre-game period |Content-Type: application/json

| `yahoo-scraper-morning` | 4AM & 8AM ET | `0 4,8 * * *` | Morning updates |

{

### Stat Aggregation  "action": "start"

Rebuilds stat aggregations for completed game days.}

````

| Job Name | Schedule | Cron Expression | Description |

|----------|----------|-----------------|-------------|**Stop Cron Jobs:**

| `stat-aggregation-primary` | 3AM ET daily | `0 3 * * *` | After games complete |

| `stat-aggregation-secondary` | 6AM ET daily | `0 6 * * *` | Late-finishing games |```bash

POST /api/cron/yahoo-scraper

## Manual ControlContent-Type: application/json

### Via CronManager{

```typescript "action": "stop"

import { cronManager } from "@gshl-server/cron";}

```

// Trigger a specific job manually

await cronManager.trigger("yahoo-scraper-peak");### Programmatically

// Check status of all jobs```typescript

const status = cronManager.getStatus();import {

startYahooScraperCron,

// Stop/start individual jobs stopYahooScraperCron,

cronManager.stop("yahoo-scraper-peak"); getYahooScraperCronStatus,

cronManager.start("yahoo-scraper-peak");} from "./yahoo-scraper-job";

// Control all jobs// Start cron jobs

cronManager.stopAll();startYahooScraperCron();

cronManager.startAll();

````// Check status

const status = getYahooScraperCronStatus();

### Via API Endpointsconsole.log(status);

```http

# Trigger a job// Stop cron jobs

POST /api/cron/triggerstopYahooScraperCron();

Authorization: Bearer {CRON_SECRET}```

{"job": "yahoo-scraper-peak"}

## Schedule Details

# Get status

GET /api/cron/status### Peak Game Time (7PM-2AM ET)

Authorization: Bearer {CRON_SECRET}

```**Cron:** `*/15 19-23,0-2 * * *`



## Adding New JobsMost NHL games occur during this window, so we scrape frequently (every 15 minutes) to capture live updates, lineup changes, and stat changes.



1. **Create task module** in `src/server/cron/tasks/my-task.ts`:### Pre-Game Period (1PM-7PM ET)

```typescript

export async function runMyTask(): Promise<void> {**Cron:** `0 13-18 * * *`

  // Your logic here

}Teams make lineup decisions and injury updates during this period. Hourly scraping captures these changes without excessive API usage.

````

### Morning Updates (4AM & 8AM ET)

2. **Register in** `src/server/cron/jobs.ts`:

```typescript**Cron:** `0 4,8 \* \* \*`

cronManager.register({

name: "my-task",Two scrapes in the morning ensure final stats from late-night games are captured and provide fresh data for early morning users.

schedule: "0 \* \* \* \*",

timezone: "America/New_York",## Monitoring

enabled: true,

task: async () => {Cron job execution is logged with timestamps and results:

    const { runMyTask } = await import("./tasks/my-task");

    await runMyTask();```

},🏒 [Cron] Peak game time scrape triggered (every 15 min, 7PM-2AM ET)

});📅 [Cron/peak-game] Starting scrape for 2025-10-20...

```✅ [Cron/peak-game] Scrape completed in 4.2s: { season: "2025-26", ... }

```

## Troubleshooting

Check your application logs to monitor cron job execution.

### "Missed execution" warnings

- **Cause**: Machine went to sleep## Important Notes

- **Fix**: Set `ENABLE_CRON=false` in development

- **Alternative**: Use manual triggers via API- Cron jobs run in **Eastern Time (America/New_York)** regardless of server timezone

- Each scrape automatically determines the current season and week

### Jobs not running- Failed scrapes are logged but don't stop the cron schedule

- Check `ENABLE_CRON=true` in `.env`- Cron jobs do NOT persist across server restarts - you must re-start them

- Check individual job flags- Only one instance of each cron job can run at a time

- Verify `cronManager.getStatus()` shows `enabled: true`

## Production Deployment

See full documentation in `/docs/operations/CRON.md`

For production environments, consider:

1. **Start cron jobs on server startup** - Add to your server initialization
2. **Health monitoring** - Set up alerts for failed scrapes
3. **Rate limiting** - Monitor Yahoo API usage to avoid rate limits
4. **Database backups** - Before running cron jobs for the first time

## Troubleshooting

**Cron jobs not running:**

- Check that you've clicked "Start Cron Jobs" or called `startYahooScraperCron()`
- Verify server timezone configuration
- Check application logs for errors

**Missed executions:**

- If server restarts, cron jobs must be manually restarted
- Node-cron doesn't catch up missed executions during downtime

**High API usage:**

- Consider adjusting the schedule in `yahoo-scraper-job.ts`
- Reduce frequency during peak game time if needed
