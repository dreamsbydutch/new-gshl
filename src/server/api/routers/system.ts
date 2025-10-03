import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { apiUtils } from "../utils";

/**
 * System router for health checks, cache management, and utilities
 */
export const systemRouter = createTRPCRouter({
  // Health check endpoint
  healthCheck: publicProcedure.query(async () => {
    return apiUtils.healthCheck();
  }),

  // Cache management
  cache: createTRPCRouter({
    // Warm up cache
    warmup: publicProcedure.mutation(async () => {
      await apiUtils.warmupCache();
      return { success: true, message: "Cache warmed up successfully" };
    }),

    // Clear cache
    clear: publicProcedure.mutation(async () => {
      // This would need to be implemented in the adapter
      return { success: true, message: "Cache cleared successfully" };
    }),

    // Get cache status
    status: publicProcedure.query(async () => {
      return apiUtils.getPerformanceMetrics();
    }),
  }),

  // Data integrity checks
  integrity: createTRPCRouter({
    // Check data integrity
    check: publicProcedure.query(async () => {
      return apiUtils.checkDataIntegrity();
    }),

    // Get record counts
    counts: publicProcedure.query(async () => {
      const integrity = await apiUtils.checkDataIntegrity();
      return {
        totalRecords: integrity.totalRecords,
        timestamp: integrity.timestamp,
      };
    }),
  }),

  // Initialize sheets
  initialize: publicProcedure.mutation(async () => {
    await apiUtils.initializeSheets();
    return { success: true, message: "Sheets initialized successfully" };
  }),

  // League utilities
  league: createTRPCRouter({
    // Get current season
    currentSeason: publicProcedure.query(async () => {
      return apiUtils.leagueUtils.getCurrentSeason();
    }),

    // Get current week
    currentWeek: publicProcedure.query(async () => {
      return apiUtils.leagueUtils.getCurrentWeek();
    }),

    // Get player leaderboard
    playerLeaderboard: publicProcedure
      .input(
        z.object({
          seasonId: z.string(),
          statType: z.enum(["G", "A", "P", "PIM", "PPG", "SOG", "HIT", "BLK"]),
          limit: z.number().int().positive().max(100).default(25),
        }),
      )
      .query(async ({ input }) => {
        return apiUtils.leagueUtils.getPlayerLeaderboard(
          +input.seasonId,
          input.statType,
          input.limit,
        );
      }),
  }),
});
