import { optimizedSheetsClient } from "./optimized-client";
import {
  SHEETS_CONFIG,
  WORKBOOKS,
  MODEL_TO_WORKBOOK,
  convertRowToModel,
  convertModelToRow,
  type DatabaseRecord,
} from "./config";
import { SheetCache, type SheetDataset, type SheetRow } from "./sheet-cache";
import { getModelCacheTTL } from "./model-metadata";

function isStringifiablePrimitive(
  value: unknown,
): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

// Type helper for objects with timestamp fields
type WithTimestamps = {
  createdAt?: Date;
  updatedAt?: Date;
};

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
  where: { id: string };
  data: Partial<T>;
}

export interface UpdateManyOptions<T> {
  where?: Partial<T>;
  data: Partial<T>;
}

export interface DeleteOptions {
  where: { id: string };
}

export interface DeleteManyOptions<T> {
  where?: Partial<T>;
}

export interface UpsertOptions<T> {
  where: { id: string };
  update: Partial<T>;
  create: Omit<T, "id" | "createdAt" | "updatedAt">;
}

// Local ID cache to avoid repeated API calls
interface IdCache {
  maxId: number;
  lastUpdate: number;
  ttl: number;
}

type ModelName = keyof typeof SHEETS_CONFIG.SHEETS;

export class OptimizedSheetsAdapter {
  private readonly sheetCache = new SheetCache();
  private idCache = new Map<string, IdCache>();
  private readonly DEFAULT_CACHE_TTL = 60000; // fallback when model metadata missing
  private readonly ID_CACHE_TTL = 120000; // 2 minutes for ID cache
  private readonly BATCH_SIZE = 100;

  // Typed wrapper around underlying sheets client to avoid unsafe 'any'
  private sheetsApi(): {
    testAccess: (spreadsheetId: string) => Promise<boolean>;
    createSheet: (
      spreadsheetId: string,
      sheetName: string,
      headers: string[],
    ) => Promise<void>;
    getValues: (
      spreadsheetId: string,
      range: string,
    ) => Promise<(string | number | boolean | null)[][]>;
    appendValues: (
      spreadsheetId: string,
      range: string,
      values: (string | number | boolean | null)[][],
    ) => Promise<void>;
    updateValues: (
      spreadsheetId: string,
      range: string,
      values: (string | number | boolean | null)[][],
    ) => Promise<void>;
    getQueueStatus: () => {
      queueLength: number;
      isProcessing: boolean;
      requestsInLastMinute: number;
    };
  } {
    return optimizedSheetsClient as unknown as ReturnType<
      OptimizedSheetsAdapter["sheetsApi"]
    >;
  }

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

  private clearCacheForModel(modelName: string): void {
    this.sheetCache.invalidate(modelName);
    this.idCache.delete(modelName); // Also clear ID cache
  }

  private getModelTTL(modelName: ModelName): number {
    return getModelCacheTTL(String(modelName)) || this.DEFAULT_CACHE_TTL;
  }

  private async getDataset<T extends DatabaseRecord>(
    modelName: ModelName,
  ): Promise<SheetDataset<T>> {
    return this.sheetCache.getDataset<T>(
      String(modelName),
      () => this.loadModelDataset<T>(modelName),
      this.getModelTTL(modelName),
    );
  }

  private async loadModelDataset<T extends DatabaseRecord>(
    modelName: ModelName,
  ): Promise<SheetDataset<T>> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    const range = `${sheetName}!A2:${this.getColumnLetter(columns.length)}`;
    const values = await this.sheetsApi().getValues(
      this.getSpreadsheetId(String(modelName)),
      range,
    );

    const rows: SheetRow<T>[] = [];
    const idToRowIndex = new Map<string, number>();

    values.forEach((row: (string | number | boolean | null)[], index) => {
      if (!row || row.length === 0) return;
      const model = convertRowToModel<T>(row, columns);
      const rowIndex = index + 2; // account for header row
      rows.push({ rowIndex, model });

      const idValue =
        (model as Record<string, unknown>).id ?? row?.[0] ?? undefined;
      if (
        idValue !== undefined &&
        idValue !== null &&
        idValue !== "" &&
        isStringifiablePrimitive(idValue)
      ) {
        idToRowIndex.set(String(idValue), rowIndex);
      }
    });

