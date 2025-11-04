/**
 * Database Adapters
 * ------------------
 * High-level Prisma-like adapters for querying Google Sheets as a database.
 */

export {
  OptimizedSheetsAdapter,
  optimizedSheetsAdapter,
  type FindManyOptions,
  type FindUniqueOptions,
  type CreateOptions,
  type CreateManyOptions,
  type UpdateOptions,
  type UpdateManyOptions,
  type DeleteOptions,
  type DeleteManyOptions,
  type UpsertOptions,
} from "./optimized-adapter";

export { PlayerDayAdapter, playerDayAdapter } from "./playerday-adapter";
