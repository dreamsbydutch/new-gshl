# Troubleshooting Guide

Common issues and solutions for the GSHL fantasy hockey application.

---

## Table of Contents

- [Development Issues](#development-issues)
- [Google Sheets Issues](#google-sheets-issues)
- [TRPC & API Issues](#trpc--api-issues)
- [Build & Deployment Issues](#build--deployment-issues)
- [Yahoo Scraper Issues](#yahoo-scraper-issues)
- [Performance Issues](#performance-issues)
- [Data Issues](#data-issues)

---

## Development Issues

### Port Already in Use

**Symptom**: `Error: listen EADDRINUSE: address already in use :::3000`

**Cause**: Another process is using port 3000

**Solution** (Windows):

```bash
# Find process on port 3000
netstat -ano | findstr :3000

# Kill process by PID
taskkill /PID <PID> /F

# Or use npx
npx kill-port 3000
```

**Solution** (Mac/Linux):

```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- -p 3001
```

---

### Module Not Found Errors

**Symptom**: `Module not found: Can't resolve '@gshl-components/...'`

**Cause**: Path aliases not recognized or modules not installed

**Solution 1** - Restart TS Server:

```
VS Code: Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

**Solution 2** - Reinstall Dependencies:

```bash
rm -rf node_modules package-lock.json .next
npm install
```

**Solution 3** - Check `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@gshl-components/*": ["./src/components/*/main"]
    }
  }
}
```

---

### Hot Reload Not Working

**Symptom**: Changes not reflecting in browser

**Solution**:

1. Hard refresh browser (Ctrl+Shift+R)
2. Restart dev server
3. Clear `.next/` cache:
   ```bash
   rm -rf .next
   npm run dev
   ```

---

### TypeScript Errors After Update

**Symptom**: Tons of type errors after updating dependencies

**Solution**:

```bash
# Clear TypeScript cache
rm -rf node_modules/.cache

# Restart TS server
# VS Code: Ctrl+Shift+P → "TypeScript: Restart TS Server"

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## Google Sheets Issues

### 401 Unauthorized Error

**Symptom**: `Error: Request had invalid authentication credentials`

**Cause**: Service account credentials invalid or missing

**Solution**:

1. Verify `.env.local` has correct credentials:

   ```bash
   GOOGLE_CLIENT_EMAIL=...
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

2. Ensure `GOOGLE_PRIVATE_KEY` includes `\n` newlines

3. Restart dev server after updating `.env.local`

---

### 403 Forbidden Error

**Symptom**: `Error: The caller does not have permission`

**Cause**: Service account lacks access to Google Sheets

**Solution**:

1. Open Google Sheet in browser
2. Click "Share" button
3. Add service account email (from `GOOGLE_CLIENT_EMAIL`)
4. Grant "Editor" permissions
5. Save

**Verify**:

```typescript
// Check service account email
console.log(process.env.GOOGLE_CLIENT_EMAIL);
```

---

### 429 Rate Limit Exceeded

**Symptom**: `Error: Quota exceeded for quota metric 'Read requests'`

**Cause**: Too many Google Sheets API calls (limit: 500 per 100 seconds)

**Solution**:

1. **Reduce requests**: Use batch operations

   ```typescript
   // ❌ BAD: Multiple calls
   await getTeams();
   await getPlayers();
   await getContracts();

   // ✅ GOOD: Single batch call
   await Promise.all([getTeams(), getPlayers(), getContracts()]);
   ```

2. **Add delays** in scripts:

   ```typescript
   await new Promise((resolve) => setTimeout(resolve, 1000)); // 1s delay
   ```

3. **Increase TRPC cache time**:
   ```typescript
   // src/trpc/query-client.ts
   staleTime: 60 * 1000, // 60 seconds instead of 30
   ```

---

### Data Not Updating

**Symptom**: Changes in Google Sheets not reflecting in app

**Cause**: TRPC query cache serving stale data

**Solution**:

1. Wait 30 seconds (cache stale time)
2. Hard refresh browser
3. Manually invalidate cache:
   ```typescript
   const utils = api.useUtils();
   utils.team.getAll.invalidate();
   ```
4. Restart dev server

---

## TRPC & API Issues

### Infinite Loading Skeleton

**Symptom**: Component shows skeleton indefinitely

**Cause**: TRPC query failing silently or `ready` flag never true

**Debug**:

1. Open browser DevTools console
2. Look for TRPC errors
3. Check Network tab for failed requests

**Solution**:

```typescript
// Add error logging to hook
export function useTeam() {
  const { data, isLoading, error } = api.team.getById.useQuery(...);

  // Log error
  if (error) console.error("Team query error:", error);

  const ready = !isLoading && !error && Boolean(data);
  return { team: data, ready };
}
```

---

### "Input validation failed"

**Symptom**: TRPC error about invalid input

**Cause**: Input doesn't match Zod schema

**Example Error**:

```
TRPCClientError: Input validation failed
  - teamId: Expected string, received number
```

**Solution**:

```typescript
// ❌ WRONG
api.team.getById.useQuery({ teamId: 123 });

// ✅ CORRECT
api.team.getById.useQuery({ teamId: "123" });
```

---

### Query Not Refetching

**Symptom**: Data doesn't update after mutation

**Cause**: Cache not invalidated

**Solution**:

```typescript
const createTeam = api.team.create.useMutation({
  onSuccess: () => {
    // Invalidate related queries
    utils.team.getAll.invalidate();
    utils.franchise.getAll.invalidate();
  },
});
```

---

## Build & Deployment Issues

### Build Fails with Type Errors

**Symptom**: `npm run build` fails with TypeScript errors

**Solution**:

1. Run `npm run typecheck` to see all errors
2. Fix type errors
3. Retry build

**Common Fixes**:

```typescript
// ❌ Accessing potentially undefined
const name = team.teamName;

// ✅ Optional chaining
const name = team?.teamName;

// ✅ Type guard
if (team) {
  const name = team.teamName;
}
```

---

### Environment Variables Not Found in Production

**Symptom**: Build succeeds locally but fails on Vercel

**Cause**: Environment variables not set in Vercel dashboard

**Solution**:

1. Go to Vercel project settings
2. Navigate to "Environment Variables"
3. Add all variables from `.env.local`
4. Redeploy

---

### Out of Memory During Build

**Symptom**: `JavaScript heap out of memory`

**Solution**:

```bash
# Increase Node.js memory
NODE_OPTIONS=--max_old_space_size=4096 npm run build
```

Or in `package.json`:

```json
{
  "scripts": {
    "build": "NODE_OPTIONS=--max_old_space_size=4096 next build"
  }
}
```

---

## Yahoo Scraper Issues

### Scraper Timeout

**Symptom**: `TimeoutError: Navigation timeout of 30000 ms exceeded`

**Cause**: Yahoo page loading slowly or element not found

**Solution 1** - Increase timeout:

```typescript
await page.goto(url, { timeout: 60000 }); // 60 seconds
```

**Solution 2** - Wait for specific element:

```typescript
await page.waitForSelector(".player-stats-table", { timeout: 60000 });
```

---

### Login Failed

**Symptom**: `Error: Failed to log into Yahoo`

**Cause**: Incorrect credentials or Yahoo security challenge

**Solution**:

1. Verify credentials in `.env.local`
2. Try logging in manually to check for security prompts
3. Generate app-specific password if 2FA enabled

---

### Stats Not Matching Yahoo

**Symptom**: Scraped stats differ from Yahoo display

**Cause**: Different stat calculation or scraping wrong element

**Solution**:

1. Check scraper selectors match current Yahoo HTML
2. Verify stat definitions (e.g., A vs A1+A2)
3. Add logging to see scraped values:
   ```typescript
   console.log("Scraped stats:", stats);
   ```

---

## Performance Issues

### Slow Page Load

**Symptom**: Pages take 5+ seconds to load

**Cause**: Too many TRPC queries or large data sets

**Solution 1** - Reduce queries:

```typescript
// ❌ Multiple queries
const { teams } = useTeams();
const { players } = usePlayers();
const { contracts } = useContracts();

// ✅ Combined hook
const { teams, players, contracts } = useAllData();
```

**Solution 2** - Add pagination:

```typescript
const { data } = api.player.getAll.useQuery({
  page: 1,
  limit: 100,
});
```

**Solution 3** - Enable query persistence:

```typescript
// src/trpc/query-persistence.ts
// Uncomment persistence code
```

---

### High Memory Usage

**Symptom**: Browser tab using >1GB RAM

**Cause**: Large arrays in React state or memory leaks

**Solution**:

1. Use pagination for large lists
2. Memoize expensive calculations:
   ```typescript
   const sorted = useMemo(() => {
     return [...players].sort(...);
   }, [players]);
   ```
3. Clean up effects:
   ```typescript
   useEffect(() => {
     const timer = setInterval(...);
     return () => clearInterval(timer); // Cleanup
   }, []);
   ```

---

### Lineup Optimizer Timeout

**Symptom**: Lineup optimization takes >5 seconds or times out (especially on first ~45 lineups)

**Cause**:

1. First lineups: Node.js V8 JIT compiler needs warm-up time
2. Edge case with complex position constraints or roster >17 players

**Solution**:

1. **Prevent initial timeouts with warm-up**:

   ```typescript
   // Run optimizer 3x on dummy lineup before processing real data
   const warmupRoster = createDummyRoster(17);
   for (let i = 0; i < 3; i++) {
     optimizeLineup(warmupRoster);
   }
   ```

   This triggers JIT compilation so subsequent optimizations are fast.

2. Check roster size:
   ```bash
   npm run test:team-sizes
   ```
3. Expected behavior: 1-3 seconds for 15-17 player rosters (after warm-up)
4. If consistently timing out after warm-up, check for:
   - Roster data anomalies (>17 players)
   - Unusual position distributions (e.g., all players eligible for same position)
5. Current timeout: 5s per lineup (logs warning if hit)

---

## Data Issues

### Duplicate Records in Sheets

**Symptom**: Same player appears multiple times for same date

**Cause**: Upsert logic not working correctly

**Solution**:

1. Identify duplicates:
   ```typescript
   const key = `${playerId}|${teamId}|${date}`;
   ```
2. Delete duplicates manually in Sheets
3. Fix upsert logic to check composite key

---

### Missing PlayerDay Records

**Symptom**: Expected records not in Google Sheets

**Cause**: Scraper didn't run or failed silently

**Solution**:

1. Check cron logs for errors
2. Manually run scraper:
   ```bash
   npm run yahoo:sync-team-day
   ```
3. Verify date range and team ID

---

### Incorrect fullPos/bestPos

**Symptom**: Lineup positions don't make sense

**Cause**: Optimizer using wrong player eligibility or GP values

**Solution**:

1. Verify `nhlPos` array is correct
2. Check `GP` and `GS` values (0 or 1)
3. Re-run optimizer:
   ```bash
   npm run lineup:update-all
   ```

---

## Getting More Help

### Enable Debug Logging

```typescript
// Add to component
console.log("Debug:", { teams, players, ready });
```

### Check Browser Console

F12 → Console tab for:

- TRPC errors
- React errors
- Network failures

### Check Server Logs

Terminal running `npm run dev` shows:

- TRPC procedure calls
- Google Sheets API errors
- Server-side errors

### Report Issues

If problem persists:

1. Check existing GitHub issues
2. Create new issue with:
   - Steps to reproduce
   - Error messages
   - Environment (OS, Node version)
   - Screenshots

---

## Next Steps

- **[Development Setup](./DEVELOPMENT.md)** - Setup guide
- **[Environment Variables](./ENVIRONMENT.md)** - Configuration reference
- **[Monitoring & Debugging](./MONITORING.md)** - Advanced debugging

---

_For specific error messages, search this document or check relevant documentation_