    return { rows, idToRowIndex };
  }

  private async resolveRowIndex(
    modelName: ModelName,
    id: string,
  ): Promise<number | undefined> {
    const dataset = await this.getDataset<DatabaseRecord>(modelName);
    return dataset.idToRowIndex.get(id);
  }

  // Enhanced initialization with batch operations
  async initializeSheets(): Promise<void> {
    const initPromises = Object.entries(WORKBOOKS).map(
      async ([workbookKey, workbookId]) => {
        console.log(`🔧 Initializing workbook ${workbookKey} (${workbookId})`);

        const hasAccess = await this.sheetsApi().testAccess(workbookId);
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
                await this.sheetsApi().createSheet(workbookId, sheetName, [
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
    modelName: ModelName,
    options: FindManyOptions<T> = {},
  ): Promise<T[]> {
    try {
      const dataset = await this.getDataset<T>(modelName);
      let results = dataset.rows.map((record: SheetRow<T>) => record.model);

      if (options.where) {
        const predicates = Object.entries(options.where) as Array<
          [keyof T, T[keyof T]]
        >;
        results = results.filter((item: T) =>
          predicates.every(([key, value]) => {
            if (value === undefined) return true;
            const currentValue = (item as Record<string, unknown>)[
              key as string
            ];
            return currentValue === value;
          }),
        );
      }

      if (options.orderBy) {
        const orderEntries = Object.entries(options.orderBy) as Array<
          [keyof T, "asc" | "desc"]
        >;
        results.sort((a: T, b: T) => {
          for (const [key, direction] of orderEntries) {
            const aValue = (a as Record<string, unknown>)[key as string];
            const bValue = (b as Record<string, unknown>)[key as string];

            let comparison = 0;
            if (
              aValue !== null &&
              aValue !== undefined &&
              bValue !== null &&
              bValue !== undefined
            ) {
              if (typeof aValue === typeof bValue && aValue < bValue)
                comparison = -1;
              else if (typeof aValue === typeof bValue && aValue > bValue)
                comparison = 1;
            } else if (
              (aValue === null || aValue === undefined) &&
              bValue !== null &&
              bValue !== undefined
            ) {
              comparison = 1;
            } else if (
              aValue !== null &&
              aValue !== undefined &&
              (bValue === null || bValue === undefined)
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

      if (typeof options.skip === "number" && options.skip > 0) {
        results = results.slice(options.skip);
      }
      if (typeof options.take === "number" && options.take >= 0) {
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
    modelName: ModelName,
    options: FindUniqueOptions<T>,
  ): Promise<T | null> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      const targetId = options.where.id as unknown;
      if (isStringifiablePrimitive(targetId)) {
        const stringId = String(targetId);
        let rowIndex = await this.resolveRowIndex(modelName, stringId);

        if (!rowIndex) {
          this.clearCacheForModel(String(modelName));
          rowIndex = await this.resolveRowIndex(modelName, stringId);
        }

        if (rowIndex) {
          const range = `${sheetName}!A${rowIndex}:${this.getColumnLetter(columns.length)}${rowIndex}`;
          const rows = await this.sheetsApi().getValues(
            this.getSpreadsheetId(String(modelName)),
            range,
          );

          if (rows.length > 0 && rows[0] && rows[0].length > 0) {
            return convertRowToModel<T>(rows[0], columns);
          }
          return null;
        }
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
    modelName: ModelName,
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
    modelName: ModelName,
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
        await this.sheetsApi().appendValues(
          this.getSpreadsheetId(String(modelName)),
          `${sheetName}!A:A`,
          batch,
        );
      }

      this.clearCacheForModel(String(modelName));
      return { count: options.data.length };
    } catch (error) {
      console.error(`Error creating many ${modelName}:`, error);
      throw error;
    }
  }

  // Optimized update with direct row access
  async update<T extends DatabaseRecord>(
    modelName: ModelName,
    options: UpdateOptions<T>,
  ): Promise<T> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      const targetId = String(options.where.id);
      let dataset = await this.getDataset<DatabaseRecord>(modelName);
      let rowIndex = dataset.idToRowIndex.get(targetId);

      console.log(`Update ${modelName} - Looking for ID ${targetId}`);
      console.log(
        "Available IDs:",
        Array.from(dataset.idToRowIndex.keys()).slice(0, 10),
      );
      console.log("Row mapping size:", dataset.idToRowIndex.size);

      if (!rowIndex) {
        console.log("Row not found, clearing cache and retrying...");
        this.clearCacheForModel(String(modelName));
        dataset = await this.getDataset<DatabaseRecord>(modelName);
        rowIndex = dataset.idToRowIndex.get(targetId);

        console.log(
          "Fresh mapping available IDs:",
          Array.from(dataset.idToRowIndex.keys()).slice(0, 10),
        );

        if (!rowIndex) {
          console.error(
            `Record with id ${targetId} not found in ${modelName} even after cache refresh`,
          );
          throw new Error(
            `Record with id ${targetId} not found in ${modelName}`,
          );
        }
      }

      const existingRange = `${sheetName}!A${rowIndex}:${this.getColumnLetter(columns.length)}${rowIndex}`;
      const existingRows = await this.sheetsApi().getValues(
        this.getSpreadsheetId(String(modelName)),
        existingRange,
      );

      if (
        existingRows.length === 0 ||
        !existingRows[0] ||
        existingRows[0].length === 0
      ) {
        throw new Error(`Record with id ${targetId} not found in ${modelName}`);
      }

      const existingData = convertRowToModel<T>(existingRows[0], columns);
      console.log(
        "Existing data createdAt:",
        (existingData as T & WithTimestamps).createdAt,
      );

      const updatedData = {
        ...existingData,
        ...options.data,
        updatedAt: new Date(),
      };

      if (
        "createdAt" in existingData &&
        existingData.createdAt &&
        !("createdAt" in options.data)
      ) {
        (updatedData as T & WithTimestamps).createdAt = (
          existingData as T & WithTimestamps
        ).createdAt;
        console.log(
          "Preserving createdAt:",
          (updatedData as T & WithTimestamps).createdAt,
        );
      }

      console.log(
        "Final updatedData createdAt:",
        (updatedData as T & WithTimestamps).createdAt,
      );
      const updatedRow = convertModelToRow(updatedData, columns);
      await this.sheetsApi().updateValues(
        this.getSpreadsheetId(String(modelName)),
        existingRange,
        [updatedRow],
      );

      this.clearCacheForModel(String(modelName));
      return updatedData;
    } catch (error) {
      console.error(`Error updating ${modelName}:`, error);
      throw error;
    }
  }

  // New updateMany operation
  async updateMany<T extends DatabaseRecord>(
    modelName: ModelName,
    options: UpdateManyOptions<T>,
  ): Promise<{ count: number }> {
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
          where: { id: (record as Record<string, unknown>).id as string },
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
    modelName: ModelName,
    options: DeleteOptions,
  ): Promise<T> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];

    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    try {
      const targetId = String(options.where.id);
      let dataset = await this.getDataset<DatabaseRecord>(modelName);
      let rowIndex = dataset.idToRowIndex.get(targetId);

      if (!rowIndex) {
        this.clearCacheForModel(String(modelName));
        dataset = await this.getDataset<DatabaseRecord>(modelName);
        rowIndex = dataset.idToRowIndex.get(targetId);
      }

      if (!rowIndex) {
        throw new Error(`Record with id ${targetId} not found in ${modelName}`);
      }

      const existingRange = `${sheetName}!A${rowIndex}:${this.getColumnLetter(columns.length)}${rowIndex}`;
      const existingRows = await this.sheetsApi().getValues(
        this.getSpreadsheetId(String(modelName)),
        existingRange,
      );

      if (
        existingRows.length === 0 ||
        !existingRows[0] ||
        existingRows[0].length === 0
      ) {
        throw new Error(`Record with id ${targetId} not found in ${modelName}`);
      }

      const existingData = convertRowToModel<T>(existingRows[0], columns);

      // Clear the row
      const emptyRow = new Array(columns.length).fill("") as (
        | string
        | number
        | boolean
        | null
      )[];
      await this.sheetsApi().updateValues(
        this.getSpreadsheetId(String(modelName)),
        existingRange,
        [emptyRow],
      );

      this.clearCacheForModel(String(modelName));
      return existingData;
    } catch (error) {
      console.error(`Error deleting ${modelName}:`, error);
      throw error;
    }
  }

  // New deleteMany operation
  async deleteMany<T extends DatabaseRecord>(
    modelName: ModelName,
    options: DeleteManyOptions<T>,
  ): Promise<{ count: number }> {
    const records = await this.findMany<T>(modelName, { where: options.where });
    let count = 0;

    for (const record of records) {
      const recId = (record as Record<string, unknown>).id;
      if (typeof recId !== "string") continue;
      await this.delete<T>(modelName, {
        where: { id: recId },
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
          where: { id: options.where.id },
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
  private async getNextId(modelName: ModelName): Promise<number> {
    const cacheKey = String(modelName);
    const cached = this.idCache.get(cacheKey);
    const now = Date.now();

    // Check if we have a valid cached max ID
    if (cached && now - cached.lastUpdate < cached.ttl) {
      // Increment the cached max ID and return it
      cached.maxId++;
      return cached.maxId;
    }

    // If cache is stale or doesn't exist, fetch from sheet
    try {
      const dataset = await this.getDataset<DatabaseRecord>(modelName);
      const ids = Array.from(dataset.idToRowIndex.keys());
      const maxId = ids.length > 0 ? Math.max(...ids.map(Number)) : 0;

      // Cache the max ID for future use
      this.idCache.set(cacheKey, {
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
  async refreshIdCache(modelName: ModelName): Promise<void> {
    const cacheKey = String(modelName);
    this.idCache.delete(cacheKey);
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
        await this.getDataset<DatabaseRecord>(modelName as ModelName);
        console.log(`✅ Warmed up cache for ${modelName}`);
      } catch (error) {
        console.error(`❌ Failed to warm up cache for ${modelName}:`, error);
      }
    });

    await Promise.all(promises);
  }

  clearCache(): void {
    this.sheetCache.clear();
    this.idCache.clear(); // Also clear ID cache
  }

  // Additional utility methods
  async count<T extends DatabaseRecord>(
    modelName: ModelName,
    options?: { where?: Partial<T> },
  ): Promise<number> {
    const results = await this.findMany<T>(modelName, {
      where: options?.where,
    });
    return results.length;
  }

  async findFirst<T extends DatabaseRecord>(
    modelName: ModelName,
    options: FindManyOptions<T> = {},
  ): Promise<T | null> {
    const results = await this.findMany<T>(modelName, { ...options, take: 1 });
    return results.length > 0 && results[0] ? results[0] : null;
  }

  // Batch operations for better performance
  async batchCreate<T extends DatabaseRecord>(
    modelName: ModelName,
    operations: CreateOptions<T>[],
  ): Promise<{ count: number }> {
    const data = operations.map((op) => op.data);
    return this.createMany<T>(modelName, { data });
  }

  async batchUpdate<T extends DatabaseRecord>(
    modelName: ModelName,
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
    modelName: ModelName,
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
    sheetCacheStats: ReturnType<SheetCache["getStats"]>;
    idCacheStats: {
      totalEntries: number;
      entries: Array<{ model: string; maxId: number; age: number }>;
    };
    queueStats: ReturnType<typeof optimizedSheetsClient.getQueueStatus>;
  } {
    const now = Date.now();
    const sheetCacheStats = this.sheetCache.getStats();

    return {
      sheetCacheStats,
      idCacheStats: {
        totalEntries: this.idCache.size,
        entries: Array.from(this.idCache.entries()).map(([model, cache]) => ({
          model,
          maxId: cache.maxId,
          age: now - cache.lastUpdate,
        })),
      },
      queueStats: this.sheetsApi().getQueueStatus(),
    };
  }
}

// Export singleton instance
export const optimizedSheetsAdapter = new OptimizedSheetsAdapter();
