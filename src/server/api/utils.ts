import { optimizedSheetsAdapter } from "@gshl-sheets";

/**
 * API Utilities for common operations across the tRPC API
 */

// Cache warming utility
export const warmupCache = async () => {
  console.log("🔥 Warming up sheets cache...");

  try {
    await optimizedSheetsAdapter.warmupCache([
      "Season",
      "Week",
      "Team",
      "Player",
      "Conference",
      "Franchise",
    ]);

    console.log("✅ Cache warmed up successfully");
  } catch (error) {
    console.error("❌ Cache warmup failed:", error);
  }
};

// Initialize sheets utility
export const initializeSheets = async () => {
  console.log("🔧 Initializing sheets...");

  try {
    await optimizedSheetsAdapter.initializeSheets();
    console.log("✅ Sheets initialized successfully");
  } catch (error) {
    console.error("❌ Sheets initialization failed:", error);
  }
};

// Health check utility
export const healthCheck = async () => {
  const checks = {
    sheetsConnection: false,
    cacheStatus: false,
    timestamp: new Date().toISOString(),
  };

  try {
    // Test basic sheets connection
    const seasons = await optimizedSheetsAdapter.count("Season");
    checks.sheetsConnection = seasons >= 0;

    // Test cache functionality
    await optimizedSheetsAdapter.findFirst("Season");
    checks.cacheStatus = true;

    return {
      status:
        checks.sheetsConnection && checks.cacheStatus ? "healthy" : "unhealthy",
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
    // Count records in each model
    const models = [
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
        const count = await optimizedSheetsAdapter.count(model as any);
        results.totalRecords[model] = count;
      } catch (error) {
        results.totalRecords[model] = -1; // Error counting
      }
    }

    // You can add more integrity checks here
    // For example: check for orphaned players without teams, etc.

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
  createPlayers: async (players: any[]) => {
    return optimizedSheetsAdapter.createMany("Player", { data: players });
  },

  // Batch update team stats
  updateTeamStats: async (updates: any[]) => {
    return optimizedSheetsAdapter.batchUpdate("TeamWeekStatLine", updates);
  },

  // Batch create contracts
  createContracts: async (contracts: any[]) => {
    return optimizedSheetsAdapter.createMany("Contract", { data: contracts });
  },
};

// League management utilities
export const leagueUtils = {
  // Get current season
  getCurrentSeason: async () => {
    return optimizedSheetsAdapter.findFirst("Season", {
      where: { isActive: true },
    });
  },

  // Get current week
  getCurrentWeek: async () => {
    return optimizedSheetsAdapter.findFirst("Week", {
      where: { isActive: true },
    });
  },

  // Get player leaderboard
  getPlayerLeaderboard: async (
    seasonId: number,
    statType: string,
    limit = 25,
  ) => {
    return optimizedSheetsAdapter.findMany("PlayerTotalStatLine", {
      where: { seasonId },
      orderBy: { [statType]: "desc" } as any,
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
