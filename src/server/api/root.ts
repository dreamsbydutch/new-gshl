import { createCallerFactory, createTRPCRouter } from "./trpc";
import { seasonRouter } from "./routers/season";
import { weekRouter } from "./routers/week";
import { teamRouter } from "./routers/team";
import { ownerRouter } from "./routers/owner";
import { matchupRouter } from "./routers/matchup";
import { playerRouter } from "./routers/player";
import { conferenceRouter } from "./routers/conference";
import { franchiseRouter } from "./routers/franchise";
import { eventRouter } from "./routers/event";
import { contractRouter } from "./routers/contract";
import { draftPickRouter } from "./routers/draftPick";
import { systemRouter } from "./routers/system";
import { playerStatsRouter } from "./routers/playerStats";
import { teamStatsRouter } from "./routers/teamStats";
import { snapshotRouter } from "./routers/snapshot";
// import { archivedStatsRouter } from "./routers/archivedStats"; // Disabled for performance

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  // Core league entities
  season: seasonRouter,
  week: weekRouter,
  team: teamRouter,
  player: playerRouter,
  conference: conferenceRouter,
  franchise: franchiseRouter,

  // League management
  owner: ownerRouter,
  matchup: matchupRouter,
  event: eventRouter,
  contract: contractRouter,
  draftPick: draftPickRouter,

  playerStats: playerStatsRouter,
  teamStats: teamStatsRouter,

  // High-throughput snapshot endpoint (client-side caching)
  snapshot: snapshotRouter,

  // System utilities
  system: systemRouter,

  // Archived stats (disabled for performance)
  // archivedStats: archivedStatsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
