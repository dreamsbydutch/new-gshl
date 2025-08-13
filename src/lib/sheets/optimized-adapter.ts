import { optimizedSheetsClient } from "./optimized-client";
import {
  SHEETS_CONFIG,
  WORKBOOKS,
  MODEL_TO_WORKBOOK,
  convertRowToModel,
  convertModelToRow,
  type DatabaseRecord,
} from "./config";

// Enhanced types for complete CRUD operations
export interface FindManyOptions<T> {
  where?: Partial<T>;
  select?: Partial<Record<keyof T, boolean>>;
  orderBy?: Partial<Record<keyof T, "asc" | "desc">>;
  take?: number;
  skip?: number;
}

export interface FindUniqueOptions<T> {
  where: Partial<T>;
}

export interface CreateOptions<T> {
  data: Omit<T, "id" | "createdAt" | "updatedAt">;
}

export interface CreateManyOptions<T> {
  data: Omit<T, "id" | "createdAt" | "updatedAt">[];
}

export interface UpdateOptions<T> {
  where: { id: number };
  data: Partial<T>;
}

export interface UpdateManyOptions<T> {
  where?: Partial<T>;
  data: Partial<T>;
}

export interface DeleteOptions {
  where: { id: number };
}

export interface DeleteManyOptions<T> {
  where?: Partial<T>;
}

export interface UpsertOptions<T> {
  where: { id: number };
  update: Partial<T>;
  create: Omit<T, "id" | "createdAt" | "updatedAt">;
}

// Enhanced cache with better invalidation
interface CacheEntry {
  data: unknown[];
  timestamp: number;
  ttl: number;
}

// ID-based row mapping for efficient lookups
interface RowMapping {
  idToRowIndex: Map<number, number>;
  lastUpdate: number;
}

// Local ID cache to avoid repeated API calls
interface IdCache {
  maxId: number;
  lastUpdate: number;
  ttl: number;
}

type ModelName = keyof typeof SHEETS_CONFIG.SHEETS;
type CellValue = string | number | boolean | null;

export class OptimizedSheetsAdapter {
  private cache = new Map<string, CacheEntry>();
  private rowMappings = new Map<string, RowMapping>();
  private idCache = new Map<string, IdCache>();
  private readonly DEFAULT_CACHE_TTL = 60000; // 1 minute
  private readonly LONG_CACHE_TTL = 300000; // 5 minutes for static data
  private readonly ID_CACHE_TTL = 120000; // 2 minutes for ID cache
  private readonly BATCH_SIZE = 100;

  private getSpreadsheetId(modelName: string): string {
    const workbookKey = MODEL_TO_WORKBOOK[modelName];
    if (!workbookKey) {
      throw new Error(`No workbook mapping found for model: ${modelName}`);
    }
    return WORKBOOKS[workbookKey];
  }

  private getCacheKey(modelName: string, operation: string): string {
    return `${modelName}_${operation}`;
  }

  private isCacheValid(cacheEntry: CacheEntry): boolean {
    return Date.now() - cacheEntry.timestamp < cacheEntry.ttl;
  }

  private async getCachedOrFetch<T>(
    modelName: string,
    operation: string,
    fetcher: () => Promise<T>,
    ttl: number = this.DEFAULT_CACHE_TTL,
  ): Promise<T> {
    const cacheKey = this.getCacheKey(modelName, operation);
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(cacheKey, {
      data: data as unknown[],
      timestamp: Date.now(),
      ttl,
    });

    return data;
  }

  private clearCacheForModel(modelName: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter((key) =>
      key.startsWith(modelName),
    );
    keysToDelete.forEach((key) => this.cache.delete(key));
    this.rowMappings.delete(modelName);
    this.idCache.delete(modelName); // Also clear ID cache
  }

