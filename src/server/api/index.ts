// Server API barrel exports

// Root router and types
export { appRouter, createCaller, type AppRouter } from "./root";

// TRPC setup and procedures
export {
  createTRPCContext,
  createCallerFactory,
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  ownerOrCommissionerProcedure,
  commissionerProcedure,
} from "./trpc";

// API utilities and helper functions
export {
  warmupCache,
  initializeSheets,
  healthCheck,
  checkDataIntegrity,
  getPerformanceMetrics,
  batchOperations,
  leagueUtils,
  apiUtils,
} from "./utils";
