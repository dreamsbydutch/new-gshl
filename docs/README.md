# GSHL Documentation

Complete documentation for the **Google Sheets Hockey League (GSHL)** application — a Next.js-based fantasy hockey management system using Google Sheets as the database and Yahoo Fantasy as the data source.

---

## 📚 Documentation Structure

### 🚀 Getting Started

- **[Quick Start Guide](./getting-started/QUICK_START.md)** - Get up and running in 10 minutes
- **[Development Setup](./getting-started/DEVELOPMENT.md)** - Local environment configuration and workflows

### 🔧 Core Systems

- **[Architecture Overview](./core-systems/ARCHITECTURE.md)** - System design, tech stack, and data flow
- **[Data Layer](./core-systems/DATA_LAYER.md)** - Google Sheets integration, PlayerDay system, stat aggregation
- **[TRPC API](./core-systems/TRPC_API.md)** - Type-safe API routes, routers, and procedures

### 🎨 Frontend

- **[Component Architecture](./frontend/COMPONENTS.md)** - React patterns, folder structure, and conventions
- **[Hooks & State Management](./frontend/HOOKS.md)** - Custom hooks, Zustand store, query caching
- **[UI System](./frontend/UI_SYSTEM.md)** - shadcn/ui components, Tailwind patterns, design system

### ⚙️ Backend

- **[Lineup Optimizer](./backend/LINEUP_OPTIMIZER.md)** - Daily lineup optimization and analytics
- **[Ranking Engine](./backend/RANKING_ENGINE.md)** - Player performance scoring algorithm
- **[Yahoo Scraper](./backend/YAHOO_SCRAPER.md)** - Yahoo Fantasy data integration and sync

### 🚢 Operations

- **[Scripts & Utilities](./operations/SCRIPTS.md)** - Data migration and maintenance scripts
- **[NPM Scripts](./operations/NPM_SCRIPTS.md)** - Available commands and their usage
- **[Team Stats Flow](./operations/TEAM_STATS_FLOW.md)** - Complete guide to aggregating PlayerDays → TeamStats
- **[Team Stats Quick Start](./operations/TEAM_STATS_QUICKSTART.md)** - Quick reference for team aggregation
- **[Environment Variables](./operations/ENVIRONMENT.md)** - Configuration, secrets, and service accounts
- **[Cron Jobs](./operations/CRON.md)** - Scheduled automation with Vercel Cron
- **[Deployment Guide](./operations/DEPLOYMENT.md)** - Vercel deployment, environment setup, and CI/CD

### 📖 Reference

- **[Troubleshooting](./reference/TROUBLESHOOTING.md)** - Common issues and solutions

---

## 🎯 Quick Navigation

### I want to...

**Get started quickly:**
→ [Quick Start Guide](./getting-started/QUICK_START.md)

**Understand the architecture:**
→ [Architecture Overview](./core-systems/ARCHITECTURE.md)

**Set up my local environment:**
→ [Development Setup](./getting-started/DEVELOPMENT.md)

**Deploy to production:**
→ [Deployment Guide](./operations/DEPLOYMENT.md)

**Build a new UI feature:**
→ [Component Architecture](./frontend/COMPONENTS.md) + [Hooks & State](./frontend/HOOKS.md)

**Create a new API endpoint:**
→ [TRPC API](./core-systems/TRPC_API.md)

**Work with player data:**
→ [Data Layer](./core-systems/DATA_LAYER.md)

**Understand how rankings work:**
→ [Ranking Engine](./backend/RANKING_ENGINE.md)

**Optimize lineups:**
→ [Lineup Optimizer](./backend/LINEUP_OPTIMIZER.md)

**Debug an issue:**
→ [Troubleshooting](./reference/TROUBLESHOOTING.md)

**Add automation:**
→ [Cron Jobs](./operations/CRON.md) + [Scripts](./operations/SCRIPTS.md)

---

## 📋 Project Overview

### What is GSHL?

GSHL is a comprehensive fantasy hockey league management platform that:

- Tracks 15 fantasy teams across multiple seasons
- Imports daily player statistics from Yahoo Fantasy Hockey
- Manages contracts, draft picks, and salary cap
- Calculates advanced player rankings and lineup optimization
- Provides team schedules, standings, and historical matchups

### Technology Stack

| Layer          | Technologies                                                |
| -------------- | ----------------------------------------------------------- |
| **Frontend**   | Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS |
| **Backend**    | TRPC 11, Google Sheets API, Yahoo Fantasy API               |
| **Database**   | Google Sheets (3 partitioned workbooks for PlayerDay data)  |
| **State**      | Zustand (persisted), TRPC Query Cache (30s stale time)      |
| **Deployment** | Vercel (Edge Functions + Cron Jobs)                         |
| **Auth**       | Google Service Account (Sheets), OAuth 2.0 (Yahoo)          |