  // Build ID-to-row mapping for efficient lookups
  private async buildRowMapping(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
  ): Promise<RowMapping> {
    const cached = this.rowMappings.get(modelName);
    if (cached && Date.now() - cached.lastUpdate < 30000) {
      // 30 seconds
      return cached;
    }

    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    const range = `${sheetName}!A2:A`;
    const rows = await optimizedSheetsClient.getValues(
      this.getSpreadsheetId(modelName),
      range,
    );

    const idToRowIndex = new Map<number, number>();
    rows.forEach((row: any, index: number) => {
      if (row && row[0] && typeof row[0] === "number") {
        idToRowIndex.set(row[0], index + 2); // +2 for header row and 0-based index
      }
    });

    const mapping: RowMapping = {
      idToRowIndex,
      lastUpdate: Date.now(),
    };

    this.rowMappings.set(modelName, mapping);
    return mapping;
  }

  // Enhanced initialization with batch operations
  async initializeSheets(): Promise<void> {
    const initPromises = Object.entries(WORKBOOKS).map(
      async ([workbookKey, workbookId]) => {
        console.log(`🔧 Initializing workbook ${workbookKey} (${workbookId})`);

        const hasAccess = await optimizedSheetsClient.testAccess(workbookId);
        if (!hasAccess) {
          console.warn(`⚠️ Cannot access workbook ${workbookKey}. Skipping...`);
          return;
        }

        const sheetPromises = Object.entries(SHEETS_CONFIG.SHEETS).map(
          async ([modelName, sheetName]) => {
            const modelWorkbook = MODEL_TO_WORKBOOK[modelName];
            if (modelWorkbook !== workbookKey) return;

            const columns =
              SHEETS_CONFIG.COLUMNS[
                modelName as keyof typeof SHEETS_CONFIG.COLUMNS
              ];
            if (columns) {
              try {
                await optimizedSheetsClient.createSheet(workbookId, sheetName, [
                  ...columns,
                ]);
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                if (!errorMessage.includes("already exists")) {
                  console.error(
                    `❌ Error creating sheet ${sheetName}:`,
                    errorMessage,
                  );
                }
              }
            }
          },
        );

        await Promise.all(sheetPromises);
      },
    );

    await Promise.all(initPromises);
  }

