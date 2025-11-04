# Deployment Guide

This guide covers deploying the GSHL application to Vercel with automated cron jobs.

## Quick Start

### 1. Set Environment Variables in Vercel

```bash
# Generate a secret
openssl rand -base64 32

# Add to Vercel Dashboard → Your Project → Settings → Environment Variables:
# - CRON_SECRET = <your-generated-secret>
# - YAHOO_LEAGUE_ID
# - YAHOO_TEAM_IDS (comma-separated or blank for all)
# - GOOGLE_SHEETS_SPREADSHEET_ID
# - GOOGLE_SERVICE_ACCOUNT_EMAIL
# - GOOGLE_PRIVATE_KEY
# - USE_GOOGLE_SHEETS = true
```

### 2. Deploy

```bash
vercel --prod
```

### 3. Verify

Go to Vercel Dashboard → Settings → Cron Jobs - you should see 3 active cron jobs! ✅

---

## Cron Job Configuration

The system automatically scrapes Yahoo Fantasy Hockey rosters on a schedule:

| Time Period      | Frequency    | Purpose                 |
| ---------------- | ------------ | ----------------------- |
| **7PM-2AM ET**   | Every 15 min | Live game updates       |
| **1PM-7PM ET**   | Every hour   | Pre-game lineup changes |
| **4AM & 8AM ET** | Twice daily  | Morning stat updates    |

**Total**: ~34 scrapes per day

### Smart Date Logic

- **Before 7 AM ET**: Scrapes previous day (overnight games)
- **7 AM onwards**: Scrapes current day (new game day)

### Cron Schedule Details

The cron schedules in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/yahoo-scraper/trigger",
      "schedule": "*/15 19-23,0-2 * * *" // Every 15 min, 7PM-2AM ET
    },
    {
      "path": "/api/cron/yahoo-scraper/trigger",
      "schedule": "0 13-18 * * *" // Hourly, 1PM-7PM ET
    },
    {
      "path": "/api/cron/yahoo-scraper/trigger",
      "schedule": "0 4,8 * * *" // 4AM & 8AM ET
    }
  ]
}
```

---

## Security

### Protecting the Cron Endpoint

**IMPORTANT**: Set `CRON_SECRET` in Vercel to protect your endpoint!

The trigger endpoint checks for authorization:

```typescript
const authHeader = request.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Without it, anyone can trigger your scraper.

---

## Monitoring

### View Logs

**In Vercel Dashboard:**

1. Go to your project
2. Click "Deployments"
3. Click on your deployment
4. Navigate to "Functions" tab
5. Click on `/api/cron/yahoo-scraper/trigger`
6. View execution logs

**Or Filter Logs:**
Vercel Dashboard → Your Project → Logs → Filter: `/api/cron/yahoo-scraper/trigger`

### Check Cron Executions

Vercel Dashboard → Settings → Cron Jobs → Click any job to view execution history

### Success Indicators

Look for logs like:

```
✅ [Vercel Cron] Completed in 12.3s:
  - season: 2024-25
  - teams: 14
  - players: 280
  - created: 45
  - updated: 235
```

---

## Testing

### Test Manually

```bash
curl -X POST https://your-app.vercel.app/api/cron/yahoo-scraper/trigger \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Vercel Pricing Considerations

**Hobby Plan (Free):**

- ⚠️ 10-second timeout (might be too short for scraping)
- ⚠️ Max 2 cron jobs (need to pick 2 of 3)

**Pro Plan ($20/month):**

- ✅ 300-second (5 min) timeout
- ✅ Unlimited cron jobs
- ✅ Better reliability
- **Recommended for production**

---

## Local Development

For testing cron jobs locally without deploying:

### Prerequisites

1. Node.js and npm installed
2. Environment variables set in `.env.local`

### Manual Trigger

```bash
# Start dev server
npm run dev

# In another terminal, trigger the cron endpoint
curl -X POST http://localhost:3000/api/cron/yahoo-scraper/trigger \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Development Schedule

For development, you may want to:

1. Comment out the cron schedules in `vercel.json`
2. Trigger manually as needed
3. Avoid unnecessary API calls to Yahoo/Google Sheets

---

## Troubleshooting

### Cron Jobs Not Appearing

1. Verify `vercel.json` is in project root
2. Ensure you deployed to production (`vercel --prod`)
3. Check Vercel dashboard for deployment errors

### 401 Unauthorized Errors

1. Verify `CRON_SECRET` is set in Vercel environment variables
2. Check that all required environment variables are present
3. Ensure environment variables are applied to Production environment

### Timeout Errors

1. Upgrade to Vercel Pro for longer timeout limits
2. Optimize scraper to reduce execution time
3. Consider splitting into smaller batches

### Missing Data

1. Check that Google service account has access to all workbooks
2. Verify Yahoo league ID and team IDs are correct
3. Review logs for specific error messages

---

## Files Reference

- **`vercel.json`** - Vercel configuration with cron schedules
- **`src/app/api/cron/yahoo-scraper/trigger/route.ts`** - Cron endpoint handler
- **`src/server/cron/`** - Cron job business logic
