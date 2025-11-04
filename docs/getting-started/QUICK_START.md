# Quick Start Guide

Get the GSHL app running locally in 10 minutes.

---

## Prerequisites

Ensure you have the following installed:

- **Node.js** 20.x or later ([Download](https://nodejs.org/))
- **npm** 10.x or later (comes with Node.js)
- **Git** ([Download](https://git-scm.com/downloads))
- **Google Service Account** with Sheets API access (see [Environment Variables](./ENVIRONMENT.md))

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/dreamsbydutch/new-gshl.git
cd new-gshl
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including Next.js, React, TRPC, and Google Sheets API client.

---

## Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# .env
# Google Sheets Configuration
USE_GOOGLE_SHEETS=true
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID_MAIN=your-main-spreadsheet-id
SPREADSHEET_ID_PLAYERDAY_1_5=playerday-workbook-1-id
SPREADSHEET_ID_PLAYERDAY_6_10=playerday-workbook-2-id
SPREADSHEET_ID_PLAYERDAY_11_PLUS=playerday-workbook-3-id

# Yahoo Scraper (Optional - only needed for data sync)
YAHOO_LOGIN_EMAIL=your-yahoo-email@example.com
YAHOO_LOGIN_PASSWORD=your-yahoo-password

# NextAuth (Required for production)
NEXTAUTH_SECRET=your-random-secret-string
NEXTAUTH_URL=http://localhost:3000

# UploadThing (Optional - for file uploads)
UPLOADTHING_SECRET=sk_live_...
UPLOADTHING_APP_ID=app_id_...
```

### Getting Google Service Account Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Sheets API
4. Create a Service Account
5. Generate a JSON key
6. Copy `client_email` and `private_key` to your `.env`

See [Environment Variables](./ENVIRONMENT.md) for complete details.

---

## Step 4: Run Development Server

```bash
npm run dev
```

The app will be available at **http://localhost:3000**

---

## Step 5: Verify Setup

Visit these pages to confirm everything works:

### 1. Home Page

**http://localhost:3000**

Should display league admin tools if properly configured.

### 2. Standings

**http://localhost:3000/standings**

Should load team standings for the current season.

### 3. Team Locker Room

**http://localhost:3000/lockerroom**

Should display team selector and roster data.

### 4. Schedule

**http://localhost:3000/schedule**

Should show weekly matchups.

### 5. Draft Board

**http://localhost:3000/draftboard**

Should display draft picks and team assignments.

---

## Common First-Run Issues

### Issue: "Failed to fetch from Google Sheets"

**Cause:** Missing or incorrect Google Service Account credentials.

**Solution:**

1. Verify `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` in `.env`
2. Ensure service account has "Editor" access to all Google Sheets
3. Check that `SPREADSHEET_ID_*` values are correct

### Issue: "Module not found" errors

**Cause:** Dependencies not fully installed.

**Solution:**

```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: TypeScript errors on startup

**Cause:** Type generation incomplete.

**Solution:**

```bash
npm run typecheck
```

### Issue: Page shows loading skeleton indefinitely

**Cause:** TRPC query failing silently.

**Solution:**

1. Open browser DevTools console
2. Check for API errors
3. Verify Google Sheets IDs and permissions

---

## Available NPM Scripts

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Start development server (http://localhost:3000) |
| `npm run build`     | Build for production                             |
| `npm start`         | Run production build locally                     |
| `npm run lint`      | Lint with ESLint                                 |
| `npm run typecheck` | Check TypeScript types                           |
| `npm run check`     | Run lint + typecheck                             |

See [NPM Scripts](./NPM_SCRIPTS.md) for complete list including data scripts.

---

## Development Workflow

### Making Changes

1. **Edit files** in `src/` directory
2. **Hot reload** automatically updates browser
3. **Check types** with `npm run typecheck`
4. **Lint code** with `npm run lint`

### Project Organization

- **Components** → `src/components/` (single files, organized by category)
- **Hooks** → `src/lib/hooks/` (all hooks, including feature-specific)
- **Utils** → `src/lib/utils/` (all utilities, helpers, formatters)
- **Types** → `src/lib/types/` (TypeScript types and interfaces)
- **Pages** → `src/app/` (Next.js app router pages)
- **API** → `src/server/api/routers/` (tRPC procedures)

### Adding a New Page

1. Create file in `src/app/[route]/page.tsx`
2. Use `"use client"` directive if using hooks
3. Import components using path aliases: `@gshl-components/category/ComponentName/main`
4. Fetch data using hooks from `@gshl-hooks`

Example:

```tsx
// src/app/mypage/page.tsx
"use client";

import { StandingsContainer } from "@gshl-components/league/StandingsContainer/main";
import { useStandings } from "@gshl-hooks";

export default function MyPage() {
  const { standings } = useStandings();
  return <StandingsContainer standings={standings} />;
}
```

### Adding a New Component

Components are single files organized by category:

```
src/components/
  team/
    TeamSchedule/
      main.tsx          # Main component
      components/       # Sub-components (optional)
        index.ts        # Barrel export
        TeamScheduleHeader.tsx
        TeamScheduleItem.tsx
  ui/
    button.tsx          # UI primitives
  admin/
    YahooScraperControl.tsx
```

**Component Structure:**

- **Single file per component** - `main.tsx` or `ComponentName.tsx`
- **Hooks** go in `src/lib/hooks/` (not in component folders)
- **Utils** go in `src/lib/utils/` (not in component folders)
- **Sub-components** can optionally live in a `components/` subfolder

**Example component:**

```tsx
// src/components/team/TeamStats/main.tsx
"use client";

import { useTeamStatsData } from "@gshl-hooks";
import { formatStat } from "@gshl-utils";
import type { Team } from "@gshl-types";

export function TeamStats({ teamId }: { teamId: string }) {
  const { stats, isLoading } = useTeamStatsData(teamId);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h2>Team Statistics</h2>
      <p>Goals: {formatStat(stats.goals)}</p>
    </div>
  );
}
```

**Corresponding hook:**

```typescript
// src/lib/hooks/features/useTeamStatsData.ts
"use client";

import { clientApi } from "@gshl-trpc";
import { useMemo } from "react";

export function useTeamStatsData(teamId: string) {
  const { data, isLoading } = clientApi.team.getStats.useQuery({ id: teamId });

  const stats = useMemo(() => {
    // Transform data here
    return data ?? {};
  }, [data]);

  return { stats, isLoading };
}
```

**Corresponding utility:**

```typescript
// src/lib/utils/formatters.ts
export function formatStat(value: number | null): string {
  return value?.toFixed(2) ?? "N/A";
}
```

### Adding a New API Endpoint

1. Create or edit router in `src/server/api/routers/`
2. Add procedure to router
3. Export via `src/server/api/root.ts`
4. Use in component via `api.myRouter.myProcedure.useQuery()`

See [TRPC API](./TRPC_API.md) for details.

---

## Next Steps

Now that you're running locally:

1. **Understand the Architecture** → [Architecture Overview](./ARCHITECTURE.md)
2. **Learn Component Patterns** → [Component Architecture](./COMPONENTS.md)
3. **Explore the Data Layer** → [Data Layer](./DATA_LAYER.md)
4. **Build a Feature** → [Development Setup](./DEVELOPMENT.md)
5. **Deploy to Production** → [Deployment Guide](./DEPLOYMENT.md)

---

## Getting Help

- **Documentation not clear?** → [Troubleshooting](./TROUBLESHOOTING.md)
- **Want to contribute?** → [Development Setup](./DEVELOPMENT.md)
- **Ready to deploy?** → [Deployment Guide](./DEPLOYMENT.md)

---

Happy coding! 🏒