### Key Features

✅ **Daily Player Stats** - Automated sync from Yahoo Fantasy  
✅ **Advanced Rankings** - Position-specific performance scoring (0-100 scale)  
✅ **Lineup Optimizer** - Backtracking algorithm finds optimal daily lineups  
✅ **Contract Management** - Salary cap tracking and future projections  
✅ **Draft Board** - Real-time draft picks and team assignments  
✅ **Team Dashboards** - Rosters, schedules, and historical matchups  
✅ **League Views** - Standings and weekly schedules  
✅ **Automated Sync** - Cron jobs for stats, rankings, and aggregations

### Data Scale

- **251,000+** PlayerDay records (individual player game stats)
- **15** fantasy teams across **15** seasons
- **3** Google Sheets workbooks (partitioned by season for performance)
- **Daily updates** during hockey season via cron jobs

---

## 🏗️ Architecture Snapshot

```
┌─────────────────────────────────────────────────────────────────┐
│                         Next.js App Router                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Client Pages    │→ │  TRPC Hooks      │→ │  Zustand Store│ │
│  │  (React 18)      │  │  (clientApi)     │  │  (Persist)    │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│           ↓                      ↓                      ↓        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Feature Components (Props-Driven)            │  │
│  │  TeamRoster | ContractTable | DraftBoard | Standings     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         TRPC API Layer                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Routers: teams | contracts | draft | schedule | stats   │  │
│  │  Procedures: queries (fetch) + mutations (update)        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Google Sheets Adapter                         │
│  ┌────────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  optimizedSheets   │→ │  Batch Reads    │→ │  SuperJSON   │ │
│  │  Adapter           │  │  Caching        │  │  Hydration   │ │
│  └────────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Google Sheets (DB)                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  PlayerDay_1-5   │  │  PlayerDay_6-10  │  │ PlayerDay_11+│ │
│  │  (Workbook 1)    │  │  (Workbook 2)    │  │ (Workbook 3) │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Teams | Contracts | DraftPicks | Schedules | Standings  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────┐
│                    Yahoo Fantasy Scraper                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Puppeteer → Extract Stats → Upsert PlayerDay Records    │  │
│  │  Triggered by: Vercel Cron (daily) or Manual API Call    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Data Flow:**

1. **User visits page** → Next.js renders skeleton
2. **Client component** → Calls TRPC hook from `src/lib/hooks`
3. **TRPC router** → Fetches from Google Sheets via `optimizedSheetsAdapter`
4. **Data returns** → Cached (30s stale), hydrated with SuperJSON
5. **Feature component** → Transforms data in local hook, renders UI

---

## 📚 Learning Path

**For new developers:**

1. [Quick Start](./QUICK_START.md) - Install and run locally
2. [Architecture](./ARCHITECTURE.md) - Understand system design
3. [Components](./COMPONENTS.md) - Learn UI patterns
4. [Data Layer](./DATA_LAYER.md) - Explore data structures

**For contributors:**

1. [Development Setup](./DEVELOPMENT.md) - Configure environment
2. [TRPC API](./TRPC_API.md) - Add endpoints
3. [Hooks](./HOOKS.md) - Build reusable data hooks
4. [Troubleshooting](./TROUBLESHOOTING.md) - Debug issues

**For operators:**

1. [Deployment](./DEPLOYMENT.md) - Deploy to Vercel
2. [Environment](./ENVIRONMENT.md) - Configure secrets
3. [Cron Jobs](./CRON.md) - Schedule automation
4. [Monitoring](./MONITORING.md) - Track performance

---

## 🤝 Contributing

When working with the codebase:

1. ✅ Follow patterns in [Component Architecture](./COMPONENTS.md)
2. ✅ Use TypeScript types from [Types Reference](./TYPES.md)
3. ✅ Document with JSDoc (see examples in codebase)
4. ✅ Test locally with `npm run dev` before deploying
5. ✅ Run `npm run check` (lint + typecheck) before commits

---

## 📞 Support

**Documentation not clear?**

- Check [Troubleshooting](./TROUBLESHOOTING.md)
- Search for related keywords in other docs
- Review inline JSDoc comments in source code

**Found a bug?**

- See [Monitoring & Debugging](./MONITORING.md)
- Check GitHub Issues

---

_Last Updated: October 28, 2025_  
_GSHL v15 - Season 15 in progress_
