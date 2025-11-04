# Development Setup

Complete guide for local development on the GSHL fantasy hockey management application.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Environment Configuration](#environment-configuration)
- [Development Workflow](#development-workflow)
- [NPM Scripts](#npm-scripts)
- [Code Organization](#code-organization)
- [Testing & Debugging](#testing--debugging)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Tool        | Version              | Installation                               |
| ----------- | -------------------- | ------------------------------------------ |
| **Node.js** | 20.x or later        | [Download](https://nodejs.org/)            |
| **npm**     | 10.x or later        | Comes with Node.js                         |
| **Git**     | Latest               | [Download](https://git-scm.com/)           |
| **VS Code** | Latest (recommended) | [Download](https://code.visualstudio.com/) |

### Recommended VS Code Extensions

- **ESLint** (`dbaeumer.vscode-eslint`) - Linting
- **Prettier** (`esbenp.prettier-vscode`) - Code formatting
- **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`) - Tailwind autocomplete
- **TypeScript Error Translator** (`mattpocock.ts-error-translator`) - Readable TS errors

---

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/dreamsbydutch/new-gshl.git
cd new-gshl
```

### 2. Install Dependencies

```bash
npm install
```

This installs all packages from `package.json` including:

- Next.js 15 + React 18
- TRPC 11
- TanStack Query
- Google Sheets API client
- Tailwind CSS + shadcn/ui components

### 3. Configure Environment Variables

Create `.env.local` (gitignored) in project root:

```bash
# Google Sheets Configuration
USE_GOOGLE_SHEETS=true
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google Sheets IDs
SPREADSHEET_ID_MAIN=1abc...xyz
SPREADSHEET_ID_PLAYERDAY_1_5=1def...xyz
SPREADSHEET_ID_PLAYERDAY_6_10=1ghi...xyz
SPREADSHEET_ID_PLAYERDAY_11_PLUS=1jkl...xyz

# Yahoo Scraper (Optional)
YAHOO_LOGIN_EMAIL=your-email@yahoo.com
YAHOO_LOGIN_PASSWORD=your-password

# NextAuth (Required for production)
NEXTAUTH_SECRET=generate-random-string-here
NEXTAUTH_URL=http://localhost:3000

# UploadThing (Optional)
UPLOADTHING_SECRET=sk_live_...
UPLOADTHING_APP_ID=app_id_...
```

See [Environment Variables](./ENVIRONMENT.md) for complete details.

### 4. Start Development Server

```bash
npm run dev
```

App runs at **http://localhost:3000** with hot reload enabled.

---

## Environment Configuration

### Google Service Account Setup

1. **Create Google Cloud Project**

   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing

2. **Enable Google Sheets API**

   - Navigate to "APIs & Services" → "Library"
   - Search "Google Sheets API"
   - Click "Enable"

3. **Create Service Account**

   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "Service Account"
   - Name: `gshl-sheets-access`
   - Role: None required (permissions granted per-sheet)

4. **Generate JSON Key**

   - Click on created service account
   - Go to "Keys" tab
   - "Add Key" → "Create new key" → JSON
   - Download JSON file

5. **Extract Credentials**

   - Open downloaded JSON
   - Copy `client_email` → `GOOGLE_CLIENT_EMAIL`
   - Copy `private_key` → `GOOGLE_PRIVATE_KEY` (keep `\n` characters)

6. **Grant Sheet Access**
   - Open each Google Sheet
   - Click "Share"
   - Add service account email with "Editor" permissions

---

## Development Workflow

### Daily Development

```bash
# Start dev server (with Turbopack)
npm run dev

# In another terminal, run type checking
npm run typecheck

# Run linter
npm run lint
```

### Making Changes

#### 1. Adding a New Page

```bash
# Create page file
src/app/mypage/page.tsx
```

```tsx
"use client";

import { MyFeature } from "@gshl-components/myfeature/MyFeature";
import { useMyData } from "@gshl-hooks";

export default function MyPage() {
  const { data, ready } = useMyData();
  if (!ready) return <div>Loading...</div>;
  return <MyFeature data={data} />;
}
```

#### 2. Adding a New Component

Follow the Feature Folder Pattern:

```bash
src/components/MyFeature/
  main.tsx              # Main component export
  components/           # Subcomponents
    MySubComponent.tsx
  hooks/                # Feature-specific hooks
    useMyFeatureData.ts
  utils/                # Types, helpers, constants
    types.ts
    utils.ts
    constants.ts
    index.ts            # Barrel export
```

```tsx
// main.tsx
import type { MyFeatureProps } from "./utils";
import { useMyFeatureData } from "./hooks";

export function MyFeature(props: MyFeatureProps) {
  const { derived, ready } = useMyFeatureData(props);
  if (!ready) return <Skeleton />;
  return <div>{/* render */}</div>;
}
```

#### 3. Adding a TRPC Endpoint

```typescript
// src/server/api/routers/myRouter.ts
import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";

export const myRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    // Fetch from Google Sheets
    return [];
  }),

  create: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      // Create in Google Sheets
      return { success: true };
    }),
});
```

```typescript
// src/server/api/root.ts
import { myRouter } from "./routers/myRouter";

export const appRouter = createTRPCRouter({
  // ... existing routers
  my: myRouter, // Add new router
});
```

#### 4. Using TRPC in Component

```typescript
// src/lib/hooks/data/useMyData.ts
import { api } from "@/trpc/react";

export function useMyData() {
  const { data, isLoading } = api.my.getAll.useQuery();
  const ready = !isLoading && Boolean(data);
  return { data, ready };
}
```

---

## NPM Scripts

### Development

```bash
npm run dev          # Start dev server with Turbopack (fast refresh)
npm run build        # Build for production
npm run start        # Run production build locally
npm run preview      # Build + start (for testing prod builds)
```

### Code Quality

```bash
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix linting issues
npm run typecheck    # TypeScript type checking
npm run check        # Lint + typecheck (run before commits)
npm run format:check # Check Prettier formatting
npm run format:write # Auto-format with Prettier
```

### Data Scripts

```bash
# Yahoo scraper
npm run yahoo:sync-team-day     # Sync one team-day from Yahoo

# Player rankings
npm run ranking:train           # Train ranking model
npm run ranking:test            # Test ranking accuracy
npm run ranking:visualize       # Generate ranking visualizations
npm run ranking:update-all      # Update rankings for all players

# Lineup optimizer
npm run lineup:update-all       # Optimize all lineups (fullPos/bestPos)
```

See [Scripts & Utilities](./SCRIPTS.md) for detailed script documentation.

---

## Code Organization

### File Naming Conventions

- **Components**: PascalCase (`TeamRoster.tsx`)
- **Hooks**: camelCase with `use` prefix (`useTeam.ts`)
- **Utils**: camelCase (`formatDate.ts`)
- **Types**: PascalCase interfaces/types (`Player.ts`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_ROSTER_SIZE`)

### Import Order

Follow this order (enforced by ESLint):

```typescript
// 1. External packages
import { useState } from "react";
import { api } from "@/trpc/react";

// 2. Internal path aliases
import { Button } from "@gshl-ui";
import { useTeam } from "@gshl-hooks";
import type { Player } from "@gshl-types";

// 3. Relative imports
import { MySubComponent } from "./components/MySubComponent";
import type { MyFeatureProps } from "./utils";
```

### Path Aliases

Configured in `tsconfig.json`:

```json
{
  "@/*": ["./src/*"],
  "@gshl-components/*": ["./src/components/*/main"],
  "@gshl-hooks": ["./src/lib/hooks"],
  "@gshl-ui": ["./src/components/ui"],
  "@gshl-utils": ["./src/lib/utils"],
  "@gshl-types": ["./src/lib/types"],
  "@gshl-skeletons": ["./src/components/skeletons"]
}
```

---

## Testing & Debugging

### Type Checking

```bash
# Check types without emitting files
npm run typecheck

# Watch mode
npx tsc --noEmit --watch
```

### Debugging TRPC Queries

1. **Enable TRPC devtools** (already configured):

   ```typescript
   // src/trpc/react.tsx
   const trpc = api.createClient({
     // ... config
   });
   ```

2. **Check browser console** for query states:

   - `isLoading`: Initial fetch
   - `isFetching`: Background refetch
   - `isError`: Failed query
   - `data`: Query result

3. **Inspect React Query Devtools**:
   - Already installed in dev mode
   - Shows all query states, cache, and refetch history

### Debugging Google Sheets

Add logging in sheets operations:

```typescript
// In any TRPC procedure
export const myRouter = createTRPCRouter({
  getData: publicProcedure.query(async () => {
    console.log("Fetching from sheets...");
    const data = await fetchFromSheets();
    console.log("Received rows:", data.length);
    return data;
  }),
});
```

Check terminal running `npm run dev` for server logs.

### Common Debug Points

| Issue                   | Debug Location                              |
| ----------------------- | ------------------------------------------- |
| Component not rendering | Check `ready` flag in hook                  |
| Data not loading        | Check TRPC query in browser console         |
| Type errors             | Run `npm run typecheck`                     |
| Styling not applying    | Check Tailwind class names, inspect element |
| API error               | Check terminal logs for TRPC errors         |

---

## Common Tasks

### Adding a UI Component from shadcn/ui

```bash
# Example: Add a new component
npx shadcn-ui@latest add dialog
```

This adds the component to `src/components/ui/dialog.tsx`.

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update specific package
npm install <package>@latest

# Update all (carefully)
npm update
```

### Creating a Database Migration

Currently using Google Sheets (no formal migrations).

For schema changes:

1. Update sheet manually
2. Update TypeScript types in `src/lib/types`
3. Update TRPC procedures if needed
4. Test with `npm run typecheck`

### Generating Types from Sheets

No automatic generation. Manually define types in `src/lib/types/*.ts`:

```typescript
// src/lib/types/player.ts
export interface Player {
  playerId: string;
  firstName: string;
  lastName: string;
  nhlPos: RosterPosition[];
  // ...
}
```

---

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000 (Windows)
npx kill-port 3000

# Or use different port
npm run dev -- -p 3001
```

### Module Resolution Errors

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Environment Variables Not Loading

1. Ensure `.env.local` exists (not `.env`)
2. Restart dev server after changes
3. Check `src/env.js` for validation errors
4. Verify variable names match schema

### Google Sheets API Errors

**401 Unauthorized**:

- Check service account has access to sheets
- Verify `GOOGLE_PRIVATE_KEY` includes `\n` characters

**403 Forbidden**:

- Enable Google Sheets API in Cloud Console
- Grant service account "Editor" access to sheets

**429 Rate Limit**:

- Too many requests (500/100s limit)
- Add delays between bulk operations
- Use batch operations where possible

### TypeScript Errors

```bash
# Restart TS server in VS Code
Ctrl+Shift+P → "TypeScript: Restart TS Server"

# Check for type errors
npm run typecheck
```

### Styles Not Applying

1. Check Tailwind class names are correct
2. Verify `globals.css` imports Tailwind: `@tailwind base;`
3. Clear browser cache
4. Restart dev server

---

## Next Steps

Now that your dev environment is ready:

1. **Explore the codebase** → [Architecture Overview](./ARCHITECTURE.md)
2. **Understand data flow** → [Data Layer](./DATA_LAYER.md)
3. **Learn component patterns** → [Component Architecture](./COMPONENTS.md)
4. **Build a feature** → Follow examples in `src/components`
5. **Deploy** → [Deployment Guide](./DEPLOYMENT.md)

---

## Getting Help

- **Code questions**: See [Component Architecture](./COMPONENTS.md) or [TRPC API](./TRPC_API.md)
- **Setup issues**: Check [Troubleshooting](./TROUBLESHOOTING.md)
- **Environment**: See [Environment Variables](./ENVIRONMENT.md)
- **API reference**: See [API Reference](./API_REFERENCE.md)

Happy coding! 🏒
