import { fastSheetsReader, type SheetsModelName } from "@gshl-sheets";
import { getCount, getFirst, getMany } from "./sheets-store";

/**
 * API Utilities for common operations across the tRPC API
 */

// Cache warming utility
export const warmupCache = async () => {
  console.log("🔥 Warming up sheets snapshot...");

  try {
    await fastSheetsReader.fetchSnapshot([
      "Season",
      "Week",
      "Team",
      "Player",
      "Conference",
      "Franchise",
    ]);

    console.log("✅ Snapshot warmed up successfully");
  } catch (error) {
    console.error("❌ Snapshot warmup failed:", error);
  }
};

// Initialize sheets utility
export const initializeSheets = async () => {
  // No-op in the read-optimized path.
  console.log("ℹ️ initializeSheets is a no-op (read-optimized mode)");
};

// Health check utility
export const healthCheck = async () => {
  const checks = {
    sheetsConnection: false,
    snapshotStatus: false,
    timestamp: new Date().toISOString(),
  };

  try {
    const seasons = await getCount("Season");
    checks.sheetsConnection = seasons >= 0;

    await getFirst("Season");
    checks.snapshotStatus = true;

    return {
      status:
        checks.sheetsConnection && checks.snapshotStatus
          ? "healthy"
          : "unhealthy",
      checks,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      checks,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Data integrity check utility
export const checkDataIntegrity = async () => {
  const results = {
    totalRecords: {} as Record<string, number>,
    orphanedRecords: [] as string[],
    duplicateIds: [] as string[],
    timestamp: new Date().toISOString(),
  };

  try {
    const models: SheetsModelName[] = [
      "Season",
      "Week",
      "Team",
      "Player",
      "Conference",
      "Franchise",
      "Contract",
      "DraftPick",
      "Event",
      "Matchup",
      "Owner",
    ];

    for (const model of models) {
      try {
        results.totalRecords[model] = await getCount(model);
      } catch {
        results.totalRecords[model] = -1; // Error counting
      }
    }

    // Additional integrity checks could be added here
    return results;
  } catch (error) {
    return {
      ...results,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Performance metrics utility
export const getPerformanceMetrics = async () => {
  const metrics = {
    cacheHitRate: 0,
    avgResponseTime: 0,
    activeConnections: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    // These would need to be implemented in the adapter
    // For now, return placeholder metrics
    return metrics;
  } catch (error) {
    return {
      ...metrics,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Batch operations utility
export const batchOperations = {
  // Batch create players
  createPlayers: async () => {
    throw new Error("Writes are disabled in read-optimized mode");
  },
  updateTeamStats: async () => {
    throw new Error("Writes are disabled in read-optimized mode");
  },
  createContracts: async () => {
    throw new Error("Writes are disabled in read-optimized mode");
  },
};

// League management utilities
export const leagueUtils = {
  // Get current season
  getCurrentSeason: async () => {
    return getFirst("Season", { where: { isActive: true } });
  },

  // Get current week
  getCurrentWeek: async () => {
    return getFirst("Week", { where: { isActive: true } });
  },

  // Get player leaderboard
  getPlayerLeaderboard: async (
    seasonId: number,
    statType: string,
    limit = 25,
  ) => {
    return getMany("PlayerTotalStatLine", {
      where: { seasonId },
      orderBy: { [statType]: "desc" },
      take: limit,
    });
  },
};

// Export all utilities
export const apiUtils = {
  warmupCache,
  initializeSheets,
  healthCheck,
  checkDataIntegrity,
  getPerformanceMetrics,
  batchOperations,
  leagueUtils,
};