  // Optimized findMany with better caching and filtering
  async findMany<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: FindManyOptions<T> = {},
  ): Promise<T[]> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      const range = `${sheetName}!A2:${this.getColumnLetter(columns.length)}`;
      const rows = (await this.getCachedOrFetch(
        modelName,
        `findMany_${JSON.stringify(options)}`,
        () =>
          optimizedSheetsClient.getValues(
            this.getSpreadsheetId(modelName),
            range,
          ),
        this.DEFAULT_CACHE_TTL,
      )) as (string | number | boolean | null)[][];

      let results = rows
        .filter((row) => row && row.length > 0)
        .map((row) => convertRowToModel<T>(row, columns));

      // Apply filters
      if (options.where) {
        results = results.filter((item) => {
          return Object.entries(options.where!).every(([key, value]) => {
            if (value === undefined) return true;
            return (item as Record<string, unknown>)[key] === value;
          });
        });
      }

      // Apply ordering
      if (options.orderBy) {
        const orderEntries = Object.entries(options.orderBy);
        results.sort((a, b) => {
          for (const [key, direction] of orderEntries) {
            const aVal = (a as Record<string, unknown>)[key];
            const bVal = (b as Record<string, unknown>)[key];

            let comparison = 0;
            if (
              aVal !== null &&
              aVal !== undefined &&
              bVal !== null &&
              bVal !== undefined
            ) {
              if (typeof aVal === typeof bVal && aVal < bVal) comparison = -1;
              else if (typeof aVal === typeof bVal && aVal > bVal)
                comparison = 1;
            } else if (
              (aVal === null || aVal === undefined) &&
              bVal !== null &&
              bVal !== undefined
            ) {
              comparison = 1;
            } else if (
              aVal !== null &&
              aVal !== undefined &&
              (bVal === null || bVal === undefined)
            ) {
              comparison = -1;
            }

            if (comparison !== 0) {
              return direction === "asc" ? comparison : -comparison;
            }
          }
          return 0;
        });
      }

      // Apply pagination
      if (options.skip) {
        results = results.slice(options.skip);
      }
      if (options.take) {
        results = results.slice(0, options.take);
      }

      return results;
    } catch (error) {
      console.error(`Error finding ${modelName}:`, error);
      throw error;
    }
  }

  // Optimized findUnique with direct row access
  async findUnique<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: FindUniqueOptions<T>,
  ): Promise<T | null> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      // If searching by ID, use optimized row mapping
      if (options.where.id && typeof options.where.id === "number") {
        const mapping = await this.buildRowMapping(modelName);
        const rowIndex = mapping.idToRowIndex.get(options.where.id);

        if (rowIndex) {
          const range = `${sheetName}!A${rowIndex}:${this.getColumnLetter(columns.length)}${rowIndex}`;
          const rows = await optimizedSheetsClient.getValues(
            this.getSpreadsheetId(modelName),
            range,
          );

          if (rows.length > 0 && rows[0] && rows[0].length > 0) {
            return convertRowToModel<T>(rows[0], columns);
          }
        }
        return null;
      }

      // Fallback to findMany for non-ID searches
      const results = await this.findMany<T>(modelName, {
        where: options.where,
        take: 1,
      });
      return results.length > 0 && results[0] ? results[0] : null;
    } catch (error) {
      console.error(`Error finding unique ${modelName}:`, error);
      throw error;
    }
  }

  // Optimized create with batch processing
  async create<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: CreateOptions<T>,
  ): Promise<T> {
    const result = await this.createMany<T>(modelName, {
      data: [options.data],
    });
    if (result.count === 0) {
      throw new Error(`Failed to create ${modelName}`);
    }

    // Return the created item with generated ID
    const now = new Date();
    return {
      id: await this.getNextId(modelName),
      ...options.data,
      createdAt: now,
      updatedAt: now,
    } as unknown as T;
  }

  // Optimized createMany with batch operations
  async createMany<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: CreateManyOptions<T>,
  ): Promise<{ count: number }> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      const nextId = await this.getNextId(modelName);
      const now = new Date();

      const rows = options.data.map((item, index) => {
        const fullData = {
          id: nextId + index,
          ...item,
          createdAt: now,
          updatedAt: now,
        };
        return convertModelToRow(fullData, columns);
      });

      // Process in batches for better performance
      const batches = this.chunkArray(rows, this.BATCH_SIZE);

      for (const batch of batches) {
        await optimizedSheetsClient.appendValues(
          this.getSpreadsheetId(modelName),
          `${sheetName}!A:A`,
          batch,
        );
      }

      this.clearCacheForModel(modelName);
      return { count: options.data.length };
    } catch (error) {
      console.error(`Error creating many ${modelName}:`, error);
      throw error;
    }
  }

  // Optimized update with direct row access
  async update<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: UpdateOptions<T>,
  ): Promise<T> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      const mapping = await this.buildRowMapping(modelName);
      const rowIndex = mapping.idToRowIndex.get(options.where.id);

      if (!rowIndex) {
        throw new Error(
          `Record with id ${options.where.id} not found in ${modelName}`,
        );
      }

      // Get existing data
      const existingRange = `${sheetName}!A${rowIndex}:${this.getColumnLetter(columns.length)}${rowIndex}`;
      const existingRows = await optimizedSheetsClient.getValues(
        this.getSpreadsheetId(modelName),
        existingRange,
      );

      if (
        existingRows.length === 0 ||
        !existingRows[0] ||
        existingRows[0].length === 0
      ) {
        throw new Error(
          `Record with id ${options.where.id} not found in ${modelName}`,
        );
      }

      const existingData = convertRowToModel<T>(existingRows[0], columns);
      const updatedData = {
        ...existingData,
        ...options.data,
        updatedAt: new Date(),
      };

      const updatedRow = convertModelToRow(updatedData, columns);
      await optimizedSheetsClient.updateValues(
        this.getSpreadsheetId(modelName),
        existingRange,
        [updatedRow],
      );

      this.clearCacheForModel(modelName);
      return updatedData;
    } catch (error) {
      console.error(`Error updating ${modelName}:`, error);
      throw error;
    }
  }

  // New updateMany operation
  async updateMany<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: UpdateManyOptions<T>,
  ): Promise<{ count: number }> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      const records = await this.findMany<T>(modelName, {
        where: options.where,
      });
      let count = 0;

      for (const record of records) {
        await this.update<T>(modelName, {
          where: { id: (record as any).id },
          data: options.data,
        });
        count++;
      }

      return { count };
    } catch (error) {
      console.error(`Error updating many ${modelName}:`, error);
      throw error;
    }
  }

  // Optimized delete with direct row access
  async delete<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: DeleteOptions,
  ): Promise<T> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      const mapping = await this.buildRowMapping(modelName);
      const rowIndex = mapping.idToRowIndex.get(options.where.id);

      if (!rowIndex) {
        throw new Error(
          `Record with id ${options.where.id} not found in ${modelName}`,
        );
      }

      // Get existing data before deletion
      const existingRange = `${sheetName}!A${rowIndex}:${this.getColumnLetter(columns.length)}${rowIndex}`;
      const existingRows = await optimizedSheetsClient.getValues(
        this.getSpreadsheetId(modelName),
        existingRange,
      );

      if (
        existingRows.length === 0 ||
        !existingRows[0] ||
        existingRows[0].length === 0
      ) {
        throw new Error(
          `Record with id ${options.where.id} not found in ${modelName}`,
        );
      }

      const existingData = convertRowToModel<T>(existingRows[0], columns);

      // Clear the row
      const emptyRow = new Array(columns.length).fill("") as (
        | string
        | number
        | boolean
        | null
      )[];
      await optimizedSheetsClient.updateValues(
        this.getSpreadsheetId(modelName),
        existingRange,
        [emptyRow],
      );

      this.clearCacheForModel(modelName);
      return existingData;
    } catch (error) {
      console.error(`Error deleting ${modelName}:`, error);
      throw error;
    }
  }

  // New deleteMany operation
  async deleteMany<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: DeleteManyOptions<T>,
  ): Promise<{ count: number }> {
    const records = await this.findMany<T>(modelName, { where: options.where });
    let count = 0;

    for (const record of records) {
      await this.delete<T>(modelName, {
        where: { id: (record as any).id },
      });
      count++;
    }

    return { count };
  }

  // New upsert operation
  async upsert<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: UpsertOptions<T>,
  ): Promise<T> {
    try {
      const existing = await this.findUnique<T>(modelName, {
        where: options.where as unknown as Partial<T>,
      });

      if (existing) {
        return await this.update<T>(modelName, {
          where: { id: (options.where as any).id },
          data: options.update,
        });
      } else {
        return await this.create<T>(modelName, {
          data: options.create,
        });
      }
    } catch (error) {
      console.error(`Error upserting ${modelName}:`, error);
      throw error;
    }
  }

  // Enhanced utility methods with local ID caching
  private async getNextId(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
  ): Promise<number> {
    const cached = this.idCache.get(modelName);
    const now = Date.now();

    // Check if we have a valid cached max ID
    if (cached && now - cached.lastUpdate < cached.ttl) {
      // Increment the cached max ID and return it
      cached.maxId++;
      return cached.maxId;
    }

    // If cache is stale or doesn't exist, fetch from sheet
    try {
      const mapping = await this.buildRowMapping(modelName);
      const ids = Array.from(mapping.idToRowIndex.keys());
      const maxId = ids.length > 0 ? Math.max(...ids) : 0;

      // Cache the max ID for future use
      this.idCache.set(modelName, {
        maxId,
        lastUpdate: now,
        ttl: this.ID_CACHE_TTL,
      });

      return maxId + 1;
    } catch (error) {
      console.error(`Error getting next ID for ${modelName}:`, error);
      // Fallback: use timestamp-based ID
      return Math.floor(Date.now() / 1000);
    }
  }

  // Method to manually refresh ID cache
  async refreshIdCache(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
  ): Promise<void> {
    this.idCache.delete(modelName);
    await this.getNextId(modelName);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private getColumnLetter(index: number): string {
    let letter = "";
    while (index > 0) {
      index--;
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26);
    }
    return letter;
  }

  // Enhanced cache management
  async warmupCache(
    modelNames: string[] = ["Week", "Season", "Player"],
  ): Promise<void> {
    const promises = modelNames.map(async (modelName) => {
      try {
        await this.findMany(modelName as keyof typeof SHEETS_CONFIG.SHEETS, {});
        console.log(`✅ Warmed up cache for ${modelName}`);
      } catch (error) {
        console.error(`❌ Failed to warm up cache for ${modelName}:`, error);
      }
    });

    await Promise.all(promises);
  }

  clearCache(): void {
    this.cache.clear();
    this.rowMappings.clear();
    this.idCache.clear(); // Also clear ID cache
  }

  // Additional utility methods
  async count<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options?: { where?: Partial<T> },
  ): Promise<number> {
    const results = await this.findMany<T>(modelName, {
      where: options?.where,
    });
    return results.length;
  }

  async findFirst<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    options: FindManyOptions<T> = {},
  ): Promise<T | null> {
    const results = await this.findMany<T>(modelName, { ...options, take: 1 });
    return results.length > 0 && results[0] ? results[0] : null;
  }

  // Batch operations for better performance
  async batchCreate<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    operations: CreateOptions<T>[],
  ): Promise<{ count: number }> {
    const data = operations.map((op) => op.data);
    return this.createMany<T>(modelName, { data });
  }

  async batchUpdate<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    operations: UpdateOptions<T>[],
  ): Promise<{ count: number }> {
    let count = 0;
    for (const operation of operations) {
      await this.update<T>(modelName, operation);
      count++;
    }
    return { count };
  }

  async batchDelete<T extends DatabaseRecord>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
    operations: DeleteOptions[],
  ): Promise<{ count: number }> {
    let count = 0;
    for (const operation of operations) {
      await this.delete<T>(modelName, operation);
      count++;
    }
    return { count };
  }

  // Debug methods
  getDebugInfo(): {
    cacheStats: {
      totalEntries: number;
      cacheKeys: string[];
    };
    idCacheStats: {
      totalEntries: number;
      entries: Array<{ model: string; maxId: number; age: number }>;
    };
    rowMappingStats: {
      totalEntries: number;
      entries: Array<{ model: string; rowCount: number; age: number }>;
    };
    queueStats: ReturnType<typeof optimizedSheetsClient.getQueueStatus>;
  } {
    const now = Date.now();

    return {
      cacheStats: {
        totalEntries: this.cache.size,
        cacheKeys: Array.from(this.cache.keys()),
      },
      idCacheStats: {
        totalEntries: this.idCache.size,
        entries: Array.from(this.idCache.entries()).map(([model, cache]) => ({
          model,
          maxId: cache.maxId,
          age: now - cache.lastUpdate,
        })),
      },
      rowMappingStats: {
        totalEntries: this.rowMappings.size,
        entries: Array.from(this.rowMappings.entries()).map(
          ([model, mapping]) => ({
            model,
            rowCount: mapping.idToRowIndex.size,
            age: now - mapping.lastUpdate,
          }),
        ),
      },
      queueStats: optimizedSheetsClient.getQueueStatus(),
    };
  }
}

// Export singleton instance
export const optimizedSheetsAdapter = new OptimizedSheetsAdapter();
