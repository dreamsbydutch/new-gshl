import {
  optimizedSheetsAdapter,
  type SHEETS_CONFIG,
  type DatabaseRecord,
} from "@gshl-sheets";

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
    type ModelName = keyof typeof SHEETS_CONFIG.SHEETS;
    const models: ModelName[] = [
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
        const count = await optimizedSheetsAdapter.count(model);
        results.totalRecords[model] = count;
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
  createPlayers: async (
    players: Omit<DatabaseRecord, "id" | "createdAt" | "updatedAt">[],
  ) => {
    return optimizedSheetsAdapter.createMany("Player", { data: players });
  },

  // Batch update team stats (typed minimal shape)
  updateTeamStats: async (
    updates: { where: { id: number }; data: Partial<DatabaseRecord> }[],
  ) => {
    // batchUpdate signature not exported; using existing call with safer typing
    return (
      optimizedSheetsAdapter as unknown as {
        batchUpdate: (
          model: keyof typeof SHEETS_CONFIG.SHEETS,
          updates: unknown,
        ) => Promise<unknown>;
      }
    ).batchUpdate("TeamWeekStatLine", updates);
  },

  // Batch create contracts
  createContracts: async (
    contracts: Omit<DatabaseRecord, "id" | "createdAt" | "updatedAt">[],
  ) => {
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
    const orderBy: Partial<Record<string, "asc" | "desc">> = {
      [statType]: "desc",
    };
    return optimizedSheetsAdapter.findMany("PlayerTotalStatLine", {
      where: { seasonId },
      orderBy: orderBy as unknown as Partial<Record<string, "asc" | "desc">>,
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
